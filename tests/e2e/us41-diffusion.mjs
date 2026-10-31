// US-41 : diffuser vers un televiseur par lien signe, contre le faux serveur
// (jamais le vrai serveur ni le fournisseur). La Remote Playback API est
// SIMULEE : `video.remote` factice qui annonce un appareil et se connecte au
// `prompt()` ; un second banc la retire (Firefox) pour le lien a copier.
//   NODE_OPTIONS=--tls-max-v1.2 node tests/e2e/us41-diffusion.mjs
//   NAVIGATEUR=firefox ... rejoue le tout sur Firefox (le faux `remote` y est injecte aussi).
import { construireHarnais, ouvrirBanc, creerVerificateur, jusqua, attendre, chaine, film } from './banc.mjs'

const v = creerVerificateur('US-41 diffusion')
await construireHarnais()

const NAVIGATEUR_ATTENDU = process.env.NAVIGATEUR === 'firefox' ? 'Firefox' : 'Chrome'
const NB_SEGMENTS = 6
const PARAMETRES_ATTENDUS = 'cap=hevc,eac3,ac3'

/** Remote Playback factice : un appareil toujours visible, connecte 150 ms apres `prompt()`, lache au `prompt()` suivant. */
function fauxRemote() {
  window.__cast = { prompts: 0, sources: [], preload: [] }
  const remotes = new WeakMap()
  Object.defineProperty(HTMLMediaElement.prototype, 'remote', {
    configurable: true,
    get() {
      let r = remotes.get(this)
      if (r) return r
      const video = this
      r = new EventTarget()
      r.state = 'disconnected'
      r.watchAvailability = (cb) => { setTimeout(() => cb(true), 20); return Promise.resolve(1) }
      r.cancelWatchAvailability = () => Promise.resolve()
      r.prompt = () => {
        window.__cast.prompts += 1
        if (r.state === 'connected') {
          r.state = 'disconnected'
          r.dispatchEvent(new Event('disconnect'))
          return Promise.resolve()
        }
        // Ce que l'appareil recevra : la source de l'element au moment du choix, et son preload.
        window.__cast.sources.push(video.getAttribute('src'))
        window.__cast.preload.push(video.preload)
        r.state = 'connecting'
        r.dispatchEvent(new Event('connecting'))
        return new Promise((ok) => setTimeout(() => { r.state = 'connected'; r.dispatchEvent(new Event('connect')); ok() }, 150))
      }
      remotes.set(this, r)
      return r
    },
  })
}

/** Navigateur sans Remote Playback ni AirPlay (Firefox), presse-papiers observe. */
function sansRemote() {
  Object.defineProperty(HTMLMediaElement.prototype, 'remote', { configurable: true, get: () => undefined })
  window.__presse = []
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: (t) => { window.__presse.push(t); return Promise.resolve() } },
  })
}

const dialogue = (page) => page.locator('[role="dialog"][aria-label="Diffuser sur un écran"]')
const ouvrirDialogue = async (page) => {
  await page.locator('[tabindex="-1"]').first().focus()
  await page.keyboard.press('c')
  return jusqua(async () => (await dialogue(page).count()) > 0, 3000)
}
const jetonDe = (url) => /\/api\/v1\/cast\/([^/]+)\//.exec(url ?? '')?.[1]

