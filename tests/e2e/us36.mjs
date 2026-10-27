// US-36 CA4 : import par difference quand la version change (serveur qui la propose),
// complet quand le serveur repond 409 version_inconnue ; progression affichee ;
// telemetrie catalogue:import. Faux serveur local (serveur-factice.mjs) uniquement.
//   npm run build && NODE_OPTIONS=--tls-max-v1.2 node tests/e2e/us36.mjs
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { demarrerServeurFactice, COMPTE, MOT_DE_PASSE } from './serveur-factice.mjs'

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist')
const violations = []

async function contexte(navigateur) {
  const ctx = await navigateur.newContext({ viewport: { width: 1360, height: 860 } })
  await ctx.route('**/*', (route) => {
    const u = new URL(route.request().url())
    if (u.hostname === '127.0.0.1' || u.protocol === 'data:' || u.protocol === 'blob:') return route.continue()
    violations.push(route.request().url())
    return route.abort()
  })
  ctx.setDefaultTimeout(15_000)
  return ctx
}

const lireIdb = (page, table, cle) =>
  page.evaluate(
    ([t, c]) =>
      new Promise((ok, ko) => {
        const r = indexedDB.open('mytv')
        r.onerror = () => ko(r.error)
        r.onsuccess = () => {
          const base = r.result
          if (!base.objectStoreNames.contains(t)) { base.close(); return ok(undefined) }
          const st = base.transaction(t).objectStore(t)
          const q = c === undefined ? st.getAll() : st.get(c)
          q.onsuccess = () => { base.close(); ok(q.result) }
          q.onerror = () => { base.close(); ko(q.error) }
        }
      }),
    [table, cle],
  )
const compterIdb = (page, table) => lireIdb(page, table).then((l) => l?.length ?? 0)

async function attendre(condition, { delai = 15_000, pas = 100, quoi = 'condition' } = {}) {
  const debut = Date.now()
  for (;;) {
    const v = await condition()
    if (v) return v
    if (Date.now() - debut > delai) throw new Error(`delai depasse : ${quoi}`)
    await new Promise((r) => setTimeout(r, pas))
  }
}

const catalogueComplet = (page, serveur) => async () => {
  const v = await lireIdb(page, 'reglages', 'catalogue.version')
  if (v?.valeur !== serveur.etat.version) return false
  const t = serveur.etat.catalogue
  return (await compterIdb(page, 'catalogue')) === t.live.length + t.vod.length + t.series.length
}

/** Exports demandes, par type, avec ou sans `depuis`. */
const exports = (serveur) =>
  serveur.etat.requetes
    .filter((r) => r.chemin === '/api/v1/catalogue/export')
    .map((r) => {
      const q = new URLSearchParams(r.requete)
      return { type: q.get('type'), depuis: q.get('depuis') }
    })

const evenementsImport = (serveur) => serveur.lire('evenements').then((l) => l.filter((e) => e.type === 'catalogue:import'))

async function seConnecter(page) {
  await page.getByLabel('Identifiant').fill(COMPTE)
  await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await page.getByPlaceholder('Nom du profil').fill('Salon')
  await page.getByRole('button', { name: 'Créer et utiliser' }).click()
}

