import { chromium } from 'playwright'

// Recette du relais authentifie : l'API Xtream, le guide et les images passent
// par le service, et le mot de passe du relais ne doit plus apparaitre nulle
// part — ni dans une URL, ni dans le localStorage, ni dans IndexedDB.
//
// AUCUN FLUX N'EST OUVERT : l'abonnement n'en autorise qu'un et l'utilisateur
// regarde peut-etre la television. Les routes de lecture sont coupees net.
//
//   MYTV_ID=<id> MYTV_MDP=<mdp> MYTV_RELAIS_MDP=<mdp du relais> \
//     node tests/relais-recette.mjs

const MDP_RELAIS = process.env.MYTV_RELAIS_MDP
if (!MDP_RELAIS) throw new Error('MYTV_RELAIS_MDP attendu : la recette cherche sa trace partout')
const DIR = '/tmp/claude-0/-root/af0bfe04-324f-47cd-9f6b-faadeffb4ea5/scratchpad/profil-recette'

const resultats = []
const verifier = (nom, ok, detail = '') => {
  resultats.push({ nom, ok, detail })
  console.log(`${ok ? 'OK  ' : 'ECHEC'} ${nom}${detail ? ' — ' + detail : ''}`)
}

const nav = await chromium.launchPersistentContext(DIR, { viewport: { width: 1280, height: 900 } })
const page = nav.pages()[0] ?? (await nav.newPage())
// CONTRAINTE ABSOLUE : aucun flux ne doit s'ouvrir. On ancre les motifs sur la
// RACINE du chemin au lieu du glob habituel : `**/live/**` coupait aussi
// /flux/relais/resource/live/<id>/logo, qui n'est qu'un logo de 7 ko.
for (const motif of [
  /^https?:\/\/[^/]+\/(live|movie|series)\//,
  /^https?:\/\/[^/]+\/flux\/(live|movie|series|seg|hls)\//,
])
  await page.route(motif, (r) => r.abort())

// Toute requete partante est inspectee : c'est la seule preuve qui vaille.
const fuites = []
page.on('request', (r) => {
  const u = r.url()
  if (u.includes(MDP_RELAIS)) fuites.push(u.replace(/^https?:\/\/[^/]+/, '').slice(0, 110))
})

// Residu d'une version precedente, tel qu'il dort dans le localStorage des
// machines deja utilisees : la recette verifie qu'il disparait au chargement.
await page.addInitScript(
  ([mdp]) => {
    localStorage.setItem(
      'mytv.config',
      JSON.stringify({ base: '', username: 'local_user', password: mdp, theme: 'dark' }),
    )
  },
  [MDP_RELAIS],
)

