# Couverture US-45 — Interface : lecteur et fiches (codeur ui-6, lot 10)

Branche `feat/ui-6` (depuis `main` feb306e). Lanceurs : `NODE_OPTIONS=--tls-max-v1.2 npm run check`,
`npm run test:unit`, `npm run build`, `npm run test:dist`, `npm run test:e2e` (application complete contre
`tests/e2e/serveur-factice.mjs`, jamais le vrai fournisseur ; `NAVIGATEURS=chromium,firefox,webkit` pour
les parcours multi-moteurs, defaut : les trois). Banc commun des parcours US-45 : `tests/e2e/us45-banc.mjs`
(repris des scripts d'audit B/commun.mjs, C/commun.mjs, D/zombie.mjs). Chaque verification est marquee
« CAn » dans la sortie.

| CA | Exigence | Couvert par | Etat |
|----|----------|-------------|------|
| CA1 | « Arrêter le flux », « Fermer la lecture », « Retour » du panneau d'erreur detachent la video (src vide, `load()`, place rendue), notent la position de sortie dans `reprises` et l'envoient tout de suite (`keepalive` a la sortie, a la pause, au `pagehide`), demontent la couche, sans « Stale read » : le nettoyage ne lit plus `props.entree` (valeurs capturees, `direct` memo, `duree`/`position` sans props) | `tests/e2e/us45-arret.mjs` (chromium, firefox, webkit : croix apres aller-retour mini-lecteur, « Fermer la lecture », « Retour » de l'erreur 415, Echap puis Fermer, pause -> PUT immediat ; apres chaque arret : aucune `<video>` avec source, `pageerror` = 0, position dans `reprises`, `PUT /profil/historique` recu, couche absente de Ma liste / Reglages / Direct) ; `tests/unit/sortie-lecteur.test.ts`. Base : D/zombie.mjs, B/01. **Mutation** : rendre `direct` une fonction qui relit `props.entree.type` dans le nettoyage -> `Stale read from <Show>` x3, 26/30 (position absente, couche presente) | vert (3 moteurs) |
| CA2 | Une seule regle de retour : Retour, Echap, « Fermer la lecture » et la fin de lecture = ecran precedent (pile ; pile vide : fiche du contenu, sinon accueil) ; requete de recherche conservee ; mini-lecteur ne navigue jamais ; fiche serie = `history.back()` | `tests/e2e/us45-retour.mjs` (accueil -> fiche -> lecture -> Retour = fiche avec mini-lecteur ; Fermer du mini-lecteur ne navigue pas ; recherche -> lecture -> Echap = `/recherche?q=…` ; guide -> lecture -> Arrêter = guide ; fiche serie Retour/Echap = accueil ; lien direct : Arrêter -> fiche du film, chaine -> accueil) ; `tests/unit/sortie-lecteur.test.ts` « CA2 » (`destinationRetour`, `cheminApresLecture` = fiche sinon accueil) | vert |
| CA3 | Fiche film : `Regarder` / `Reprendre · 42 min` + `Recommencer` / `Regarder à nouveau` + `✓ Vu le …`, barre sous le titre, chip de preparation, un seul `+ Ma liste`, sonde hors liste et hors « pret » ; plus de dialogue de reprise dans le lecteur ; sous 60 s : « Regarder ». Fiche serie : `Lire S01E01` / `Reprendre S01E02 · 23 min` / `Épisode suivant S01E03`, barre | `tests/unit/fiche-regles.test.ts` (10 tests : actionFilm, actionSerie, seuil 0,9, sous 60 s, reste jamais « 0 min ») ; `tests/e2e/us45-fiches.mjs` (bureau + mobile : boutons, barre, Recommencer -> position 0 puis lecteur sans dialogue, menu ⋯ vu/non vu avec « Annuler », chip 42 %, sonde) | vert |
| CA4 | Fiche serie : menu ⋯ par ligne (Lire · Marquer comme vu/non vu · Ma liste a partir d'ici / Ne plus partir d'ici + « Point de depart »), menu de saison (vue / non vue), un seul bouton `✓ Dans ma liste · dès S01E03 ▾`, sonde UNE fois par fiche, lignes `✓ Vu` / barre + « 23 min » / chip Pret dans 390 px, en-tete `minmax(0,1fr)` (D6) | `tests/e2e/us45-fiches.mjs` (menus de ligne et de saison, point de depart, « Ne plus partir d'ici » sans retrait, sondes comptees par onglet, mesures en-tete/lignes <= 390 px, bouton ⋯ 44 px, duree visible) | vert |
| CA5 | Decompte suspendu en pause ; apres annulation, calque persistant « Épisode suivant · Lire / Revenir à la série » ; dernier episode : « Série terminée ✓ · Prochain dans Ma liste » (jamais la serie finie) ; film hors liste : « Prochain dans Ma liste » sans « suivant » ; liste vide : « Regarder à nouveau / Fermer » ; aucune notification « arrêté » a l'enchainement ; calque borne a la zone video ; decompte avec repere, titre, vignette | `tests/unit/fin-regles.test.ts` (5 tests) ; `tests/e2e/us45-fin.mjs`. **Mutation** : `avancerDecompte` ignore `enPause` -> unitaire « suspendu » rouge et e2e « decompte suspendu » rouge (r1 != r2) | vert |
| CA6 | Telephone/tablette : barre qui tient dans la largeur (lecture, −10/+10, muet, plein ecran, ⋯ : Diffuser, Pistes, Qualite, Infos, PiP, Ma liste, Arreter), carte d'erreur AU-DESSUS des commandes (390×844, 844×390), tap = commandes + bouton central, double-tap lateral = ±10 s, paysage = toute la hauteur | `tests/e2e/us45-mobile.mjs` (3 moteurs × 390×844 et 844×390 : boites des commandes dans la largeur, cibles 44 px, menu ⋯ dans la zone video, tap/tap, double-tap +10 s, hauteur en paysage, « Retour » de l'erreur sous le doigt et operant) | vert |
| CA7 | Plein ecran iPhone par `video.webkitEnterFullscreen()`, F = plein ecran, M muet, I infos, Espace active le bouton focalise ; favori retire du lecteur VOD | `tests/unit/plein-ecran.test.ts` (4 tests sur `choisirApiPleinEcran`) ; `tests/e2e/us45-plein-ecran.mjs` (3 moteurs ; doublure iPhone : `webkitEnterFullscreen` appele, puis `webkitExitFullscreen` ; standard : `fullscreenElement` ; F/M/I ; Espace sur « Couper le son ») | vert |
| CA8 | Auto/Éco reprend au point atteint (`timeupdate`) ; panneau « Lecteur » : UN reglage Qualite Auto/Éco (lib/qualite) ; PiP refuse = message discret, pas d'erreur ni de reouverture ; Echap ferme d'abord tout calque (menu, Variantes, Diffuser, Infos, Mini-guide, decompte, fin) | `tests/e2e/us45-lecteur.mjs` (1-4) | vert |
| CA9 | WebKit : plantage au zapping apres echec HLS rejoue ; Firefox `cap=hevc` seulement si `smooth && powerEfficient` ; colonne « Pistes » seulement avec un choix ; identifiants internes et « HTTP 404 — manifestLoadError » hors des textes visibles (replies dans « Détails techniques » / panneau Infos) ; Infos d'un episode : numero, titre, resume | `tests/unit/capacites.test.ts` « CA9 » (4 tests) ; `tests/e2e/us45-webkit.mjs` (webkit : 404 HLS puis ↓, « Chaîne suivante », liste, 3 zaps rapides : `page.on('crash')` jamais) ; `tests/e2e/us45-lecteur.mjs` (5) ; `us45-retour.mjs` (fiche serie sans `iptva:s…`) | voir § WebKit |
| CA10 | e2e 3 moteurs pour CA1, CA6, CA7 ; unitaires ; `tsc`, `npm run build` ; ce document | `npm run check`, `npm run test:unit`, `npm run build`, `npm run test:dist`, `npm run test:e2e` | voir rapport |

## Mutations rapportees

- **CA1** — `src/screens/Lecture.tsx` : remplacer `const direct = createMemo(() => props.entree.type === 'live')`
  par `const direct = () => props.entree.type === 'live'` et faire relire `direct()` dans `duree()` (comme avant) :
  `us45-arret.mjs` chromium 26/30 (3 × « Stale read from <Show>. », position de sortie absente, couche encore
  presente sur Ma liste) ; retour -> 30/30.
- **CA5** — `src/screens/lecture/fin-regles.ts` : `avancerDecompte` sans la garde `enPause` : `fin-regles.test.ts`
  « en pause, le decompte est SUSPENDU » rouge, `us45-fin.mjs` « decompte suspendu (10 -> 8 s) » rouge ; retour -> vert.

## WebKit (CA9, D16)

Voir le rapport de fin d'US : le script d'audit `D/crash-webkit.mjs` rejoue contre le `dist` de cette branche
et `tests/e2e/us45-webkit.mjs` (zapping par ↓, bouton, liste, trois zaps rapides apres un 404 HLS).

## Notes de fusion (coordinateur)

- `src/lib/ui7-contrat.tsx` : STUB aux signatures publiees par ui-7 (`PART_VUE`, `ChipPreparation`
  `{ etat | preparation, serie, forme, surReessayer }`, `phraseEtat`, `emettreToast({ message, action,
  libelleAction })`) -> remplacer le corps par les re-exports de `lib/vu`, `components/ChipPreparation`,
  `lib/toasts`. Imports d'ui-6 a renommer si ui-7 renomme : `lib/a-voir` -> `lib/ma-liste`
  (ajouterAVoir/retirerAVoir/modifierOptionsAVoir/basculerAVoir/listeAVoir/prochainAVoirApres),
  `lib/a-voir-regles` -> `lib/ma-liste-regles` (libelleDisponibilite), `components/BoutonAVoir` ->
  `components/BoutonMaListe` (BoutonAVoir, useAVoirCles). Les fiches emettent leurs toasts : si la fusion
  les branche sur `marquerVu`/`marquerNonVu`/`ajouterMaListe` d'ui-7 (qui emettent les leurs), retirer les
  `emettreToast` de FicheFilm.tsx / FicheSerie.tsx.
- `src/etat.ts`, `src/App.tsx` : STUB local au contrat ui-8 (`revenirEnArriere`, `quitterLecteur` inerte hors
  du lecteur, `arreterLecture` + `cleArretee`, garde de reselection, `surRetour` des fiches =
  `revenirEnArriere('/')`, `surQuitterLecteur = quitterLecteur`) -> prendre la version ui-8.
- `src/screens/lecture/groupes-stub.ts` : STUB de `ouvrirGroupe` (screens/parcours/ouverture.ts) et
  `indiceGroupeActif` (lib/direct-tri.ts) d'ui-8 -> remplacer l'import dans `screens/lecture/zapping.ts` et
  supprimer le stub.
- `src/components/PanneauLecteur.tsx` : meme intention que la version ui-8 (Qualite Auto/Éco de lib/qualite) ;
  prendre la version ui-8.
- `tests/e2e/us43.mjs` (ui-7) : trois adaptations a la nouvelle fiche (« Ma liste a partir d'ici » par le menu
  de ligne ; sonde sans son propre bouton ; « Prêt » = chip `[data-role="chip-preparation"][data-etat="pret"]`).
- `package.json` : ajout des parcours US-45 a `test:e2e` ; `tests/e2e/harnais/principal.tsx` : prop `surRetour`.
