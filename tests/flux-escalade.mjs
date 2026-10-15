import { chromium } from 'playwright'
import { execSync } from 'node:child_process'

// Reproduction EXACTE de la panne signalee, puis preuve que l'escalade la
// repare. On remet le navigateur dans l'etat ou il etait : un verdict garde qui
// annonce « aac, lisible en direct » sur une chaine qui, elle, a change
// d'encodage depuis. Le flux reel n'est jamais ouvert — les reponses amont sont
// interceptees — donc cette recette ne consomme AUCUNE connexion du
// fournisseur, et le transcodage impose est observe a la requete.

const PROFIL = '/tmp/claude-0/-root/af0bfe04-324f-47cd-9f6b-faadeffb4ea5/scratchpad/profil-chromium-esc'
const CHAINE = 'TF1 SERIES FHD'
const ID = '9921'

const ffm = () => {
  try {
    return execSync('docker top mytv-flux 2>/dev/null | grep -c ffmpeg', { encoding: 'utf8' }).trim()
  } catch {
    return '0'
  }
}
const rates = []
const ok = (nom, vrai, detail = '') => {
  console.log(`${vrai ? 'OK  ' : 'ECHEC'} ${nom}${detail ? '   ' + detail : ''}`)
  if (!vrai) rates.push(`${nom}${detail ? '   ' + detail : ''}`)
}