const SCENARIOS = {
  // CA4 : version connue -> difference ; entrees ajoutees, modifiees, supprimees ;
  // compteurs de categories justes ; progression visible ; telemetrie mode=difference.
  async difference(navigateur) {
    const serveur = await demarrerServeurFactice({ dist: DIST })
    const ctx = await contexte(navigateur)
    try {
      const page = await ctx.newPage()
      await page.goto(`${serveur.origine}/`)
      await seConnecter(page)
      await attendre(catalogueComplet(page, serveur), { delai: 30_000, quoi: 'import initial' })
      assert.deepEqual(exports(serveur).map((e) => e.depuis), [null, null, null, null], 'import initial sans depuis')
      const v1 = serveur.etat.version
      const comptesAvant = (await lireIdb(page, 'categories')).filter((c) => c.type === 'vod').reduce((n, c) => n + c.compte, 0)
      assert.equal(comptesAvant, serveur.etat.catalogue.vod.length)
      await attendre(async () => (await evenementsImport(serveur)).length === 1, { quoi: 'telemetrie du premier import' })
      const [e1] = await evenementsImport(serveur)
      assert.equal(e1.mode, 'complet')
      assert.equal(e1.entrees, 300 + 600 + 40)
      assert.ok(typeof e1.ms === 'number' && e1.ms > 0, `ms mesure (${e1.ms})`)

      // Nouvelle version : 5 films retires, 3 ajoutes, 2 renommes, 1 chaine retiree.
      await serveur.lire('vider-requetes')
      await serveur.appel('nouvelle-version', { version: 'v2', retirerFilms: 5, ajouterFilms: 3, renommerFilms: 2, retirerChaines: 1 })
      const parts = new Set()
      await page.reload()
      await attendre(async () => {
        const w = await page.getByTestId('bandeau-import-barre').evaluate((e) => e.style.width).catch(() => null)
        if (w) parts.add(w)
        return await catalogueComplet(page, serveur)()
      }, { delai: 30_000, pas: 20, quoi: 'import par difference' })
      const ex = exports(serveur)
      assert.deepEqual(
        ex,
        [{ type: 'categories', depuis: null }, { type: 'live', depuis: v1 }, { type: 'vod', depuis: v1 }, { type: 'series', depuis: v1 }],
        `exports demandes : ${JSON.stringify(ex)}`,
      )
      assert.equal(await lireIdb(page, 'catalogue', 'vod:iptva:5000'), undefined, 'film retire encore present')
      assert.equal(await lireIdb(page, 'catalogue', 'live:iptva:100000'), undefined, 'chaine retiree encore presente')
      assert.ok(await lireIdb(page, 'catalogue', 'vod:iptva:90000'), 'film ajoute absent')
      const renomme = await lireIdb(page, 'catalogue', 'vod:iptva:5005')
      assert.match(renomme.nom, /remasterisé/, `film renomme non mis a jour : ${renomme.nom}`)
      const cats = await lireIdb(page, 'categories')
      assert.equal(cats.filter((c) => c.type === 'vod').reduce((n, c) => n + c.compte, 0), serveur.etat.catalogue.vod.length, 'compteurs des categories apres difference')
      assert.equal(cats.filter((c) => c.type === 'live').reduce((n, c) => n + c.compte, 0), serveur.etat.catalogue.live.length)
      assert.ok([...parts].some((w) => parseInt(w) > 0 && parseInt(w) <= 100), `pas de progression visible : ${[...parts]}`)
      await attendre(async () => (await evenementsImport(serveur)).length === 2, { quoi: 'telemetrie de la difference' })
      const [, e2] = await evenementsImport(serveur)
      assert.equal(e2.mode, 'difference')
      // 1 chaine + (5 + 3 + 2) films appliques, 0 serie.
      assert.equal(e2.entrees, 1 + 10, `entrees traitees = ${e2.entrees}`)
      assert.equal(e2.total, serveur.etat.catalogue.live.length + serveur.etat.catalogue.vod.length + serveur.etat.catalogue.series.length)

      // Meme version : rien n'est redemande.
      await serveur.lire('vider-requetes')
      await page.reload()
      await page.getByRole('button', { name: 'Réglages' }).waitFor()
      await attendre(() => serveur.etat.requetes.some((r) => r.chemin === '/api/v1/catalogue/version'), { quoi: 'manifeste' })
      await page.waitForTimeout(1200)
      assert.deepEqual(exports(serveur), [], 'des donnees ont ete redemandees a version egale')

      // Reimport force : complet, sans depuis.
      await serveur.lire('vider-requetes')
      await page.getByRole('button', { name: 'Réglages' }).click()
      await page.getByRole('button', { name: 'Réimporter tout' }).click()
      await attendre(() => exports(serveur).some((e) => e.type === 'series'), { quoi: 'reimport force' })
      assert.ok(exports(serveur).every((e) => e.depuis === null), `reimport force avec depuis : ${JSON.stringify(exports(serveur))}`)
      await attendre(catalogueComplet(page, serveur), { quoi: 'fin du reimport force' })
    } finally {
      await ctx.close()
      await serveur.fermer()
    }
  },

  // CA4 : le serveur ne connait plus la version (409) -> import complet, resultat juste.
  async versionInconnue(navigateur) {
    const serveur = await demarrerServeurFactice({ dist: DIST })
    const ctx = await contexte(navigateur)
    try {
      const page = await ctx.newPage()
      await page.goto(`${serveur.origine}/`)
      await seConnecter(page)
      await attendre(catalogueComplet(page, serveur), { delai: 30_000, quoi: 'import initial' })
      const v1 = serveur.etat.version
      await serveur.lire('vider-requetes')
      await serveur.appel('nouvelle-version', { version: 'v3', retirerFilms: 4, ajouterFilms: 1, sansHistorique: true })
      await page.reload()
      await attendre(catalogueComplet(page, serveur), { delai: 30_000, quoi: 'import complet apres 409' })
      const ex = exports(serveur)
      assert.deepEqual(ex.slice(0, 2), [{ type: 'categories', depuis: null }, { type: 'live', depuis: v1 }], `debut : ${JSON.stringify(ex)}`)
      assert.deepEqual(
        ex.slice(2),
        [{ type: 'categories', depuis: null }, { type: 'live', depuis: null }, { type: 'vod', depuis: null }, { type: 'series', depuis: null }],
        `apres le 409, tout en complet : ${JSON.stringify(ex)}`,
      )
      assert.equal(await lireIdb(page, 'catalogue', 'vod:iptva:5000'), undefined, 'film retire encore present')
      assert.ok(await lireIdb(page, 'catalogue', 'vod:iptva:90000'), 'film ajoute absent')
      await attendre(async () => (await evenementsImport(serveur)).length === 2, { quoi: 'telemetrie' })
      const [, e2] = await evenementsImport(serveur)
      assert.equal(e2.mode, 'complet')
      assert.equal((await lireIdb(page, 'categories')).filter((c) => c.type === 'vod').reduce((n, c) => n + c.compte, 0), serveur.etat.catalogue.vod.length)
    } finally {
      await ctx.close()
      await serveur.fermer()
    }
  },
}

const demandes = process.argv.slice(2)
const noms = demandes.length ? demandes : Object.keys(SCENARIOS)
const navigateur = await chromium.launch()
let echecs = 0
try {
  for (const nom of noms) {
    const t0 = Date.now()
    try {
      await SCENARIOS[nom](navigateur)
      console.log(`OK   ${nom} (${Date.now() - t0} ms)`)
    } catch (e) {
      echecs++
      console.log(`KO   ${nom} : ${e.message}`)
      if (process.env.DEBUG) console.log(e.stack)
    }
  }
} finally {
  await navigateur.close()
}
if (violations.length) {
  echecs++
  console.log(`KO   requetes hors 127.0.0.1 :\n  ${[...new Set(violations)].join('\n  ')}`)
}
console.log(`US-36 : ${noms.length - echecs}/${noms.length} scenarios`)
process.exit(echecs ? 1 : 0)
