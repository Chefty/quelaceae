# Familles Maraîchage

PWA éducative en français pour apprendre les **familles botaniques** des légumes, aromatiques, céréales et fruits.
Pensée pour la formation maraîchère (BPREA, CFPPA…) : on ouvre l'URL, on joue en 2 secondes,
sans compte, et ça **fonctionne hors ligne** après le premier chargement.

- 107 végétaux, 23 familles botaniques (légumes, aromatiques/médicinales, céréales & pseudo-céréales, fruits)
- 2 images par végétal : une **photo en culture** + une **planche botanique** (indice de détermination de la famille)
- Sessions courtes (12 cartes par défaut)
- Les cartes ratées reviennent plus souvent (système Leitner à 3 niveaux)
- Révision des erreurs, score par famille, série (streak)
- Fiches familles consultables (critère de détermination pour chacune)
- 100 % statique : HTML + CSS + JavaScript, **sans framework ni build**
- Progression enregistrée dans le navigateur (localStorage)

---

## Sommaire

- [Lancer en local](#lancer-en-local)
- [Structure du projet](#structure-du-projet)
- [Les deux types d'images](#les-deux-types-dimages)
- [Ajouter un végétal](#ajouter-un-végétal)
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
├── index.html          # page unique (écrans : accueil, jeu, fin, fiches)
├── style.css           # styles (mobile-first, gros boutons, fort contraste)
├── app.js              # logique du jeu (sessions, Leitner, carrousel 2 photos, fiches)
├── sw.js               # Service Worker (cache-first, offline)
├── manifest.json       # métadonnées PWA (installation sur l'écran d'accueil)
├── data.json           # DONNÉES : familles + végétaux (voir ci-dessous)
├── icons/              # icônes de l'application (192 et 512 px)
├── images/             # une photo "en culture" par végétal (images/<id>.jpg)
├── images/familles/    # une planche botanique par famille (images/familles/<famille>-anatomie.jpg)
├── scripts/
│   └── fetch-images.mjs # télécharge + redimensionne + compresse les images
├── server.mjs          # serveur statique local (dev uniquement)
├── package.json        # scripts npm (dev, fetch-images) + dépendance sharp (dev)
└── README.md
```

**Le seul fichier à modifier au quotidien est `data.json`.**

---

## Les deux types d'images

Chaque carte affiche un carrousel de 2 images (swipe ou clic sur les points) :

1. **Photo « champ »** — le végétal tel qu'on le voit en culture
   (image principale de sa page Wikipédia FR). Une par végétal : `images/<id>.jpg`.
2. **Planche botanique** — un dessin scientifique montrant le critère diagnostique
   de la famille (fleur, fruit, port). **Une seule par famille**, mutualisée entre
   tous ses végétaux : `images/familles/<famille>-anatomie.jpg`.

> ⚠️ Dans l'interface, la planche n'est **pas** une photo du végétal affiché : c'est
> l'indice qui permet de reconnaître sa famille. Le libellé dans l'app doit le rendre
> clair pour éviter toute confusion avec la photo de culture.

La planche de famille est définie par les champs de la famille dans `data.json` :

- `imageAnatomie` : chemin de destination (`images/familles/<id>-anatomie.jpg`) ;
- `sourceAnatomie` : page Wikipédia FR de la famille (repli) ;
- `commonsAnatomie` *(optionnel, le plus fiable)* : titre exact d'un fichier
  Wikimedia Commons, ex. `"File:Thome Flora von Deutschland ... Tafel 049.jpg"` ;
- `categorieAnatomie` *(optionnel)* : catégorie Commons entière
  (ex. `"Category:Botanical illustrations of Poaceae"`).

Le script essaie dans l'ordre : `commonsAnatomie` → `categorieAnatomie` → recherche
automatique Commons (`nomLatin + "botanical illustration"`). La recherche automatique
manque parfois de précision : dans ce cas, renseignez `commonsAnatomie` à la main,
ou déposez directement le bon fichier `.jpg` dans `images/familles/`.

---

## Ajouter un végétal

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
   - **`image`** : chemin `images/<id>.jpg` (photo en culture).
   - **`source`** : page Wikipédia FR du végétal (utilisée par le script d'images).

   La planche botanique de la carte est celle de sa famille — rien à ajouter ici.

3. Récupérer l'image :

   ```bash
   npm run fetch-images
   ```

   Le script ne télécharge que les images manquantes et crée `images/radis-noir.jpg`.
   (Vous pouvez aussi déposer votre propre photo `.jpg` dans `images/` sans lancer le script.)

4. **Important :** incrémenter le numéro de version dans `sw.js` (`const VERSION = "v3"` → `"v4"`)
   pour que les utilisateurs reçoivent le nouveau contenu hors ligne.

---

## Ajouter une famille

1. Ouvrir **`data.json`**.
2. Dans le tableau `"familles"`, ajouter un objet :

   ```json
   {
     "id": "lamiacees",
     "nom": "Lamiacées",
     "nomLatin": "Lamiaceae",
     "critere": "Tige carrée, feuilles opposées, fleur à 2 lèvres",
     "imageAnatomie": "images/familles/lamiacees-anatomie.jpg",
     "sourceAnatomie": "https://fr.wikipedia.org/wiki/Lamiaceae"
   }
   ```

   - **`id`** : identifiant unique en minuscules, sans espace ni accent.
   - **`nom`** : nom affiché sur les boutons.
   - **`nomLatin`** : nom scientifique (utilisé par la recherche Commons pour la planche).
   - **`critere`** : le repère visuel botanique — affiché dans le feedback du jeu et les fiches.
   - **`imageAnatomie`** / **`sourceAnatomie`** : voir [Les deux types d'images](#les-deux-types-dimages).

3. Rattacher au moins un végétal à cette famille (via son champ `"famille"`), sinon elle
   n'apparaîtra jamais dans le jeu.
4. Incrémenter la `VERSION` dans `sw.js`.

> Astuce : le jeu propose 4 boutons de familles par carte (1 bonne + 3 pièges).
> Il faut donc **au moins 4 familles** dans `data.json` pour que les cartes s'affichent correctement.

---

## Télécharger / remplacer les images

Le script `scripts/fetch-images.mjs` (v2) :

1. lit `data.json` ;
2. pour chaque végétal, récupère la photo principale de sa page Wikipédia FR
   (champ `source`), avec repli sur une recherche par nom si besoin ;
3. pour chaque famille, récupère une **planche botanique** depuis Wikimedia Commons
   (stratégies détaillées plus haut) ;
4. redimensionne tout à ~800 px de large et compresse en JPEG (fond blanc aplati
   pour les dessins au trait).

```bash
npm install                      # une seule fois (installe sharp)
npm run fetch-images             # télécharge uniquement les images manquantes
npm run fetch-images -- --force  # re-télécharge TOUTES les images
```

En cas d'échec (page sans photo, planche introuvable…), le script l'indique en fin
d'exécution. Pour corriger :

- changer le champ `source` dans `data.json` ;
- renseigner `commonsAnatomie` avec un fichier Commons précis ;
- ou déposer manuellement le bon fichier `.jpg` dans `images/` ou `images/familles/`
  (le script ignore les fichiers déjà présents).

> La recherche automatique de planches est heuristique : elle peut renvoyer un dessin
> approximatif. Après un premier passage, contrôlez visuellement les planches dans
> `images/familles/` et remplacez à la main celles qui ne sont pas explicites — c'est
> la méthode recommandée, chaque planche étant mutualisée entre tous les végétaux de
> la famille (une correction profite à toute la famille).

> Toutes les images proviennent de Wikimedia Commons / Wikipédia. Vérifiez la licence de
> chaque image avant une diffusion publique et créditez les auteurs si nécessaire. Les
> planches botaniques historiques (Thomé, Curtis…) sont généralement dans le domaine public.

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
- **Offline** : le Service Worker met en cache la coquille de l'app + toutes les images
  (photos de végétaux ET planches de familles) au premier chargement (stratégie *cache-first*).
- **Persistance** : `localStorage` (progression Leitner, stock d'erreurs, série). Rien côté serveur.
- **Pédagogie** : feedback immédiat non bloquant avec le critère « pourquoi » (sans boite
  de dialogue), avancement manuel via bouton « Suivant », carrousel 2 images (photo de
  culture → planche botanique de la famille), fiches familles récapitulatives.
- **Accessibilité** : HTML sémantique, zones `aria-live` pour le feedback, cibles tactiles ≥ 56 px,
  fort contraste pour la lisibilité en extérieur.