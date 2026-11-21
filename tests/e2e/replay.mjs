// Lot 2 du chantier enregistrement : revoir un programme passe (replay du fournisseur).
//   NODE_OPTIONS=--tls-max-v1.2 node tests/e2e/replay.mjs
// Le faux serveur donne un identifiant de replay aux programmes commences des chaines 7000-7998 paires.
import { construireHarnais, ouvrirBanc, creerVerificateur, jusqua, attendre, chaine } from './banc.mjs'

const v = creerVerificateur('Replay')
await construireHarnais()

// Cle `live:iptva:<n>` comme le vrai catalogue (`type:idServeur`) : le lecteur retrouve la chaine
// d'un replay par cette cle.
const chaines = [chaine(7000, { cle: 'live:iptva:7000' }), chaine(7001, { cle: 'live:iptva:7001' })]

const banc = await ouvrirBanc({ ecran: 'guide' })
try {
  const { page } = banc
  await page.evaluate((c) => window.harnais.semer(c), chaines)
  await page.reload()
  await page.waitForFunction(() => !!window.harnais)

  console.log('1. guide : « Revoir » sur les programmes termines d’une chaine avec replay, et elle seule')
  await page.getByTitle('Reculer de 3 heures').click()
  const revoir = page.locator('button[data-replay][title*="Prog iptva:7000"]')
  v.ok(await jusqua(async () => (await revoir.count()) > 0, 30_000), 'des programmes termines de la chaine 7000 portent « Revoir »')
  v.ok((await page.locator('button[data-replay][title*="Prog iptva:7001"]').count()) === 0, 'rien sur la chaine 7001 (sans replay)')
  v.ok((await revoir.first().getAttribute('title')).startsWith('Revoir — '), 'l’infobulle commence par « Revoir — »')
  v.ok((await revoir.first().innerText()).includes('↺ Revoir'), 'la case affiche « ↺ Revoir »')

  console.log('2. clic : le guide demande la lecture du replay')
  await revoir.last().click()
  v.ok(await jusqua(async () => (await page.evaluate(() => window.harnais.ouvertures)).some((c) => /^vod:iptva:replay-7000-\d+-60$/.test(c)), 5000),
    'le clic lance la lecture de vod:iptva:replay-7000-<debut>-60')
} finally {
  await banc.fermer()
}

const lecteur = await ouvrirBanc({ ecran: 'lecture' })
try {
  const { page } = lecteur
  await page.evaluate((c) => window.harnais.semer(c), chaines)
  const debut = Math.floor(Date.now() / 3_600_000) * 3_600_000 - 2 * 3_600_000
  const id = `iptva:replay-7000-${debut / 1000}-60`
  await page.evaluate((e) => window.harnais.ouvrir(e), {
    cle: `vod:${id}`, type: 'vod', idServeur: id, lecture: `/api/v1/vod/${id}`, id: 0, nom: 'Prog · Chaine 7000', recherche: 'prog',
  })
  v.ok(await jusqua(() => lecteur.api((r) => r.chemin === `/api/v1/vod/${id}`).length > 0, 10_000), 'le lecteur demande /api/v1/vod/<replay>')

  console.log('3. panneau « Programmes de la chaîne » depuis le replay')
  await page.mouse.move(700, 450)
  await page.getByRole('button', { name: 'Programmes de la chaîne' }).first().click()
  const panneau = page.getByRole('dialog', { name: 'Programmes de Chaine 7000' })
  v.ok(await jusqua(() => panneau.isVisible(), 10_000), 'le panneau s’ouvre, au nom de la chaine')
  v.ok(await jusqua(async () => (await panneau.locator('[data-statut="revoir"]').count()) > 0, 10_000), 'il liste des programmes « ↺ Revoir »')
  v.ok(await jusqua(async () => (await panneau.locator('[data-actif="1"]').count()) === 1, 5000), 'le programme en lecture y est marque')
  v.ok((await panneau.getByRole('tab').count()) === 3, 'trois jours : aujourd’hui, hier, avant-hier')
  await page.keyboard.press('Escape')
  v.ok(await jusqua(async () => !(await panneau.isVisible()), 5000), 'Échap ferme le panneau sans quitter le lecteur')

  console.log('4. « Revenir au direct »')
  await page.mouse.move(700, 450)
  await page.getByRole('button', { name: 'Revenir au direct' }).first().click()
  v.ok(await jusqua(() => lecteur.api((r) => r.chemin === '/api/v1/live/7000.m3u8').length > 0, 10_000), 'le direct de la chaine 7000 est ouvert')

  console.log('5. depuis le direct : P ouvre les programmes, un clic revoit')
  await attendre(800)
  await page.locator('[tabindex="-1"]').first().focus()
  await page.keyboard.press('p')
  v.ok(await jusqua(() => panneau.isVisible(), 10_000), 'P ouvre le panneau en direct')
  v.ok(await jusqua(async () => (await panneau.locator('[data-statut="direct"][data-actif="1"]').count()) === 1, 10_000), 'le programme en cours est marque « ● Direct »')
  const avant = lecteur.api((r) => /^\/api\/v1\/vod\/iptva:replay-7000-/.test(r.chemin)).length
  // Juste apres minuit (heure locale), « Aujourd'hui » n'a encore rien a revoir : la veille, si.
  if ((await panneau.locator('[data-statut="revoir"]').count()) === 0) await panneau.getByRole('tab', { name: 'Hier' }).click()
  v.ok(await jusqua(async () => (await panneau.locator('[data-statut="revoir"]').count()) > 0, 10_000), 'des programmes a revoir (aujourd’hui ou hier)')
  await panneau.locator('[data-statut="revoir"]').last().click()
  v.ok(await jusqua(() => lecteur.api((r) => /^\/api\/v1\/vod\/iptva:replay-7000-/.test(r.chemin)).length > avant, 10_000), 'un clic sur « ↺ Revoir » lance ce replay')
  v.ok(lecteur.api((r) => r.chemin.startsWith('/api/v1/profil/historique/') && r.chemin.includes('replay')).length === 0, 'aucune ecriture d’historique pour un replay')
  v.ok(lecteur.erreursPage.length === 0, `aucune erreur de page (${lecteur.erreursPage.join(' | ')})`)
  v.ok(lecteur.externes.length === 0, 'aucune requete hors 127.0.0.1')
} finally {
  await lecteur.fermer()
}
v.termine()
