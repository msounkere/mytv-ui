// US-45 CA2 (A8, B4, B UX4-5) : une seule regle de retour -- l'ecran precedent (pile d'historique) ;
// la requete de recherche est conservee ; le mini-lecteur ne navigue jamais ; fiche serie : Retour/Echap
// = history.back() comme la fiche film. Base : audits A/09-retour-mobile, B/01 et B/02.
//   npm run build && NODE_OPTIONS=--tls-max-v1.2 node tests/e2e/us45-retour.mjs
import { ouvrirSession, lancer, creerVerificateur, attendre, pause } from './us45-banc.mjs'

const v = creerVerificateur('US-45 CA2 retour')
const navigateur = await lancer('chromium')
const s = await ouvrirSession({ navigateur, moteur: 'chromium' })
const { page, serveur, chemin, commandes, reveil, video, videosAvecSource, rail } = s
try {
  const fiche = page.locator('[data-role="fiche-film"]')
  const attendreChemin = (c, quoi) => attendre(async () => (await chemin()) === c, { quoi: quoi ?? c })

  // Navigation INTERNE (pushState + popstate = ce que fait le routeur) : `page.goto` rechargerait la page
  // et viderait la pile de l'application.
  const naviguer = (c) => page.evaluate((x) => { history.pushState(null, '', x); dispatchEvent(new PopStateEvent('popstate')) }, c)

  // --- 1. accueil -> fiche -> lecture -> Retour = fiche (la lecture continue en mini-lecteur) ---
  console.log('1. accueil -> fiche -> lecture -> Retour')
  await page.goto(`${serveur.origine}/`)
  await attendreChemin('/')
  await pause(500)
  await naviguer('/film/vod:iptva:5001')
  await fiche.getByRole('button', { name: /^Regarder$|^Reprendre/ }).first().waitFor()
  await fiche.getByRole('button', { name: /^Regarder$|^Reprendre/ }).first().click()
  await attendreChemin('/lecture/vod:iptva:5001', 'lecteur')
  await page.waitForFunction(() => (document.querySelector('video')?.readyState ?? 0) >= 1, null, { timeout: 20_000 })
  await reveil()
  await commandes().getByRole('button', { name: 'Retour' }).click()
  await attendreChemin('/film/vod:iptva:5001', 'retour a la fiche')
  v.ok(true, 'CA2 fiche -> lecture -> Retour = la fiche')
  v.ok((await page.locator('[data-role="mini-lecteur"]').count()) === 1, 'CA2 Retour : la lecture continue dans le mini-lecteur')
  // Le mini-lecteur ne navigue jamais : « Fermer la lecture » laisse sur la fiche.
  await page.locator('[data-role="mini-lecteur"]').getByRole('button', { name: 'Fermer la lecture' }).click()
  await pause(600)
  v.ok((await chemin()) === '/film/vod:iptva:5001', `CA2 « Fermer la lecture » du mini-lecteur ne navigue pas (${await chemin()})`)
  v.ok((await page.locator('[data-role="mini-lecteur"]').count()) === 0 && (await videosAvecSource()) === 0, 'CA2 ... et la lecture est bien arretee')
  // Fiche film : Retour = ecran precedent (ici l'accueil).
  await fiche.getByRole('button', { name: /Retour/ }).click()
  await attendreChemin('/', 'retour de la fiche a l accueil')
  v.ok(true, 'CA2 fiche film : Retour = l ecran precedent (accueil)')

  // --- 2. recherche -> lecture -> Echap = resultats, requete conservee ----------------------------
  // Les navigations qui comptent dans la pile sont celles de l'application (clics), pas des pushState.
  console.log('2. recherche -> lecture -> Echap')
  await naviguer(`/recherche?q=${encodeURIComponent('Film Test 2')}`)
  const carte = page.getByRole('button', { name: 'Film Test 2', exact: true }).first()
  await carte.waitFor()
  await carte.click()
  // Sur cette branche la carte lance la lecture ; apres ui-7, elle ouvre la fiche : on lance alors depuis la fiche.
  await attendre(async () => /^\/(lecture|film)\//.test(await chemin()), { quoi: 'lecture ou fiche' })
  if (/^\/film\//.test(await chemin())) {
    await fiche.locator('[data-role="action-principale"]').click()
  }
  await attendreChemin('/lecture/vod:iptva:5002', 'lecteur depuis la recherche')
  await page.locator('[data-role="commandes"]').waitFor({ state: 'attached' })
  await page.waitForFunction(() => (document.querySelector('video')?.readyState ?? 0) >= 1, null, { timeout: 20_000 })
  await page.locator('[tabindex="-1"]').first().focus()
  await page.keyboard.press('Escape')
  await attendre(async () => !/^\/lecture/.test(await chemin()), { quoi: 'Echap quitte le lecteur' })
  if (/^\/film\//.test(await chemin())) {
    // Venu de la fiche : encore un pas, par son « Retour ».
    await fiche.getByRole('button', { name: /Retour/ }).click()
  }
  await attendreChemin('/recherche?q=Film%20Test%202', 'retour aux resultats')
  v.ok(true, 'CA2 recherche -> lecture -> Echap = les resultats, requete conservee dans l adresse')
  v.ok(await attendre(async () => (await page.getByRole('button', { name: /Film Test 2/ }).count()) > 0, { delai: 5000 }).catch(() => false), 'CA2 les resultats sont bien affiches')
  v.ok((await page.locator('[data-role="mini-lecteur"]').count()) === 1, 'CA2 Echap : la lecture continue dans le mini-lecteur')
  await page.locator('[data-role="mini-lecteur"]').getByRole('button', { name: 'Fermer la lecture' }).click()
  await pause(600)
  v.ok((await chemin()) === '/recherche?q=Film%20Test%202' && (await videosAvecSource()) === 0, 'CA2 « Fermer la lecture » sur les resultats : on y reste, flux detache')

  // --- 3. direct -> lecture -> « Arrêter le flux » = direct (meme regle pour le guide) --------------
  console.log('3. direct -> lecture -> Arrêter')
  await rail('Direct').click()
  await attendreChemin('/direct')
  const ligne = page.locator('main button[title^="Chaîne"]').first()
  await ligne.waitFor()
  await ligne.click()
  await attendre(async () => /^\/lecture\/live:/.test(await chemin()), { quoi: 'lecteur depuis Direct' })
  await page.locator('[data-role="commandes"]').waitFor({ state: 'attached' })
  await pause(1500)
  // Le faux serveur n'a pas de direct : la chaine est en erreur, « Retour » de la carte = l'arret.
  const alerte = page.locator('[role="alert"]')
  if (await alerte.count()) await alerte.getByRole('button', { name: 'Retour' }).click()
  else { await reveil(); await commandes().getByRole('button', { name: 'Arrêter le flux' }).click() }
  await attendreChemin('/direct', 'retour au direct')
  v.ok(true, 'CA2 direct -> lecture -> Arrêter = l ecran precedent (Direct)')
  v.ok(await attendre(async () => (await videosAvecSource()) === 0, { delai: 3000 }).catch(() => false), 'CA1 et le flux est detache')

  // --- 4. fiche serie : Retour et Echap = ecran precedent, plus jamais Direct ------------------------
  console.log('4. fiche serie')
  await naviguer('/')
  await attendreChemin('/')
  await naviguer('/serie/series:iptva:s5001')
  await page.locator('[data-role="episode"]').first().waitFor()
  await page.keyboard.press('Escape')
  await attendreChemin('/', 'Echap de la fiche serie')
  v.ok(true, 'CA2 fiche serie : Echap = l ecran precedent (accueil), pas Direct')
  await naviguer('/serie/series:iptva:s5001')
  await page.locator('[data-role="episode"]').first().waitFor()
  await page.getByRole('button', { name: /Retour/ }).first().click()
  await attendreChemin('/', '« Retour » de la fiche serie')
  v.ok(true, 'CA2 fiche serie : « Retour » = l ecran precedent')
  v.ok(!/iptva:s5001/.test(await page.locator('body').innerText()), 'CA9 aucun identifiant interne (iptva:s…) visible')

  // --- 5. pile vide (lien direct) : la fiche du contenu, sinon l'accueil ----------------------------
  console.log('5. lien direct')
  await page.goto(`${serveur.origine}/lecture/vod:iptva:5003`)
  await page.locator('[data-role="commandes"]').waitFor({ state: 'attached' })
  await page.waitForFunction(() => (document.querySelector('video')?.readyState ?? 0) >= 1, null, { timeout: 20_000 })
  await reveil()
  await commandes().getByRole('button', { name: 'Arrêter le flux' }).click()
  await attendreChemin('/film/vod:iptva:5003', 'pile vide : la fiche du film')
  v.ok(true, 'CA2 pile vide : « Arrêter » ouvre la fiche du film')
  await page.goto(`${serveur.origine}/lecture/live:iptva:100002`)
  await page.locator('[data-role="commandes"]').waitFor({ state: 'attached' })
  await pause(1500)
  if (await alerte.count()) await alerte.getByRole('button', { name: 'Retour' }).click()
  else { await reveil(); await commandes().getByRole('button', { name: 'Arrêter le flux' }).click() }
  await attendreChemin('/', 'pile vide, chaine : l accueil')
  v.ok(true, 'CA2 pile vide, chaine : l accueil')

  v.ok(s.erreurs.length === 0, `aucune erreur de page (${s.erreurs.join(' | ') || 'aucune'})`)
  v.ok(s.violations.length === 0, 'aucune requete hors 127.0.0.1')
} catch (e) {
  v.ok(false, `exception : ${e.stack}`)
} finally {
  await s.fermer()
  await navigateur.close()
  v.termine()
}
