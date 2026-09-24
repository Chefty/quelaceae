/* =========================================================================
   Service Worker — Familles Maraîchage
   -------------------------------------------------------------------------
   Strategie : "cache-first" (le cache d'abord, le reseau seulement si absent).
   Objectif : apres le tout premier chargement, l'application fonctionne
   entierement hors ligne (mode avion), sans aucun appel reseau.

   IMPORTANT pour la maintenance :
   - Quand vous modifiez des fichiers (ou ajoutez des legumes/images), incrementez
     le numero de VERSION ci-dessous. Cela cree un nouveau cache et force la
     mise a jour chez les utilisateurs.
   ========================================================================= */

const VERSION = "v3" // v3 : plus de minuteur d'avance, bouton "Suivant" explicite
const CACHE = `familles-maraichage-${VERSION}`

// Fichiers de base ("app shell") a mettre en cache des l'installation.
// Chemins RELATIFS : fonctionne a la racine comme dans un sous-dossier GitHub Pages.
const FICHIERS_BASE = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "data.json",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
]

/* ---- Installation : on precharge le shell + toutes les images -------- */
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)

      // 1. Fichiers de base.
      await cache.addAll(FICHIERS_BASE)

      // 2. Toutes les images des legumes + les photos "indice de famille",
      //    lues depuis data.json. Ainsi, pas besoin de maintenir la liste
      //    des images ici a la main.
      try {
        const rep = await fetch("data.json", { cache: "no-cache" })
        const data = await rep.json()
        const imagesLegumes = (data.legumes || []).map((l) => l.image)
        const imagesFamilles = (data.familles || []).map((f) => f.imageAnatomie).filter(Boolean)
        const images = [...imagesLegumes, ...imagesFamilles]
        // On met en cache une par une pour ne pas tout faire echouer si une image manque.
        await Promise.all(
          images.map((src) =>
            cache.add(src).catch((err) => console.log("[v0] Image non mise en cache :", src, err.message)),
          ),
        )
      } catch (err) {
        console.log("[v0] Prechargement des images ignore :", err.message)
      }

      // Active immediatement ce nouveau Service Worker.
      await self.skipWaiting()
    })(),
  )
})

/* ---- Activation : on supprime les anciens caches --------------------- */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cles = await caches.keys()
      await Promise.all(cles.filter((c) => c !== CACHE).map((c) => caches.delete(c)))
      await self.clients.claim()
    })(),
  )
})

/* ---- Interception des requetes : cache d'abord ----------------------- */
self.addEventListener("fetch", (event) => {
  const req = event.request

  // On ne gere que les requetes GET (le reste passe directement au reseau).
  if (req.method !== "GET") return

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)

      // 1. Reponse en cache -> on la renvoie tout de suite.
      const enCache = await cache.match(req)
      if (enCache) return enCache

      // 2. Sinon reseau, et on met en cache au passage (utile au 1er chargement).
      try {
        const reseau = await fetch(req)
        if (reseau && reseau.ok && reseau.type === "basic") {
          cache.put(req, reseau.clone())
        }
        return reseau
      } catch {
        // 3. Hors ligne et non trouve : on retombe sur la page d'accueil pour les navigations.
        if (req.mode === "navigate") {
          const fallback = await cache.match("index.html")
          if (fallback) return fallback
        }
        // Dernier recours : reponse vide propre.
        return new Response("", { status: 504, statusText: "Hors ligne" })
      }
    })(),
  )
})
