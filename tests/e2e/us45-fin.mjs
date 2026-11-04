// US-45 CA5 (C6, B10, B11, B12, C13, C19) : fin de lecture -- decompte suspendu en pause ; apres
// annulation, calque persistant « Episode suivant · Lire / Revenir a la serie » a la vraie fin ; dernier
// episode : « Série terminée ✓ · Prochain dans Ma liste » (jamais la serie finie) ; film hors liste :
// « Prochain dans Ma liste » sans « suivant » ; aucune notification « arrêté » a l'enchainement ; calque
// borne a la zone video au telephone ; le decompte nomme l'episode avec sa vignette.
// Base : audits B/02-serie-enchainement.mjs et C/04-enchainement.mjs.
//   npm run build && NODE_OPTIONS=--tls-max-v1.2 node tests/e2e/us45-fin.mjs [bureau|mobile]
import { ouvrirSession, lancer, creerVerificateur, attendre, pause } from './us45-banc.mjs'

const gabarit = process.argv[2] ?? 'bureau'
const v = creerVerificateur(`US-45 CA5 fin de lecture (${gabarit})`)
const navigateur = await lancer('chromium')
const s = await ouvrirSession({ navigateur, moteur: 'chromium', gabarit })
const { page, serveur, profil, chemin, video, idb } = s
const EP = (sn, en) => `series:iptva:${5002 * 100 + sn * 10 + en}.mkv`
const decompte = page.locator('[data-role="prochain-episode"]')
const finContenu = page.locator('[data-role="prochain-contenu"]')
const texte = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ').trim()
const notifications = () => page.locator('[data-role="notification"]')
try {
  // Ma liste : la serie 2 (S01E02 pret) puis le film 3 (pret) ; film 5 hors liste.
  await serveur.appel('a-voir', { profil, elements: [{ contenu: 'serie:iptva:s5002' }, { contenu: 'vod:iptva:5003' }] })
  await serveur.appel('preparation', { contenu: 'iptva:500212.mkv', reglage: { etat: 'pret' } })
  await serveur.appel('preparation', { contenu: 'vod:iptva:5003', reglage: { etat: 'pret' } })
  await page.reload()
  await page.locator('nav.rail').waitFor()

  // --- 1. Decompte : suspendu pendant la pause, nomme l'episode avec sa vignette, aucune notification -----
  console.log('1. decompte en pause, enchainement')
  await page.goto(`${serveur.origine}/serie/series:iptva:s5002`)
  await page.locator('[data-role="episode"]').first().getByRole('button').first().click()
  await attendre(async () => (await chemin()) === `/lecture/${EP(1, 1)}`, { quoi: 'episode 1' })
  await decompte.waitFor({ timeout: 25_000 })
  v.ok(/Épisode suivant dans \d+ s/.test(await texte(decompte)), 'CA5 decompte affiche')
  v.ok(/S01E02 · Épisode 2/.test(await texte(decompte)), `CA5 le decompte nomme l episode (repere et titre) : « ${await texte(decompte)} »`)
  v.ok((await decompte.locator('img').count()) === 1, 'CA5 ... avec sa vignette')
  v.ok(/● Prêt — démarre sans attente/.test(await texte(decompte)), 'CA5 libelle « ● Prêt — démarre sans attente »')
  await page.evaluate(() => document.querySelector('video').pause())
  await pause(300)
  const r1 = Number((await texte(decompte)).match(/dans (\d+) s/)?.[1])
  await pause(2600)
  const r2 = Number((await texte(decompte)).match(/dans (\d+) s/)?.[1])
  v.ok(r1 === r2 && (await video()).paused, `CA5 en pause, le decompte est suspendu (${r1} -> ${r2} s)`)
  await page.evaluate(() => document.querySelector('video').play())
  await pause(2300)
  const r3 = Number((await texte(decompte)).match(/dans (\d+) s/)?.[1])
  v.ok(r3 < r2, `CA5 a la reprise, il repart (${r2} -> ${r3} s)`)
  // Calque borne a la zone video (jamais coupe) : au telephone, entierement dans le cadre.
  const bornes = await page.evaluate(() => {
    const c = document.querySelector('[data-role="prochain-episode"]')?.getBoundingClientRect()
    const z = document.querySelector('video')?.getBoundingClientRect()
    return c && z ? { ok: c.top >= z.top - 1 && c.bottom <= z.bottom + 1 && c.left >= z.left - 1 && c.right <= z.right + 1, c: [c.top, c.bottom], z: [z.top, z.bottom] } : null
  })
  v.ok(bornes?.ok === true, `CA5 calque dans la zone video (${JSON.stringify(bornes)})`)
  await attendre(async () => (await chemin()) === `/lecture/${EP(1, 2)}`, { delai: 20_000, quoi: 'enchainement automatique' })
  await pause(600)
  v.ok((await notifications().count()) === 0 || !/arrêté/.test(await texte(notifications())), 'CA5 aucune notification « arrêté — un seul flux » a l enchainement voulu')

  // --- 2. Annulation, puis la vraie fin : calque persistant sans decompte ----------------------------
  console.log('2. annulation puis vraie fin')
  await decompte.waitFor({ timeout: 25_000 })
  await page.keyboard.press('Escape')
  await attendre(async () => (await decompte.count()) === 0, { quoi: 'annule' })
  await attendre(async () => (await video()).ended, { delai: 25_000, quoi: 'fin de l episode 2' })
  await decompte.waitFor({ timeout: 5000 })
  v.ok((await decompte.getAttribute('data-decompte')) === 'non' && !/dans \d+ s/.test(await texte(decompte)), `CA5 a la vraie fin, calque persistant SANS decompte : « ${await texte(decompte)} »`)
  const boutonsFin = await decompte.getByRole('button').allInnerTexts()
  v.ok(boutonsFin.join('|') === 'Lire|Revenir à la série', `CA5 boutons « Lire » / « Revenir à la série » (${JSON.stringify(boutonsFin)})`)
  await pause(3000)
  v.ok((await chemin()) === `/lecture/${EP(1, 2)}`, 'CA5 rien ne demarre tout seul')
  await decompte.getByRole('button', { name: 'Revenir à la série' }).click()
  await attendre(async () => (await chemin()) === '/serie/series:iptva:s5002', { quoi: 'retour a la serie' })
  v.ok(true, 'CA5 « Revenir à la série » ouvre la fiche, flux arrete')
  v.ok(await attendre(async () => (await s.videosAvecSource()) === 0, { delai: 3000 }).catch(() => false), 'CA1 ... et le flux est detache')

  // --- 3. Dernier episode : « Série terminée ✓ · Prochain dans Ma liste », jamais la serie finie ---------
  console.log('3. dernier episode')
  await page.getByRole('tab', { name: /Saison 2/ }).click()
  await page.locator('[data-role="episode"]').nth(2).getByRole('button').first().click()
  await attendre(async () => (await chemin()) === `/lecture/${EP(2, 3)}`, { quoi: 'dernier episode' })
  await page.waitForFunction(() => (document.querySelector('video')?.readyState ?? 0) >= 1, null, { timeout: 20_000 })
  await page.evaluate(() => { document.querySelector('video').currentTime = 16.5 })
  await finContenu.waitFor({ timeout: 20_000 })
  v.ok(/^Série terminée ✓ · Prochain dans Ma liste/.test(await texte(finContenu)), `CA5 fin du dernier episode : « ${await texte(finContenu)} »`)
  v.ok(/Film Test 3/.test(await texte(finContenu)) && !/Série Test 2/.test(await texte(finContenu)), 'CA5 le prochain est le film de la liste, jamais la serie que l on vient de finir')
  v.ok((await finContenu.locator('[data-role="suivant-pret"]').count()) === 1, 'CA5 « ● Prêt »')
  await finContenu.getByRole('button', { name: 'Regarder' }).click()
  await attendre(async () => (await chemin()) === '/lecture/vod:iptva:5003', { quoi: 'le prochain s ouvre' })
  await pause(600)
  v.ok((await notifications().count()) === 0 || !/arrêté/.test(await texte(notifications())), 'CA5 aucune notification « arrêté » en passant au prochain de la liste')

  // --- 4. Film hors liste : « Prochain dans Ma liste » sans « suivant » ; sans liste : Regarder a nouveau --
  console.log('4. film hors liste')
  await page.goto(`${serveur.origine}/lecture/vod:iptva:5005`)
  await finContenu.waitFor({ timeout: 25_000 })
  v.ok(/^Film terminé ✓ · Prochain dans Ma liste/.test(await texte(finContenu)) && !/suivant/i.test(await texte(finContenu)), `CA5 film hors liste : « ${await texte(finContenu)} » (sans le mot « suivant »)`)
  await serveur.appel('a-voir', { profil, elements: [] })
  await page.goto(`${serveur.origine}/`)
  await pause(2500)
  await page.goto(`${serveur.origine}/lecture/vod:iptva:5006`)
  await finContenu.waitFor({ timeout: 25_000 })
  v.ok(/^Film terminé ✓$/.test(await texte(finContenu).then((t) => t.split(' Regarder')[0])) || /Regarder à nouveau/.test(await texte(finContenu)), `CA5 liste vide : « ${await texte(finContenu)} »`)
  v.ok((await finContenu.getByRole('button').allInnerTexts()).join('|') === 'Regarder à nouveau|Fermer', 'CA5 plus d impasse : « Regarder à nouveau » / « Fermer »')
  await finContenu.getByRole('button', { name: 'Regarder à nouveau' }).click()
  await pause(1200)
  v.ok((await video()).t < 3 && !(await video()).ended, `CA5 « Regarder à nouveau » relance du debut (t=${(await video()).t.toFixed(1)})`)
  await finContenu.waitFor({ timeout: 25_000 })
  await finContenu.getByRole('button', { name: 'Fermer' }).click()
  await attendre(async () => !/^\/lecture/.test(await chemin()), { quoi: 'fermer = ecran precedent' })
  v.ok(true, `CA5 « Fermer » = ecran precedent (${await chemin()}), flux arrete`)
  const r6 = await idb('reprises', 'vod:iptva:5006')
  v.ok(r6 && r6.position === r6.duree, `CA5 le film est tenu pour vu (${JSON.stringify(r6)})`)

  v.ok(s.erreurs.length === 0, `aucune erreur de page (${s.erreurs.join(' | ') || 'aucune'})`)
  v.ok(s.violations.length === 0, 'aucune requete hors 127.0.0.1')
} catch (e) {
  v.ok(false, `exception : ${e.stack}`)
} finally {
  await s.fermer()
  await navigateur.close()
  v.termine()
}
