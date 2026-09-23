// Petit serveur de fichiers statiques pour le developpement local uniquement.
// Il n'est PAS necessaire au deploiement (GitHub Pages sert les fichiers directement).
// Il existe surtout parce que le Service Worker exige http://localhost ou HTTPS.
//
// Lancement : npm run dev   puis ouvrir http://localhost:3000

import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { extname, join, normalize } from "node:path"
import { fileURLToPath } from "node:url"
import { dirname } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 5001

// Types MIME minimaux dont l'application a besoin.
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
}

const server = createServer(async (req, res) => {
  try {
    // On enleve la query string et on empeche de sortir du dossier (../).
    let urlPath = decodeURIComponent((req.url || "/").split("?")[0])
    if (urlPath === "/") urlPath = "/index.html"
    const safePath = normalize(urlPath).replace(/^(\.\.[/\\])+/, "")
    const filePath = join(__dirname, safePath)

    const data = await readFile(filePath)
    const type = TYPES[extname(filePath).toLowerCase()] || "application/octet-stream"
    res.writeHead(200, { "Content-Type": type })
    res.end(data)
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
    res.end("404 - Fichier introuvable")
  }
})

server.listen(PORT, () => {
  console.log(`[v0] Serveur statique local sur http://localhost:${PORT}`)
})
