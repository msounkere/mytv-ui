// US-39 (variantes, recommandation, test actif, telemetrie) et US-38 CA4 (qualite
// Auto / Eco) dans le LECTEUR, contre le faux serveur (127.0.0.1 ; jamais le
// vrai fournisseur).
//   NODE_OPTIONS=--tls-max-v1.2 node tests/e2e/us39.mjs
import { construireHarnais, ouvrirBanc, creerVerificateur, jusqua, attendre, chaine, film } from './banc.mjs'

const v = creerVerificateur('US-39 variantes + US-38 CA4 Eco (lecteur)')
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
  const evenements = () => banc.serveur.evenements()
  const attendreEvt = (type, pred = () => true, delai = 12_000) =>
    jusqua(() => evenements().some((e) => e.type === type && pred(e)), delai, 250)
  const texte = async (loc) => (await loc.first().innerText().catch(() => '')) || ''
  const alerte = page.locator('[role="alert"]')
  const bande = page.locator('[data-role="variantes"]')
  const recommandation = page.locator('[data-role="recommandation"]')

  // Trois variantes d'une meme chaine, dans le catalogue local (index `groupe`),
  // dans deux categories differentes comme chez le fournisseur.
  const groupe = 'fr|chaine test'
  const hd = chaine(1301, { nom: 'Chaine test HD', pays: 'FR', groupe, categorie: 'c1' })
  const fhd = chaine(1302, { nom: 'Chaine test FHD', pays: 'FR', groupe, categorie: 'c1' })
  const k4 = chaine(1303, { nom: 'Chaine test 4K', pays: 'FR', groupe, categorie: 'c4k' })
  await page.evaluate((entrees) => window.harnais.semer(entrees), [hd, fhd, k4, chaine(1001, { groupe: 'chaine 1001' })])

  // --- 1. CA3 : ligne de recommandation et menu des variantes -------------------
  console.log('1. recommandation a l ouverture (sans historique, debit non mesure : FHD)')
  await ouvrir(hd)
  v.ok(await jusqua(() => segments(1301).length >= 2, 15_000), 'la chaine HD est lue')
  await page.locator('[tabindex="-1"]').first().focus()
  await page.keyboard.press('v')
  v.ok(await jusqua(async () => (await bande.count()) > 0, 5000, 100), 'la bande des variantes s ouvre (touche V)')
  const t1 = await texte(recommandation)
  v.ok(/^Recommandé : FHD — la plus haute définition pour un débit non mesuré\./.test(t1), `ligne de recommandation (${t1.slice(0, 80)})`)
  v.ok(/4K déconseillée/.test(t1), 'la 4K est deconseillee (HEVC non lisible ou debit)')
  const boutons = page.locator('[data-role="variante"]')
  v.ok((await boutons.count()) === 3, `trois variantes dans le menu (${await boutons.count()})`)
  v.ok(await page.locator('[data-role="variante"][data-qualite="HD"]').getAttribute('aria-pressed') === 'true', 'la variante lue est marquee')
  v.ok(await attendreEvt('recommandation:choix', (e) => e.groupe === groupe && e.recommandee === 'live:1302' && e.choisie === 'live:1301'), 'CA5 : telemetrie recommandation:choix (groupe, recommandee, choisie, raison)')
  const evtChoix = evenements().find((e) => e.type === 'recommandation:choix')
  v.ok(evtChoix && typeof evtChoix.raison === 'string' && evtChoix.raison.length > 0, `raison presente (${evtChoix?.raison})`)

  // --- 2. CA3 : choix explicite -> zap vers la variante, retenu pour le groupe ------
  console.log('2. choix explicite d une variante')
  await page.locator('[data-role="variante"][data-qualite="FHD"]').click()
  v.ok(await jusqua(() => playlists(1302).length >= 1, 10_000), 'la variante FHD est ouverte (une playlist)')
  v.ok(await jusqua(() => segments(1302).length >= 1, 15_000), 'et lue')
  const memo = await page.evaluate((g) => localStorage.getItem('mytv.variante.' + g), groupe)
  v.ok(memo === 'live:1302', `le choix est retenu pour le groupe (${memo})`)
  v.ok(await attendreEvt('recommandation:choix', (e) => e.raison === 'explicite' && e.choisie === 'live:1302'), 'telemetrie : raison explicite')

  // --- 3. CA4 : test actif, une variante a la fois --------------------------------
  console.log('3. test actif')
  await reinit()
  await ouvrir(fhd)
  v.ok(await jusqua(() => segments(1302).length >= 2, 15_000), 'lecture en cours avant le test')
  await page.keyboard.press('v')
  await jusqua(async () => (await bande.count()) > 0, 5000, 100)
  const avantTest = banc.api().length
  await page.getByRole('button', { name: 'Tester cette chaîne' }).click()
  v.ok(await jusqua(async () => (await page.locator('[data-role="test-en-cours"]').count()) > 0, 3000, 50), 'etat « test en cours » affiche')
  v.ok(await jusqua(async () => (await page.locator('[data-role="test-date"]').count()) > 0, 30_000, 200), 'le test se termine')
  const requetes = banc.api().slice(avantTest).filter((r) => /\/live\/13\d\d/.test(r.chemin) && !r.chemin.endsWith('/fin'))
  const ordre = requetes.map((r) => (r.chemin.includes('/seg/') ? 'seg' : 'pl') + r.chemin.match(/13\d\d/)[0])
  v.info(`requetes du test : ${ordre.join(' ')}`)
  // Des segments du flux ferme peuvent encore arriver au serveur (Firefox en
  // envoie trois) : le test commence a sa premiere playlist, et apres lui le
  // lecteur rouvre la chaine lue. On ne regarde que la sequence du test.
  const debutTest = ordre.findIndex((x) => x.startsWith('pl'))
  const sequence = ordre.slice(debutTest, debutTest + 6)
  v.ok(sequence.join(' ') === 'pl1303 seg1303 pl1302 seg1302 pl1301 seg1301', 'une playlist puis un segment par variante, l une apres l autre, de la 4K a la HD')
  const finTest = requetes.slice(debutTest, debutTest + 6)
  v.ok(finTest.every((r, i) => i === 0 || r.t >= finTest[i - 1].t), 'strictement en sequence')
  const mesures = page.locator('[data-role="mesure"]')
  v.ok((await mesures.count()) === 3, `latence et debit affiches pour chaque variante (${await mesures.count()})`)
  const m2 = await texte(page.locator('[data-role="variante"][data-qualite="FHD"] [data-role="mesure"]'))
  v.ok(/\d+ ms · [\d,]+ (Mbit|kbit)\/s/.test(m2), `format « latence · debit » (${m2})`)
  const lat = Number(/(\d+) ms/.exec(m2)?.[1])
  v.ok(lat >= 350, `la latence de la FHD reflete les 400 ms du serveur (${lat} ms)`)
  v.ok(await jusqua(() => segments(1302).length >= 3, 20_000), 'la lecture rouvre toute seule apres le test')
  const garde = await page.evaluate((g) => localStorage.getItem('mytv.test-chaine.' + g), groupe)
  v.ok(!!garde && JSON.parse(garde).resultats.length === 3, 'le resultat est garde (24 h)')
  v.ok(await attendreEvt('recommandation:test-fin', (e) => e.testees === 3 && !e.refus), 'telemetrie : fin du test')
  v.ok((await alerte.count()) === 0, 'aucune carte d erreur')

  // --- 4. CA4 : refus quand une lecture est en cours ailleurs dans mytv ---------------
  console.log('4. test refuse : compte_utilise_par_mytv')
  await reinit()
  const occ = chaine(1203, { nom: 'Chaine occ HD', pays: 'FR', groupe: 'fr|chaine occ', categorie: 'c1' })
  const occ2 = chaine(1001, { nom: 'Chaine occ FHD', pays: 'FR', groupe: 'fr|chaine occ', categorie: 'c1' })
  await page.evaluate((entrees) => window.harnais.semer(entrees), [occ, occ2])
  await ouvrir(occ2)
  v.ok(await jusqua(() => segments(1001).length >= 2, 15_000), 'lecture en cours')
  await page.keyboard.press('v')
  await jusqua(async () => (await bande.count()) > 0, 5000, 100)
  const avant4 = banc.api().length
  await page.getByRole('button', { name: 'Tester cette chaîne' }).click()
  v.ok(await jusqua(async () => /autre fenêtre de MyTV/.test(await texte(page.locator('[data-role="test-date"]'))), 15_000, 200), 'message « une autre fenetre de MyTV lit deja »')
  // Un segment de la lecture precedente peut encore etre en vol : on ne regarde que les playlists.
  const apres4 = banc.api().slice(avant4)
  const pl4 = apres4.filter((r) => r.chemin.endsWith('.m3u8')).map((r) => r.chemin)
  v.ok(pl4[0] === '/api/v1/live/1001.m3u8', `la FHD (plus haute definition) est testee en premier (${pl4.join(' ')})`)
  v.ok(pl4[1] === '/api/v1/live/1203.m3u8' && !apres4.some((r) => r.chemin.includes('/1203/seg/')), 'le 503 compte_utilise_par_mytv arrete le test : aucun segment demande ensuite')
  v.ok(await page.evaluate((g) => localStorage.getItem('mytv.test-chaine.' + g), 'fr|chaine occ') === null, 'un test interrompu n est pas garde')
  v.ok(await attendreEvt('recommandation:test-fin', (e) => e.refus === 'compte_utilise_par_mytv'), 'telemetrie : refus')

  // --- 5. CA2 : la lecture est enregistree pour le score -----------------------------------
  console.log('5. collecte des lectures (IndexedDB)')
  await reinit()
  await ouvrir(hd)
  v.ok(await jusqua(() => segments(1301).length >= 2, 15_000), 'lecture')
  await attendre(5500)
  await fermer()
  const lectures = await page.evaluate(() => window.harnais.lectures())
  const l1301 = lectures.filter((l) => l.chaine === '1301')
  v.ok(l1301.length >= 1, `une lecture enregistree pour la chaine 1301 (${lectures.length} au total)`)
  v.ok(l1301.every((l) => l.dureeS >= 5 && l.segments >= 1 && typeof l.blocages === 'number'), `avec duree, segments, blocages (${JSON.stringify(l1301[0])})`)

  // --- 6. US-38 CA4 : bouton Qualite Auto / Eco ---------------------------------------------
  console.log('6. qualite Eco : parametre, en-tete, reouverture, memorisation')
  await attendre(1800)
  banc.serveur.reinit()
  await ouvrir(chaine(1001))
  v.ok(await jusqua(() => segments(1001).length >= 1, 15_000), 'lecture en Auto')
  v.ok(playlists(1001).every((r) => !r.qualite && !r.qualiteEntete), 'Auto : ni parametre ni en-tete')
  const boutonEco = page.getByRole('button', { name: 'Qualité : Auto' })
  v.ok((await boutonEco.count()) === 1, 'bouton « Qualité : Auto » dans le lecteur')
  await boutonEco.click()
  v.ok(await jusqua(() => playlists(1001).some((r) => r.qualite === 'eco'), 10_000), 'Eco : la playlist est redemandee avec ?qualite=eco')
  v.ok(await jusqua(() => playlists(1001).some((r) => r.qualite === 'eco' && r.qualiteEntete === 'eco'), 5000), 'et l en-tete X-Mytv-Qualite: eco')
  v.ok(await jusqua(() => segments(1001).some((r) => r.qualiteEntete === 'eco'), 15_000), 'les segments portent aussi l en-tete')
  v.ok((await page.getByRole('button', { name: 'Qualité : Éco' }).count()) === 1, 'le bouton dit « Qualité : Éco »')
  v.ok(await page.evaluate(() => localStorage.getItem('mytv.qualite')) === 'eco', 'memorise par appareil (localStorage)')
  const fins = banc.api((r) => r.chemin.endsWith('/fin'))
  v.ok(fins.length === 0, `changer de qualite ne rend pas la place (zap propre, ${fins.length} fin)`)
  // Un film en Eco porte aussi le parametre.
  await ouvrir(film(101))
  v.ok(await jusqua(() => banc.api((r) => r.chemin === '/api/v1/vod/iptva:101' && r.qualite === 'eco').length >= 1, 10_000), 'film : HEAD/GET avec ?qualite=eco')
  await page.getByRole('button', { name: 'Qualité : Éco' }).click()
  v.ok(await page.evaluate(() => localStorage.getItem('mytv.qualite')) === 'auto', 'retour en Auto')

  // --- 7. US-38 CA4 : « Passer en Eco ? » sur debit mesure (regle sur 5 segments, 30 s) ---------
  console.log('7. proposition Eco (35 s)')
  await reinit()
  await ouvrir(chaine(1001))
  v.ok(await jusqua(() => segments(1001).length >= 1, 15_000), 'lecture')
  const proposition = page.locator('[data-role="proposition-eco"]')
  // Segments de 10 s a 5,4 Mbit/s sur une liaison mesuree a 5 Mbit/s : trop juste.
  const segmentLent = () => page.evaluate(() => window.harnais.noter('hls:segment', { octets: 6_750_000, dureeMedia: 10, debitKbps: 5000 }))
  for (let i = 0; i < 5; i++) await segmentLent()
  await attendre(1000)
  v.ok((await proposition.count()) === 0, 'pas de proposition avant 30 s sous le seuil')
  await attendre(31_000)
  await segmentLent()
  v.ok(await jusqua(async () => (await proposition.count()) > 0, 3000, 100), 'proposition « Passer en Eco ? » apres 30 s')
  v.ok(/passer en qualité Éco/.test(await texte(proposition)), 'message')
  v.ok(await attendreEvt('eco:proposition'), 'telemetrie : eco:proposition')
  await proposition.getByRole('button', { name: 'Non' }).click()
  for (let i = 0; i < 8; i++) await segmentLent()
  await attendre(500)
  v.ok((await proposition.count()) === 0, 'un seul rappel par lecture')
  await page.getByRole('button', { name: 'Qualité : Auto' }).click()
  await attendre(300)
  await page.getByRole('button', { name: 'Qualité : Éco' }).click()

  // --- Hygiene ----------------------------------------------------------------------------------
  v.ok(evenements().every((e) => typeof e.type === 'string' && e.type.length <= 40), 'evenements conformes (type <= 40)')
  v.ok(!evenements().some((e) => JSON.stringify(e).includes('jeton')), 'aucun jeton dans la telemetrie')
  v.ok(banc.externes.length === 0, `aucune requete hors 127.0.0.1 (${banc.externes.length})`)
  v.ok(banc.erreursPage.length === 0, `aucune erreur de page (${banc.erreursPage.join(' | ').slice(0, 200)})`)
} finally {
  await banc.fermer()
}
v.termine()
