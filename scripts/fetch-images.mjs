/**
 * fetch-images.mjs (v2)
 * ----------------------
 * Telecharge :
 *   1. une photo "champ" pour chaque legume de data.json : l'image principale
 *      de l'article Wikipédia FR (le vegetal tel qu'on le voit/le cultive) ;
 *   2. pour chaque FAMILLE, une PLANCHE BOTANIQUE SCIENTIFIQUE (dessin
 *      academique avec fleur, coupe de fruit, port) depuis Wikimedia Commons,
 *      c'est-a-dire un document diagnostique, pas une simple photo.
 *
 * Pour les familles, 3 strategies successives :
 *   a. "commonsAnatomie" : titre EXACT d'un fichier Commons, pioche a la main
 *      dans data.json (le plus fiable) -- ex. :
 *      "File:Thome Flora von Deutschland Oesterreich und der Schweiz 1885 Tafel 049.jpg"
 *   b. "categorieAnatomie" : une categorie Commons entiere, p.ex.
 *      "Category:Botanical illustrations of Poaceae" ; on prend le 1er fichier.
 *   c. sinon, recherche automatique sur Commons : "nomLatin botanical illustration".
 *
 * Les planches de Commons sont souvent des SVG (dessins au trait) ou des scans
 * anciens : on recupere une vignette bitmap de 800px rendue par Wikimedia, puis
 * on la compresse en JPEG. Pour un non-dev : rien a modifier ici, tout se regle
 * dans data.json.
 *
 * Pre-requis : Node 18+ et le paquet "sharp".
 *   npm install
 *   npm run fetch-images             # tout ce qui manque
 *   npm run fetch-images -- --force  # re-telecharge tout
 */

import { readFile, mkdir, writeFile, access } from "node:fs/promises"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const __dirname = dirname(fileURLToPath(import.meta.url))
const RACINE = join(__dirname, "..")
const DOSSIER_IMAGES = join(RACINE, "images")
const DOSSIER_IMAGES_FAMILLES = join(DOSSIER_IMAGES, "familles")
const LARGEUR_CIBLE = 800
const QUALITE_JPEG = 80 // plus haute que pour les photos : les dessins au trait se degradent vite

const UA = "FamillesMaraichage/1.0 (PWA educative; contact: exemple@exemple.fr)"
const API_WIKIPEDIA = "https://fr.wikipedia.org/w/api.php"
const API_COMMONS = "https://commons.wikimedia.org/w/api.php"

const forcer = process.argv.includes("--force")

/** Extrait le titre de page depuis une URL Wikipedia. */
function titreDepuisSource(source) {
  if (!source) return null
  try {
    const url = new URL(source)
    const apres = url.pathname.split("/wiki/")[1]
    if (!apres) return null
    return decodeURIComponent(apres).replace(/_/g, " ")
  } catch {
    return null
  }
}

/** Appelle une API MediaWiki et renvoie le JSON. */
async function apiMediaWiki(base, params) {
  const url = `${base}?${new URLSearchParams({ format: "json", origin: "*", ...params })}`
  const rep = await fetch(url, { headers: { "User-Agent": UA } })
  if (!rep.ok) throw new Error(`API ${rep.status}`)
  return rep.json()
}

// --- Photos "champ" (legumes) ------------------------------------------

async function imageParTitre(titre) {
  const data = await apiMediaWiki(API_WIKIPEDIA, {
    action: "query",
    titles: titre,
    prop: "pageimages",
    piprop: "original",
    redirects: "1",
  })
  const pages = data?.query?.pages || {}
  for (const page of Object.values(pages)) {
    if (page?.original?.source) return page.original.source
  }
  return null
}

async function imageParRecherche(motCle) {
  const data = await apiMediaWiki(API_WIKIPEDIA, {
    action: "query",
    generator: "search",
    gsrsearch: motCle,
    gsrlimit: "1",
    prop: "pageimages",
    piprop: "original",
    redirects: "1",
  })
  const pages = data?.query?.pages || {}
  for (const page of Object.values(pages)) {
    if (page?.original?.source) return page.original.source
  }
  return null
}

// --- Planches botaniques (familles, via Commons) ------------------------

/** Renvoie l'URL d'une vignette 800px d'un fichier Commons par son titre exact. */
async function vignetteFichier(titreFichier) {
  const data = await apiMediaWiki(API_COMMONS, {
    action: "query",
    titles: titreFichier,
    prop: "imageinfo",
    iiprop: "url",
    iiurlwidth: String(LARGEUR_CIBLE),
    redirects: "1",
  })
  const pages = data?.query?.pages || {}
  for (const page of Object.values(pages)) {
    const info = page?.imageinfo?.[0]
    if (info) return info.thumburl || info.url
  }
  return null
}

/** Renvoie l'URL de vignette du premier fichier image d'une categorie Commons. */
async function vignetteCategorie(categorie) {
  const data = await apiMediaWiki(API_COMMONS, {
    action: "query",
    generator: "categorymembers",
    gcmtitle: categorie.startsWith("Category:") ? categorie : `Category:${categorie}`,
    gcmtype: "file",
    gcmlimit: "10",
    prop: "imageinfo",
    iiprop: "url",
    iiurlwidth: String(LARGEUR_CIBLE),
  })
  const pages = Object.values(data?.query?.pages || {})
    .sort((a, b) => (a.title < b.title ? -1 : 1))
  for (const page of pages) {
    const titre = page.title || ""
    if (!/\.(jpe?g|png|svg|gif|tiff?)$/i.test(titre)) continue // evite les PDF, DJVU...
    const info = page?.imageinfo?.[0]
    if (info) return info.thumburl || info.url
  }
  return null
}

