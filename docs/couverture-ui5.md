# Couverture US-43 — Interface : liste « À voir », preparation visible, enchainement (codeur ui-5)

Branche `feat/ui-5`. Lanceurs : `NODE_OPTIONS=--tls-max-v1.2 npm run test:unit` (unitaires, dont
`tests/unit/a-voir.test.ts`), `NODE_OPTIONS=--tls-max-v1.2 node tests/e2e/us43.mjs [scenario]`
(application complete contre `tests/e2e/serveur-factice.mjs`, Chromium) et
`node tests/e2e/us43-lecteur.mjs` (lecteur seul, harnais, contre `serveur-fictif.mjs` ;
`NAVIGATEUR=firefox` pour Firefox). Contrat serveur : US-42 tel que decrit dans
`/opt/mytv-work/statut/ui-5.contrat.demande`, ACCEPTE par le coordinateur (identifiants
`vod:iptva:5521` / `serie:iptva:s77`, `GET /profil/a_voir` -> `{ elements[] }` avec etat et
`episodes`, `PUT|DELETE /profil/a_voir/{id}` 204 idempotents, `PUT /profil/a_voir { ids }`,
`GET /vod/{id}/disponibilite` -> `{ etat, debit_kbps, mesure, requis_kbps }`), joue par les deux
faux serveurs.

