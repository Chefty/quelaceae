/* =========================================================================
   Familles Maraîchage — logique du jeu (JavaScript vanilla, sans dependance)
   -------------------------------------------------------------------------
   Organisation du fichier :
     1. Constantes et etat global
     2. Persistance localStorage (progression, streak, erreurs, Leitner)
     3. Chargement des donnees (data.json)
     4. Systeme Leitner simplifie (3 boites, tirage pondere)
     5. Construction et deroulement d'une session
     6. Ecran de fin
     7. Navigation entre ecrans + branchement des boutons
   Pour un non-dev : la mecanique se regle surtout dans data.json (config +
   liste des legumes). Ce fichier n'a normalement pas besoin d'etre modifie.
   ========================================================================= */

;(() => {
  "use strict"

  /* ================= 1. Constantes et etat global ======================= */

  // Nombre de boutons de familles proposes par carte (le brief demande 4 a 6).
  const NB_CHOIX = 4
  // Delai avant l'auto-avance apres une reponse (en millisecondes).
  const DELAI_AVANCE = 700
  // Ponderation du tirage selon la boite Leitner (boite 1 = mal su = revient souvent).
  const POIDS_BOITE = { 1: 5, 2: 2, 3: 1 }

  // Cles de stockage localStorage.
  const CLE = {
    leitner: "fm_leitner",
    erreurs: "fm_erreurs",
    streak: "fm_streak",
  }

  // Donnees chargees depuis data.json.
  let DATA = null
  let familleParId = {} // id famille -> objet famille
  let legumeParId = {} // id legume -> objet legume

  // Etat de la session en cours.
  let session = null

  // Raccourci de selection DOM.
  const $ = (sel) => document.querySelector(sel)

  /* ================= 2. Persistance localStorage ======================== */

  // Lecture/ecriture tolerantes : si localStorage est indisponible, on continue
  // sans planter (mode navigation privee tres restrictif, par ex.).
  function lire(cle, valeurParDefaut) {
    try {
      const brut = localStorage.getItem(cle)
      return brut === null ? valeurParDefaut : JSON.parse(brut)
    } catch {
      return valeurParDefaut
    }
  }

  function ecrire(cle, valeur) {
    try {
      localStorage.setItem(cle, JSON.stringify(valeur))
    } catch {
      /* ignore : le jeu reste jouable sans sauvegarde */
    }
  }

  const lireLeitner = () => lire(CLE.leitner, {})
  const lireErreurs = () => lire(CLE.erreurs, [])
  const lireStreak = () => lire(CLE.streak, 0)

  /* ================= 3. Chargement des donnees ========================== */

  async function chargerDonnees() {
    const rep = await fetch("data.json", { cache: "no-cache" })
    if (!rep.ok) throw new Error("Impossible de charger data.json")
    DATA = await rep.json()

    familleParId = {}
    for (const f of DATA.familles) familleParId[f.id] = f

    legumeParId = {}
    for (const l of DATA.legumes) legumeParId[l.id] = l
  }

  /* ================= 4. Systeme Leitner ================================= */

  // Boite d'un legume : 1 (a revoir), 2 (moyen), 3 (bien su). Defaut : 2.
  function boiteDe(leitner, id) {
    const b = leitner[id]
    return b === 1 || b === 2 || b === 3 ? b : 2
  }

  // Met a jour la boite apres une reponse : bonne -> monte, mauvaise -> boite 1.
  function majBoite(leitner, id, correct) {
    const actuelle = boiteDe(leitner, id)
    leitner[id] = correct ? Math.min(3, actuelle + 1) : 1
  }

  // Tirage pondere SANS remise de "nombre" legumes parmi une liste d'ids.
  function tiragePondere(ids, nombre, leitner) {
    const pool = ids.map((id) => ({ id, poids: POIDS_BOITE[boiteDe(leitner, id)] }))
    const choisis = []
    const n = Math.min(nombre, pool.length)

    for (let k = 0; k < n; k++) {
      const total = pool.reduce((s, e) => s + e.poids, 0)
      let tir = Math.random() * total
      let index = 0
      for (let i = 0; i < pool.length; i++) {
        tir -= pool[i].poids
        if (tir <= 0) {
          index = i
          break
        }
      }
      choisis.push(pool[index].id)
      pool.splice(index, 1) // sans remise
    }
    return choisis
  }

  /* ================= 5. Session : construction et jeu =================== */

  // Melange un tableau (Fisher-Yates) sans modifier l'original.
  function melanger(tableau) {
    const t = tableau.slice()
    for (let i = t.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[t[i], t[j]] = [t[j], t[i]]
    }
    return t
  }

  // Construit la liste des cartes selon le mode ("normal" ou "revision").
  function construireCartes(mode) {
    const leitner = lireLeitner()
    const taille = (DATA.config && DATA.config.cartesParSession) || 12

    if (mode === "revision") {
      // On revoit uniquement les legumes en stock d'erreurs.
      const erreurs = lireErreurs().filter((id) => legumeParId[id])
      return melanger(erreurs)
    }

    // Mode normal : tirage pondere Leitner parmi tous les legumes.
    const tousIds = DATA.legumes.map((l) => l.id)
    return tiragePondere(tousIds, taille, leitner)
  }

  // Prepare les boutons de familles pour une carte : la bonne + des distracteurs.
  function choixPourLegume(legume) {
    const autres = DATA.familles.map((f) => f.id).filter((id) => id !== legume.famille)
    const distracteurs = melanger(autres).slice(0, Math.max(0, NB_CHOIX - 1))
    return melanger([legume.famille, ...distracteurs])
  }

  // Demarre une nouvelle session.
  function demarrerSession(mode) {
    const cartes = construireCartes(mode)

    if (cartes.length === 0) {
      // Rien a jouer (revision sans erreurs) : on reste a l'accueil.
      return
    }

    session = {
      mode,
      cartes,
      index: 0,
      reponses: [], // { id, correct }
      streak: lireStreak(),
      verrouille: false, // empeche le double-tap pendant le feedback
    }

    allerA("ecran-jeu")
    afficherCarte()
  }

  // Affiche la carte courante.
  function afficherCarte() {
    const id = session.cartes[session.index]
    const legume = legumeParId[id]
    session.verrouille = false

    // Header : progression + streak.
    const total = session.cartes.length
    const numero = session.index + 1
    $("#jeu-progression").textContent = `${numero} / ${total}`
    $("#progression-barre").style.width = `${(session.index / total) * 100}%`
    $("#streak-valeur").textContent = String(session.streak)

    // Photo + nom.
    const img = $("#carte-photo")
    img.src = legume.image
    img.alt = `Photo : ${legume.nom}`
    $("#carte-nom").textContent = legume.nom

    // Reinitialise le feedback.
    const fb = $("#feedback")
    fb.textContent = ""
    fb.className = "feedback"

    // (Re)genere les boutons de familles.
    const conteneur = $("#familles-boutons")
    conteneur.innerHTML = ""
    for (const familleId of choixPourLegume(legume)) {
      const btn = document.createElement("button")
      btn.type = "button"
      btn.className = "famille-btn"
      btn.textContent = familleParId[familleId].nom
      btn.dataset.famille = familleId
      btn.addEventListener("click", () => repondre(familleId, btn))
      conteneur.appendChild(btn)
    }
  }

  // Gere une reponse de l'utilisateur.
  function repondre(familleChoisie, boutonClique) {
    if (session.verrouille) return
    session.verrouille = true

    const id = session.cartes[session.index]
    const legume = legumeParId[id]
    const correct = familleChoisie === legume.famille

    // Enregistre la reponse pour le bilan de fin.
    session.reponses.push({ id, correct })

    // Met a jour la persistance (Leitner, erreurs, streak).
    appliquerResultat(id, correct)
    session.streak = correct ? session.streak + 1 : 0
    $("#streak-valeur").textContent = String(session.streak)

    // Feedback visuel sur les boutons.
    const boutons = document.querySelectorAll(".famille-btn")
    boutons.forEach((b) => {
      b.disabled = true
      const estBonne = b.dataset.famille === legume.famille
      if (estBonne) {
        b.classList.add("correct") // la bonne famille passe toujours en vert
      } else if (b === boutonClique) {
        b.classList.add("erreur") // le mauvais choix passe en rouge
      } else {
        b.classList.add("attenue")
      }
    })

    // Feedback textuel.
    const fb = $("#feedback")
    if (correct) {
      fb.textContent = "Correct"
      fb.className = "feedback est-correct"
    } else {
      fb.textContent = `Non — c'est : ${familleParId[legume.famille].nom}`
      fb.className = "feedback est-erreur"
    }

    // Auto-avance.
    window.setTimeout(avancer, DELAI_AVANCE)
  }

  // Applique le resultat d'une carte a la persistance.
  function appliquerResultat(id, correct) {
    // Leitner.
    const leitner = lireLeitner()
    majBoite(leitner, id, correct)
    ecrire(CLE.leitner, leitner)

    // Stock d'erreurs : on ajoute si rate, on retire si reussi.
    let erreurs = lireErreurs()
    if (correct) {
      erreurs = erreurs.filter((x) => x !== id)
    } else if (!erreurs.includes(id)) {
      erreurs.push(id)
    }
    ecrire(CLE.erreurs, erreurs)

    // Streak persistant.
    ecrire(CLE.streak, correct ? lireStreak() + 1 : 0)
  }

  // Passe a la carte suivante ou termine la session.
  function avancer() {
    session.index++
    if (session.index >= session.cartes.length) {
      terminerSession()
    } else {
      afficherCarte()
    }
  }

  /* ================= 6. Ecran de fin ==================================== */

  function terminerSession() {
    // Barre a 100 %.
    $("#progression-barre").style.width = "100%"

    const total = session.reponses.length
    const bons = session.reponses.filter((r) => r.correct).length

    $("#fin-score-valeur").textContent = `${bons} / ${total}`

    // Score par famille (uniquement les familles vues dans la session).
    const parFamille = {} // familleId -> { total, bons }
    for (const r of session.reponses) {
      const fam = legumeParId[r.id].famille
      if (!parFamille[fam]) parFamille[fam] = { total: 0, bons: 0 }
      parFamille[fam].total++
      if (r.correct) parFamille[fam].bons++
    }

    const listeFamilles = $("#fin-familles-liste")
    listeFamilles.innerHTML = ""
    Object.keys(parFamille)
      .sort((a, b) => familleParId[a].nom.localeCompare(familleParId[b].nom, "fr"))
      .forEach((famId) => {
        const { total: t, bons: b } = parFamille[famId]
        const li = document.createElement("li")
        const bonScore = b === t
        li.innerHTML =
          `<span class="ligne-legume">${familleParId[famId].nom}</span>` +
          `<span class="pastille ${bonScore ? "bon" : "mauvais"}">${b} / ${t}</span>`
        listeFamilles.appendChild(li)
      })

    // Cartes ratees pendant CETTE session (avec la bonne famille rappelee).
    const rateesSession = session.reponses.filter((r) => !r.correct).map((r) => r.id)
    const uniques = [...new Set(rateesSession)]

    const blocErreurs = $("#fin-erreurs")
    const listeErreurs = $("#fin-erreurs-liste")
    listeErreurs.innerHTML = ""
    if (uniques.length > 0) {
      blocErreurs.hidden = false
      for (const id of uniques) {
        const legume = legumeParId[id]
        const li = document.createElement("li")
        li.innerHTML =
          `<span class="ligne-legume">${legume.nom}</span>` +
          `<span class="ligne-detail">${familleParId[legume.famille].nom}</span>`
        listeErreurs.appendChild(li)
      }
    } else {
      blocErreurs.hidden = true
    }

    // Message "sans faute".
    $("#fin-parfait").hidden = uniques.length !== 0

    // Bouton "Reviser les erreurs" : visible si on a des erreurs en stock.
    const stock = lireErreurs()
    $("#btn-reviser-fin").hidden = stock.length === 0

    allerA("ecran-fin")
  }

  /* ================= 7. Navigation + branchements ======================= */

  // Affiche un ecran et masque les autres.
  function allerA(idEcran) {
    document.querySelectorAll(".ecran").forEach((e) => e.classList.remove("actif"))
    $(`#${idEcran}`).classList.add("actif")
    // Repart en haut de page (utile sur l'ecran de fin).
    window.scrollTo(0, 0)
  }

  // Met a jour l'accueil (bouton revision + note de reprise) a chaque affichage.
  function rafraichirAccueil() {
    const erreurs = lireErreurs()
    const btnRev = $("#btn-reviser-accueil")
    $("#compte-erreurs").textContent = String(erreurs.length)
    btnRev.hidden = erreurs.length === 0

    const streak = lireStreak()
    const note = $("#accueil-reprise")
    if (streak > 0) {
      note.hidden = false
      note.textContent = `Série en cours : ${streak}`
    } else {
      note.hidden = true
    }
  }

  function retourAccueil() {
    rafraichirAccueil()
    allerA("ecran-accueil")
  }

  function brancherBoutons() {
    $("#btn-jouer").addEventListener("click", () => demarrerSession("normal"))
    $("#btn-reviser-accueil").addEventListener("click", () => demarrerSession("revision"))
    $("#btn-rejouer").addEventListener("click", () => demarrerSession("normal"))
    $("#btn-reviser-fin").addEventListener("click", () => demarrerSession("revision"))
    $("#btn-accueil").addEventListener("click", retourAccueil)
  }

  /* ================= Enregistrement du Service Worker =================== */

  function enregistrerSW() {
    if (!("serviceWorker" in navigator)) return
    // Chemin relatif : fonctionne aussi bien a la racine que dans un sous-dossier
    // (utile pour GitHub Pages du type user.github.io/familles-maraichage/).
    const inscrire = () =>
      navigator.serviceWorker.register("sw.js").catch((err) => {
        console.log("[v0] Service Worker non enregistre :", err.message)
      })
    // Si la page est deja chargee (script execute apres l'evenement "load"),
    // on inscrit tout de suite ; sinon on attend "load" pour ne pas gener le 1er rendu.
    if (document.readyState === "complete") {
      inscrire()
    } else {
      window.addEventListener("load", inscrire, { once: true })
    }
  }

  /* ================= Demarrage ========================================== */

  async function init() {
    try {
      await chargerDonnees()
      brancherBoutons()
      rafraichirAccueil()
      enregistrerSW()
    } catch (err) {
      console.log("[v0] Erreur d'initialisation :", err.message)
      document.body.innerHTML =
        '<main style="padding:24px;font-family:system-ui;color:#1a1a1a">' +
        "<h1>Oups</h1><p>Impossible de charger les données du jeu. Rechargez la page.</p></main>"
    }
  }

  init()
})()
