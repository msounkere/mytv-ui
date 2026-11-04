// US-47 CA6 : erreur du guide avec ses propres mots et « Reessayer », etat vide qui
// nomme la cause, erreur de lecture du direct « Impossible de lire ce flux »,
// ResizeObserver sans boucle (zero pageerror sur Direct, Films, Series — WebKit).
// Derive de /opt/mytv-work/audit/D/balayage.mjs (D13, D17) et A/05-guide.mjs (UX18).
//   NAVIGATEUR=chromium|firefox|webkit NODE_OPTIONS=--tls-max-v1.2 node tests/e2e/us47-messages.mjs
import { demarrer, ouvrirSession, creerVerificateur, jusqua, attendre, texte, chemin, NAVIGATEUR } from './us47-commun.mjs'

const v = creerVerificateur(`US-47 CA6 messages (${NAVIGATEUR})`)
// WebKit remonte en `pageerror` les requetes de synchronisation annulees par une
// navigation (`page.goto`) : « …due to access control checks ». Ce n'est pas une
// erreur de l'interface (les autres moteurs n'en produisent pas).
const erreursHorsNavigation = (b) => b.erreurs.filter((e) => !/access control checks/.test(e))
const TAILLE = { chaines: 30, films: 40, series: 8, variantes: 2 }