try {
  await page.goto('http://localhost:5173/app/', { waitUntil: 'domcontentloaded', timeout: 60000 })

  // --- 1. Les routes relayees refusent une requete sans session ------------
  const sansSession = await page.evaluate(async () => {
    const codes = {}
    for (const [nom, u] of [
      ['api', '/flux/relais/player_api.php?action=get_live_categories'],
      ['guide', '/flux/relais/xmltv.php'],
      ['image', '/flux/relais/resource/live/1/logo'],
    ])
      codes[nom] = (await fetch(u, { credentials: 'omit' })).status
    return codes
  })
  verifier('sans session : 401 sur les trois routes',
    Object.values(sansSession).every((c) => c === 401), JSON.stringify(sansSession))

  // --- 2. Connexion --------------------------------------------------------
  if (await page.locator('button[type=submit]').count()) {
    await page.locator('label:has-text("Identifiant") input').fill(process.env.MYTV_ID)
    await page.locator('label:has-text("Mot de passe") input').fill(process.env.MYTV_MDP)
    await page.locator('button[type=submit]').click()
  }
  await page.waitForSelector('.coque', { timeout: 40000 })

  // --- 3. Purge du localStorage -------------------------------------------
  const stock = await page.evaluate(() => {
    const o = {}
    for (let i = 0; i < localStorage.length; i++) o[localStorage.key(i)] = localStorage.getItem(localStorage.key(i))
    return o
  })
  verifier('localStorage purge des identifiants du relais',
    !JSON.stringify(stock).includes(MDP_RELAIS), Object.keys(stock).join(', '))

  // --- 4. Un catalogue « sale », tel que les imports precedents l'ont laisse
  await page.evaluate(async ([mdp]) => {
    const { db } = await import('/app/src/lib/db.ts')
    await db.reglages.delete('purge.urlsRelais')
    await db.catalogue.bulkPut([
      { cle: 'live:999001', type: 'live', id: 999001, nom: 'Sale 1', recherche: 'sale 1',
        icone: `https://mytv.msocasa.com:443/resource/live/local_user/${mdp}/999001/logo` },
      { cle: 'series:999002', type: 'series', id: 999002, nom: 'Sale 2', recherche: 'sale 2',
        icone: `https://mytv.msocasa.com:443/resource/series/local_user/${mdp}/999002/cover` },
    ])
    const { purgerUrlsRelais } = await import('/app/src/lib/db.ts')
    await purgerUrlsRelais()
  }, [MDP_RELAIS])
  const apresPurge = await page.evaluate(async () => {
    const { db } = await import('/app/src/lib/db.ts')
    return (await db.catalogue.bulkGet(['live:999001', 'series:999002'])).map((e) => e?.icone)
  })
  verifier('IndexedDB : URL d\'images purgees',
    apresPurge.every((u) => u?.startsWith('/flux/relais/resource/')), JSON.stringify(apresPurge))

  // --- 5. Import complet du catalogue, par le vrai chemin ------------------
  const imp = await page.evaluate(async () => {
    const { importerCatalogue } = await import('/app/src/lib/catalogue.ts')
    const t = performance.now()
    const r = await importerCatalogue(() => {})
    const { db } = await import('/app/src/lib/db.ts')
    const sales = await db.catalogue.filter((e) => !!e.icone && e.icone.startsWith('http')).count()
    return { ...r, ms: Math.round(performance.now() - t), sales,
             exemple: (await db.catalogue.get('live:1'))?.icone }
  })
  verifier('import du catalogue (worker, cookie de session joint)',
    imp.entrees > 150000 && imp.categories > 500, `${imp.entrees} entrees, ${imp.ms} ms`)
  verifier('aucune URL d\'image absolue dans le catalogue importe',
    imp.sales === 0, `${imp.sales} restantes, ex. ${imp.exemple}`)

  // --- 6. Les images se chargent par la route relayee ---------------------
  const img = await page.evaluate(async () => {
    const r = await fetch('/flux/relais/resource/live/1/logo', { credentials: 'same-origin' })
    return { code: r.status, type: r.headers.get('content-type'),
             cache: r.headers.get('cache-control'), octets: (await r.blob()).size }
  })
  verifier('image relayee', img.code === 200 && (img.type ?? '').startsWith('image/') && img.octets > 0,
    JSON.stringify(img))

  // --- 7. Guide : le worker XMLTV, par l'ecran -----------------------------
  await page.evaluate(async () => {
    const { dbEpg } = await import('/app/src/lib/epg.ts')
    await dbEpg.meta.clear()
  })
  await page.locator('button.rail-item', { has: page.locator('.rail-libelle', { hasText: /^Guide$/ }) }).first().click()
  // Trois libelles possibles selon l'etat de la base : le bouton est le meme.
  const bouton = page
    .locator('button')
    .filter({ hasText: /(Charger|Recharger) le guide|Reprendre le chargement/ })
    .first()
  await bouton.waitFor({ timeout: 30000 })
  await bouton.click()
  const t0 = Date.now()
  let guide = { complet: false }
  while (!guide.complet && Date.now() - t0 < 240000) {
    await page.waitForTimeout(2000)
    guide = await page.evaluate(async () => {
      const { etatGuide } = await import('/app/src/lib/epg.ts')
      return etatGuide()
    })
  }
  guide.ms = Date.now() - t0
  verifier('guide charge par le worker', guide.complet && guide.programmes > 150000 && guide.chaines > 2000,
    `${guide.programmes} programmes, ${guide.chaines} chaines, ${guide.ms} ms`)

  // --- 8. Non-regression : recherche, favoris, EPG d'une chaine ------------
  const reste = await page.evaluate(async () => {
    const { db } = await import('/app/src/lib/db.ts')
    const { demarrerIndex, chercherPage } = await import('/app/src/lib/recherche-client.ts')
    const { ClientXtream } = await import('/app/src/lib/xtream.ts')
    const { epgChaine } = await import('/app/src/lib/epg.ts')
    const avecEpg = await db.catalogue.where('type').equals('live').limit(1).toArray()
    const grille = await epgChaine(new ClientXtream(), avecEpg[0].id, 6).catch((e) => String(e))
    return {
      catalogue: await db.catalogue.count(),
      categories: await db.categories.count(),
      favoris: await db.favoris.count(),
      reprises: await db.reprises.count(),
      epgAppelable: Array.isArray(grille),
      indexe: await demarrerIndex(),
      trouves: (await chercherPage('matrix', null, 'pertinence', { live: 5, vod: 5, series: 5 })).totaux,
    }
  })
  verifier('catalogue et categories intacts', reste.catalogue > 150000 && reste.categories > 500,
    JSON.stringify(reste))
  verifier('get_short_epg relaye repond', reste.epgAppelable)
  const totalRech = Object.values(reste.trouves ?? {}).reduce((a, b) => a + b, 0)
  verifier('recherche operationnelle', reste.indexe > 150000 && totalRech > 0,
    `${reste.indexe} indexees, ${totalRech} resultats pour « matrix » ${JSON.stringify(reste.trouves)}`)
  verifier('etat personnel intact (favoris / reprises)', reste.favoris >= 21 && reste.reprises >= 7,
    `${reste.favoris} favoris, ${reste.reprises} reprises`)

  // --- 9. Aucune fuite sur le fil ----------------------------------------
  verifier('aucune requete ne porte le mot de passe du relais', fuites.length === 0,
    fuites.slice(0, 5).join(' | '))
} finally {
  await nav.close()
}

const echecs = resultats.filter((r) => !r.ok)
console.log(`\n${resultats.length - echecs.length}/${resultats.length} verifications passees`)
if (echecs.length) process.exitCode = 1
