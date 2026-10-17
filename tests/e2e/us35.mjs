// US-35 : compte utilise ailleurs -- messages, decompte qui respecte Retry-After,
// reprise automatique, plafond, coupure en cours de lecture, telemetrie.
// Faux serveur local uniquement (127.0.0.1, port ephemere) ; jamais de vrai fournisseur.
//   NODE_OPTIONS=--tls-max-v1.2 node tests/e2e/us35.mjs
import { construireHarnais, ouvrirBanc, creerVerificateur, jusqua, attendre, chaine } from './banc.mjs'

const v = creerVerificateur('US-35 compte utilise ailleurs')
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
  const segments = (n) => banc.api((r) => r.chemin.includes(`/live/${n}/seg/`))
  const bandeau = page.locator('[data-role="reconnexion"]')
  const alerte = page.locator('[role="alert"]')
  const texte = async (loc) => (await loc.first().innerText().catch(() => '')) || ''
  const evenements = () => banc.serveur.evenements()
  const attendreEvt = (type, pred = () => true) =>
    jusqua(() => evenements().some((e) => e.type === type && pred(e)), 12_000, 250)
  /** Ecarts (s) entre requetes successives. */
  const ecarts = (liste) => liste.slice(1).map((r, i) => (r.t - liste[i].t) / 1000)

  // --- 1. compte utilise ailleurs : message, decompte, reprise automatique --------
  console.log('1. compte_utilise_ailleurs (Retry-After 2) x3 puis place libre')
  await ouvrir(chaine(1201))
  v.ok(await jusqua(async () => (await bandeau.count()) > 0, 8000, 50), 'un bandeau d’attente apparait')
  const t1 = await texte(bandeau)
  v.ok(t1.includes('Le compte IPTV est utilisé sur un autre appareil. Fermez-le pour regarder ici.'), `message CA1 (${t1.slice(0, 50).replace(/\n/g, ' ')})`)
  v.ok(/nouvel essai dans \d+ s/.test(t1), 'compte a rebours affiche')
  v.ok(await jusqua(() => segments(1201).length >= 3, 30_000), 'reprise AUTOMATIQUE : les segments sont lus sans action')
  const p1 = playlists(1201)
  v.ok(p1.length === 4, `exactement 4 playlists (3 refus + 1 succes), pas de martelage (${p1.length})`)
  v.ok(ecarts(p1).every((e) => e >= 1.95), `jamais plus frequent que Retry-After (${ecarts(p1).map((e) => e.toFixed(1)).join(' ; ')} s)`)
  v.ok((await alerte.count()) === 0, 'aucune carte d’erreur : la reprise est silencieuse')
  v.ok(await attendreEvt('occupation:code', (e) => e.code === 'compte_utilise_ailleurs' && e.retryAfter === 2), 'telemetrie : code recu')
  v.ok(await attendreEvt('occupation:attente', (e) => e.delai === 2), 'telemetrie : attente')
  v.ok(await attendreEvt('occupation:reprise', (e) => e.essais === 3 && e.attendu === 6), 'telemetrie : reprise reussie (3 essais, 6 s attendues)')

  // --- 2. compte_occupe -----------------------------------------------------------------
  console.log('2. compte_occupe')
  await reinit()
  await ouvrir(chaine(1202))
  v.ok(await jusqua(async () => (await texte(bandeau)).includes('Connexion du fournisseur occupée, nouvelle tentative automatique'), 8000, 50), 'message compte_occupe')
  v.ok(await jusqua(() => segments(1202).length >= 2, 20_000), 'reprise automatique')
  v.ok(playlists(1202).length === 3, `3 playlists (${playlists(1202).length})`)

  // --- 3. Retry-After au-dela du plafond : abandon, bouton Reessayer ------------------------
  console.log('3. attente au-dela du plafond')
  await reinit()
  await ouvrir(chaine(1203))
  v.ok(await jusqua(async () => (await alerte.count()) > 0, 8000, 100), 'carte d’erreur (plafond d’attente)')
  const t3 = await texte(alerte)
  v.ok(t3.includes('Une autre fenêtre de MyTV utilise la connexion.') && /10 minutes/.test(t3), `message par_mytv + plafond (${t3.slice(0, 60).replace(/\n/g, ' ')})`)
  await attendre(4000)
  v.ok(playlists(1203).length === 1, `aucune requete de plus apres abandon (${playlists(1203).length})`)
  v.ok(await attendreEvt('occupation:abandon'), 'telemetrie : abandon')
  await page.getByRole('button', { name: 'Réessayer' }).click()
  v.ok(await jusqua(() => playlists(1203).length === 2, 5000), 'Réessayer relance UNE requete')
  v.ok(await jusqua(async () => (await alerte.count()) > 0, 5000), 'et abandonne de nouveau sans boucle')

  // --- 4. Coupure en cours de lecture -------------------------------------------------------
  console.log('4. coupure en cours de lecture')
  await reinit()
  await ouvrir(chaine(1204))
  v.ok(await jusqua(async () => (await bandeau.count()) > 0, 20_000, 50), 'bandeau apres coupure')
  const t4 = await texte(bandeau)
  v.ok(t4.includes('Lecture interrompue : le compte est utilisé ailleurs'), `message de coupure (${t4.slice(0, 60).replace(/\n/g, ' ')})`)
  v.ok(await jusqua(() => evenements().some((e) => e.type === 'occupation:reprise'), 50_000, 250), 'reprise automatique apres liberation')
  const p4 = playlists(1204)
  v.ok(ecarts(p4)[0] >= 14.9 && ecarts(p4.slice(1)).every((e) => e >= 1.95), `respect de Retry-After apres coupure, attente par defaut 15 s sur un 403 sans en-tete (${ecarts(p4).map((e) => e.toFixed(1)).join(' ; ')} s)`)
  v.ok((await alerte.count()) === 0, 'aucune carte d’erreur')

  // --- 5. Film ---------------------------------------------------------------------------------------
  console.log('5. film : memes messages et meme reprise')
  await reinit()
  await ouvrir({ cle: 'vod:106', type: 'vod', id: 106, nom: 'Film 106', recherche: 'film 106', categorie: 'v1', extension: 'mkv', idServeur: 'iptva:106', lecture: '/api/v1/vod/iptva:106' })
  v.ok(await jusqua(async () => (await texte(bandeau)).includes('Le compte IPTV est utilisé sur un autre appareil'), 8000, 50), 'film : message compte utilise ailleurs')
  v.ok(await jusqua(() => banc.api((r) => r.chemin === '/api/v1/vod/iptva:106' && r.methode === 'GET').length >= 1, 15_000), 'film : reprise automatique')
  const heads = banc.api((r) => r.chemin === '/api/v1/vod/iptva:106' && r.methode === 'HEAD')
  v.ok(heads.length === 3 && ecarts(heads).every((e) => e >= 1.95), `film : 3 HEAD espaces d'au moins 2 s (${ecarts(heads).map((e) => e.toFixed(1)).join(' ; ')})`)

  // --- Hygiene ------------------------------------------------------------------------------------
  v.ok(evenements().every((e) => typeof e.type === 'string' && e.type.length <= 40), 'evenements conformes (type <= 40)')
  v.ok(banc.externes.length === 0, `aucune requete hors 127.0.0.1 (${banc.externes.length})`)
} finally {
  await banc.fermer()
}
v.termine()
