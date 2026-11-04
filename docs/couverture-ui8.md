# Couverture US-47 — coque, navigation, Direct, Guide, Recherche, Réglages, responsive, hors ligne (ui-8, lot 10)

Branche `feat/ui-8` (worktree `/opt/mytv-work/ui-8`), à partir de `main` feb306e. Tous les parcours tournent
contre le faux serveur `tests/e2e/serveur-factice.mjs` (127.0.0.1, tout autre hôte bloqué) ; le guide et le
direct factices sont servis par interception (`tests/e2e/us47-commun.mjs`, dérivé de
`/opt/mytv-work/audit/A/commun.mjs`). Aucun vrai fournisseur, aucun secret, aucun flux réel.

Commandes : `npm run check` · `npm run test:unit` · `npm run build` · `npm run test:dist` · `npm run test:e2e`
(chromium) · `npm run test:e2e:moteurs` (responsive et messages sur firefox et webkit). Tout est préfixé
`NODE_OPTIONS=--tls-max-v1.2`.

## Une ligne par CA

| CA | Ce qui est fait | Test (commentaire « CAn ») | Fichiers |
|---|---|---|---|
| CA1 | Entrée dans le champ = page `/recherche?q=` (jamais une lecture), aucune ligne présélectionnée, ↓ puis Entrée = fiche, re-clic sur le champ focalisé rouvre les suggestions, « 60 résultats » et « Entrée » sans ms (A bug 3, A UX20, D E7) | e2e `us47-recherche.mjs` (bureau, téléphone) | PanneauSuggestions, ResultatsRecherche, App (suggestion → `ouvrirDetails`) |
| CA2 | Barre d'outils du Direct sous 1100 px : titre + compteur lisibles, menu « ⋯ » (masquer la catégorie, 4K, guide), filtre dans la barre (un seul champ par panneau) ; nom prioritaire sur le badge (replié en « HD », cède avant le nom) ; cartes sans « Chaîn… » ; tri par `numero` du bouquet sinon nom naturel ; colonne N° = numéro ; chaîne en cours surlignée ; zapping, mini-guide et bandeau regroupés par variantes, variante jouée annoncée (A bug 11, D5, A UX13-16) | e2e `us47-direct.mjs` (390, 768, 844×390, bureau) ; unitaires `direct-tri.test.ts` (tri, numéro, regroupement, libellé de variante) | BarreOutilsDirect, LigneChaine, CarteDirect, Parcours, chaines.ts, lib/direct-tri.ts, ListeZapping, MiniGuide, BandeauChaine |
| CA3 | 5 onglets (Accueil, Direct, Ma liste, Recherche, Profil) avec gouttières à 320 px et au zoom 125 % ; Films/Séries/Guide/Réglages dans la feuille du profil ; rail compact en paysage 844×390 ; `safe-area-inset-top/left/right` sur la coque, la barre basse et les feuilles ; contenu qui réserve le mini-lecteur ; cibles ≥ 44 px sur tablette (en-tête, champ de recherche, panneaux, Réglages, colonne et barre du Direct, sélecteur segmenté) ; guide téléphone (jour visible, statistiques sur deux lignes) ; écrans sans débordement horizontal (D6 côté coque, D10, D12, D15, D20, D21, D22) | e2e `us47-responsive.mjs` sur chromium, firefox, webkit | coque.css, BarreLaterale, MenuProfil, EnTete, App, Guide, ColonneCategories, SelecteurSegmente, Reglages, Connexion, ChoixProfil |
| CA4 | Session expirée → écran de connexion « Votre session a expiré, reconnectez-vous », URL conservée (une lecture devient l'accueil), retour à l'écran d'origine ; focus initial (identifiant, premier profil / champ) et sur le mot de passe après refus ; bandeau persistant « Hors ligne · n geste(s)… » sur tous les écrans ; gestes hors ligne annoncés « sera envoyé au retour du réseau » ; ouverture de l'application hors ligne sur le catalogue local (session locale) ; écran à la demande indisponible = « Écran indisponible hors ligne · Réessayer » (frontière d'erreur par écran) ; IndexedDB bloquée = phrase humaine (A bug 12, A UX1, A UX2, B bug 9, B UX20, D14) | e2e `us47-session.mjs` ; unitaires `messages-ui8.test.ts` (stockage, hors ligne, expiration) | auth.ts, api.ts (`reseauCoupe`), lib/reseau.ts, lib/hors-ligne.ts, lib/profils-regles.ts, BandeauHorsLigne, BandeauImport, import.worker.ts, errors.ts, Connexion, ChoixProfil, App (`Ecran`) |
| CA5 | Panneau « Lecteur » : qualité Auto/Éco réelle (`lib/qualite`), plus de 1080p/720p/480p ni de signal fantôme ; « 0/1 » remplacé par « Lecture en cours · Titre » ; Réglages en premier dans l'onglet Profil du téléphone ; noms de profils uniques (message) ; suppression par un dialogue de l'application ; `:focus-visible` du champ de recherche ; masquer une catégorie = toast « … · catégorie masquée · Annuler » sans changer de catégorie, liste des masquées dans Réglages avec « Réafficher » ; « Guide TV » lien distinct du sélecteur de mode (A bug 2, A bug 14, A UX3, A UX4, A UX11, A UX12, A UX21, D9, D E8) | e2e `us47-coque.mjs`, `us47-direct.mjs` (lien guide, sélecteur), `us47-responsive.mjs` (Réglages en un tap) ; unitaire `messages-ui8.test.ts` (profils) | PanneauLecteur, EnTete, MenuProfil, Reglages, categories.ts, BarreOutilsDirect, coque.css, etat.ts |
| CA6 | Guide : « Guide indisponible pour le moment · Réessayer » (jamais « contenu n'existe plus »), état vide qui nomme la cause (filtre / catalogue / aucun guide) ; direct : « Impossible de lire ce flux » + Réessayer ; ResizeObserver sans boucle (mesure différée par rAF dans GrilleCartes, Guide, ListeVirtuelle) → zéro `pageerror` sur Direct (liste et cartes), Films, Séries, y compris WebKit (D13, D17, A UX17, A UX18) | e2e `us47-messages.mjs` sur chromium, firefox, webkit ; unitaires `messages-ui8.test.ts` (textes, contexte direct) | lib/messages-guide.ts, errors.ts, epg.ts, Guide, GrilleCartes, ListeVirtuelle |
| CA7 | Catégorie et mode du Direct dans l'URL (`/direct?categorie=…&mode=cartes`), retenus hors de Direct, rechargement et lien partagé ; focus déplacé dans les panneaux (Lecteur, Profil, menu « ⋯ », Catégories, Filtres, dialogue de suppression) et rendu à l'ancre ; ← → entre cartes d'une rangée et entre onglets, ↑ ↓ entre rangées ; focus initial d'une fiche sur son action principale ; retour = écran précédent (`revenirEnArriere`), « Fermer la lecture » ne change pas d'écran, fiche série : Retour/Échap = précédent (A bug 8, A UX5, A UX9, A UX10, B bug 4, B UX22) | e2e `us47-coque.mjs`, `us47-direct.mjs` (URL, menu « ⋯ ») | etat.ts, App.tsx, lib/navigation-clavier.ts, EnTete, PanneauCoulissant, FeuilleFiltres, BarreOutilsDirect, Parcours, Reglages |
| CA8 | Cette page ; scripts ajoutés à `package.json` (ajout seulement) ; `tsc`, build, dist sans secret, unitaires, e2e verts | — | — |

## Mutations rapportées

- **CA1** — `PanneauSuggestions.tsx`, `lancer()` : `poserSelection(AUCUNE)` remis à `poserSelection(0)` (la
  frappe présélectionne la première ligne, comme avant). `us47-recherche.mjs` devient rouge, 8 échecs :
  `ECHEC [bureau] CA1 aucune ligne preselectionnee (1)` · `ECHEC [bureau] CA1 Entree -> page de resultats
  (/film/vod:iptva:5000)` · `ECHEC [bureau] CA1 aucune requete de flux apres Entree (1)` (et les mêmes au
  téléphone). Remis en place ensuite. (Nota : ne mutter que la valeur initiale du signal ne suffit pas, la
  frappe la remettant à `AUCUNE` ; la mutation porte donc sur la remise à zéro à la frappe.)
- **CA6** — `ListeVirtuelle.tsx` : mesure écrite directement dans le rappel du `ResizeObserver` (boucle de
  l'audit D17). `NAVIGATEUR=webkit us47-messages.mjs` devient rouge : `ECHEC CA6 /direct : zero pageerror
  (ResizeObserver loop completed with undelivered notifications)` — 14/15. Remis en place ensuite.

## Arbitrages du coordinateur (réponse à `ui-8.contrat.demande`) appliqués

1. `PanneauLecteur.tsx` retenu tel quel (qualité Auto/Éco réelle, prop `flux` retirée, signal `etat.qualite` supprimé).
2. `zapping.ts` (groupes), `GrilleAffiches` (rAF), `Lecture.tsx surQuitterEcran → surRetour` : ui-6 / ui-7.
3. `tests/e2e/us19.mjs` : scénario `etat` → favori d'une CHAÎNE (`iptva:100000`, bouton « Ajouter aux favoris »
   du lecteur) ; scénario `profils` → coexistence film / série de même numéro vérifiée par Ma liste
   (`__test/a-voir`, table `a_voir`) ; suppression du profil par le dialogue de l'application.
4. `App.tsx` : `lire` (ui-7) n'est pas exporté sur cette branche → `ouvrir` conservé, à remplacer à la fusion.
5. `EcranMedia.tsx` / `BarreFiltres.tsx` : bascule « Favoris » retirée des grilles Films / Séries ;
   `ResultatsRecherche.tsx` ne passe plus `surAVoir` / `aVoir` / `pret` à `CarteAffiche`, `surOuvrir` = fiche.
6. `/direct?favoris=1` : vue « Mes chaînes favorites » (favorites de la catégorie active), portée par l'URL comme
   la catégorie et le mode, quittée en choisissant une catégorie ; l'onglet Direct du rail ne la retient pas.
   Test : `us47-direct.mjs` (bureau).
7. `changerDeChaine` : `replace: true` seulement depuis l'écran du lecteur ; ailleurs, nouvelle entrée.
8. `auth.ts` (`cloisonner`) : vide aussi `reprises_cachees` (v7, ui-7) quand la table existe.

## Hors de mon périmètre, à coordonner (fichiers de statut `ui-8.info-ui6`, `ui-8.info-ui7`, `ui-8.contrat.demande`)

- `Stale read from <Show>` à l'arrêt d'une lecture (D1/B1, US-45 CA1, ui-6) : mes tests l'excluent du
  comptage des erreurs de page ; la libération de la réserve du mini-lecteur après « Fermer la lecture »
  dépend aussi de ce correctif (vérifiée ici au retour dans le lecteur).
- Touches ↑ ↓ du zapping par groupe (`screens/lecture/zapping.ts`, ui-6) : helpers fournis
  (`grouperVariantes`, `ouvrirGroupe`, `indiceGroupeActif`).
- `GrilleAffiches.tsx:77` (ui-7) : même correctif ResizeObserver que `GrilleCartes` ; sans lui, WebKit peut
  encore remonter la boucle sur Films/Séries (non reproduit par `us47-messages.mjs` sur ce catalogue factice).
- `PanneauLecteur.tsx` (ui-6) modifié sur consigne de CA5 (qualité fantôme) ; `us43.mjs` (ui-7) adapté a
  minima au renommage « Ma liste » / `/ma-liste` ; `SelecteurSegmente.tsx` et `ListeVirtuelle.tsx` (sans
  propriétaire) touchés pour les cibles 44 px et la boucle D17.
- `safe-area-inset-*` : posé en CSS, non vérifiable sous Playwright (pas d'encoche émulée).

## Sorties (branche feat/ui-8, dernier passage)

- `npm run check` : `tsc --noEmit` sans erreur.
- `npm run test:unit` : `node --test` 38/38 ; `lancer.mjs` 198/198 (dont `direct-tri.test.ts` 7, `messages-ui8.test.ts` 7, `toasts.test.ts` repris de ui-7).
- `npm run build` : ok ; `npm run test:dist` : `35 fichiers lus : 0 secret(s), 0 reliquat(s)`.
- `npm run test:e2e` (chromium) : US-19 11 scénarios OK (dont `etat` et `profils` adaptés) ; US-20 63/63 ; US-21 34/34 ;
  US-28 8 OK ; US-32 30/30 ; US-35 29/29 ; US-36 2 OK ; US-39 54/54 et 15/15 ; US-41 56/56 ; US-43 5 scénarios OK
  (`liste` adapté) ; US-43 lecteur 14/14 ; **US-47** recherche 32/32 · direct 80/80 · coque et navigation 57/57 ·
  session et hors ligne 32/32 · responsive 46/46 · messages 19/19.
- `npm run test:e2e:moteurs` : responsive firefox 46/46, messages firefox 19/19, responsive webkit 46/46,
  messages webkit 15/15 (section « erreur de lecture du direct » sautée sur WebKit : D16, US-45 CA9 ui-6).
- Mutations : CA1 → 8 échecs (voir ci-dessus) ; CA6 → 1 échec sur WebKit (voir ci-dessus).
- Constats hors périmètre vus en passant : avec IndexedDB bloquée, une erreur de page résiduelle « r » subsiste
  (hors bandeau, probablement une promesse Dexie non attrapée côté synchro ui-7) ; WebKit remonte en
  `pageerror` les requêtes annulées par une navigation (« due to access control checks »), ignorées par
  `us47-messages.mjs`.