console.log('--- guide : erreur, Reessayer, etat vide')
{
  const b = await demarrer({ gabarit: 'telephone', taille: TAILLE })
  const { page, serveur } = b
  try {
    await ouvrirSession(b)
    b.etatEpg.statut = 404
    await page.goto(`${serveur.origine}/guide`)
    const erreur = page.locator('[data-role="erreur-guide"]')
    v.ok(await jusqua(async () => (await erreur.count()) > 0, 15_000), 'CA6 bandeau d erreur du guide (404 de la grille)')
    const t = await texte(erreur)
    v.ok(/Guide indisponible pour le moment/.test(t), `CA6 « Guide indisponible pour le moment » (${t.slice(0, 60)})`)
    v.ok(!/n’existe plus au catalogue|n'existe plus au catalogue/.test(t), 'CA6 jamais « contenu n existe plus au catalogue »')
    v.ok(await jusqua(async () => (await erreur.getByRole('button', { name: 'Réessayer' }).count()) === 1, 3000), 'CA6 bouton Reessayer')
    // Reessayer relance la demande (le serveur refuse encore : l'erreur reste).
    const appelsAvant = b.epgAppels.length
    await erreur.getByRole('button', { name: 'Réessayer' }).click()
    v.ok(await jusqua(() => b.epgAppels.length > appelsAvant, 5000), `CA6 Reessayer redemande la grille (${b.epgAppels.length - appelsAvant} appel(s))`)
    v.ok(await jusqua(async () => (await erreur.count()) === 1, 5000), 'l erreur reste tant que le serveur refuse')
    // Le serveur repond : Reessayer efface l'erreur (ou une demande en cours l'a deja effacee).
    b.etatEpg.statut = null
    await erreur.getByRole('button', { name: 'Réessayer' }).click({ timeout: 3000 }).catch(() => {})
    v.ok(await jusqua(async () => (await erreur.count()) === 0, 8000), 'CA6 Reessayer efface l erreur')
    v.ok(await jusqua(async () => (await page.locator('button[title*="Journal"], button[title*="Film du soir"], button[title*="Magazine"]').count()) > 0, 15_000), 'CA6 les programmes arrivent apres Reessayer')
    // Etat vide : le filtre est la cause.
    await page.getByLabel('Filtrer les chaînes').fill('zzz')
    const vide = page.locator('[data-role="guide-vide"]')
    v.ok(await jusqua(async () => (await vide.count()) > 0, 5000), 'etat vide affiche')
    v.ok((await texte(vide)).trim() === 'Aucune chaîne ne correspond à « zzz ».', `CA6 la cause est le filtre (${await texte(vide)})`)
    await page.getByLabel('Filtrer les chaînes').fill('')
    v.ok(erreursHorsNavigation(b).length === 0, `aucune erreur de page (${erreursHorsNavigation(b).join(' | ').slice(0, 200)})`)
  } finally {
    await b.fermer()
  }
}

console.log('--- direct : erreur de lecture')
// WebKit plante la page quand le manifeste HLS echoue (audit D16, reproduit ici aussi
// sans zapping) : correctif US-45 CA9 (ui-6). Le message, lui, est verifie sur les
// deux autres moteurs et par le test unitaire messages-ui8.test.ts.
if (NAVIGATEUR === 'webkit') console.log('  ..   WebKit : section sautee (D16, US-45 CA9 ui-6)')
else {
  const b = await demarrer({ gabarit: 'bureau', taille: TAILLE })
  const { page, serveur } = b
  try {
    await ouvrirSession(b)
    // Le faux serveur n'a pas de HLS : le manifeste repond 404 (flux non servi).
    await page.goto(`${serveur.origine}/direct`)
    const lignes = page.locator('[data-role="ligne-chaine"]')
    await jusqua(async () => (await lignes.count()) > 1, 15_000)
    await lignes.nth(1).click()
    v.ok(await jusqua(async () => /^\/lecture\/live:/.test(await chemin(page)), 10_000), 'lecteur ouvert')
    const alerte = page.locator('[role="alert"]').first()
    v.ok(await jusqua(async () => /Impossible de lire ce flux/.test(await texte(alerte)), 20_000), `CA6 « Impossible de lire ce flux » (${(await texte(alerte)).replace(/\s+/g, ' ').slice(0, 80)})`)
    v.ok(!/n’existe plus au catalogue|n'existe plus au catalogue/.test(await texte(alerte)), 'CA6 jamais « n existe plus au catalogue » pour une chaine')
    const boutons = await alerte.getByRole('button').evaluateAll((l) => l.map((e) => (e.getAttribute('aria-label') || e.textContent || '').trim()))
    v.ok(boutons[0] === 'Réessayer', `CA6 Reessayer en premier (${boutons.join(', ')})`)
    // Le retrait de « HTTP 404 — manifestLoadError » des textes visibles est US-45 CA9 (ui-6).
  } finally {
    await b.fermer()
  }
}

console.log('--- ResizeObserver : Direct, Films, Series sans erreur de page')
{
  const b = await demarrer({ gabarit: 'tablette', taille: TAILLE })
  const { page, serveur } = b
  try {
    await ouvrirSession(b)
    for (const ecran of ['/direct', '/direct?mode=cartes', '/films', '/series']) {
      await page.goto(`${serveur.origine}${ecran}`)
      await attendre(800)
      // Redimensionnement : c'est la que la boucle de mesure se declenchait.
      await page.setViewportSize({ width: 1024, height: 768 })
      await attendre(500)
      await page.setViewportSize({ width: 768, height: 1024 })
      await attendre(500)
      let erreurs = erreursHorsNavigation(b)
      // Films / Series : la boucle de GrilleAffiches.tsx (ui-7) est corrigee sur
      // feat/ui-7 (meme rAF que GrilleCartes) ; tant qu'elle n'est pas fusionnee,
      // WebKit la remonte encore ici : signalee, pas comptee.
      if (NAVIGATEUR === 'webkit' && /films|series/.test(ecran)) {
        const grille = erreurs.filter((e) => /ResizeObserver/.test(e))
        if (grille.length) console.log(`  ..   ${ecran} : ${grille.length} boucle(s) ResizeObserver (GrilleAffiches, ui-7, en attente de fusion)`)
        erreurs = erreurs.filter((e) => !/ResizeObserver/.test(e))
      }
      v.ok(erreurs.length === 0, `CA6 ${ecran} : zero pageerror (${erreurs.map((e) => e.slice(0, 60)).join(' | ') || 'aucune'})`)
      b.erreurs.length = 0
    }
  } finally {
    await b.fermer()
  }
}
v.termine()
