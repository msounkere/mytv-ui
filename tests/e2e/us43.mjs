// US-43 : liste « À voir » (devenue « Ma liste » au lot 10 / US-46), preparation visible,
// enchainement, sonde -- application complete contre le faux serveur (serveur-factice.mjs,
// contrat suppose : ui-5.contrat.demande). Aucun vrai fournisseur, aucune requete hors 127.0.0.1.
// Lot 10 : selecteurs et libelles mis a jour (bouton data-role="ma-liste", ecran
// « Ma liste », menu « ⋯ » des lignes) ; les comportements verifies sont ceux du lot 9.
//   npm run build && NODE_OPTIONS=--tls-max-v1.2 node tests/e2e/us43.mjs [scenario ...]
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { demarrerServeurFactice, COMPTE, MOT_DE_PASSE } from './serveur-factice.mjs'

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist')
const violations = []
/** Catalogue court : l'import n'est pas ce qu'on mesure ici. */
const TAILLE = { chaines: 20, films: 30, series: 6 }

async function contexte(navigateur) {
  const ctx = await navigateur.newContext({ viewport: { width: 1360, height: 860 }, locale: 'fr-FR' })
  await ctx.route('**/*', (route) => {
    const u = new URL(route.request().url())
    if (u.hostname === '127.0.0.1' || u.protocol === 'data:' || u.protocol === 'blob:') return route.continue()
    violations.push(route.request().url())
    return route.abort()
  })
  ctx.setDefaultTimeout(30_000)
  return ctx
}

async function attendre(condition, { delai = 15_000, pas = 100, quoi = 'condition' } = {}) {
  const debut = Date.now()
  for (;;) {
    const v = await condition()
    if (v) return v
    if (Date.now() - debut > delai) throw new Error(`delai depasse : ${quoi}`)
    await new Promise((r) => setTimeout(r, pas))
  }
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms))

const lireIdb = (page, table, cle) =>
  page.evaluate(([t, c]) => new Promise((ok, ko) => {
    const r = indexedDB.open('mytv')
    r.onerror = () => ko(r.error)
    r.onsuccess = () => {
      const d = r.result
      if (!d.objectStoreNames.contains(t)) { d.close(); return ok(undefined) }
      const st = d.transaction(t).objectStore(t)
      const q = c === undefined ? st.getAll() : st.get(c)
      q.onsuccess = () => { d.close(); ok(q.result) }
      q.onerror = () => { d.close(); ko(q.error) }
    }
  }), [table, cle])

async function scenario(navigateur, corps) {
  const serveur = await demarrerServeurFactice({ dist: DIST, taille: TAILLE })
  const ctx = await contexte(navigateur)
  try {
    const page = await ctx.newPage()
    const erreurs = []
    page.on('pageerror', (e) => erreurs.push(e.message))
    await page.goto(`${serveur.origine}/`)
    await page.getByLabel('Identifiant').fill(COMPTE)
    await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE)
    await page.getByRole('button', { name: 'Se connecter' }).click()
    await page.getByPlaceholder('Nom du profil').fill('Salon')
    await page.getByRole('button', { name: 'Créer et utiliser' }).click()
    await attendre(async () => (await lireIdb(page, 'reglages', 'catalogue.version'))?.valeur === serveur.etat.version, { quoi: 'import du catalogue' })
    const profil = serveur.etat.profils[0].id
    const outils = {
      serveur, page, ctx, profil,
      /** Liste du profil cote serveur : identifiants dans l'ordre. */
      liste: () => (serveur.etat.aVoir.get(profil) ?? []).map((e) => e.contenu),
      element: (id) => (serveur.etat.aVoir.get(profil) ?? []).find((e) => e.contenu === id),
      requetes: (f) => serveur.etat.requetes.filter(f),
      evenements: (type) => serveur.etat.evenements.filter((e) => e.type === type),
      rail: (nom) => page.locator('nav.rail').getByRole('button', { name: nom, exact: true }),
      boutonAVoir: (racine = page) => racine.locator('[data-role="ma-liste"]'),
      lignes: () => page.locator('[data-role="element-ma-liste"]'),
      menu: () => page.locator('[role="menu"]'),
      chemin: () => page.evaluate(() => location.pathname),
    }
    await corps(outils)
    assert.deepEqual(erreurs, [], `erreurs de page : ${erreurs.join(' | ')}`)
  } finally {
    await ctx.close()
    await serveur.fermer()
  }
}

