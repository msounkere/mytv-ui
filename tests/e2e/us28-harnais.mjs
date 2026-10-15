// US-28 de bout en bout contre le VRAI serveur de dev (cmd/mytv-dev) : mytv reel, faux
// fournisseur local (get_vod_info / get_series_info generes, jamais le vrai fournisseur).
// Usage : MYTV_DEV=<binaire cmd/mytv-dev de la branche feat/lot4-d> node tests/e2e/us28-harnais.mjs
// Binaire absent : le test est saute (POST /panne-details existe dans le harnais de la branche feat/lot4-d). Cas du faux (rang i = numero - 200001) :
//   i%10 == 7 : pas de fiche   i%10 == 8 : HTTP 404   i%10 == 9 : fiche partielle   autres : complete
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
const build = spawnSync(path.join(RACINE, 'node_modules/.bin/vite'), ['build', '--base=/', '--outDir', DIST, '--emptyOutDir'],
  { cwd: RACINE, env: { ...process.env, NODE_OPTIONS: '--tls-max-v1.2' }, encoding: 'utf8' })
if (build.status !== 0) { console.log('KO   build du harnais :', build.stdout, build.stderr); process.exit(1) }

const violations = []
const proc = spawn(BIN, ['--dist', DIST, '--ecoute', '127.0.0.1:0'], { stdio: ['ignore', 'pipe', 'pipe'] })
const sortie = []
proc.stdout.on('data', (d) => sortie.push(String(d)))
proc.stderr.on('data', (d) => sortie.push(String(d)))
const arreter = () => new Promise((ok) => { proc.once('exit', ok); proc.kill('SIGINT'); setTimeout(() => proc.kill('SIGKILL'), 4000) })
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

