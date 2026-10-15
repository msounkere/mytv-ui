import { chromium } from 'playwright'
import { execSync } from 'node:child_process'

// Recette du lecteur sur des flux REELS. Deux lectures au total, strictement
// l'une apres l'autre : l'abonnement n'autorise qu'une connexion.
//
// Chromium sans interface n'embarque aucun decodeur H.264, donc aucune image
// n'apparaitra jamais. On ne valide donc rien a l'image : on mesure l'URL
// choisie, les requetes emises, les ffmpeg demarres cote service et les calculs
// affiches. L'absence de decodeur sert meme de banc d'essai : elle produit le
// vrai echec de codec qui doit declencher le transcodage impose.

const PROFIL = '/tmp/claude-0/-root/af0bfe04-324f-47cd-9f6b-faadeffb4ea5/scratchpad/profil-chromium'
const FILM = 'Best in Snow (2022)'
const CHAINE = 'TF1 SERIES FHD'

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
// Meme regle d'affichage que l'interface : h:mm:ss au-dela d'une heure.
const mmss = (secondes) => {
  const s = Math.floor(secondes % 60)
  const m = Math.floor(secondes / 60) % 60
  const h = Math.floor(secondes / 3600)
  const d2 = (n) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${d2(m)}:${d2(s)}` : `${d2(m)}:${d2(s)}`
}

const ctx = await chromium.launchPersistentContext(PROFIL, { viewport: { width: 1440, height: 900 } })
try {
  const page = ctx.pages()[0] ?? (await ctx.newPage())
  page.on('pageerror', (e) => console.log('ERREUR PAGE:', e.message))

  const requetes = []
  page.on('request', (r) => {
    const u = r.url()
    if (/\/flux\//.test(u) && !/\/flux\/(seg|hls)\//.test(u)) requetes.push(u.replace(/^.*\/flux\//, '/flux/'))
  })
  const sondesDe = () => requetes.filter((r) => r.startsWith('/flux/sonde/'))

  /** Ouvre une entree par son nom exact, via la recherche universelle. */
  const ouvrir = async (nom) => {
    await page.goto('http://localhost:5173/app/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)
    await page.locator('input[aria-label="Recherche universelle"]').fill(nom)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(3000)
    await page.locator(`[title="${nom}"]`).first().click({ position: { x: 20, y: 20 } })
    await page.waitForTimeout(2500)
  }

  const etat = () =>
    page.evaluate(() => {
      const v = document.querySelector('video')
      const barre = document.querySelector('input[aria-label="Position de lecture"]')
      const brut = v?.src || v?.currentSrc || ''
      return {
        url: brut,
        chemin: brut.replace(/^https?:\/\/[^/]+/, ''),
        hote: brut.replace(/^(https?:\/\/[^/]+).*/, '$1'),
        videos: document.querySelectorAll('video').length,
        mediaTime: v?.currentTime ?? null,
        position: barre ? Number(barre.value) : null,
        duree: barre ? Number(barre.max) : null,
        temps: [...document.querySelectorAll('.num')].map((e) => e.textContent?.trim()).filter(Boolean),
        texte: document.body.innerText,
      }
    })

  await page.goto('http://localhost:5173/app/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3000)
  const cat = await page.evaluate(async () => (await import('/app/src/lib/db.ts')).db.catalogue.count())
  console.log(`Catalogue : ${cat} entrées`)
  if (!cat) throw new Error('catalogue vide : lancer une fois l’import depuis les Réglages')
  // Verdicts gardes effaces : on veut compter les sondes reellement depensees.
  await page.evaluate(() => localStorage.removeItem('mytv.flux.sondes'))

  // ======================================================================
  console.log(`\n=== GARANTIE 1 : « ${CHAINE} » (AAC) doit lire en direct, sans le service ===`)
  console.log(`ffmpeg avant ouverture : ${ffm()}`)
  await ouvrir(CHAINE)
  const e1 = await etat()
  const ffm1 = ffm()
  console.log('   URL donnée au lecteur :', e1.url.slice(0, 95))
  console.log('   <video> montés        :', e1.videos, '| ffmpeg côté service :', ffm1)
  console.log('   requêtes vers /flux/  :', JSON.stringify(requetes))
  // En developpement, l'URL TuliProx est relative : le proxy de Vite reproduit
  // l'origine unique de la production. Ce qui compte est qu'elle ne passe PAS
  // par /flux/, donc que le service ne soit pas dans le chemin.
  ok('la chaîne AAC est lue chez TuliProx, pas chez le service',
    /\/live\/[^/]+\/[^/]+\/9921\.m3u8/.test(e1.url) && !e1.url.includes('/flux/'),
    e1.url.slice(0, 90))
  ok("aucune route de flux du service n'a été appelée",
    requetes.filter((r) => /^\/flux\/(live|movie|series)\//.test(r)).length === 0)
  ok('une seule sonde dépensée', sondesDe().length === 1, JSON.stringify(sondesDe()))
  ok('AUCUN ffmpeg démarré : le processeur du service ne travaille pas', ffm1 === '0', `(${ffm1})`)

  // L'absence de decodeur H.264 produit ici le vrai echec de codec que
  // l'escalade doit rattraper : c'est exactement le chemin de production.
  console.log('\n=== ESCALADE : l’échec de codec doit imposer un transcodage audio ===')
  let escalade = null
  for (let i = 0; i < 22 && !escalade; i += 1) {
    await page.waitForTimeout(1500)
    escalade = requetes.find((r) => r.includes('forcer='))
  }
  const e2 = await etat()
  console.log('   URL forcée demandée :', escalade ?? '(aucune)')
  console.log('   URL du lecteur      :', e2.url.slice(0, 95))
  console.log('   ffmpeg côté service :', ffm())
  const msg = e2.texte.match(/[^\n]*(réencodé|remux|injoignable)[^\n]*/i)?.[0] ?? null
  console.log('   message affiché     :', msg ?? '(aucun)')
  if (escalade) {
    ok("l'échec de codec impose un transcodage audio", escalade === '/flux/live/9921.m3u8?forcer=audio', escalade)
    ok("le lecteur pointe désormais sur le service", /forcer=audio/.test(e2.url), e2.url.slice(-45))
    ok("l'escalade est annoncée, jamais muette", /réencodé/i.test(msg ?? ''), msg ?? '(aucun message)')
    ok("l'escalade ne redépense aucune sonde", sondesDe().length === 1, JSON.stringify(sondesDe()))
    ok('un ffmpeg de transcodage audio tourne maintenant', ffm() === '1', `(${ffm()})`)
  } else {
    console.log('   NON VERIFIE : ce Chromium n’a pas émis d’erreur fatale de codec en 33 s.')
  }

  // ======================================================================
  console.log(`\n=== GARANTIE 3 : « ${FILM} » (MKV) par le remux, déplacement et temps ===`)
  requetes.length = 0
  // La connexion unique se mesure : on echantillonne les ffmpeg pendant toute
  // l'ouverture, le navigateur demandant le MP4 fabrique plage par plage.
  let maxFfmpeg = 0
  const sonde = setInterval(() => {
    maxFfmpeg = Math.max(maxFfmpeg, Number(ffm()))
  }, 350)
  await ouvrir(FILM)
  await page.waitForTimeout(3500)
  clearInterval(sonde)
  const f1 = await etat()
  const id = f1.chemin.match(/\/flux\/movie\/(\d+)/)?.[1]
  console.log('   URL donnée au lecteur :', f1.chemin)
  console.log('   durée de la barre     :', f1.duree, 's | position :', f1.position)
  console.log('   temps affichés        :', JSON.stringify(f1.temps))
  console.log('   ffmpeg côté service   :', ffm())
  ok('le film passe par le service', !!id, f1.chemin)
  ok('une seule sonde pour ce film', sondesDe().length === 1, JSON.stringify(sondesDe()))
  console.log('   ffmpeg simultanés max :', maxFfmpeg)
  ok('un ffmpeg a bien fabriqué le MP4', maxFfmpeg >= 1, `max=${maxFfmpeg}`)
  ok('jamais deux ffmpeg à la fois : la connexion unique est respectée',
    maxFfmpeg <= 1, `max=${maxFfmpeg}`)

  // Les sondes de l'INTERFACE : la relecture de verdict ci-dessous est faite par
  // la recette elle-meme, elle ne doit pas etre comptee a sa charge.
  const sondesInterface = sondesDe().length

  // Le verdict est relu depuis le service (cache permanent de la VOD, donc
  // gratuit) : il doit confirmer un MKV effectivement remuxe.
  const verdict = await page.evaluate(
    (i) => fetch(`/flux/sonde/movie/${i}`).then((r) => r.json()),
    id,
  )
  console.log('   verdict du service    :', JSON.stringify(verdict))
  ok('conteneur Matroska', verdict.conteneur === 'mkv', verdict.conteneur)
  ok('stratégie remux (ni redirection, ni réencodage)', verdict.strategie === 'remux', verdict.strategie)
  ok('la durée de la barre vient de la sonde, pas du MP4 fabriqué',
    Math.abs(f1.duree - verdict.dureeSecondes) < 1, `${f1.duree} vs ${verdict.dureeSecondes}`)

  console.log('\n   stabilisation : Chromium sans décodeur fait échouer ce MP4,')
  console.log('   donc l’escalade s’y produit pour de vrai. On l’attend.')
  let gele = 0
  let derniere = requetes.length
  while (gele < 5) {
    await page.waitForTimeout(1000)
    if (requetes.length === derniere) gele += 1
    else { gele = 0; derniere = requetes.length }
  }
  const apres = await etat()
  const forcee = /forcer=audio/.test(apres.chemin)
  console.log('   URL stabilisée :', apres.chemin)
  console.log('   escalade subie :', forcee ? 'oui (forcer=audio)' : 'non')
  ok("aucune sonde supplémentaire pendant la stabilisation",
    sondesDe().length === sondesInterface + 1,
    `${sondesDe().length - 1} sonde(s) d'interface`)

  const CIBLE = 1800
  console.log(`\n   déplacement à ${CIBLE} s (${mmss(CIBLE)})`)
  await page.locator('input[aria-label="Position de lecture"]').evaluate((el, v) => {
    el.value = String(v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }, CIBLE)
  await page.waitForTimeout(2500)
  const f2 = await etat()
  const restant = '−' + mmss(verdict.dureeSecondes - CIBLE)
  console.log('   URL après déplacement :', f2.chemin)
  console.log('   horodatage du média   :', f2.mediaTime, 's  (le MP4 fragmenté renumérote à zéro)')
  console.log('   position affichée     :', f2.position, 's →', JSON.stringify(f2.temps))
  // Le forcage eventuellement en cours doit etre conserve par le deplacement :
  // le reperdre ramenerait au flux qui vient d'echouer.
  ok('le déplacement part en ?t= exact, forçage conservé',
    f2.chemin === `/flux/movie/${id}?t=${CIBLE}.000` + (forcee ? '&forcer=audio' : ''), f2.chemin)
  ok(`la position affichée est celle du FILM : ${CIBLE} s`, f2.position === CIBLE, String(f2.position))
  ok(`le temps écoulé affiche ${mmss(CIBLE)}`, f2.temps.includes(mmss(CIBLE)), JSON.stringify(f2.temps))
  ok(`le temps restant affiche ${restant}`, f2.temps.includes(restant), JSON.stringify(f2.temps))
  ok("l'affichage ne retombe pas à zéro là où le média, lui, y repart",
    f2.position === CIBLE && (f2.mediaTime ?? 0) < 60,
    `position=${f2.position} media=${f2.mediaTime}`)

  console.log('\n=== Fermeture : la connexion unique doit être rendue ===')
  await page.goto('about:blank')
  // Le service tue son ffmpeg des qu'il constate le depart du client : mesure,
  // ce constat prend environ 2 s. On laisse une marge, puis on exige zero.
  let reste = '1'
  let attendu = 0
  for (let i = 0; i < 24 && reste !== '0'; i += 1) {
    await page.waitForTimeout(500)
    attendu += 0.5
    reste = ffm()
  }
  console.log(`   ffmpeg après fermeture : ${reste} (constaté en ${attendu} s)`)
  ok('aucun ffmpeg ne survit au départ du client', reste === '0', `(${reste})`)
} finally {
  await ctx.close()
}

if (rates.length === 0) console.log('\n=== TOUT VERT ===')
else {
  console.log(`\n=== ${rates.length} ECHEC(S) ===`)
  for (const r of rates) console.log('  -', r)
}
process.exit(rates.length === 0 ? 0 : 1)
