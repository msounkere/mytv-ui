import { chromium } from 'playwright'

// Mesure de l'import du catalogue et du telechargement du guide, par le VRAI
// chemin de l'application. AUCUN FLUX n'est ouvert : seuls player_api.php,
// xmltv.php et les images sont sollicites, et aucun ne consomme la connexion
// unique du fournisseur.
//
//   MYTV_ID=<id> MYTV_MDP=<mdp> node tests/relais-mesure.mjs [dossier-profil]

const DIR = process.argv[2] ?? '/tmp/claude-0/-root/af0bfe04-324f-47cd-9f6b-faadeffb4ea5/scratchpad/profil-mesure'
const nav = await chromium.launchPersistentContext(DIR, { viewport: { width: 1280, height: 800 } })
const page = nav.pages()[0] ?? (await nav.newPage())
// CONTRAINTE ABSOLUE : aucun flux ne doit s'ouvrir. On ancre les motifs sur la
// RACINE du chemin au lieu du glob habituel : `**/live/**` coupait aussi
// /flux/relais/resource/live/<id>/logo, qui n'est qu'un logo de 7 ko.
for (const motif of [
  /^https?:\/\/[^/]+\/(live|movie|series)\//,
  /^https?:\/\/[^/]+\/flux\/(live|movie|series|seg|hls)\//,
])
  await page.route(motif, (r) => r.abort())

const reseau = []
page.on('response', (r) => {
  const u = r.url()
  if (/player_api\.php|xmltv\.php/.test(u))
    reseau.push({ u: u.replace(/^https?:\/\/[^/]+/, '').slice(0, 78),
                  enc: r.headers()['content-encoding'] ?? 'identity', code: r.status() })
})

try {
  await page.goto('http://localhost:5173/app/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  if (await page.locator('button[type=submit]').count()) {
    await page.locator('label:has-text("Identifiant") input').fill(process.env.MYTV_ID)
    await page.locator('label:has-text("Mot de passe") input').fill(process.env.MYTV_MDP)
    await page.locator('button[type=submit]').click()
  }
  await page.waitForSelector('.coque', { timeout: 40000 })
  console.log('session ouverte')

  const r = await page.evaluate(async () => {
    const { ClientXtream } = await import('/app/src/lib/xtream.ts')
    const { telechargerXmltv } = await import('/app/src/lib/epg.ts')
    const sortie = { api: [], guide: null }
    const c = new ClientXtream()
    for (const [nom, f] of [
      ['chaines', () => c.chaines()],
      ['films', () => c.films()],
      ['series', () => c.series()],
    ]) {
      const t = performance.now()
      const v = await f()
      sortie.api.push({ nom, ms: Math.round(performance.now() - t), n: v.length,
                        icone0: v[0]?.stream_icon ?? v[0]?.cover })
    }
    const t2 = performance.now()
    const flux = await telechargerXmltv()
    const lec = flux.getReader()
    let octets = 0
    for (;;) { const { done, value } = await lec.read(); if (done) break; octets += value.byteLength }
    sortie.guide = { ms: Math.round(performance.now() - t2), octets }
    return sortie
  })
  console.log(JSON.stringify(r, null, 1))

  const imp = await page.evaluate(async () => {
    const { importerCatalogue } = await import('/app/src/lib/catalogue.ts')
    const t = performance.now()
    const r = await importerCatalogue(() => {})
    const { db } = await import('/app/src/lib/db.ts')
    return { ...r, ms: Math.round(performance.now() - t),
             icones: (await db.catalogue.limit(2).toArray()).map((e) => e.icone) }
  })
  console.log('import complet :', JSON.stringify(imp))
  console.log('reseau :', JSON.stringify([...new Map(reseau.map((x) => [x.u, x])).values()], null, 1))
} finally {
  await nav.close()
}