const SCENARIOS = {
  // CA1 : bouton « À voir » sur la fiche d'un film, d'une serie, d'un episode (serie « a partir de »)
  // et dans la recherche ; table Dexie `a_voir` ; synchronisation idempotente vers /profil/a_voir.
  // CA2 : ecran « À voir » ordonne, reordonnable, retrait, options de serie, etats rafraichis toutes les 10 s,
  // une serie = une ligne.
  async liste(navigateur) {
    await scenario(navigateur, async ({ serveur, page, liste, element, requetes, evenements, boutonAVoir, lignes, menu }) => {
      // --- Fiche film --------------------------------------------------------------
      await page.goto(`${serveur.origine}/film/vod:iptva:5000`)
      const fiche = page.locator('[data-role="fiche-film"]')
      await fiche.getByRole('button', { name: 'Regarder' }).waitFor()
      await boutonAVoir(fiche).first().click()
      await attendre(async () => (await lireIdb(page, 'a_voir', 'vod:iptva:5000')) !== undefined, { quoi: 'ligne Dexie a_voir' })
      await attendre(() => liste().includes('vod:iptva:5000'), { quoi: 'PUT /profil/a_voir/vod:iptva:5000' })
      assert.equal(await boutonAVoir(fiche).first().getAttribute('aria-pressed'), 'true', 'le bouton dit « Retirer »')
      // Idempotent : un second ajout ne cree pas de doublon (la fiche bascule : retrait puis ajout).
      await boutonAVoir(fiche).first().click()
      await attendre(() => !liste().includes('vod:iptva:5000'), { quoi: 'DELETE' })
      await boutonAVoir(fiche).first().click()
      await attendre(() => liste().includes('vod:iptva:5000'), { quoi: 'PUT de nouveau' })
      assert.equal(liste().filter((x) => x === 'vod:iptva:5000').length, 1, 'un seul element pour le film')
      await attendre(() => evenements('a_voir:ajout').length >= 1 && evenements('a_voir:retrait').length >= 1, { quoi: 'telemetrie a_voir:ajout / a_voir:retrait' })
      assert.deepEqual(Object.keys(evenements('a_voir:ajout')[0]).filter((k) => !['type', 't'].includes(k)), ['id'], 'telemetrie : identifiants seulement')

      // --- Fiche serie : un episode ajoute SA SERIE « a partir de » lui -----------------
      await page.goto(`${serveur.origine}/serie/series:iptva:s5001`)
      const episode2 = page.locator('[data-role="episode"]').nth(1)
      await episode2.getByText('Épisode 2', { exact: true }).waitFor()
      await episode2.locator('[data-role="ma-liste"]').click()
      await attendre(() => element('serie:iptva:s5001')?.depuis?.episode === 2, { quoi: 'PUT serie avec depuis = S01E02' })
      assert.deepEqual(element('serie:iptva:s5001').depuis, { saison: 1, episode: 2 })
      assert.ok(!liste().some((x) => x.includes('.mkv')), 'jamais un episode comme element de la liste')
      // Le bouton de la serie elle-meme dit « present ».
      await attendre(async () => (await page.locator('header [data-role="ma-liste"]').getAttribute('aria-pressed')) === 'true', { quoi: 'bouton de la serie presse' })

      // --- Resultats de recherche ---------------------------------------------------------
      await page.goto(`${serveur.origine}/recherche?q=${encodeURIComponent('Film Test 3')}`)
      const carte = page.getByRole('button', { name: 'Film Test 3', exact: true }).first()
      await carte.waitFor()
      await carte.hover()
      await carte.getByRole('button', { name: 'Ajouter à Ma liste' }).click()
      await attendre(() => liste().includes('vod:iptva:5003'), { quoi: 'PUT depuis la recherche' })
      assert.deepEqual(liste(), ['vod:iptva:5000', 'serie:iptva:s5001', 'vod:iptva:5003'], 'ordre d ajout conserve')

      // --- Ecran « Ma liste » (/a-voir) ----------------------------------------------------------
      await page.goto(`${serveur.origine}/a-voir`)
      await attendre(async () => (await lignes().count()) === 3, { quoi: '3 lignes' })
      assert.equal(await page.evaluate(() => location.pathname), '/a-voir')
      const cles = async () => Promise.all((await lignes().all()).map((l) => l.getAttribute('data-cle')))
      assert.deepEqual(await cles(), ['vod:iptva:5000', 'series:iptva:s5001', 'vod:iptva:5003'])
      const ligneSerie = lignes().nth(1)
      const etatSerie = () => ligneSerie.locator('[data-role="etat-preparation"]').innerText()
      await attendre(async () => /^[○⟳●✕] S01E02 /.test(await etatSerie()), { quoi: 'resume de la serie' })
      assert.match(await etatSerie(), /^[○⟳●✕] S01E02 (en attente|en préparation.*|prêt) · S01E03 /, 'une serie affiche « S01E02 etat · S01E03 etat »')
      assert.equal((await etatSerie()).match(/S\d\dE\d\d/g).length, 2, 'jamais la liste de ses episodes : l episode et le suivant seulement')
      assert.equal(await ligneSerie.locator('[data-role="etat-preparation"]').count(), 1, 'une seule ligne d etat pour la serie')

      // Etat rafraichi toutes les 10 s pendant que l'ecran est ouvert : on impose des etats cote serveur.
      const etatFilm = async () => (await lignes().first().locator('[data-role="etat-preparation"]').innerText()).replace(/\s+/g, ' ').trim()
      await serveur.appel('preparation', { contenu: 'vod:iptva:5000', reglage: { etat: 'en_cours', octets: 420, total: 1000, debit_kbps: 2100 } })
      const t0 = Date.now()
      await attendre(async () => /^⟳ En préparation · 42 % · ~\d+ s$/.test(await etatFilm()), { delai: 13_000, quoi: 'etat « en preparation » avec pourcentage et temps restant' })
      const dt = Date.now() - t0
      assert.ok(dt <= 12_000, `rafraichi en ${dt} ms (<= 10 s + marge)`)
      await serveur.appel('preparation', { contenu: 'vod:iptva:5000', reglage: { etat: 'echec', cause: 'disque plein' } })
      await attendre(async () => (await etatFilm()) === '✕ Échec · disque plein Réessayer', { delai: 13_000, quoi: 'etat « echec » avec la cause' })
      await serveur.appel('preparation', { contenu: 'vod:iptva:5000', reglage: { etat: 'pret' } })
      await attendre(async () => (await etatFilm()) === '● Prêt', { delai: 13_000, quoi: 'etat « pret »' })
      assert.ok(requetes((r) => r.chemin === '/api/v1/profil/a_voir' && r.methode === 'GET').length >= 3, 'GET /profil/a_voir repete pendant que l ecran est ouvert')

      // Reordonner : « Descendre » (menu « ⋯ », donc clavier et telecommande), puis Alt+Flèche.
      await lignes().first().locator('[data-role="menu-ma-liste"]').click()
      await menu().getByRole('menuitem', { name: 'Descendre' }).click()
      await attendre(async () => (await cles())[0] === 'series:iptva:s5001', { quoi: 'descendu localement' })
      await attendre(() => liste()[0] === 'serie:iptva:s5001' && liste()[1] === 'vod:iptva:5000', { quoi: 'PUT /profil/a_voir (ordre)' })
      await lignes().nth(2).focus()
      await page.keyboard.press('Alt+ArrowUp')
      await attendre(async () => (await cles())[1] === 'vod:iptva:5003', { quoi: 'Alt+↑ monte la ligne' })
      await attendre(() => liste().join() === 'serie:iptva:s5001,vod:iptva:5003,vod:iptva:5000', { quoi: 'ordre synchronise' })

      // Options d'une serie (menu « ⋯ ») : episodes d'avance (+) et « a partir de ».
      await lignes().first().locator('[data-role="menu-ma-liste"]').click()
      await menu().waitFor()
      await menu().locator('[data-role="menu-plus"]').click()
      await attendre(() => element('serie:iptva:s5001')?.episodes_avance === 3, { quoi: 'episodes_avance = 3' })
      await menu().locator('select').selectOption('2:1')
      await attendre(() => element('serie:iptva:s5001')?.depuis?.saison === 2, { quoi: 'depuis = S02E01' })
      await page.keyboard.press('Escape')
      await attendre(async () => (await menu().count()) === 0)

      // Retrait (menu « ⋯ »).
      await lignes().nth(1).locator('[data-role="menu-ma-liste"]').click()
      await menu().getByRole('menuitem', { name: 'Retirer de Ma liste' }).click()
      await attendre(async () => (await lignes().count()) === 2, { quoi: 'ligne retiree' })
      await attendre(() => !liste().includes('vod:iptva:5003'), { quoi: 'DELETE synchronise' })
    })
  },

  // CA1 : tolerant hors ligne -- une entree ajoutee sans reseau part au serveur quand il revient.
  async horsLigne(navigateur) {
    await scenario(navigateur, async ({ serveur, page, ctx, liste, requetes, boutonAVoir }) => {
      await page.goto(`${serveur.origine}/film/vod:iptva:5002`)
      const fiche = page.locator('[data-role="fiche-film"]')
      await fiche.getByRole('button', { name: 'Regarder' }).waitFor()
      await pause(2000) // la synchronisation de demarrage est passee
      await ctx.setOffline(true)
      await boutonAVoir(fiche).first().click()
      await attendre(async () => (await lireIdb(page, 'a_voir', 'vod:iptva:5002')) !== undefined, { quoi: 'ligne locale' })
      await attendre(async () => (await boutonAVoir(fiche).first().getAttribute('aria-pressed')) === 'true', { quoi: 'bouton presse hors ligne (la fiche repond depuis IndexedDB)' })
      await pause(4000)
      assert.ok(!liste().includes('vod:iptva:5002'), 'rien n est parti : le reseau est coupe')
      assert.equal(requetes((r) => r.chemin.startsWith('/api/v1/profil/a_voir/')).length, 0, 'aucune requete n a atteint le serveur')
      await ctx.setOffline(false)
      await attendre(() => liste().includes('vod:iptva:5002'), { quoi: 'CA1 l entree ajoutee hors ligne arrive au serveur au retour du reseau' })
      const journal = await lireIdb(page, 'journal')
      await attendre(async () => ((await lireIdb(page, 'journal')) ?? []).every((l) => l.genre !== 'a_voir'), { quoi: 'journal vide' })
      assert.ok(Array.isArray(journal))
    })
  },

  // CA3 : rangee « À voir » de l'Accueil (prets d'abord), badge « Prêt » sur les cartes et les fiches,
  // lecture par le lecteur habituel.
  async accueil(navigateur) {
    await scenario(navigateur, async ({ serveur, page, profil, requetes, chemin }) => {
      await serveur.appel('a-voir', { profil, elements: [{ contenu: 'vod:iptva:5003' }, { contenu: 'vod:iptva:5001' }, { contenu: 'serie:iptva:s5002' }] })
      await serveur.appel('preparation', { contenu: 'vod:iptva:5001', reglage: { etat: 'pret' } })
      await serveur.appel('preparation', { contenu: 'vod:iptva:5003', reglage: { etat: 'attente' } })
      await serveur.appel('preparation', { contenu: 'iptva:500211.mkv', reglage: { etat: 'attente' } })
      // GET /profil/a_voir fait foi au demarrage.
      await page.reload()
      const rangee = page.locator('section[aria-label="Ma liste"]')
      await rangee.waitFor()
      await attendre(async () => (await rangee.getByRole('button', { name: /^Film Test|^Série Test/ }).count()) === 3, { quoi: '3 cartes' })
      // Lot 10 : l'ORDRE de la liste (le badge « Prêt » distingue), plus « prets d'abord ».
      const titres = await rangee.getByRole('button', { name: /^Film Test|^Série Test/ }).evaluateAll((l) => l.map((e) => e.getAttribute('aria-label')))
      assert.deepEqual(titres, ['Film Test 3', 'Film Test 1', 'Série Test 2'], 'rangee dans l ordre de la liste')
      assert.equal(await rangee.locator('[data-role="badge-preparation"]:has-text("Prêt")').count(), 1, 'un seul badge « Prêt »')
      assert.ok(/Prêt/.test(await rangee.innerText()) && /En attente/.test(await rangee.innerText()), 'chaque carte dit son etat')

      // Fiche : badge « Prêt » quand le serveur l'indique.
      await page.goto(`${serveur.origine}/film/vod:iptva:5001`)
      await page.locator('[data-role="fiche-film"] [data-role="badge-pret"]').waitFor()
      await page.goto(`${serveur.origine}/film/vod:iptva:5003`)
      await page.locator('[data-role="fiche-film"]').getByRole('button', { name: 'Regarder' }).waitFor()
      assert.equal(await page.locator('[data-role="fiche-film"] [data-role="badge-pret"]').count(), 0, 'pas de badge sans fichier pret')

      // Lecture d'un contenu pret : lecteur habituel, adresse normale, le serveur choisit la source.
      await page.goto(`${serveur.origine}/`)
      const carte = rangee.getByRole('button', { name: 'Film Test 1', exact: true })
      await carte.waitFor()
      await carte.hover()
      await carte.getByRole('button', { name: 'Lecture' }).click()
      await attendre(async () => (await chemin()) === '/lecture/vod:iptva:5001', { quoi: 'lecteur ouvert' })
      await attendre(() => requetes((r) => r.chemin === '/api/v1/vod/iptva:5001' && r.methode === 'GET').length >= 1, { quoi: 'GET /api/v1/vod/iptva:5001' })
      assert.ok(!requetes((r) => r.chemin.startsWith('/api/v1/vod/')).some((r) => /prepar|source|disque/.test(r.chemin + r.requete)), 'aucune adresse speciale')
    })
  },

  // CA4 : enchainement d'episodes (decompte, « prêt », demarrage automatique, suite au-dela du premier,
  // reprises coherentes) et film termine (proposition sans demarrage automatique).
  async enchainement(navigateur) {
    await scenario(navigateur, async ({ serveur, page, profil, evenements, chemin }) => {
      await serveur.appel('a-voir', { profil, elements: [{ contenu: 'serie:iptva:s5002' }, { contenu: 'vod:iptva:5000' }, { contenu: 'vod:iptva:5003' }] })
      await serveur.appel('preparation', { contenu: 'iptva:500212.mkv', reglage: { etat: 'pret' } })
      await serveur.appel('preparation', { contenu: 'vod:iptva:5003', reglage: { etat: 'pret' } })
      await page.reload()
      await page.goto(`${serveur.origine}/serie/series:iptva:s5002`)
      await page.getByText('Épisode 1').first().click()
      await attendre(async () => (await chemin()) === '/lecture/series:iptva:500211.mkv', { quoi: 'episode 1 ouvert' })
      const decompte = page.locator('[data-role="prochain-episode"]')
      await decompte.waitFor({ timeout: 25_000 })
      assert.match(await decompte.innerText(), /Épisode suivant dans \d+ s/, 'decompte de 10 s')
      assert.match(await decompte.innerText(), /S01E02/, 'il nomme l episode suivant')
      assert.equal(await decompte.locator('[data-role="suivant-pret"]').count(), 1, 'CA4 le decompte dit que le suivant est prêt')
      await attendre(async () => (await chemin()) === '/lecture/series:iptva:500212.mkv', { delai: 20_000, quoi: 'CA4 demarrage automatique de l episode 2' })
      await attendre(async () => {
        const r = await lireIdb(page, 'reprises', 'series:iptva:500211.mkv')
        return r && r.duree > 0 && r.position >= r.duree * 0.95
      }, { quoi: 'CA4 l episode precedent est marque vu' })
      await attendre(async () => (await lireIdb(page, 'historique', 'series:iptva:500212.mkv')) !== undefined, { quoi: 'CA4 l episode suivant est la nouvelle reprise' })
      await attendre(() => evenements('enchainement:suivant').length >= 1, { quoi: 'telemetrie enchainement:suivant' })
      const ev = evenements('enchainement:suivant')[0]
      assert.equal(ev.de, 'series:iptva:500211.mkv')
      assert.equal(ev.vers, 'series:iptva:500212.mkv')
      assert.equal(ev.pret, true)
      // Suite : l'episode 3 n'etait pas connu de la fiche au lancement, il vient des saisons (cache).
      await attendre(async () => (await decompte.count()) === 1 && /S01E03/.test(await decompte.innerText()), { delai: 25_000, quoi: 'decompte vers l episode 3' })
      await page.keyboard.press('Escape')
      await attendre(async () => (await decompte.count()) === 0, { quoi: 'Echap annule' })
      await pause(12_000)
      assert.equal(await chemin(), '/lecture/series:iptva:500212.mkv', 'CA4 annule : l episode 3 ne demarre pas')
      // Le decompte n'est pas une adresse speciale : les episodes sont demandes par /api/v1/vod/<id>.
      assert.ok(serveur.etat.requetes.some((r) => r.chemin === '/api/v1/vod/iptva:500212.mkv' && r.methode === 'GET'))

      // Film termine : proposition du prochain element de la liste, SANS demarrage automatique.
      await page.goto(`${serveur.origine}/film/vod:iptva:5000`)
      await page.locator('[data-role="fiche-film"]').getByRole('button', { name: 'Regarder' }).click()
      await attendre(async () => (await chemin()) === '/lecture/vod:iptva:5000', { quoi: 'film ouvert' })
      const proposition = page.locator('[data-role="prochain-contenu"]')
      await proposition.waitFor({ timeout: 20_000 })
      assert.match(await proposition.innerText(), /Film Test 3/, 'CA4 propose le prochain element de la liste (apres ce film)')
      assert.equal(await proposition.locator('[data-role="suivant-pret"]').count(), 1, 'et dit qu il est prêt')
      await pause(11_000)
      assert.equal(await chemin(), '/lecture/vod:iptva:5000', 'CA4 un film ne lance rien tout seul')
      await proposition.getByRole('button', { name: 'Regarder' }).click()
      // Lot 10 : App.tsx (ui-8) passe encore `ouvrir` au calque de fin ; `ouvrir` d'un film = sa fiche.
      // Quand ui-8 passera `lire`, ce sera le lecteur (voir ui-7.contrat.demande) : les deux sont acceptes.
      await attendre(async () => ['/lecture/vod:iptva:5003', '/film/vod:iptva:5003'].includes(await chemin()), { quoi: 'le suivant s ouvre au clic' })
    })
  },

  // CA5 : sonde de disponibilite a l'ouverture de la fiche d'un film et d'un episode, seulement sans lecture en cours.
  async sonde(navigateur) {
    await scenario(navigateur, async ({ serveur, page, profil, liste, requetes, rail, chemin }) => {
      const sondes = (id) => requetes((r) => r.chemin === `/api/v1/vod/${id}/disponibilite`)
      await serveur.appel('disponibilite', { id: 'iptva:5001', reponse: { etat: 'lent', debit_kbps: 2700, requis_kbps: 4400 } })
      await serveur.appel('disponibilite', { id: 'iptva:5002', reponse: { etat: 'immediat', debit_kbps: 12000 } })
      await serveur.appel('disponibilite', { id: 'iptva:500111.mkv', reponse: { etat: 'lent', debit_kbps: 1500, requis_kbps: 4400 } })
      await serveur.appel('a-voir', { profil, elements: [{ contenu: 'vod:iptva:5004' }] })
      await serveur.appel('preparation', { contenu: 'vod:iptva:5004', reglage: { etat: 'pret' } })
      await page.reload()

      // Film lent : le message, et le bouton « À voir » a cote.
      await page.goto(`${serveur.origine}/film/vod:iptva:5001`)
      const ligne = page.locator('[data-role="fiche-film"] [data-role="disponibilite"]')
      await ligne.waitFor()
      assert.equal((await ligne.innerText()).trim().replace(/\s+/g, ' '), 'Risque de coupures — préparer d’avance ? 2,7 Mbit/s mesurés pour 4,4 nécessaires Ma liste')
      assert.equal(sondes('iptva:5001').length, 1, 'CA5 une sonde a l ouverture de la fiche')
      await ligne.locator('[data-role="ma-liste"]').click()
      await attendre(() => liste().includes('vod:iptva:5001'), { quoi: 'ajoute depuis la sonde' })
      await attendre(async () => (await ligne.locator('[data-role="ma-liste"]').count()) === 0, { quoi: 'le bouton de la sonde disparait une fois ajoute' })

      // Film immediat.
      await page.goto(`${serveur.origine}/film/vod:iptva:5002`)
      await ligne.waitFor()
      assert.equal((await ligne.innerText()).trim().replace(/\s+/g, ' '), 'Lecture fluide 12 Mbit/s mesurés')
      assert.equal(await ligne.getAttribute('data-etat'), 'immediat')

      // Fichier prepare : « Prêt » (le faux serveur repond pret pour un fichier qu'il tient).
      await page.goto(`${serveur.origine}/film/vod:iptva:5004`)
      await ligne.waitFor()
      assert.equal((await ligne.innerText()).trim(), '● Prêt · préparé sur le serveur')

      // Episode : la fiche serie sonde le prochain episode a regarder (S01E01).
      await page.goto(`${serveur.origine}/serie/series:iptva:s5001`)
      const ligneSerie = page.locator('header [data-role="disponibilite"]')
      await ligneSerie.waitFor()
      assert.match((await ligneSerie.innerText()).replace(/\s+/g, ' '), /^S01E01 · Risque de coupures — préparer d’avance \? 1,5 Mbit\/s mesurés pour 4,4 nécessaires/)
      assert.equal(sondes('iptva:500111.mkv').length, 1, 'CA5 une sonde pour l episode')

      // Lecture en cours : AUCUNE sonde a l'ouverture d'une fiche.
      await page.goto(`${serveur.origine}/film/vod:iptva:5002`)
      await page.locator('[data-role="fiche-film"]').getByRole('button', { name: 'Regarder' }).click()
      await attendre(async () => (await chemin()) === '/lecture/vod:iptva:5002', { quoi: 'lecture ouverte' })
      // Entree du rail : « À voir » (lot 9) ou « Ma liste » (lot 10, coque ui-8).
      await page.locator('nav.rail').getByRole('button', { name: /^(À voir|Ma liste)$/ }).click()
      await page.locator('[data-role="element-ma-liste"]').first().waitFor()
      // Les fiches s'ouvrent par le titre de la ligne (pas de rechargement : la lecture continue).
      const avant = sondes('iptva:5004').length + sondes('iptva:5001').length
      await page.locator('[data-role="element-ma-liste"]').first().getByText('Film Test 4').click()
      await page.locator('[data-role="fiche-film"]').getByRole('button', { name: 'Regarder' }).waitFor()
      await pause(1500)
      assert.equal(sondes('iptva:5004').length + sondes('iptva:5001').length, avant, 'CA5 aucune sonde pendant une lecture')
      // Lot 10 : un fichier deja pret le dit sans sonder ; rien d'autre n'est affiche pendant une lecture.
      assert.equal(await page.locator('[data-role="fiche-film"] [data-role="disponibilite"]:not([data-etat="pret"])').count(), 0, 'et rien n est affiche (hors « Prêt » deja connu)')
    })
  },
}

// --- Execution ----------------------------------------------------------------
const demandes = process.argv.slice(2)
const noms = demandes.length ? demandes : Object.keys(SCENARIOS)
const navigateur = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
let echecs = 0
try {
  for (const nom of noms) {
    const f = SCENARIOS[nom]
    if (!f) { console.error(`scenario inconnu : ${nom}`); echecs++; continue }
    const t0 = Date.now()
    try {
      await f(navigateur)
      console.log(`OK   ${nom} (${Date.now() - t0} ms)`)
    } catch (e) {
      echecs++
      console.log(`KO   ${nom} : ${e.message}`)
      if (process.env.DEBUG) console.log(e.stack)
    }
  }
} finally {
  await navigateur.close()
}
if (violations.length) {
  echecs++
  console.log(`KO   requetes hors 127.0.0.1 :\n  ${[...new Set(violations)].join('\n  ')}`)
}
process.exit(echecs ? 1 : 0)