let navigateur
let echec = 0
try {
  let origine, ctrl
  for (let i = 0; i < 300 && !(origine && ctrl); i++) {
    const t = sortie.join('')
    origine = /\(API \+ interface\)\s*:\s*(http:\/\/127\.0\.0\.1:\d+)/.exec(t)?.[1]
    ctrl = /pilotage des pannes\s*:\s*(http:\/\/127\.0\.0\.1:\d+)/.exec(t)?.[1]
    await dormir(100)
  }
  if (!origine || !ctrl) throw new Error('harnais muet : ' + sortie.join(''))
  const compteurs = async () => (await fetch(`${ctrl}/compteurs`)).json()

  navigateur = await chromium.launch()
  const ctx = await navigateur.newContext({ viewport: { width: 1360, height: 860 } })
  await ctx.route('**/*', (route) => {
    const u = new URL(route.request().url())
    if (u.hostname === '127.0.0.1' || ['data:', 'blob:'].includes(u.protocol)) return route.continue()
    violations.push(route.request().url()); return route.abort()
  })
  ctx.setDefaultTimeout(30_000)
  const page = await ctx.newPage()
  const erreurs = []
  page.on('pageerror', (e) => erreurs.push(e.message))
  await page.goto(`${origine}/`)
  await page.getByLabel('Identifiant').fill('test')
  await page.getByLabel('Mot de passe').fill('motdepasse-de-dev')
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await page.getByRole('button', { name: 'Réglages' }).waitFor()
  // Le catalogue de dev est ancien : « A la une » reste vide, les fiches s'ouvrent par leur adresse.
  const attendreImport = async () => {
    for (let i = 0; i < 600; i++) {
      const v = await page.evaluate(() => new Promise((ok) => {
        const r = indexedDB.open('mytv'); r.onerror = () => ok(false)
        r.onsuccess = () => { const d = r.result
          if (!d.objectStoreNames.contains('reglages')) { d.close(); return ok(false) }
          const q = d.transaction('reglages').objectStore('reglages').get('catalogue.version')
          q.onsuccess = () => { d.close(); ok(!!q.result?.valeur) } }
      }))
      if (v) return
      await dormir(200)
    }
    throw new Error('import du catalogue non termine')
  }
  await attendreImport()
  let c = await compteurs()
  const appelsFiche = (k) => Object.entries(c.DetailsParID ?? {}).filter(([cle]) => cle.startsWith(k)).reduce((n, [, v]) => n + v, 0)
  assert.equal((c.ParAction.get_vod_info ?? 0) + (c.ParAction.get_series_info ?? 0), 0, "l'import et l'accueil ne doivent demander aucun detail")

  // 2. Fiche film complete : synopsis, genre, casting... venus du fournisseur via mytv.
  await page.goto(`${origine}/film/vod:iptva:200001`)
  const fiche = page.locator('[data-role="fiche-film"]')
  await fiche.locator('[data-role="resume"][data-etat="pret"]').waitFor()
  const t = await fiche.innerText()
  assert.match(t, /Synopsis du film 200001/)
  assert.match(t, /Réalisateur\s+Denis Lefevre/)
  assert.match(t, /Avec\s+Alice Martin, Bruno Durand, Claire Petit/)
  assert.equal(await fiche.locator('a[data-role="bande-annonce"]').getAttribute('href'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  c = await compteurs()
  assert.equal(appelsFiche('vod:200001'), 1)
  // Rouvrir la fiche (rechargement complet : cache de l'interface perdu) : le CACHE DU SERVEUR repond, aucun appel de plus.
  await page.reload()
  await page.locator('[data-role="fiche-film"] [data-role="resume"][data-etat="pret"]').waitFor()
  assert.equal(appelsFiche('vod:200001'), 1 + 0, 'le fournisseur a ete rappele alors que les details sont en cache')
  c = await compteurs()
  assert.equal((c.DetailsParID['vod:200001'] ?? 0), 1)

  // 3. Cas du fournisseur : pas de fiche, 404, fiche partielle.
  await page.goto(`${origine}/film/vod:iptva:200008`) // i=7
  await page.locator('[data-role="resume"][data-etat="absent"]').waitFor()
  await page.goto(`${origine}/film/vod:iptva:200009`) // i=8 : 404 du fournisseur
  await page.locator('[data-role="resume"][data-etat="absent"]').waitFor()
  assert.match(await page.locator('[data-role="fiche-film"]').innerText(), /Pas de résumé disponible/)
  await page.goto(`${origine}/film/vod:iptva:200010`) // i=9 : synopsis seul
  await page.locator('[data-role="resume"][data-etat="pret"]').waitFor()
  assert.match(await page.locator('[data-role="fiche-film"]').innerText(), /Synopsis partiel du film 200010/)
  assert.equal(await page.locator('a[data-role="bande-annonce"]').count(), 0)

  // 4. Fiche serie : details de la serie + resume de chaque episode.
  await page.goto(`${origine}/serie/series:iptva:s200001`)
  await page.getByText('Episode 1 de la saison 1').first().waitFor()
  await page.locator('[data-role="resume"][data-etat="pret"]').waitFor()
  const s = await page.locator('main').innerText()
  assert.match(s, /Resume de la serie 200001/)
  assert.match(s, /26 min par épisode/)
  assert.ok((await page.locator('[data-role="episode-resume"]').count()) >= 3, 'resume des episodes')
  c = await compteurs()
  assert.equal(c.DetailsParID['serie:200001'], 1, 'un seul get_series_info pour la fiche et ses saisons')

  // 5. Fournisseur qui refuse (458) : la fiche s'affiche quand meme ; plus aucun appel ensuite (coupe-circuit).
  await fetch(`${ctrl}/panne-details?statut=458&duree=60s`, { method: 'POST' })
  const avant = (await compteurs()).ParAction.get_vod_info
  await page.goto(`${origine}/film/vod:iptva:200002`)
  await page.locator('[data-role="resume"][data-etat="indisponible"]').waitFor()
  assert.match(await page.locator('[data-role="fiche-film"]').innerText(), /momentanément indisponible/)
  await fetch(`${ctrl}/panne`, { method: 'DELETE' })
  await page.goto(`${origine}/film/vod:iptva:200003`)
  await page.locator('[data-role="resume"][data-etat="indisponible"]').waitFor()
  c = await compteurs()
  assert.equal(c.ParAction.get_vod_info, avant + 1, 'le coupe-circuit doit empecher tout appel apres le 458')

  assert.deepEqual(erreurs, [], erreurs.join(' | '))
  console.log('OK   harnais US-28')
} catch (e) {
  echec = 1
  console.log(`KO   harnais US-28 : ${e.message}`)
  console.log(sortie.join('').split('\n').slice(-15).join('\n'))
} finally {
  await navigateur?.close()
  await arreter()
}
if (violations.length) { echec = 1; console.log('KO   requetes hors 127.0.0.1 :', violations.join(', ')) }
process.exit(echec)
