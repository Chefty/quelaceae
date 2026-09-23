/**
 * fetch-images.mjs
 * -----------------
 * Telecharge :
 *   1. une photo "champ" pour chaque legume de data.json (comme avant) ;
 *   2. une photo "indice de famille" (fleur/port caracteristique) pour chaque
 *      FAMILLE, mutualisee entre tous ses legumes (feature carrousel 2 photos).
 * Les deux sont redimensionnees a ~800px de large et compressees, puis
 * enregistrees dans /images/ (legumes) et /images/familles/ (familles).
 *
 * Pourquoi une photo par FAMILLE plutot que par legume : l'API Wikipedia ne
 * renvoie qu'UNE SEULE image "principale" par page, et la page d'un legume
 * (ex. "Tomate") montre presque toujours le fruit, jamais un detail de fleur.
 * En revanche la page Wikipedia de la famille botanique (ex. "Solanaceae")
 * montre generalement une fleur typique de la famille : c'est exactement le
 * critere diagnostique qu'on veut enseigner, et un seul telechargement suffit
 * pour tous les legumes de cette famille.
 *
 * Pre-requis : Node 18+ (fetch integre) et le paquet "sharp".
 *   npm install
 *   npm run fetch-images            # tout ce qui manque (legumes + familles)
 *   npm run fetch-images -- --force # re-telecharge tout
 *
 * Comment ca marche (robuste face aux URLs Wikimedia fragiles) :
 *   1. On lit le titre de page Wikipedia FR depuis "source" (legume) ou
 *      "sourceAnatomie" (famille).
 *   2. On demande a l'API MediaWiki l'image principale de cette page (prop=pageimages, original).
 *   3. Si la page n'a pas d'image, on retombe sur une recherche par nom.
 *   4. On telecharge l'image d'origine, on la redimensionne/compresse avec sharp.
 *
 * Pour un non-dev : il n'y a rien a modifier ici. Pour changer une image, il
 * suffit de changer "source"/"sourceAnatomie" dans data.json (ou de deposer
 * un .jpg a la main dans /images/ ou /images/familles/).
 */

import { readFile, mkdir, writeFile, access } from "node:fs/promises"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const __dirname = dirname(fileURLToPath(import.meta.url))
const RACINE = join(__dirname, "..")
const DOSSIER_IMAGES = join(RACINE, "images")
const DOSSIER_IMAGES_FAMILLES = join(DOSSIER_IMAGES, "familles")
const LARGEUR_CIBLE = 800 // largeur max en pixels
const QUALITE_JPEG = 72 // compromis poids / lisibilite

// User-Agent poli exige par les API Wikimedia.
const UA = "FamillesMaraichage/1.0 (PWA educative; contact: exemple@exemple.fr)"
const API = "https://fr.wikipedia.org/w/api.php"

const forcer = process.argv.includes("--force")

/** Extrait le titre de page depuis une URL Wikipedia (…/wiki/Titre_ici). */
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

/** Appelle l'API MediaWiki et renvoie le JSON. */
async function apiMediaWiki(params) {
  const url = `${API}?${new URLSearchParams({ format: "json", origin: "*", ...params })}`
  const rep = await fetch(url, { headers: { "User-Agent": UA } })
  if (!rep.ok) throw new Error(`API ${rep.status}`)
  return rep.json()
}

/** Recupere l'URL de l'image principale via le titre exact (avec suivi des redirections). */
async function imageParTitre(titre) {
  const data = await apiMediaWiki({
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

/** Repli : recherche l'article le plus pertinent par mot-cle, puis prend son image. */
async function imageParRecherche(motCle) {
  const data = await apiMediaWiki({
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

/** Vrai si le fichier existe deja. */
async function existe(chemin) {
  try {
    await access(chemin)
    return true
  } catch {
    return false
  }
}

/**
 * Trouve puis telecharge/redimensionne l'image d'une page Wikipedia (via son
 * "source"), l'enregistre a "destination". Renvoie le poids en Ko en cas de succes.
 * Leve une erreur explicite en cas d'echec (page sans image, telechargement KO...).
 */
async function telechargerImagePourEntree(source, nomRepli, destination) {
  const titre = titreDepuisSource(source)
  let urlImage = titre ? await imageParTitre(titre) : null
  if (!urlImage) urlImage = await imageParRecherche(nomRepli)
  if (!urlImage) throw new Error("aucune image trouvee")

  const rep = await fetch(urlImage, { headers: { "User-Agent": UA } })
  if (!rep.ok) throw new Error(`telechargement ${rep.status}`)
  const buffer = Buffer.from(await rep.arrayBuffer())

  // Redimensionnement (jamais d'agrandissement) + compression JPEG.
  const optimisee = await sharp(buffer)
    .rotate() // respecte l'orientation EXIF
    .resize({ width: LARGEUR_CIBLE, withoutEnlargement: true })
    .jpeg({ quality: QUALITE_JPEG, mozjpeg: true })
    .toBuffer()

  await writeFile(destination, optimisee)
  return Math.round(optimisee.length / 1024)
}

async function main() {
  const data = JSON.parse(await readFile(join(RACINE, "data.json"), "utf-8"))
  await mkdir(DOSSIER_IMAGES, { recursive: true })
  await mkdir(DOSSIER_IMAGES_FAMILLES, { recursive: true })

  let ok = 0
  let ignores = 0
  const echecs = []

  // --- 1. Photo "champ" par legume (comme avant) -------------------------
  for (const legume of data.legumes) {
    const destination = join(RACINE, legume.image)

    if (!forcer && (await existe(destination))) {
      ignores++
      console.log(`= ${legume.nom} : deja present, ignore`)
      continue
    }

    try {
      const ko = await telechargerImagePourEntree(legume.source, legume.nom, destination)
      ok++
      console.log(`+ ${legume.nom} (champ) : ${ko} Ko -> ${legume.image}`)
    } catch (err) {
      echecs.push(`${legume.nom} (champ)`)
      console.warn(`! ${legume.nom} (champ) : echec (${err.message})`)
    }

    // Petite pause pour rester poli avec l'API Wikimedia.
    await new Promise((r) => setTimeout(r, 250))
  }

  // --- 2. Photo "indice de famille" (fleur/port typique), UNE par famille -
  // Mutualisee entre tous les legumes de la famille : voir l'explication en
  // tete de fichier. Necessite "imageAnatomie" + "sourceAnatomie" dans data.json.
  for (const famille of data.familles || []) {
    if (!famille.imageAnatomie) continue // famille pas encore configuree, on saute
    const destination = join(RACINE, famille.imageAnatomie)

    if (!forcer && (await existe(destination))) {
      ignores++
      console.log(`= ${famille.nom} : indice deja present, ignore`)
      continue
    }

    try {
      const ko = await telechargerImagePourEntree(famille.sourceAnatomie, famille.nom, destination)
      ok++
      console.log(`+ ${famille.nom} (indice famille) : ${ko} Ko -> ${famille.imageAnatomie}`)
    } catch (err) {
      echecs.push(`${famille.nom} (indice famille)`)
      console.warn(`! ${famille.nom} (indice famille) : echec (${err.message})`)
    }

    await new Promise((r) => setTimeout(r, 250))
  }

  console.log(`\nTermine : ${ok} telechargees, ${ignores} ignorees, ${echecs.length} echecs`)
  if (echecs.length) {
    console.log(`A corriger manuellement (verifier "source"/"sourceAnatomie" dans data.json) : ${echecs.join(", ")}`)
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error("Erreur fatale :", err)
  process.exit(1)
})
