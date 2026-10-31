# Couverture US-41 — Interface : diffuser depuis n'importe ou (codeur ui-4)

Branche `feat/ui-4`. Lanceurs : `NODE_OPTIONS=--tls-max-v1.2 npm run test:unit` (unitaires),
`NODE_OPTIONS=--tls-max-v1.2 node tests/e2e/us41-diffusion.mjs` (parcours, Chromium ;
`NAVIGATEUR=firefox` pour Firefox). Contrat serveur : docs/lot8.md, US-40 (`POST /api/v1/cast/lien`,
`GET /api/v1/cast/<jeton>/...` sans cookie), joue par le faux serveur `tests/e2e/serveur-fictif.mjs`.

| CA | Exigence | Couvert par | Etat |
|----|----------|-------------|------|
| CA1 | `diffuser()` ne refuse plus hors reseau local : `POST /cast/lien` pour `lectureEntree(entree)` + parametres, puis `preparerDiffusion(video, urlSignee)` et le selecteur natif ; `diffusionPossible` / `origineLocale` disparaissent de cast.ts | `tests/unit/cast.test.ts` « CA1 » (x3 : demande de lien, validation du chemin signe, plus de notion de reseau local) ; `tests/e2e/us41-diffusion.mjs` A1 (une demande de lien pour l'adresse de lecture, source signee de l'element, `remote.prompt`) | vert |
| CA2 | Capacites du televiseur distinctes du navigateur, `cap=hevc,eac3,ac3` par defaut, reglables (Reglages > Lecture), memorisees par appareil ; jamais `qualite=eco` | `tests/unit/cast.test.ts` « CA2 » (x2 : parametres, reglages) ; e2e A1/B1 (parametres recus par le faux serveur). Mutations : `qualite=eco` ajoute → rouge ; `eac3` retire → rouge | vert |
| CA3 | Un seul flux : `preload="none"` avant la source signee, aucun `play()` local avant l'etat `diffusion` ; e2e : UNE demande de lien, AUCUNE requete de flux depuis le navigateur (Remote Playback simulee) | `tests/e2e/us41-diffusion.mjs` A1 et A3 (direct et film : 0 requete `/cast/<jeton>/...`, 0 requete `/live` ou `/vod` apres « Diffuser », `readyState 0`, bail non rendu). Mutation : `preload = 'none'` retire → rouge (8 requetes du flux signe, readyState 4) | vert (Chromium et Firefox) |
| CA4 | Sans Remote Playback (Firefox) : bouton visible, « Diffusion disponible dans Chrome, Edge ou Safari », « Copier le lien pour le televiseur » (lien signe, 12 h) ; aucun lien copie dans la telemetrie | `tests/e2e/us41-diffusion.mjs` B1 (bouton actif, texte, lien absolu copie, « Lien copie — valable jusqu'a … », aucune requete du flux signe, telemetrie sans lien ni jeton) ; `tests/unit/cast.test.ts` « CA4 » (lien absolu, libelle d'expiration) | vert |
| CA5 | Arret : retour a la lecture locale par l'adresse normale (cookie), position conservee ; telemetrie `diffusion:debut` / `diffusion:fin` (ressource, duree, navigateur ; jamais le jeton) ; tsc, unitaires, build verts | `tests/e2e/us41-diffusion.mjs` A2 (playlist puis segments redemandes par l'adresse normale, `diffusion:fin` avec duree) et A3 (film rouvert a 8 s pour 10 s atteintes, marge de reprise 2 s) ; `tests/unit/cast.test.ts` « CA4/CA5 » (details sans jeton). `npm run check`, `npm run test:unit` (169 + 38), `npm run build` verts | vert |

Notes :
- `origineLocale` vit desormais dans `src/sonde-debit.ts` (nommer la liaison « Domicile / Distant » dans le panneau reseau) ; elle ne decide plus rien pour la diffusion.
- Mesure Chromium : un `load()` explicite apres la source fait ignorer `preload="none"` ; Firefox rattache une source posee dans la meme tache que le `load()` de detachement de hls.js a ce chargement explicite. `preparerDiffusion` pose donc `src` seul, apres un tour de boucle.
- Pas encore verifie avec un vrai appareil (recette coordinateur, US-40 d'abord) : la disponibilite Remote Playback sur une source `preload="none"`, et la deconnexion par `prompt()` en etat connecte.