const ctx = await chromium.launchPersistentContext(PROFIL, { viewport: { width: 1440, height: 900 } })
try {
  const page = ctx.pages()[0] ?? (await ctx.newPage())
  page.on('pageerror', (e) => console.log('ERREUR PAGE:', e.message))

  const requetes = []
  page.on('request', (r) => {
    const u = r.url()
    if (/\/flux\//.test(u) || /\/live\/.*\.m3u8/.test(u)) requetes.push(u.replace(/^https?:\/\/[^/]+/, ''))
  })

  // Toute source donnee au lecteur est remplacee par des octets que le
  // navigateur ne sait pas decoder : c'est, vu du lecteur, exactement ce que
  // produit une piste EAC3 arrivee a la place d'une piste AAC annoncee.
  const servies = []
  await page.route(/\/(live|flux)\/.*(m3u8|forcer=)/, async (route) => {
    servies.push(route.request().url().replace(/^https?:\/\/[^/]+/, ''))
    await route.fulfill({ status: 200, contentType: 'video/mp4', body: Buffer.from('indecodable') })
  })

  await page.goto('http://localhost:5173/app/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2500)
  const cat = await page.evaluate(async () => (await import('/app/src/lib/db.ts')).db.catalogue.count())
  if (!cat) {
    console.log('Catalogue absent sur ce profil, import en cours…')
    await page.getByRole('button', { name: /Réglages/ }).click()
    await page.getByRole('button', { name: 'Importer le catalogue' }).click()
    await page.waitForFunction(() => /entrées importées/.test(document.body.innerText), null, { timeout: 240000 })
  }

  // --- L'etat exact du navigateur de l'utilisateur -------------------------
  await page.evaluate((id) => {
    localStorage.setItem(
      'mytv.flux.sondes',
      JSON.stringify({
        [`live:${id}`]: {
          horodatage: Date.now(),
          sonde: {
            conteneur: 'hls', video: 'h264', audio: 'aac',
            strategie: 'redirection', lisibleDirect: true,
            hauteur: 1080, dureeSecondes: 0,
            pourquoi: 'h264+aac deja en HLS, playlist reecrite sans transcodage',
            coutCpu: '0 % CPU (aucun ffmpeg)', depuisCache: true,
          },
        },
      }),
    )
  }, ID)
  console.log(`Verdict périmé semé : live:${ID} annoncé « aac / redirection / lisible en direct ».`)
  console.log(`ffmpeg avant ouverture : ${ffm()}`)

  await page.goto('http://localhost:5173/app/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  await page.locator('input[aria-label="Recherche universelle"]').fill(CHAINE)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(3000)
  await page.locator(`[title="${CHAINE}"]`).first().click({ position: { x: 20, y: 20 } })

  // L'escalade monte d'un cran par echec : on observe les deux crans.
  const attendre = async (motif, secondes) => {
    for (let i = 0; i < secondes * 2; i += 1) {
      const t = requetes.find((r) => r.includes(motif))
      if (t) return t
      await page.waitForTimeout(500)
    }
    return null
  }

  const cran0 = await attendre(`/live/`, 20)
  console.log('\n--- Sur le verdict périmé, l’interface lit en direct ---')
  console.log('   requêtes :', JSON.stringify(requetes.slice(0, 4)))
  ok('aucune sonde redépensée : le verdict gardé a servi',
    requetes.filter((r) => r.includes('/flux/sonde/')).length === 0,
    JSON.stringify(requetes.filter((r) => r.includes('/flux/sonde/'))))
  ok('le flux demandé est bien celui de TuliProx', !!cran0 && !cran0.includes('/flux/'), cran0 ?? '(aucun)')

  console.log('\n--- Cran 1 : l’échec de décodage impose le réencodage AUDIO ---')
  const cran1 = await attendre('forcer=audio', 25)
  console.log('   requête servie :', cran1 ?? '(aucune)')
  ok("l'échec de décodage impose un transcodage audio au service",
    cran1 === `/flux/live/${ID}.m3u8?forcer=audio`, cran1 ?? '(aucune escalade)')
  ok('aucune sonde redépensée par l’escalade',
    requetes.filter((r) => r.includes('/flux/sonde/')).length === 0)

  console.log('\n--- Cran 2 : toujours illisible → la vidéo, mais pas sans accord ---')
  // L'avertissement de cout est le comportement attendu : 78 a 106 % d'un coeur
  // ne se declenchent pas dans le dos de l'utilisateur.
  await page.waitForSelector('[data-role="cout-flux"]', { timeout: 25000 }).catch(() => null)
  const vu2 = await page.evaluate(() => ({
    avert: document.querySelector('[data-role="cout-flux"]')?.innerText?.trim() ?? null,
    msgs: [...document.body.innerText.matchAll(/[^\n]*(réencodé|réencodée)[^\n]*/g)].map((m) => m[0]),
    tech: document.body.innerText.match(/[^\n]*(audio AAC|réencodage H\.264|remux|direct)[^\n]*/)?.[0] ?? null,
  }))
  console.log('   avertissement :', (vu2.avert ?? '(aucun)').replace(/\n/g, ' / '))
  console.log('   annonce       :', JSON.stringify(vu2.msgs))
  console.log('   ligne tech    :', vu2.tech)
  const avantAccord = requetes.filter((r) => r.includes('forcer=video')).length
  ok('le réencodage vidéo ne part PAS sans accord', avantAccord === 0, String(avantAccord))
  ok("l'escalade s'annonce, jamais muette", vu2.msgs.length > 0, JSON.stringify(vu2.msgs))
  ok('la ligne technique dit ce qui a lieu, pas ce que la sonde croyait',
    /réencodage H\.264/.test(vu2.tech ?? ''), vu2.tech ?? '')
  ok("l'avertissement motive LE forçage, pas le traitement abandonné",
    /réencodée en H\.264/i.test(vu2.avert ?? ''), (vu2.avert ?? '').slice(0, 80))
  ok("le coût annoncé est celui du réencodage, pas « 0 % CPU »",
    /78 à 106/.test(vu2.avert ?? '') && !/0 % CPU/.test(vu2.avert ?? ''),
    (vu2.avert ?? '').match(/Coût mesuré[^\n]*/)?.[0] ?? '(aucun)')

  console.log('\n--- Accord donné : le réencodage vidéo part alors, et une seule fois ---')
  await page.getByRole('button', { name: /Réencoder quand même/ }).click()
  const cran2 = await attendre('forcer=video', 20)
  console.log('   requête servie :', cran2 ?? '(aucune)')
  ok("l'accord lance le réencodage vidéo",
    cran2 === `/flux/live/${ID}.m3u8?forcer=video`, cran2 ?? '(aucune)')

  console.log('\n--- L’échelle ne boucle pas : l’échec devient franc en haut ---')
  const avant = requetes.length
  await page.waitForTimeout(8000)
  const erreur = await page.evaluate(() => document.body.innerText.match(/[^\n]*(ne décode pas|non pris en charge|Réessayer|Diffuser)[^\n]*/)?.[0] ?? null)
  console.log('   requêtes supplémentaires :', requetes.length - avant, '| écran :', erreur)
  ok("l'escalade s'arrête en haut de l'échelle au lieu de boucler",
    requetes.length - avant <= 1, String(requetes.length - avant))
  ok('le dernier échec est nommé, avec une sortie proposée', !!erreur, erreur ?? '(aucun message)')

  console.log('\n   sources servies :', JSON.stringify(servies))
  console.log('   ffmpeg côté service :', ffm(), '(aucun flux réel n’a été ouvert)')
  ok('aucune connexion du fournisseur consommée par cette recette', ffm() === '0', `(${ffm()})`)
} finally {
  await ctx.close()
}

if (rates.length === 0) console.log('\n=== TOUT VERT ===')
else {
  console.log(`\n=== ${rates.length} ECHEC(S) ===`)
  for (const r of rates) console.log('  -', r)
}
process.exit(rates.length === 0 ? 0 : 1)
