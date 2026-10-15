// US-19 contre le VRAI serveur de dev (cmd/mytv-dev) : faux fournisseur local,
// jamais le vrai. Usage : npm run build && node tests/e2e/us19-harnais.mjs
// Binaire : MYTV_DEV (defaut /opt/mytv-work/bin-mytv-dev). Absent : le test est saute.
import { chromium } from 'playwright'
import { spawn, spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BIN = process.env.MYTV_DEV ?? '/opt/mytv-work/bin-mytv-dev'
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
// Le harnais sert le dossier a la RACINE de l'origine, alors que la production
// le sert sous /app/ : on construit donc une copie de l'interface avec base « / ».
const DIST = path.join(RACINE, 'tests/e2e/.dist-harnais')
if (!fs.existsSync(BIN)) { console.log(`SKIP harnais absent (${BIN})`); process.exit(0) }
const build = spawnSync(
  path.join(RACINE, 'node_modules/.bin/vite'),
  ['build', '--base=/', '--outDir', DIST, '--emptyOutDir'],
  { cwd: RACINE, env: { ...process.env, NODE_OPTIONS: '--tls-max-v1.2' }, encoding: 'utf8' },
)
if (build.status !== 0) { console.log('KO   build du harnais :', build.stdout, build.stderr); process.exit(1) }

const violations = []
const proc = spawn(BIN, ['--dist', DIST, '--ecoute', '127.0.0.1:0'], { stdio: ['ignore', 'pipe', 'pipe'] })
const sortie = []
proc.stdout.on('data', (d) => sortie.push(String(d)))
proc.stderr.on('data', (d) => sortie.push(String(d)))
const arreter = () => new Promise((ok) => { proc.once('exit', ok); proc.kill('SIGINT'); setTimeout(() => proc.kill('SIGKILL'), 3000) })

let navigateur
let echec = 0
try {
  const origine = await new Promise((ok, ko) => {
    const t = setTimeout(() => ko(new Error('harnais muet : ' + sortie.join(''))), 15_000)
    const sonde = setInterval(() => {
      const m = /mytv \(API \+ interface\)\s*:\s*(http:\/\/127\.0\.0\.1:\d+)/.exec(sortie.join(''))
      if (m) { clearInterval(sonde); clearTimeout(t); ok(m[1]) }
    }, 50)
  })
  navigateur = await chromium.launch()
  const ctx = await navigateur.newContext()
  await ctx.route('**/*', (route) => {
    const u = new URL(route.request().url())
    if (u.hostname === '127.0.0.1' || u.protocol === 'data:' || u.protocol === 'blob:') return route.continue()
    violations.push(route.request().url())
    return route.abort()
  })
  ctx.setDefaultTimeout(30_000)
  const page = await ctx.newPage()
  const erreurs = []
  page.on('pageerror', (e) => erreurs.push(e.message))
  const exports = []
  page.on('response', (r) => { if (r.url().includes('/catalogue/export')) exports.push(r.url().split('type=')[1]) })

  await page.goto(`${origine}/`)
  await page.getByLabel('Identifiant').fill('test')
  await page.getByLabel('Mot de passe').fill('motdepasse-de-dev')
  const t0 = Date.now()
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await page.getByRole('button', { name: 'Réglages' }).waitFor()

  const lire = (table, cle) => page.evaluate(([t, c]) => new Promise((ok, ko) => {
    const r = indexedDB.open('mytv')
    r.onerror = () => ko(r.error)
    r.onsuccess = () => {
      const b = r.result
      if (!b.objectStoreNames.contains(t)) { b.close(); return ok(undefined) }
      const st = b.transaction(t).objectStore(t)
      const q = c === undefined ? st.count() : st.get(c)
      q.onsuccess = () => { b.close(); ok(q.result) }
    }
  }), [table, cle])

  const attendre = async (f, quoi, delai = 60_000) => {
    const d = Date.now()
    while (!(await f())) {
      if (Date.now() - d > delai) throw new Error('delai depasse : ' + quoi)
      await new Promise((r) => setTimeout(r, 150))
    }
  }
  await attendre(async () => (await lire('reglages', 'catalogue.version'))?.valeur, 'import termine')
  const ms = Date.now() - t0
  const n = await lire('catalogue')
  const c = await lire('categories')
  console.log(`  harnais : ${n} entrees et ${c} categories importees en ${ms} ms (connexion comprise)`)
  assert.ok(n >= 2000 + 5000 + 500, `catalogue incomplet : ${n}`)
  assert.deepEqual([...new Set(exports)].sort(), ['categories', 'live', 'series', 'vod'])

  // Recherche sur le vrai catalogue de dev, et un favori qui atteint le vrai serveur.
  await page.goto(`${origine}/recherche?q=${encodeURIComponent('Chaine 1')}`)
  await page.getByText('Chaine 1', { exact: false }).first().waitFor()
  await page.goto(`${origine}/`)
  const fav = page.getByRole('button', { name: 'Ajouter aux favoris' }).first()
  await fav.waitFor()
  await fav.click()
  const reponse = await ctx.request.get(`${origine}/api/v1/profil/favoris`)
  await attendre(async () => (await (await ctx.request.get(`${origine}/api/v1/profil/favoris`)).json()).elements.length === 1, 'favori au serveur', 10_000)
  void reponse

  // Reouverture : meme version => aucune donnee retelechargee.
  exports.length = 0
  await page.reload()
  await page.getByRole('button', { name: 'Réglages' }).waitFor()
  await page.waitForTimeout(2000)
  assert.deepEqual(exports, [], 'import redemande alors que la version n\'a pas change')
  assert.deepEqual(erreurs, [], erreurs.join(' | '))
  console.log('OK   harnais')
} catch (e) {
  echec = 1
  console.log(`KO   harnais : ${e.message}`)
} finally {
  await navigateur?.close()
  await arreter()
}
if (violations.length) { echec = 1; console.log('KO   requetes hors 127.0.0.1 :', violations.join(', ')) }
process.exit(echec)