/** Renvoie l'URL de vignette du meilleur resultat d'une recherche Commons (espace Fichier). */
async function vignetteRecherche(nomLatin) {
  const data = await apiMediaWiki(API_COMMONS, {
    action: "query",
    generator: "search",
    gsrsearch: `${nomLatin} botanical illustration`,
    gsrnamespace: "6", // espace "File:"
    gsrlimit: "10",
    prop: "imageinfo",
    iiprop: "url",
    iiurlwidth: String(LARGEUR_CIBLE),
  })
  const pages = Object.values(data?.query?.pages || {})
    .sort((a, b) => (a.index || 99) - (b.index || 99))
  for (const page of pages) {
    const titre = page.title || ""
    if (!/\.(jpe?g|png|svg|gif|tiff?)$/i.test(titre)) continue
    const info = page?.imageinfo?.[0]
    if (info) return info.thumburl || info.url
  }
  return null
}

/** Chaine de repli pour une famille : fichier precis, puis categorie, puis recherche. */
async function planchePourFamille(famille) {
  if (famille.commonsAnatomie) {
    const url = await vignetteFichier(famille.commonsAnatomie).catch(() => null)
    if (url) return { url, via: "fichier manuel" }
  }
  if (famille.categorieAnatomie) {
    const url = await vignetteCategorie(famille.categorieAnatomie).catch(() => null)
    if (url) return { url, via: "categorie Commons" }
  }
  if (famille.nomLatin) {
    const url = await vignetteRecherche(famille.nomLatin).catch(() => null)
    if (url) return { url, via: "recherche Commons" }
  }
  return null
}

// --- Telechargement / optimisation --------------------------------------

async function existe(chemin) {
  try {
    await access(chemin)
    return true
  } catch {
    return false
  }
}

async function enregistrerImage(urlImage, destination) {
  const rep = await fetch(urlImage, { headers: { "User-Agent": UA } })
  if (!rep.ok) throw new Error(`telechargement ${rep.status}`)
  const buffer = Buffer.from(await rep.arrayBuffer())
  const optimisee = await sharp(buffer)
    .rotate()
    .resize({ width: LARGEUR_CIBLE, withoutEnlargement: true })
    .flatten({ background: "#ffffff" }) // fond blanc pour les PNG transparents / dessins au trait
    .jpeg({ quality: QUALITE_JPEG, mozjpeg: true })
    .toBuffer()
  await writeFile(destination, optimisee)
  return Math.round(optimisee.length / 1024)
}

/** Photo "champ" d'un legume via son "source" Wikipedia (repli : recherche). */
async function telechargerChamp(legume, destination) {
  const titre = titreDepuisSource(legume.source)
  let urlImage = titre ? await imageParTitre(titre) : null
  if (!urlImage) urlImage = await imageParRecherche(legume.nom)
  if (!urlImage) throw new Error("aucune image trouvee")
  return enregistrerImage(urlImage, destination)
}

async function main() {
  const data = JSON.parse(await readFile(join(RACINE, "data.json"), "utf-8"))
  await mkdir(DOSSIER_IMAGES, { recursive: true })
  await mkdir(DOSSIER_IMAGES_FAMILLES, { recursive: true })

  let ok = 0
  let ignores = 0
  const echecs = []

  // --- 1. Photo "champ" par legume ---------------------------------------
  for (const legume of data.legumes) {
    const destination = join(RACINE, legume.image)
    if (!forcer && (await existe(destination))) {
      ignores++
      continue
    }
    try {
      const ko = await telechargerChamp(legume, destination)
      ok++
      console.log(`+ ${legume.nom} (champ) : ${ko} Ko`)
    } catch (err) {
      echecs.push(`${legume.nom} (champ)`)
      console.warn(`! ${legume.nom} (champ) : echec (${err.message})`)
    }
    await new Promise((r) => setTimeout(r, 250))
  }

  // --- 2. Planche botanique par famille -----------------------------------
  for (const famille of data.familles || []) {
    if (!famille.imageAnatomie) continue
    const destination = join(RACINE, famille.imageAnatomie)
    if (!forcer && (await existe(destination))) {
      ignores++
      continue
    }
    try {
      const planche = await planchePourFamille(famille)
      if (!planche) throw new Error("aucune planche trouvee (ajouter commonsAnatomie dans data.json)")
      const ko = await enregistrerImage(planche.url, destination)
      ok++
      console.log(`+ ${famille.nom} (planche, via ${planche.via}) : ${ko} Ko`)
    } catch (err) {
      echecs.push(`${famille.nom} (planche)`)
      console.warn(`! ${famille.nom} (planche) : echec (${err.message})`)
    }
    await new Promise((r) => setTimeout(r, 250))
  }

  console.log(`\nTermine : ${ok} telechargees, ${ignores} ignorees, ${echecs.length} echecs`)
  if (echecs.length) {
    console.log(`A corriger manuellement (voir "source" / "commonsAnatomie" dans data.json) : ${echecs.join(", ")}`)
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error("Erreur fatale :", err)
  process.exit(1)
})