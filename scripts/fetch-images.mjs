/**
 * fetch-images.mjs
 * -----------------
 * Telecharge une photo pour chaque legume de data.json depuis Wikimedia / Wikipedia,
 * la redimensionne a ~800px de large et la compresse, puis l'enregistre dans /images/.
 *
 * Objectif : "un legume = un fichier images/<id>.jpg", sans aucun appel reseau au runtime.
 * On lance ce script UNE FOIS lors de la preparation du repo (ou apres avoir ajoute un legume).
 *
 * Pre-requis : Node 18+ (fetch integre) et le paquet "sharp".
 *   npm install
 *   npm run fetch-images            # tous les legumes manquants
 *   npm run fetch-images -- --force # re-telecharge meme si l'image existe deja
 *
 * Comment ca marche (robuste face aux URLs Wikimedia fragiles) :
 *   1. On lit le titre de page Wikipedia FR depuis le champ "source" de chaque legume.
 *   2. On demande a l'API MediaWiki l'image principale de cette page (prop=pageimages, original).
 *   3. Si la page n'a pas d'image, on retombe sur une recherche par le nom du legume.
 *   4. On telecharge l'image d'origine, on la redimensionne/compresse avec sharp.
 *
 * Pour un non-dev : il n'y a rien a modifier ici. Pour changer une image, il suffit
 * de changer l'URL "source" dans data.json (ou de deposer un .jpg a la main dans /images/).
 */

import { readFile, mkdir, writeFile, access } from "node:fs/promises"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const __dirname = dirname(fileURLToPath(import.meta.url))
const RACINE = join(__dirname, "..")
const DOSSIER_IMAGES = join(RACINE, "images")
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

async function main() {
  const data = JSON.parse(await readFile(join(RACINE, "data.json"), "utf-8"))
  await mkdir(DOSSIER_IMAGES, { recursive: true })

  let ok = 0
  let ignores = 0
  const echecs = []

  for (const legume of data.legumes) {
    const destination = join(RACINE, legume.image)

    if (!forcer && (await existe(destination))) {
      ignores++
      console.log(`= ${legume.nom} : deja present, ignore`)
      continue
    }

    try {
      const titre = titreDepuisSource(legume.source)
      let urlImage = titre ? await imageParTitre(titre) : null
      if (!urlImage) urlImage = await imageParRecherche(legume.nom)
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
      const ko = Math.round(optimisee.length / 1024)
      ok++
      console.log(`+ ${legume.nom} : ${ko} Ko -> ${legume.image}`)
    } catch (err) {
      echecs.push(legume.nom)
      console.warn(`! ${legume.nom} : echec (${err.message})`)
    }

    // Petite pause pour rester poli avec l'API Wikimedia.
    await new Promise((r) => setTimeout(r, 250))
  }

  console.log(`\nTermine : ${ok} telechargees, ${ignores} ignorees, ${echecs.length} echecs`)
  if (echecs.length) {
    console.log(`A corriger manuellement (verifier le champ "source" dans data.json) : ${echecs.join(", ")}`)
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error("Erreur fatale :", err)
  process.exit(1)
})
