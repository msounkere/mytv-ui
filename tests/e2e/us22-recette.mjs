// US-22 : recette de bout en bout contre cmd/mytv-dev (faux fournisseur, 127.0.0.1 seulement).
// Usage : node tests/e2e/us22-recette.mjs   (MYTV_DEV = binaire, defaut /opt/mytv-work/bin-mytv-dev)
// Chromium headless ne decode pas le H.264 : on verifie les requetes et l'absence d'erreur hls.
import { chromium } from 'playwright'
import { spawn, spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BIN = process.env.MYTV_DEV ?? '/opt/mytv-work/bin-mytv-dev'
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DIST = path.join(RACINE, 'tests/e2e/.dist-harnais')
if (!fs.existsSync(BIN)) { console.log(`SKIP harnais absent (${BIN})`); process.exit(0) }
const b = spawnSync(path.join(RACINE, 'node_modules/.bin/vite'), ['build', '--base=/', '--outDir', DIST, '--emptyOutDir'],
  { cwd: RACINE, env: { ...process.env, NODE_OPTIONS: '--tls-max-v1.2' }, encoding: 'utf8' })
if (b.status !== 0) { console.log('KO build', b.stderr); process.exit(1) }

const violations = []
const mesures = {}
const resultats = []
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

async function lancer(args) {
  const t0 = Date.now()
  const proc = spawn(BIN, ['--dist', DIST, '--ecoute', '127.0.0.1:0', ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
  const sortie = []
  proc.stdout.on('data', (d) => sortie.push(String(d)))
  proc.stderr.on('data', (d) => sortie.push(String(d)))
  const txt = () => sortie.join('')
  for (let i = 0; i < 200 && !/pilotage des pannes\s*:\s*http/.test(txt()); i++) await dormir(100)
  const origine = /\(API \+ interface\)\s*:\s*(http:\/\/127\.0\.0\.1:\d+)/.exec(txt())?.[1]
  const ctrl = /pilotage des pannes\s*:\s*(http:\/\/127\.0\.0\.1:\d+)/.exec(txt())?.[1]
  if (!origine) { proc.kill('SIGKILL'); throw new Error('harnais muet : ' + txt()) }
  return {
    origine, ctrl, demarrageMs: Date.now() - t0,
    arreter: () => new Promise((ok) => { proc.once('exit', ok); proc.kill('SIGINT'); setTimeout(() => proc.kill('SIGKILL'), 5000) }),
  }
}

async function contexte(nav) {
  const ctx = await nav.newContext()
  await ctx.route('**/*', (route) => {
    const u = new URL(route.request().url())
    if (u.hostname === '127.0.0.1' || ['data:', 'blob:'].includes(u.protocol)) return route.continue()
    violations.push(route.request().url()); return route.abort()
  })
  ctx.setDefaultTimeout(30_000)
  return ctx
}

const lireIdb = (page, table) => page.evaluate((t) => new Promise((ok, ko) => {
  const r = indexedDB.open('mytv'); r.onerror = () => ko(r.error)
  r.onsuccess = () => { const d = r.result
    if (!d.objectStoreNames.contains(t)) { d.close(); return ok(0) }
    const q = d.transaction(t).objectStore(t).count(); q.onsuccess = () => { d.close(); ok(q.result) } }
}), table)
const versionImport = (page) => page.evaluate(() => new Promise((ok) => {
  const r = indexedDB.open('mytv'); r.onerror = () => ok(undefined)
  r.onsuccess = () => { const d = r.result
    if (!d.objectStoreNames.contains('reglages')) { d.close(); return ok(undefined) }
    const q = d.transaction('reglages').objectStore('reglages').get('catalogue.version')
    q.onsuccess = () => { d.close(); ok(q.result?.valeur) } }
}))
async function jusqua(f, quoi, delai = 60_000) {
  const d = Date.now()
  while (!(await f())) { if (Date.now() - d > delai) throw new Error('delai depasse : ' + quoi); await dormir(150) }
}
async function connecter(page, origine, nom = 'test') {
  await page.goto(`${origine}/`)
  await page.getByLabel('Identifiant').fill(nom)
  await page.getByLabel('Mot de passe').fill('motdepasse-de-dev')
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await page.getByRole('button', { name: 'Réglages' }).waitFor()
}
const naviguerSpa = (page, chemin) => page.evaluate((c) => { history.pushState({}, '', c); dispatchEvent(new PopStateEvent('popstate')) }, chemin)
async function ouvrirDirect(page, n) {
  await page.goto(`${page.url().split('/').slice(0, 3).join('/')}/lecture/${encodeURIComponent('live:iptva:' + n)}`)
}
const scenario = async (nom, f) => {
  const t = Date.now()
  try { await f(); resultats.push([nom, true, Date.now() - t]); console.log(`OK   ${nom} (${Date.now() - t} ms)`) }
  catch (e) { resultats.push([nom, false, Date.now() - t]); console.log(`KO   ${nom} : ${e.message}`) }
}

const nav = await chromium.launch()
try {
  // ---------------------------------------------------------------- parcours nominal
  let h = await lancer(['--une-connexion', '2s'])
  mesures.demarrageHarnaisMs = h.demarrageMs
  let ctx = await contexte(nav)
  const page = await ctx.newPage()
  const erreursPage = []; const hlsErreurs = []; const reqs = []
  page.on('pageerror', (e) => erreursPage.push(e.message))
  page.on('console', (m) => { if (/hls/i.test(m.text()) && /error|erreur/i.test(m.text()) && m.type() === 'error') hlsErreurs.push(m.text()) })
  page.on('response', (r) => reqs.push([r.status(), r.request().method(), new URL(r.url()).pathname + new URL(r.url()).search]))

  await scenario('connexion + import du catalogue complet', async () => {
    const t0 = Date.now()
    await page.goto(`${h.origine}/`)
    await page.getByLabel('Identifiant').fill('test')
    await page.getByLabel('Mot de passe').fill('motdepasse-de-dev')
    await page.getByRole('button', { name: 'Se connecter' }).click()
    await page.getByRole('button', { name: 'Réglages' }).waitFor()
    mesures.connexionAffichageMs = Date.now() - t0
    await jusqua(() => versionImport(page), 'import termine')
    mesures.importCompletMs = Date.now() - t0
    mesures.entrees = await lireIdb(page, 'catalogue')
    assert.ok(mesures.entrees >= 7500, 'catalogue incomplet ' + mesures.entrees)
  })
  await scenario('recherche', async () => {
    await page.goto(`${h.origine}/recherche?q=${encodeURIComponent('Chaine 1')}`)
    await page.getByText('Chaine 1', { exact: false }).first().waitFor()
  })
  await scenario('fiche + favori', async () => {
    await page.goto(`${h.origine}/`)
    const fav = page.getByRole('button', { name: 'Ajouter aux favoris' }).first()
    await fav.waitFor()
    await fav.click()
    await jusqua(async () => (await (await ctx.request.get(`${h.origine}/api/v1/profil/favoris`)).json()).elements.length >= 1, 'favori cote serveur', 10_000)
    await page.goto(`${h.origine}/series`)
    await page.locator('button[title*="ajouté le"]').first().click()
    await page.waitForURL(/\/serie\//)
  })
  await scenario('guide (grille EPG, aucun appel par chaine)', async () => {
    reqs.length = 0
    await page.goto(`${h.origine}/guide`)
    await jusqua(() => reqs.some((r) => r[2].startsWith('/api/v1/epg/grille')), 'appel grille', 20_000)
    await dormir(1500)
    const parChaine = reqs.filter((r) => /\/epg\/chaines\//.test(r[2])).length
    const grilles = reqs.filter((r) => r[2].startsWith('/api/v1/epg/grille')).length
    mesures.guideAppelsGrille = grilles
    assert.ok(grilles <= 6 && parChaine === 0, `grilles=${grilles} parChaine=${parChaine}`)
  })
  await scenario('lancement du direct (requetes, pas d\'erreur hls)', async () => {
    reqs.length = 0
    await page.goto(`${h.origine}/direct`)
    await ouvrirDirect(page, 1001)
    await jusqua(() => reqs.some((r) => /\/api\/v1\/live\/1001\.m3u8/.test(r[2]) && r[0] === 200), 'playlist 200', 20_000)
    await jusqua(() => reqs.some((r) => /\/live\/1001\/seg\//.test(r[2]) && r[0] === 200), 'segment 200', 20_000)
    assert.equal(reqs.filter((r) => r[0] >= 400 && /\/live\//.test(r[2])).length, 0)
    assert.deepEqual(hlsErreurs, [])
  })
  await scenario('zapping rapide x10 sans 407 residuel', async () => {
    const t0 = Date.now()
    reqs.length = 0
    await dormir(2500)
    await page.locator('body').click({ position: { x: 5, y: 5 } })
    for (let n = 0; n < 10; n++) { await page.keyboard.press('PageDown'); await dormir(400) }
    const derniere = () => [...reqs].reverse().find((r) => /\/live\/\d+\.m3u8/.test(r[2]))?.[2].match(/live\/(\d+)\.m3u8/)?.[1]
    await jusqua(() => { const d = derniere(); return d && reqs.some((r) => r[0] === 200 && r[2].includes(`/live/${d}/seg/`)) }, 'segment de la derniere chaine', 60_000)
    assert.ok(new Set(reqs.filter((r) => /\/live\/\d+\.m3u8/.test(r[2])).map((r) => r[2].split('?')[0])).size >= 2, 'aucun zapping effectif')
    mesures.zappingX10Ms = Date.now() - t0
    const compteurs = await (await fetch(`${h.ctrl}/compteurs`)).json()
    mesures.compteursFaux = compteurs
    assert.ok(compteurs.Refus407 >= 1, 'la regle une-connexion du faux n\'a pas ete exercee')
    const mauvais = reqs.filter((r) => r[0] === 407 || r[0] === 503)
    assert.equal(mauvais.length, 0, JSON.stringify(mauvais.slice(0, 3)))
    assert.equal(reqs.filter((r) => /\/live\/.*\/fin/.test(r[2])).length, 0, 'fin envoyee pendant le zapping')
  })
  await scenario('deconnexion', async () => {
    await page.goto(`${h.origine}/reglages`)
    await page.getByRole('button', { name: /Se déconnecter|Déconnexion/ }).first().click()
    await page.getByLabel('Identifiant').waitFor()
    const r = await ctx.request.get(`${h.origine}/api/v1/compte`)
    assert.equal(r.status(), 401)
  })
  await scenario('demarrage a chaud (catalogue deja importe)', async () => {
    const p2 = await ctx.newPage()
    const t0 = Date.now()
    await p2.goto(`${h.origine}/`)
    await p2.getByLabel('Identifiant').fill('test')
    await p2.getByLabel('Mot de passe').fill('motdepasse-de-dev')
    await p2.getByRole('button', { name: 'Se connecter' }).click()
    await p2.getByRole('button', { name: 'Réglages' }).waitFor()
    mesures.demarrageChaudMs = Date.now() - t0
    await p2.close()
  })
  assert.deepEqual(erreursPage, [], erreursPage.join(' | '))
  await ctx.close()

  await h.arreter()
  h = await lancer([]) // pannes : sans la regle une-connexion, pour isoler la panne
  // ---------------------------------------------------------------- pannes
  await scenario('panne 407 pendant 30 s : patience puis lecture', async () => {
    const c = await contexte(nav); const p = await c.newPage()
    const rs = []; p.on('response', (r) => rs.push([r.status(), new URL(r.url()).pathname]))
    await connecter(p, h.origine)
    await jusqua(() => versionImport(p), 'import')
    const r = await fetch(`${h.ctrl}/panne?statut=407&duree=30s`, { method: 'POST' }); assert.equal(r.status, 204)
    const t0 = Date.now()
    await ouvrirDirect(p, 1020)
    await jusqua(() => rs.some((x) => /1020\/seg\//.test(x[1]) && x[0] === 200), 'lecture apres la panne', 90_000)
    mesures.panne407AttenteMs = Date.now() - t0
    assert.ok(mesures.panne407AttenteMs >= 20_000, 'patience trop courte : ' + mesures.panne407AttenteMs)
    await fetch(`${h.ctrl}/panne`, { method: 'DELETE' })
    console.log('  deconnexion', (await c.request.post(`${h.origine}/api/v1/deconnexion`)).status())
    await c.close()
  })
  await scenario('502 ponctuel : la lecture continue', async () => {
    const c = await contexte(nav); const p = await c.newPage()
    const rs = []; p.on('response', (r) => rs.push([r.status(), new URL(r.url()).pathname]))
    await connecter(p, h.origine)
    await jusqua(() => versionImport(p), 'import')
    await ouvrirDirect(p, 1030)
    await jusqua(() => rs.some((x) => /1030\/seg\//.test(x[1]) && x[0] === 200), 'lecture initiale', 20_000).catch((e) => { throw new Error(e.message + JSON.stringify(rs.slice(-6))) })
    await fetch(`${h.ctrl}/panne?statut=502&duree=3s`, { method: 'POST' })
    await dormir(5000)
    rs.length = 0
    await jusqua(() => rs.some((x) => /1030\/seg\//.test(x[1]) && x[0] === 200), 'reprise apres le 502', 40_000)
    await fetch(`${h.ctrl}/panne`, { method: 'DELETE' })
    console.log('  deconnexion', (await c.request.post(`${h.origine}/api/v1/deconnexion`)).status())
    await c.close()
  })
  await scenario('session expiree : retour a la connexion', async () => {
    const c = await contexte(nav); const p = await c.newPage()
    await connecter(p, h.origine)
    await c.clearCookies()
    await naviguerSpa(p, '/reglages')
    await p.evaluate(() => fetch('/api/v1/compte').then(() => dispatchEvent(new Event('focus'))))
    await p.reload()
    await p.getByLabel('Identifiant').waitFor({ timeout: 15_000 })
    console.log('  deconnexion', (await c.request.post(`${h.origine}/api/v1/deconnexion`)).status())
    await c.close()
  })
  await h.arreter()

  // ---------------------------------------------------------------- charge d'import : catalogue du vrai volume
  await scenario('charge : import de 25 000 chaines + 40 000 films + 3 000 series', async () => {
    const g = await lancer(['--chaines', '25000', '--films', '40000', '--series', '3000'])
    mesures.demarrageGrosHarnaisMs = g.demarrageMs
    const c = await contexte(nav); const p = await c.newPage()
    const t0 = Date.now()
    await connecter(p, g.origine)
    await jusqua(() => versionImport(p), 'import gros catalogue', 180_000)
    mesures.importGrosMs = Date.now() - t0
    mesures.importGrosEntrees = await lireIdb(p, 'catalogue')
    assert.ok(mesures.importGrosEntrees >= 68_000)
    assert.ok(mesures.importGrosMs < 30_000, 'budget 30 s depasse')
    await c.close(); await g.arreter()
  })
} catch (e) {
  console.log('KO   recette :', e.message); resultats.push(['recette', false, 0])
} finally {
  await nav.close()
}
console.log('MESURES', JSON.stringify(mesures))
if (violations.length) { console.log('KO   requetes hors 127.0.0.1 :', violations.join(', ')); process.exit(1) }
process.exit(resultats.every((r) => r[1]) ? 0 : 1)
