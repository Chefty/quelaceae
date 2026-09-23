# Familles Maraîchage

PWA éducative en français pour apprendre les **familles botaniques** des fruits et légumes.
Pensée pour la formation maraîchère (BPREA, CFPPA…) : on ouvre l'URL, on joue en 2 secondes,
sans compte, et ça **fonctionne hors ligne** après le premier chargement.

- 35 légumes, 8 familles botaniques
- Sessions courtes (12 cartes par défaut)
- Les cartes ratées reviennent plus souvent (système Leitner à 3 niveaux)
- Révision des erreurs, score par famille, série (streak)
- 100 % statique : HTML + CSS + JavaScript, **sans framework ni build**
- Progression enregistrée dans le navigateur (localStorage)

---

## Sommaire

- [Lancer en local](#lancer-en-local)
- [Structure du projet](#structure-du-projet)
- [Ajouter un légume](#ajouter-un-légume)
- [Ajouter une famille](#ajouter-une-famille)
- [Télécharger / remplacer les images](#télécharger--remplacer-les-images)
- [Déployer sur GitHub Pages](#déployer-sur-github-pages)
- [Déployer sur Cloudflare Pages](#déployer-sur-cloudflare-pages)

---

## Lancer en local

L'application est **entièrement statique**. Ouvrir `index.html` dans un navigateur suffit
pour tester le jeu.

**Attention :** le mode hors ligne (Service Worker) ne fonctionne **que** via `http://localhost`
ou `https://` — pas en `file://`. Pour tester l'offline en local, utilisez le petit serveur fourni :

```bash
npm install      # installe uniquement l'outil d'images (sharp), pour le dev
npm run dev      # sert le site sur http://localhost:3000
```

> Node 18 ou plus récent est requis pour le serveur de dev et le script d'images.
> `npm install` et `server.mjs` ne sont **pas** nécessaires au déploiement : GitHub Pages
> et Cloudflare Pages servent directement les fichiers.

---

## Structure du projet

```
familles-maraichage/
├── index.html          # page unique (3 écrans : accueil, jeu, fin)
├── style.css           # styles (mobile-first, gros boutons, fort contraste)
├── app.js              # logique du jeu (sessions, Leitner, score, localStorage)
├── sw.js               # Service Worker (cache-first, offline)
├── manifest.json       # métadonnées PWA (installation sur l'écran d'accueil)
├── data.json           # DONNÉES : familles + légumes (voir ci-dessous)
├── icons/              # icônes de l'application (192 et 512 px)
├── images/             # une photo par légume (images/<id>.jpg)
├── scripts/
│   └── fetch-images.mjs # télécharge + redimensionne + compresse les images
├── server.mjs          # serveur statique local (dev uniquement)
├── package.json        # scripts npm (dev, fetch-images) + dépendance sharp (dev)
└── README.md
```

**Le seul fichier à modifier au quotidien est `data.json`.**

---

## Ajouter un légume

1. Ouvrir **`data.json`**.
2. Dans le tableau `"legumes"`, ajouter un objet. Exemple pour ajouter le radis noir :

   ```json
   {
     "id": "radis-noir",
     "nom": "Radis noir",
     "famille": "brassicacees",
     "image": "images/radis-noir.jpg",
     "source": "https://fr.wikipedia.org/wiki/Radis_noir"
   }
   ```

   - **`id`** : identifiant unique, en minuscules, sans espace ni accent (sert de nom de fichier image).
   - **`nom`** : le nom affiché à l'écran (accents autorisés).
   - **`famille`** : doit correspondre à un `id` présent dans le tableau `"familles"`.
   - **`image`** : chemin `images/<id>.jpg`.
   - **`source`** : page Wikipédia FR du légume (utilisée par le script d'images).

3. Récupérer l'image :

   ```bash
   npm run fetch-images
   ```

   Le script ne télécharge que les images manquantes et crée `images/radis-noir.jpg`.
   (Vous pouvez aussi déposer votre propre photo `.jpg` dans `images/` sans lancer le script.)

4. **Important :** incrémenter le numéro de version dans `sw.js` (`const VERSION = "v1"` → `"v2"`)
   pour que les utilisateurs reçoivent le nouveau contenu hors ligne.

---

## Ajouter une famille

1. Ouvrir **`data.json`**.
2. Dans le tableau `"familles"`, ajouter un objet :

   ```json
   { "id": "lamiacees", "nom": "Lamiacées" }
   ```

   - **`id`** : identifiant unique en minuscules, sans espace ni accent.
   - **`nom`** : nom affiché sur les boutons.

3. Rattacher au moins un légume à cette famille (via son champ `"famille"`), sinon elle
   n'apparaîtra jamais dans le jeu.
4. Incrémenter la `VERSION` dans `sw.js`.

> Astuce : le jeu propose 4 boutons de familles par carte (1 bonne + 3 pièges).
> Il faut donc **au moins 4 familles** dans `data.json` pour que les cartes s'affichent correctement.

---

## Télécharger / remplacer les images

Le script `scripts/fetch-images.mjs` :

1. lit `data.json` ;
2. pour chaque légume, récupère la photo principale de sa page Wikipédia FR
   (champ `source`), avec repli sur une recherche par nom si besoin ;
3. redimensionne à ~800 px de large et compresse en JPEG.

```bash
npm install                      # une seule fois (installe sharp)
npm run fetch-images             # télécharge uniquement les images manquantes
npm run fetch-images -- --force  # re-télécharge TOUTES les images
```

En cas d'échec sur un légume (page sans photo, etc.), le script l'indique en fin d'exécution :
corrigez le champ `source` dans `data.json`, ou déposez manuellement un fichier
`images/<id>.jpg`. Le poids total des images doit rester raisonnable (objectif < 5 Mo).

> Toutes les photos proviennent de Wikimedia Commons / Wikipédia. Vérifiez la licence de chaque
> image avant une diffusion publique et créditez les auteurs si nécessaire.

---

## Déployer sur GitHub Pages

1. Créer un dépôt (par exemple `familles-maraichage`) et y pousser **tout le contenu du dossier**
   (les images incluses — elles doivent être commitées) :

   ```bash
   git init
   git add .
   git commit -m "Familles Maraîchage — POC"
   git branch -M main
   git remote add origin https://github.com/<votre-compte>/familles-maraichage.git
   git push -u origin main
   ```

2. Sur GitHub : **Settings → Pages**.
3. Dans **Build and deployment**, choisir **Source : Deploy from a branch**.
4. Sélectionner la branche **`main`** et le dossier **`/ (root)`**, puis **Save**.
5. Patienter ~1 minute. Le site sera disponible à :

   ```
   https://<votre-compte>.github.io/familles-maraichage/
   ```

Les chemins du projet sont **relatifs**, donc l'application fonctionne sans réglage
supplémentaire même dans ce sous-dossier `/familles-maraichage/`.

> **Mise à jour du contenu :** après avoir modifié `data.json` ou des images, pensez à
> incrémenter `VERSION` dans `sw.js`, puis `git commit` + `git push`. Sans ça, les visiteurs
> déjà venus garderont l'ancienne version en cache (offline).

---

## Déployer sur Cloudflare Pages

Alternative tout aussi simple (statique pur, aucune configuration de build) :

1. Pousser le projet sur un dépôt GitHub/GitLab (voir ci-dessus).
2. Sur le tableau de bord Cloudflare : **Workers & Pages → Create → Pages → Connect to Git**.
3. Sélectionner le dépôt.
4. Réglages de build :
   - **Framework preset :** `None`
   - **Build command :** *(laisser vide)*
   - **Build output directory :** `/` (la racine du dépôt)
5. **Save and Deploy**. Le site sera publié sur une URL `*.pages.dev`.

---

## Choix techniques (résumé)

- **Aucune dépendance au runtime** : pas de CDN, pas de police externe (polices système),
  aucun appel réseau pendant le jeu.
- **Offline** : le Service Worker met en cache la coquille de l'app + toutes les images au
  premier chargement (stratégie *cache-first*).
- **Persistance** : `localStorage` (progression Leitner, stock d'erreurs, série). Rien côté serveur.
- **Accessibilité** : HTML sémantique, zones `aria-live` pour le feedback, cibles tactiles ≥ 56 px,
  fort contraste pour la lisibilité en extérieur.