| CA | Exigence | Couvert par | Etat |
|----|----------|-------------|------|
| CA1 | Bouton « À voir » (ajouter / retirer) sur la fiche d'un film, d'une serie et d'un episode (la serie avec `depuis` = cet episode) et dans la recherche ; table Dexie `a_voir` synchronisee par `synchro.ts` (classe de route `a_voir`, tolerant hors ligne, idempotent) ; `GET /profil/a_voir` fait foi au demarrage | `tests/unit/a-voir.test.ts` « CA1 » (traduction cle locale <-> identifiant serveur, episode et chaine refuses) ; `tests/e2e/us43.mjs` `liste` (fiche film : PUT, DELETE, PUT sans doublon, telemetrie `a_voir:ajout`/`a_voir:retrait` ids seulement ; fiche serie : l'episode 2 ajoute `serie:iptva:s5001` avec `depuis` S01E02, jamais un `.mkv` ; recherche : PUT depuis la carte) et `horsLigne` (ajout reseau coupe : ligne Dexie, bouton presse, aucune requete ; au retour du reseau le PUT arrive, journal vide) ; `accueil` (liste semee cote serveur relue au demarrage). Mutation : l'ajout part en DELETE (`synchro.ts`) -> `horsLigne` rouge ; retour -> vert | vert |
| CA2 | Ecran « À voir » (menu principal) : ordonne, reordonnable (glisser, boutons monter/descendre au clavier et a la telecommande), retrait, options de serie (episodes d'avance, « a partir de ») ; etat de preparation (`attente`, `en cours` + pourcentage + debit, `pret`, `echec` + cause) rafraichi toutes les 10 s ecran ouvert ; une serie = une ligne « S02E05 · pret · suivant en preparation » | `tests/unit/a-voir.test.ts` « CA2 » (x3 : libelles d'etat, resume de serie sans ses episodes, monter/descendre et bornes) ; `tests/e2e/us43.mjs` `liste` (entree du rail -> `/a-voir`, 3 lignes dans l'ordre, resume de la serie avec un seul repere, etats imposes cote serveur visibles en moins de 12 s : « En cours · 42 % · 2,1 Mbit/s », « Échec : disque plein », « Prêt », GET /profil/a_voir repete ; « Descendre » puis Alt+↑ -> `PUT /profil/a_voir { ids }` ; `episodes_avance` = 3 et `depuis` = S02E01 synchronises ; retrait -> DELETE). Le glisser HTML5 n'est pas joue en e2e (meme `reordonnerAVoir` que les boutons) | vert |
| CA3 | Accueil : rangee « À voir » (prets d'abord, puis l'ordre), badge « Prêt » sur les cartes et dans les fiches quand le serveur l'indique ; la lecture d'un contenu pret passe par le lecteur habituel | `tests/unit/a-voir.test.ts` « CA3 » (tri stable prets d'abord) ; `tests/e2e/us43.mjs` `accueil` (rangee, film pret en tete, un seul badge, etat sur chaque carte ; badge sur la fiche du film pret et pas sur l'autre ; « Lecture rapide » -> `/lecture/vod:iptva:5001` et `GET /api/v1/vod/iptva:5001`, aucune adresse speciale) | vert |
| CA4 | Fin d'episode : decompte de 10 s « Episode suivant » annulable (Echap, clic), demarrage automatique, mention « prêt » ; film termine : proposition du prochain element de la liste sans demarrage ; reprises coherentes (suivant = nouvelle reprise, precedent vu) ; e2e contre le faux serveur | `tests/unit/a-voir.test.ts` « CA4 » (x2 : prochain element de la liste, episode suivant toutes saisons) ; `tests/e2e/us43-lecteur.mjs` (Echap annule et rien ne demarre apres 11,5 s ; demarrage automatique avec « prêt (préparé d’avance) » par `/api/v1/vod/<id>` ; « Lire maintenant ») ; `tests/e2e/us43.mjs` `enchainement` (S01E01 -> decompte « prêt » -> S01E02 tout seul ; reprise de S01E01 a la fin, historique de S01E02, telemetrie `enchainement:suivant` {de, vers, pret} ; decompte vers S01E03 lu dans les saisons, Echap, pas de demarrage ; film : « Film terminé · suivant dans votre liste » = Film Test 3 prêt, rien apres 11 s, clic -> `/lecture/vod:iptva:5003`). Mutation : l'annulation n'enregistre plus le refus (`calques.ts`) -> `us43-lecteur.mjs` 12/14 (le suivant demarre apres l'annulation) ; retour -> 14/14 | vert |
| CA5 | Sonde de disponibilite sur la fiche d'un film et d'un episode, a l'ouverture seulement quand aucune lecture n'est en cours : « Disponible immédiatement », « Lent (2,7 Mbit/s pour 4,4 nécessaires) : préparer d'avance ? » + bouton « À voir », « Prêt » ; telemetrie `a_voir:ajout` / `a_voir:retrait` / `enchainement:suivant` (ids) ; tsc, unitaires, e2e, build verts ; ce document | `tests/unit/a-voir.test.ts` « CA5 » (x2 : prochain episode non vu a partir de « depuis », les trois libelles et `inconnu` muet) ; `tests/e2e/us43.mjs` `sonde` (film lent : texte exact + bouton, UNE requete `/vod/{id}/disponibilite`, ajout depuis la sonde ; immediat ; pret ; fiche serie : sonde de S01E01 avec prefixe ; lecture en cours : aucune sonde a l'ouverture d'une fiche, rien d'affiche) ; telemetrie verifiee dans `liste` et `enchainement`. `npm run check`, `npm run test:unit` (38 + 179), `npm run test:e2e`, `npm run build` verts | vert |

Notes :
- Corrections faites en passant, constatees par les parcours : « Lire maintenant » lisait
  l'accesseur du `Show` apres l'avoir ferme (lecture perimee, erreur de page) ; les requetes
  IndexedDB restaient « en pause » hors ligne (`networkMode: 'always'`) ; un episode quitte pour le
  suivant quelques secondes avant sa fin n'etait pas tenu pour vu.
- Courses fermees en recette (« liste » rejoue 5 fois de suite vert) : la liste du serveur s'applique
  dans une transaction avec le journal, les gestes ecrivent table ET journal dans une transaction, un
  ordre local pas encore parti garde ses rangs, et les lignes de l'ecran restent stables entre deux
  relectures.
- La sonde est demandee pour le prochain episode NON VU de la saison affichee (il n'existe pas de
  fiche d'episode) et le resultat « inconnu » n'affiche rien.
- Non joue : glisser-deposer HTML5 en e2e (meme chemin de code que les boutons), Firefox pour
  `us43.mjs` (application complete, Chromium seulement comme les autres parcours complets).