// ============================================================================
// A. Navigateur qui sait diffuser (Remote Playback factice)
// ============================================================================
{
  const banc = await ouvrirBanc({ ecran: 'lecture', scripts: [fauxRemote] })
  const { page } = banc
  try {
    const ouvrir = (e) => page.evaluate((x) => window.harnais.ouvrir(x), e)
    const fermer = () => page.evaluate(() => window.harnais.fermer())
    const liens = () => banc.api((r) => r.chemin === '/api/v1/cast/lien' && r.methode === 'POST')
    const fluxSignes = () => banc.api((r) => r.chemin.startsWith('/api/v1/cast/') && r.chemin !== '/api/v1/cast/lien')
    const fluxLocal = () => banc.api((r) => r.chemin.startsWith('/api/v1/live/') || r.chemin.startsWith('/api/v1/vod/'))
    const segments1001 = () => banc.api((r) => r.chemin.startsWith('/api/v1/live/1001/seg/'))
    const cast = () => page.evaluate(() => window.__cast)
    const evenements = () => banc.serveur.evenements()

    // --- 1. Direct : « Diffuser » demande UN lien signe, aucun flux depuis le navigateur ----
    console.log('A1. direct : lien signe, source posee sans chargement local (CA1, CA2, CA3)')
    await ouvrir(chaine(1001))
    v.ok(await jusqua(() => segments1001().length >= NB_SEGMENTS, 20_000), 'lecture locale en cours (tous les segments de la playlist fermee sont charges : plus rien en vol)')
    await attendre(500)
    banc.serveur.reinit()
    v.ok(await ouvrirDialogue(page), 'C ouvre le panneau « Diffuser sur un écran »')
    v.ok((await dialogue(page).locator('[data-role="diffuser"]').count()) === 1, 'le navigateur sait diffuser : « Choisir un appareil »')
    const tClic = Date.now()
    await dialogue(page).locator('[data-role="diffuser"]').click()
    // CA1 : la demande de lien.
    v.ok(await jusqua(() => liens().length >= 1, 5000), 'POST /api/v1/cast/lien demande')
    const lien1 = liens()[0]
    v.ok(lien1?.corps?.lecture === '/api/v1/live/1001.m3u8', `le lien est demande pour l'adresse de lecture de l'entree (${lien1?.corps?.lecture})`)
    // CA2 : parametres de diffusion = capacites du televiseur, jamais qualite=eco.
    v.ok(lien1?.corps?.parametres === PARAMETRES_ATTENDUS, `parametres de diffusion « ${lien1?.corps?.parametres} » (attendu ${PARAMETRES_ATTENDUS})`)
    v.ok(!/qualite/.test(lien1?.corps?.parametres ?? ''), 'jamais qualite=eco pour le televiseur')
    // CA3 : l'element porte le lien signe, preload=none, et le selecteur natif s'ouvre.
    v.ok(await jusqua(async () => (await cast()).prompts >= 1, 5000), 'le selecteur natif (remote.prompt) est ouvert')
    const c1 = await cast()
    const jeton1 = jetonDe(c1.sources[0])
    v.ok(/^\/api\/v1\/cast\/[^/]+\/live\/1001\.m3u8\?cap=hevc,eac3,ac3$/.test(c1.sources[0] ?? ''), `source de l'element au choix = lien signe (${c1.sources[0]})`)
    v.ok(c1.preload[0] === 'none', `preload="${c1.preload[0]}" pose avant la source signee`)
    v.ok(await jusqua(async () => (await dialogue(page).locator('[data-role="arreter-diffusion"]').count()) > 0, 5000), 'etat « diffusion » : le panneau propose « Arrêter la diffusion »')
    await attendre(2500)
    v.ok(liens().length === 1, `UNE demande de lien (${liens().length})`)
    v.ok(fluxSignes().length === 0, `AUCUNE requete du flux signe depuis le navigateur (${fluxSignes().length})`)
    v.ok(fluxLocal().filter((r) => r.t >= tClic).length === 0, `aucune requete de flux locale depuis « Diffuser » (${fluxLocal().filter((r) => r.t >= tClic).map((r) => r.chemin).join(' ')})`)
    v.ok(banc.api((r) => r.chemin.endsWith('/fin')).length === 0, 'le bail n est PAS rendu : le televiseur reprend la meme place')
    const etatVideo = await page.evaluate(() => { const e = document.querySelector('video'); return { src: e.getAttribute('src'), readyState: e.readyState, paused: e.paused } })
    v.ok(/\/api\/v1\/cast\//.test(etatVideo.src ?? ''), 'l element garde la source signee pendant la diffusion')
    v.ok(etatVideo.readyState === 0, `rien de charge localement (readyState ${etatVideo.readyState})`)
    // CA5 : telemetrie diffusion:debut, sans jeton.
    v.ok(await jusqua(() => evenements().some((e) => e.type === 'diffusion:debut'), 8000, 250), 'telemetrie : diffusion:debut')
    const debut = evenements().find((e) => e.type === 'diffusion:debut')
    v.ok(debut?.ressource === '/api/v1/live/1001.m3u8' && debut?.navigateur === NAVIGATEUR_ATTENDU, `debut : ressource ${debut?.ressource}, navigateur ${debut?.navigateur}`)
    v.ok(!!jeton1 && !evenements().some((e) => JSON.stringify(e).includes(jeton1)), 'le jeton n apparait dans aucun evenement')

    // --- 2. Arret : retour a la lecture locale par l'adresse normale ---------------------------
    console.log('A2. arret de la diffusion : reprise locale (CA5)')
    await dialogue(page).locator('[data-role="arreter-diffusion"]').click()
    v.ok(await jusqua(() => banc.api((r) => r.chemin === '/api/v1/live/1001.m3u8' && r.t > tClic).length >= 1, 8000), 'la playlist est redemandee par l adresse normale')
    v.ok(await jusqua(() => segments1001().some((r) => r.t > tClic), 15_000), 'puis les segments : la lecture locale a repris')
    v.ok(await jusqua(() => evenements().some((e) => e.type === 'diffusion:fin'), 8000, 250), 'telemetrie : diffusion:fin')
    const fin = evenements().find((e) => e.type === 'diffusion:fin')
    v.ok(fin?.ressource === '/api/v1/live/1001.m3u8' && typeof fin?.duree === 'number' && fin.duree >= 0 && fin?.navigateur === NAVIGATEUR_ATTENDU, `fin : ressource ${fin?.ressource}, duree ${fin?.duree} s, navigateur ${fin?.navigateur}`)
    v.ok(!evenements().some((e) => JSON.stringify(e).includes(jeton1)), 'toujours aucun jeton dans la telemetrie')
    v.ok(await jusqua(async () => (await dialogue(page).locator('[data-role="diffuser"]').count()) > 0, 3000), 'le panneau repropose « Choisir un appareil »')
    v.ok(fluxSignes().length === 0, 'le navigateur n a jamais demande le flux signe')

    // --- 3. Film : position conservee a l'arret ---------------------------------------------
    console.log('A3. film : diffusion puis arret, position conservee (CA5)')
    await fermer()
    await attendre(1800)
    banc.serveur.reinit()
    await ouvrir(film(100))
    v.ok(await jusqua(() => banc.api((r) => r.chemin === '/api/v1/vod/iptva:100' && r.methode === 'GET').length >= 1, 10_000), 'film ouvert')
    await page.waitForFunction(() => document.querySelector('video')?.readyState >= 1, null, { timeout: 10_000 }).catch(() => {})
    await page.evaluate(() => { document.querySelector('video').currentTime = 10 })
    v.ok(await jusqua(() => page.evaluate(() => document.querySelector('video').currentTime >= 10), 5000), 'position a 10 s')
    await attendre(300)
    banc.serveur.reinit()
    const tClic3 = Date.now()
    v.ok(await ouvrirDialogue(page), 'panneau ouvert')
    await dialogue(page).locator('[data-role="diffuser"]').click()
    v.ok(await jusqua(() => liens().length >= 1, 5000), 'lien demande pour le film')
    v.ok(liens()[0]?.corps?.lecture === '/api/v1/vod/iptva:100', `pour ${liens()[0]?.corps?.lecture}`)
    v.ok(await jusqua(async () => (await cast()).prompts >= 3, 5000), 'selecteur natif ouvert')
    const c3 = await cast()
    v.ok(/^\/api\/v1\/cast\/[^/]+\/vod\/iptva:100\?cap=hevc,eac3,ac3$/.test(c3.sources[1] ?? ''), `source signee du film (${c3.sources[1]})`)
    v.ok(await jusqua(async () => (await dialogue(page).locator('[data-role="arreter-diffusion"]').count()) > 0, 5000), 'diffusion en cours')
    await attendre(1500)
    v.ok(fluxSignes().length === 0 && fluxLocal().filter((r) => r.t >= tClic3).length === 0, 'aucune requete de flux (signe ou local) depuis « Diffuser »')
    await dialogue(page).locator('[data-role="arreter-diffusion"]').click()
    v.ok(await jusqua(() => banc.api((r) => r.chemin === '/api/v1/vod/iptva:100' && r.methode === 'GET' && r.t > tClic3).length >= 1, 8000), 'le film est rouvert par l adresse normale')
    v.ok(await jusqua(() => page.evaluate(() => document.querySelector('video').currentTime >= 7.5), 10_000), `reprise au point atteint (${await page.evaluate(() => document.querySelector('video').currentTime.toFixed(1))} s, marge de reprise 2 s)`)

    v.ok(banc.externes.length === 0, `aucune requete hors 127.0.0.1 (${banc.externes.length})`)
    v.info(`erreurs de page : ${banc.erreursPage.length}`)
  } finally {
    await banc.fermer()
  }
}

// ============================================================================
// B. Navigateur sans Remote Playback (Firefox) : le lien se copie (CA4)
// ============================================================================
{
  const banc = await ouvrirBanc({ ecran: 'lecture', scripts: [sansRemote] })
  const { page } = banc
  try {
    const ouvrir = (e) => page.evaluate((x) => window.harnais.ouvrir(x), e)
    const liens = () => banc.api((r) => r.chemin === '/api/v1/cast/lien' && r.methode === 'POST')
    const fluxSignes = () => banc.api((r) => r.chemin.startsWith('/api/v1/cast/') && r.chemin !== '/api/v1/cast/lien')
    const evenements = () => banc.serveur.evenements()

    console.log('B1. sans Remote Playback : bouton visible, explication, lien copie (CA4)')
    await ouvrir(chaine(1001))
    v.ok(await jusqua(() => banc.api((r) => r.chemin.startsWith('/api/v1/live/1001/seg/')).length >= 1, 15_000), 'lecture locale en cours')
    banc.serveur.reinit()
    const bouton = page.getByRole('button', { name: 'Diffuser vers un téléviseur' })
    v.ok((await bouton.count()) === 1 && !(await bouton.first().isDisabled()), 'le bouton « Diffuser vers un téléviseur » reste visible et actif')
    v.ok(await ouvrirDialogue(page), 'panneau ouvert')
    v.ok(/Diffusion disponible dans Chrome, Edge ou Safari/.test(await dialogue(page).innerText()), 'le panneau explique « Diffusion disponible dans Chrome, Edge ou Safari »')
    v.ok((await dialogue(page).locator('[data-role="diffuser"]').count()) === 0, 'pas de « Choisir un appareil » sans selecteur natif')
    await dialogue(page).locator('[data-role="copier-lien"]').click()
    v.ok(await jusqua(() => liens().length >= 1, 5000), 'POST /api/v1/cast/lien demande')
    v.ok(liens()[0]?.corps?.parametres === PARAMETRES_ATTENDUS, `parametres ${liens()[0]?.corps?.parametres}`)
    v.ok(await jusqua(() => page.evaluate(() => window.__presse.length >= 1), 5000), 'le lien est copie dans le presse-papiers')
    const copie = await page.evaluate(() => window.__presse[0])
    const jeton = jetonDe(copie)
    v.ok(copie?.startsWith(`${banc.serveur.origine}/api/v1/cast/`) && /\/live\/1001\.m3u8\?cap=hevc,eac3,ac3$/.test(copie), `lien absolu, signe, pour le televiseur (${copie})`)
    v.ok(await jusqua(async () => /Lien copié/.test(await dialogue(page).locator('[data-role="lien-etat"]').innerText().catch(() => '')), 3000), 'le panneau confirme « Lien copié — valable jusqu’à … »')
    v.ok(/valable jusqu’à/.test(await dialogue(page).locator('[data-role="lien-etat"]').innerText()), 'avec l heure d expiration')
    await attendre(1500)
    v.ok(fluxSignes().length === 0, 'le navigateur ne demande pas le flux signe (il est pour le televiseur)')
    v.ok(liens().length === 1, 'une seule demande de lien')
    v.ok(await jusqua(() => evenements().some((e) => e.type === 'diffusion:lien-copie'), 8000, 250), 'telemetrie : diffusion:lien-copie')
    v.ok(!!jeton && !evenements().some((e) => JSON.stringify(e).includes(jeton) || /127\.0\.0\.1|\/cast\//.test(JSON.stringify(e))), 'aucun lien copie ni jeton dans la telemetrie')
    v.ok(banc.externes.length === 0, `aucune requete hors 127.0.0.1 (${banc.externes.length})`)
    v.info(`erreurs de page : ${banc.erreursPage.length}`)
  } finally {
    await banc.fermer()
  }
}

v.termine()
