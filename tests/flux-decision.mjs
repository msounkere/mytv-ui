import { chromium } from 'playwright'

// Recette de la DECISION de flux : quelle URL l'interface donne au lecteur, et
// combien de sondes elle depense pour la trouver. Aucune lecture n'est ouverte
// ici — l'abonnement n'autorise qu'une connexion, et la decision se verifie
// sans consommer de flux : on n'exerce que `planifier`, le service et le cache.

const nav = await chromium.launch()
const rates = []
const ok = (nom, vrai, detail = '') => {
  console.log(`${vrai ? 'OK  ' : 'ECHEC'} ${nom}${detail ? '   ' + detail : ''}`)
  if (!vrai) rates.push(`${nom}${detail ? '   ' + detail : ''}`)
}

try {
  const page = await nav.newPage({ viewport: { width: 1280, height: 800 } })
  page.on('pageerror', (e) => console.log('ERREUR PAGE:', e.message))

  // Toute requete de sonde est comptee : c'est l'unite de depense du fournisseur.
  const sondes = []
  page.on('request', (r) => {
    if (r.url().includes('/flux/sonde/')) sondes.push(r.url().replace(/^.*\/flux\//, '/flux/'))
  })

  await page.goto('http://localhost:5173/app/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2500)
  await page.evaluate(() => {
    window.F = null
  })
  await page.evaluate(async () => {
    window.F = await import('/app/src/lib/flux.ts')
    localStorage.removeItem('mytv.flux.sondes')
  })

  console.log('\n--- 1. Fabrication des URL (pur calcul, aucune requete) ---')
  const urls = await page.evaluate(() => {
    const { urlFlux } = window.F
    return {
      live: urlFlux({ genre: 'live', id: '9653' }),
      liveForce: urlFlux({ genre: 'live', id: '9653' }, 0, 'audio'),
      liveDecalageIgnore: urlFlux({ genre: 'live', id: '9653' }, 900),
      film: urlFlux({ genre: 'movie', id: '147958' }),
      filmT: urlFlux({ genre: 'movie', id: '147958' }, 1800),
      filmTForce: urlFlux({ genre: 'movie', id: '147958' }, 1800, 'audio'),
      filmPetitT: urlFlux({ genre: 'movie', id: '147958' }, 0.2),
      episode: urlFlux({ genre: 'series', id: '154061' }, 42.5, 'video'),
    }
  })
  for (const [k, v] of Object.entries(urls)) console.log(`   ${k.padEnd(20)} ${v}`)
  ok('direct inchange', urls.live === '/flux/live/9653.m3u8')
  ok('forcage porte sur l URL du direct', urls.liveForce === '/flux/live/9653.m3u8?forcer=audio')
  ok('le direct ignore un decalage', urls.liveDecalageIgnore === '/flux/live/9653.m3u8')
  ok('film sans parametre inutile', urls.film === '/flux/movie/147958')
  ok('deplacement exact', urls.filmT === '/flux/movie/147958?t=1800.000')
  ok('deplacement + forcage', urls.filmTForce === '/flux/movie/147958?t=1800.000&forcer=audio')
  ok('un demi-pouce de decalage ne vaut pas une reouverture', urls.filmPetitT === '/flux/movie/147958')
  ok('episode', urls.episode === '/flux/series/154061?t=42.500&forcer=video')

  console.log('\n--- 2. GARANTIE 1 : une chaine AAC lit en direct depuis TuliProx ---')
  const g1 = await page.evaluate(async () => {
    const p = await window.F.planifier({
      reference: { genre: 'live', id: '9921' },
      urlDirecte: 'http://192.168.50.9:8901/live/u/p/9921.m3u8',
    })
    return { ...p, effective: window.F.strategieEffective(p) }
  })
  console.log('   sonde    :', JSON.stringify(g1.sonde))
  console.log('   url      :', g1.url)
  console.log('   viaService:', g1.viaService, '| repli:', g1.repli ?? '(aucun)')
  ok('audio aac', g1.sonde?.audio === 'aac')
  ok('lisible en direct', g1.sonde?.lisibleDirect === true)
  ok("l URL est celle de TuliProx, le service n'est pas dans le chemin",
    g1.viaService === false && g1.url.includes('192.168.50.9'))
  ok('aucun repli a annoncer', g1.repli === undefined)

  console.log('\n--- 3. GARANTIE 2 : une chaine EAC3 bascule seule sur le transcodage audio ---')
  const g2 = await page.evaluate(async () => {
    const p = await window.F.planifier({
      reference: { genre: 'live', id: '10595' },
      urlDirecte: 'http://192.168.50.9:8901/live/u/p/10595.m3u8',
    })
    return { ...p, effective: window.F.strategieEffective(p) }
  })
  console.log('   sonde    :', JSON.stringify(g2.sonde))
  console.log('   url      :', g2.url, '| viaService:', g2.viaService, '| effective:', g2.effective)
  ok('audio eac3 detecte', g2.sonde?.audio === 'eac3')
  ok('pas lisible en direct', g2.sonde?.lisibleDirect === false)
  ok('bascule AUTOMATIQUE sur le service', g2.viaService === true && g2.url === '/flux/live/10595.m3u8')
  ok('strategie annoncee : audio', g2.effective === 'audio')
  ok('aucun accord a demander (2,5 % d un coeur)', (await page.evaluate(() => window.F.coutAVertir(null))) === false)

  console.log('\n--- 4. DEFAUT CONNU 9653 : le forcage repare la ou le repli echouait ---')
  const g4 = await page.evaluate(async () => {
    const r = { genre: 'live', id: '9653' }
    const sans = await window.F.planifier({ reference: r, urlDirecte: 'http://192.168.50.9:8901/live/u/p/9653.m3u8' })
    const avec = await window.F.planifier({ reference: r, urlDirecte: 'http://192.168.50.9:8901/live/u/p/9653.m3u8', forcer: 'audio' })
    return { sans, avec, effAvec: window.F.strategieEffective(avec) }
  })
  console.log('   sonde            :', JSON.stringify(g4.sans.sonde))
  console.log('   sans forcage     :', g4.sans.url, '| viaService:', g4.sans.viaService)
  console.log('   avec forcer=audio:', g4.avec.url, '| viaService:', g4.avec.viaService)
  console.log('   repli annonce    :', g4.avec.repli)
  ok('le forcage impose la sortie au service',
    g4.avec.viaService === true && g4.avec.url === '/flux/live/9653.m3u8?forcer=audio')
  ok('la strategie affichee est celle qui a lieu', g4.effAvec === 'audio')
  ok('le forcage se dit, il n est jamais muet', typeof g4.avec.repli === 'string' && g4.avec.repli.length > 10)

  console.log('\n--- 5. GARANTIE 5 : une sonde par contenu, puis le cache ---')
  const avant = sondes.length
  const g5 = await page.evaluate(async () => {
    const r = { genre: 'movie', id: '147958' }
    const u = 'http://192.168.50.9:8901/movie/u/p/147958'
    // Deux appels simultanes, puis un troisieme apres coup : un seul doit sortir.
    const [a, b] = await Promise.all([
      window.F.planifier({ reference: r, urlDirecte: u }),
      window.F.planifier({ reference: r, urlDirecte: u }),
    ])
    const c = await window.F.planifier({ reference: r, urlDirecte: u, decalage: 1800 })
    return { a, b, c, memorise: !!localStorage.getItem('mytv.flux.sondes') }
  })
  const depensees = sondes.length - avant
  console.log('   sonde      :', JSON.stringify(g5.a.sonde))
  console.log('   requetes de sonde pour 3 planifications :', depensees)
  console.log('   url avec decalage :', g5.c.url)
  ok('une seule sonde pour trois planifications du meme film', depensees === 1, `(${depensees})`)
  ok('film MKV route vers le remux', g5.a.viaService === true && g5.a.url === '/flux/movie/147958')
  ok('duree lue sur la sonde, pas sur le MP4 fabrique', g5.a.sonde?.dureeSecondes > 5000)
  ok('le deplacement part en ?t=', g5.c.url === '/flux/movie/147958?t=1800.000')
  ok('verdict ecrit dans localStorage', g5.memorise === true)

  console.log('\n--- 6. Le cache survit au rechargement de la page ---')
  const avantReload = sondes.length
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  const g6 = await page.evaluate(async () => {
    const F = await import('/app/src/lib/flux.ts')
    const p = await F.planifier({ reference: { genre: 'movie', id: '147958' }, urlDirecte: 'x' })
    return { strategie: p.sonde?.strategie, duree: p.sonde?.dureeSecondes }
  })
  console.log('   verdict relu :', JSON.stringify(g6), '| sondes depuis le rechargement :', sondes.length - avantReload)
  ok('aucune sonde redepensee apres rechargement', sondes.length - avantReload === 0)
  ok('le verdict relu est complet', g6.strategie === 'remux' && g6.duree > 5000)

  console.log('\n--- 7. GARANTIE 4 : service injoignable -> repli franc sur TuliProx ---')
  await page.route('**/flux/sonde/**', (r) => r.abort('connectionrefused'))
  const g7 = await page.evaluate(async () => {
    const F = await import('/app/src/lib/flux.ts')
    const r = { genre: 'movie', id: '115213' }
    const u = 'http://192.168.50.9:8901/movie/u/p/115213'
    const nu = await F.planifier({ reference: r, urlDirecte: u })
    // Insister aupres d'un service muet n'aurait aucun sens : on verifie que le
    // forcage ne nous enferme pas dans une URL que personne ne sert.
    const force = await F.planifier({ reference: r, urlDirecte: u, forcer: 'audio' })
    return { nu, force }
  })
  console.log('   sans forcage :', g7.nu.url, '| viaService:', g7.nu.viaService)
  console.log('   repli        :', g7.nu.repli)
  console.log('   avec forcage :', g7.force.url, '| viaService:', g7.force.viaService)
  console.log('   repli        :', g7.force.repli)
  ok('repli sur TuliProx', g7.nu.viaService === false && g7.nu.url.includes('192.168.50.9'))
  ok('le repli porte un message lisible', /injoignable/.test(g7.nu.repli ?? ''))
  ok('aucun echec muet', typeof g7.nu.repli === 'string' && g7.nu.repli.length > 10)
  ok('un service muet ne se voit rien imposer', g7.force.viaService === false)

  console.log('\n--- Sondes depensees sur toute la recette ---')
  for (const s of sondes) console.log('   ', s)
  console.log(`   total : ${sondes.length}`)
} finally {
  await nav.close()
}

if (rates.length === 0) console.log('\n=== TOUT VERT ===')
else {
  console.log(`\n=== ${rates.length} ECHEC(S) ===`)
  for (const r of rates) console.log('  -', r)
}
process.exit(rates.length === 0 ? 0 : 1)
