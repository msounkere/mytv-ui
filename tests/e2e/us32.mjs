// US-32 : modes du direct, messages 4K/HEVC, forcages bornes, badge 4K.
// Faux serveur local uniquement (127.0.0.1, port ephemere) ; jamais de vrai flux.
//   NODE_OPTIONS=--tls-max-v1.2 node tests/e2e/us32.mjs
import { construireHarnais, ouvrirBanc, creerVerificateur, jusqua, attendre, chaine } from './banc.mjs'

const v = creerVerificateur('US-32 modes du direct')
await construireHarnais()

const banc = await ouvrirBanc({ ecran: 'lecture' })
const { page } = banc
try {
  const ouvrir = (e) => page.evaluate((x) => window.harnais.ouvrir(x), e)
  const fermer = () => page.evaluate(() => window.harnais.fermer())
  const reinit = async () => {
    await fermer()
    await attendre(1800)
    banc.serveur.reinit()
  }
  const playlists = (n) => banc.api((r) => r.chemin === `/api/v1/live/${n}.m3u8`)
  const forcees = (n, mode) => playlists(n).filter((r) => r.requete.includes(`forcer=${mode}`))
  const alerte = () => page.locator('[role="alert"]')
  const texte = async (loc) => (await loc.first().innerText().catch(() => '')) || ''
  const evenements = () => banc.serveur.evenements()
  const attendreEvt = (type, pred = () => true) =>
    jusqua(() => evenements().some((e) => e.type === type && pred(e)), 12_000, 250)

  // --- 1. 4K/HEVC refuse : message clair, aucune boucle ---------------------------
  console.log('1. format_hevc_non_lisible (415)')
  await ouvrir(chaine(1101, { nom: 'FR - CANAL+ 4K' }))
  v.ok(await jusqua(async () => (await alerte().count()) > 0, 10_000), 'un message est affiche')
  const t1 = await texte(alerte())
  v.ok(/4K\/HEVC/.test(t1) && /autre chaîne/.test(t1), `message clair 4K/HEVC (${t1.slice(0, 60).replace(/\n/g, ' ')})`)
  await attendre(4000)
  v.ok(playlists(1101).length === 1, `aucune boucle ni reessai (${playlists(1101).length} requete)`)
  v.ok(forcees(1101, 'audio').length === 0, 'aucun forcage sur un refus')
  v.ok(await attendreEvt('live:refus-hevc'), 'telemetrie : live:refus-hevc')

  // --- 2. Mode audio : indicateur et delai tolere --------------------------------------
  console.log('2. mode audio (playlist lente)')
  await reinit()
  await ouvrir(chaine(1102))
  v.ok(await jusqua(async () => (await page.locator('[data-role="conversion"]').count()) > 0, 8000, 100), 'indicateur « conversion en cours » pendant le demarrage')
  v.ok(await jusqua(() => banc.api((r) => r.chemin.includes('/live/1102/seg/')).length >= 1, 20_000), 'la lecture demarre apres le delai')
  v.ok((await alerte().count()) === 0, "pas d'erreur pendant le demarrage")
  v.ok(playlists(1102).length === 1, `aucun reessai agressif (${playlists(1102).length} playlist)`)
  v.ok(await attendreEvt('live:mode', (e) => e.mode === 'audio'), 'telemetrie : live:mode audio')

  // --- 3. fragParsingError : audio suffit -------------------------------------------------
  console.log('3. fragParsingError, ?forcer=audio repare')
  await reinit()
  await ouvrir(chaine(1103))
  v.ok(await jusqua(() => forcees(1103, 'audio').length >= 1, 40_000), 'une tentative ?forcer=audio')
  v.ok(await jusqua(() => banc.api((r) => r.chemin.includes('/live/1103/seg/')).length >= 8, 30_000), 'la lecture continue apres le forcage')
  v.ok(forcees(1103, 'video').length === 0, 'pas de forcage video inutile')
  v.ok((await alerte().count()) === 0, "pas d'erreur affichee")
  v.ok(await attendreEvt('live:forcage', (e) => e.mode === 'audio' && e.tentative === 1), 'telemetrie : live:forcage audio')

  // --- 4. audio insuffisant : video -----------------------------------------------------------
  console.log('4. fragParsingError, audio puis video')
  await reinit()
  await ouvrir(chaine(1104))
  v.ok(await jusqua(() => forcees(1104, 'video').length >= 1, 60_000), 'apres audio, une tentative ?forcer=video')
  const ordre = playlists(1104).map((r) => (r.requete.match(/forcer=(\w+)/) ?? [])[1] ?? 'aucun')
  v.ok(ordre.indexOf('audio') > -1 && ordre.indexOf('audio') < ordre.indexOf('video'), `ordre : ${ordre.join(' > ')}`)
  v.ok(await jusqua(() => banc.api((r) => r.chemin.includes('/live/1104/seg/')).length >= 8, 30_000), 'lecture reprise en video')

  // --- 5. Rien ne marche : abandon borne --------------------------------------------------------
  console.log('5. fragParsingError partout : abandon apres une tentative de chaque')
  await reinit()
  await ouvrir(chaine(1105))
  v.ok(await jusqua(async () => (await alerte().count()) > 0, 90_000, 250), 'abandon avec un message')
  const t5 = await texte(alerte())
  v.ok(/après conversion/.test(t5), `message final (${t5.slice(0, 70).replace(/\n/g, ' ')})`)
  await attendre(6000)
  v.ok(forcees(1105, 'audio').length === 1 && forcees(1105, 'video').length === 1, `exactement un forcage audio et un video (${forcees(1105, 'audio').length}/${forcees(1105, 'video').length})`)
  const n = playlists(1105).length
  await attendre(6000)
  v.ok(playlists(1105).length === n, `plus aucune requete apres abandon (${n} playlists)`)
  v.ok(await attendreEvt('live:conversion-echec', (e) => e.fin === true), 'telemetrie : live:conversion-echec')
  v.ok(evenements().every((e) => typeof e.type === 'string' && e.type.length <= 40), 'evenements conformes (type <= 40)')

  // --- Hygiene ------------------------------------------------------------------------------------
  v.ok(banc.externes.length === 0, `aucune requete hors 127.0.0.1 (${banc.externes.length})`)
} finally {
  await banc.fermer()
}
v.termine()
