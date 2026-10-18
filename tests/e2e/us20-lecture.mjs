// US-20 : parcours de lecture contre le faux serveur (jamais le vrai fournisseur).
//   NODE_OPTIONS=--tls-max-v1.2 node tests/e2e/us20-lecture.mjs
import { construireHarnais, ouvrirBanc, creerVerificateur, jusqua, attendre, chaine, film } from './banc.mjs'

const v = creerVerificateur('US-20 lecture')
await construireHarnais()

const banc = await ouvrirBanc({ ecran: 'lecture' })
const { page } = banc
try {
  const ouvrir = (e, forcee) => page.evaluate(([x, f]) => window.harnais.ouvrir(x, f), [e, forcee])
  const fermer = () => page.evaluate(() => window.harnais.fermer())
  const reinit = async () => {
    await fermer()
    await attendre(1800) // laisse partir la fin differee de la lecture precedente
    banc.serveur.reinit()
    await page.evaluate(() => (window.__session = 0))
  }
  const live = (n, filtre = () => true) => banc.api((r) => r.chemin.startsWith(`/api/v1/live/${n}`) && filtre(r))
  const bandeau = () => page.locator('[data-role="reconnexion"]')
  const alerte = () => page.locator('[role="alert"]')

  // --- 1. Direct nominal ---------------------------------------------------
  console.log('1. direct nominal')
  await ouvrir(chaine(1001))
  v.ok(await jusqua(() => live(1001, (r) => r.chemin.includes('/seg/')).length >= 2, 15_000), 'playlist puis segments demandes sous /api/v1/live/')
  v.ok(live(1001, (r) => r.chemin.endsWith('.m3u8')).length >= 1, 'la playlist est celle du champ `lecture`')
  v.ok(await jusqua(async () => (await banc.serveur.evenements()).some((e) => e.type === 'hls:segment'), 12_000, 250), 'telemetrie : hls:segment envoyes a POST /diagnostic/evenements')
  const evts = banc.serveur.evenements()
  v.ok(!evts.some((e) => e.type === 'hls:erreur' && e.fatale === true), 'aucune erreur hls fatale')
  v.ok(evts.every((e) => typeof e.type === 'string' && e.type.length <= 40), 'evenements conformes au contrat (type <= 40)')
  v.ok(evts.filter((e) => e.url).every((e) => !/\/seg\/jeton/.test(e.url)), 'aucun jeton de segment dans la telemetrie')
  v.ok((await alerte().count()) === 0, "aucun panneau d'erreur")
  const segs = live(1001, (r) => r.chemin.includes('/seg/')).map((r) => r.chemin)
  v.ok(segs.every((s) => !/[?]/.test(s)), 'les URL de segments ne sont pas reecrites (aucune requete ajoutee)')
  v.ok(!banc.api().some((r) => /player_api|xmltv|\/flux\//.test(r.chemin)), 'aucune route de l\'ancien service')

  // --- 2. Zapping x10 : pas de fin envoyee, une seule a l'arret ---------------
  console.log('2. zapping rapide x10')
  await reinit()
  for (let i = 0; i < 10; i++) {
    await ouvrir(chaine(2001 + i))
    await attendre(250)
  }
  await attendre(1200)
  v.ok(banc.api((r) => r.chemin.endsWith('/fin')).length === 0, "zapper n'envoie aucune fin (sinon le fournisseur refuse la reprise)")
  v.ok(banc.api((r) => r.chemin.endsWith('2010.m3u8')).length >= 1, 'la derniere chaine est bien ouverte')
  await fermer()
  v.ok(await jusqua(() => banc.api((r) => r.chemin === '/api/v1/live/2010/fin' && r.methode === 'POST').length === 1, 5000), 'fermer le lecteur : POST /live/2010/fin, une fois')
  v.ok(banc.api((r) => r.chemin.endsWith('/fin')).length === 1, 'et seulement pour la derniere chaine')

  // --- 3. 503 + Retry-After : patience, message, reprise ---------------------
  console.log('3. place occupee (503 deux fois puis ok)')
  await reinit()
  await ouvrir(chaine(1002))
  v.ok(await jusqua(async () => (await bandeau().count()) > 0, 10_000, 100), 'bandeau « Place occupée — nouvelle tentative automatique »')
  v.ok(/Place occupée/.test((await bandeau().first().innerText().catch(() => '')) || ''), 'le message dit « place occupée »')
  v.ok(await jusqua(() => live(1002, (r) => r.chemin.includes('/seg/')).length >= 1, 30_000), 'la lecture reprend toute seule apres les 503')
  v.ok((await alerte().count()) === 0, "pas de panneau d'erreur final")
  v.ok(live(1002, (r) => r.chemin.endsWith('.m3u8')).length >= 3, 'la playlist a ete redemandee (essais automatiques)')

  // --- 4. 503 sans fin : borne, jamais de boucle infinie ----------------------
  console.log('4. place occupee en permanence')
  await reinit()
  await ouvrir(chaine(1003))
  v.ok(await jusqua(async () => (await alerte().count()) > 0, 60_000, 250), "apres les essais bornes, l'erreur est nommee")
  v.ok(/Place occupée/.test((await alerte().first().innerText().catch(() => '')) || ''), 'message « place occupée »')
  const n1 = live(1003, (r) => r.chemin.endsWith('.m3u8')).length
  await attendre(5000)
  const n2 = live(1003, (r) => r.chemin.endsWith('.m3u8')).length
  v.ok(n1 === n2, `plus aucun essai apres abandon (${n1} requetes)`)
  v.ok(n1 <= 16, `nombre d'essais borne (${n1} requetes de playlist)`)

  // --- 5. 401 : retour a la connexion -----------------------------------------
  console.log('5. session expiree (direct)')
  await reinit()
  await ouvrir(chaine(1004))
  v.ok(await jusqua(async () => (await alerte().count()) > 0, 15_000), 'erreur nommee')
  v.ok(/session a expiré/i.test((await alerte().first().innerText().catch(() => '')) || ''), 'message « session expirée »')
  v.ok((await page.evaluate(() => window.__session)) >= 1, "l'evenement mytv:session-expiree est emis (retour a la connexion)")
  v.ok(live(1004, (r) => r.chemin.endsWith('.m3u8')).length <= 2, 'pas de martelage sur un 401')

  // --- 6. 502 ponctuel ---------------------------------------------------------
  console.log('6. 502 ponctuel')
  await reinit()
  await ouvrir(chaine(1005))
  v.ok(await jusqua(() => live(1005, (r) => r.chemin.includes('/seg/')).length >= 1, 30_000), 'reprise automatique apres un 502')

  // --- 7. Film en lecture directe ----------------------------------------------
  console.log('7. film servi tel quel')
  await reinit()
  await ouvrir(film(100))
  v.ok(await jusqua(() => banc.api((r) => r.chemin === '/api/v1/vod/iptva:100' && r.methode === 'GET').length >= 1, 10_000), 'HEAD puis GET /api/v1/vod/iptva:100')
  const methodes = banc.api((r) => r.chemin.startsWith('/api/v1/vod/')).map((r) => r.methode)
  v.ok(methodes[0] === 'HEAD', 'la verification en tete (HEAD) vient avant la lecture')
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 1, null, { timeout: 10_000 }).catch(() => {})
  await page.evaluate(() => { document.querySelector('video').currentTime = 10 })
  await attendre(800)
  v.ok(!banc.api().some((r) => r.requete.includes('t=')), 'Range natif : aucun ?t= pour un fichier servi tel quel')
  v.ok((await alerte().count()) === 0, "aucun panneau d'erreur")

  // --- 8. Film remuxe : deplacement par ?t= --------------------------------------
  console.log('8. film remuxe (seek par ?t=)')
  await reinit()
  await ouvrir(film(101))
  v.ok(await jusqua(() => banc.api((r) => r.chemin === '/api/v1/vod/iptva:101' && r.methode === 'GET').length >= 1, 10_000), 'lecture ouverte')
  // On fige le film : la cible d'un deplacement est « position courante + 10 s ».
  await page.evaluate(() => { const v = document.querySelector('video'); v.pause(); v.currentTime = 0 })
  await attendre(400)
  const avant = banc.api((r) => r.chemin === '/api/v1/vod/iptva:101').length
  await page.locator('[tabindex="-1"]').first().focus()
  await page.keyboard.press('ArrowRight')
  const demande = () => banc.api((r) => r.chemin === '/api/v1/vod/iptva:101' && r.methode === 'GET' && /[?&]t=/.test(r.requete))
  v.ok(await jusqua(() => demande().length >= 1, 8000), 'avancer de 10 s : GET /api/v1/vod/iptva:101?t=<secondes> (deplacement exact par le service)')
  const t = Number(new URLSearchParams(demande()[0]?.requete ?? '').get('t'))
  v.ok(t >= 10 && t < 10.6, `une seule touche = un seul pas de 10 s (?t=${t})`)
  v.ok(banc.api((r) => r.chemin === '/api/v1/vod/iptva:101').length > avant, 'et le flux est rouvert')
  const duree = await page.evaluate(() => document.body.innerText.match(/\d+:\d{2}/g))
  v.info(`temps affiches : ${duree?.slice(0, 4).join(' ')}`)

  // --- 9. Film 415 -----------------------------------------------------------------
  console.log('9. film HEVC (415)')
  await reinit()
  await ouvrir(film(102))
  v.ok(await jusqua(async () => (await alerte().count()) > 0, 10_000), "message d'erreur affiche")
  const txt415 = (await alerte().first().innerText().catch(() => '')) || ''
  v.ok(/HEVC/.test(txt415), 'le message nomme le HEVC')
  await attendre(1500)
  v.ok(banc.api((r) => r.chemin.startsWith('/api/v1/vod/')).length === 1, 'aucun reessai sur un format illisible')

  // --- 10. Film 503 une fois ----------------------------------------------------------
  console.log('10. film : place occupee une fois')
  await reinit()
  await ouvrir(film(103))
  v.ok(await jusqua(async () => (await bandeau().count()) > 0, 8000, 100), 'bandeau « place occupée »')
  v.ok(await jusqua(() => banc.api((r) => r.chemin === '/api/v1/vod/iptva:103' && r.methode === 'GET').length >= 1, 15_000), 'puis lecture')

  // --- 11. Film 401 --------------------------------------------------------------------
  console.log('11. film : session expiree')
  await reinit()
  await ouvrir(film(104))
  v.ok(await jusqua(async () => (await alerte().count()) > 0, 10_000), 'erreur nommee')
  v.ok((await page.evaluate(() => window.__session)) >= 1, 'mytv:session-expiree emis')

  // --- 12. Un film remplace un direct : pas de fin --------------------------------------
  console.log('12. direct puis film')
  await reinit()
  await ouvrir(chaine(1001))
  await attendre(1500)
  await ouvrir(film(100))
  await attendre(2500)
  v.ok(banc.api((r) => r.chemin.endsWith('/fin')).length === 0, 'direct → film : le film reprend la place, aucune fin envoyee')

  // --- 13. Fermeture de la page ---------------------------------------------------------------
  console.log('13. fermeture de la page')
  await reinit()
  await ouvrir(chaine(1001))
  await jusqua(() => live(1001, (r) => r.chemin.includes('/seg/')).length >= 1, 10_000)
  await page.goto('about:blank')
  v.ok(await jusqua(() => banc.api((r) => r.chemin === '/api/v1/live/1001/fin').length >= 1, 4000), 'pagehide : la place est rendue tout de suite (keepalive)')

  // --- 14. Fin prematuree : un `ended` avant la duree annoncee est une coupure -------------------
  console.log('14. film remuxe tronque (ended a 3 s sur 120 s annoncees)')
  // Le parcours 13 a quitte la page : on la rouvre.
  await page.goto(`${banc.serveur.origine}/index.html?ecran=lecture`)
  await page.waitForFunction(() => !!window.harnais)
  await reinit()
  await ouvrir(film(107))
  const gets107 = () => banc.api((r) => r.chemin === '/api/v1/vod/iptva:107' && r.methode === 'GET')
  v.ok(await jusqua(() => gets107().length >= 1, 10_000), 'lecture ouverte')
  v.ok(await jusqua(async () => (await bandeau().count()) > 0, 15_000, 100), "le `ended` premature est traite comme une coupure : bandeau de reconnexion")
  v.ok(await jusqua(() => gets107().length >= 2, 15_000), 'puis le flux est rouvert automatiquement')
  const t107 = Number(new URLSearchParams(gets107()[1]?.requete ?? '').get('t'))
  v.ok(t107 > 0 && t107 <= 3, `rouvert au point atteint, par ?t= (?t=${t107})`)
  v.ok(await jusqua(async () => (await banc.serveur.evenements()).some((e) => e.type === 'vod:fin-prematuree'), 5000, 250), 'telemetrie : vod:fin-prematuree')
  v.ok((await page.locator('[data-role="reprise"]').count()) === 0, 'aucun dialogue « Reprendre » rejoue par la reprise automatique')

  // --- 15. Position memorisee : ouverture directe au point sauvegarde, dialogue une fois ----------
  console.log('15. film remuxe avec une position memorisee (70 s)')
  await reinit()
  await page.evaluate(() => window.harnais.semerReprise('vod:101', 70, 120))
  await ouvrir(film(101))
  const gets101 = () => banc.api((r) => r.chemin === '/api/v1/vod/iptva:101' && r.methode === 'GET')
  v.ok(await jusqua(() => gets101().length >= 1, 10_000), 'lecture ouverte')
  v.ok(/[?&]t=70/.test(gets101()[0]?.requete ?? ''), `ouverte DIRECTEMENT au point sauvegarde (${gets101()[0]?.requete})`)
  const dialogue = page.locator('[data-role="reprise"]')
  v.ok(await jusqua(async () => (await dialogue.count()) > 0, 5000, 100), 'le dialogue « Reprendre / Depuis le debut » est propose')
  await dialogue.getByRole('button', { name: /Reprendre/ }).click()
  await attendre(1500)
  v.ok(gets101().length === 1, `« Reprendre » ne rouvre rien : on y est deja (${gets101().length} GET)`)
  v.ok((await dialogue.count()) === 0, 'dialogue ferme')
  // Une coupure (le navigateur prend la fin du corps pour la fin du film) : reprise sans dialogue.
  await page.evaluate(() => document.querySelector('video').dispatchEvent(new Event('ended')))
  v.ok(await jusqua(() => gets101().length >= 2, 15_000), 'reprise automatique apres la coupure')
  await attendre(1500)
  v.ok((await dialogue.count()) === 0, 'le dialogue n est PAS rejoue par la reprise automatique')
  v.ok(/[?&]t=/.test(gets101()[1]?.requete ?? ''), `reprise au point atteint (${gets101()[1]?.requete})`)

  // --- 16. Deplacement sans duree annoncee --------------------------------------------------------
  console.log('16. film remuxe sans X-Mytv-Duree : avancer de 10 s')
  await reinit()
  await ouvrir(film(108))
  v.ok(await jusqua(() => banc.api((r) => r.chemin === '/api/v1/vod/iptva:108' && r.methode === 'GET').length >= 1, 10_000), 'lecture ouverte')
  await page.evaluate(() => { const v = document.querySelector('video'); v.pause(); v.currentTime = 0 })
  await attendre(400)
  v.ok((await page.locator('input[aria-label="Position de lecture"]').count()) === 0, 'sans duree, pas de barre de progression (le curseur de volume, lui, reste)')
  await page.locator('[tabindex="-1"]').first().focus()
  await page.keyboard.press('ArrowRight')
  const demande108 = () => banc.api((r) => r.chemin === '/api/v1/vod/iptva:108' && r.methode === 'GET' && /[?&]t=/.test(r.requete))
  v.ok(await jusqua(() => demande108().length >= 1, 8000), 'avancer de 10 s passe par ?t= meme sans duree connue')
  const t108 = Number(new URLSearchParams(demande108()[0]?.requete ?? '').get('t'))
  v.ok(t108 >= 10 && t108 < 10.6, `la cible n est pas ramenee a 0 (?t=${t108})`)

  // --- Hygiene ------------------------------------------------------------------------------------
  v.ok(banc.externes.length === 0, `aucune requete hors 127.0.0.1 (${banc.externes.length})`)
  if (banc.externes.length) v.info(banc.externes.slice(0, 3).join(' '))
  v.info(`erreurs de page : ${banc.erreursPage.length}`)
} finally {
  await banc.fermer()
}
v.termine()
