// Parcours de l'interface contre le faux serveur (serveur-factice.mjs).
//
// REGLES : aucune requete hors 127.0.0.1 (toute tentative echoue le test),
// aucun vrai fournisseur, navigateurs toujours fermes. Usage :
//   npm run build && node tests/e2e/us19.mjs [nom-de-scenario ...]
// CHARGE=1 ajoute le test de volume (catalogue realiste) avec mesure du temps.
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { demarrerServeurFactice, COMPTE, MOT_DE_PASSE } from './serveur-factice.mjs'

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist')
const violations = []

// --- Outils -------------------------------------------------------------------

async function contexte(navigateur, serveur) {
  const ctx = await navigateur.newContext({ viewport: { width: 1360, height: 860 } })
  // Garde-fou : tout ce qui n'est pas 127.0.0.1 est refuse ET consigne. Les
  // images du faux catalogue pointent volontairement vers un hote inexistant.
  await ctx.route('**/*', (route) => {
    const u = new URL(route.request().url())
    if (u.hostname === '127.0.0.1') return route.continue()
    if (u.protocol === 'data:' || u.protocol === 'blob:') return route.continue()
    violations.push(route.request().url())
    return route.abort()
  })
  ctx.setDefaultTimeout(15_000)
  return ctx
}

async function nouvellePage(ctx, serveur) {
  const page = await ctx.newPage()
  const erreurs = []
  page.on('pageerror', (e) => erreurs.push(e.message))
  page.erreurs = erreurs
  await page.goto(`${serveur.origine}/`)
  return page
}

/** Lecture brute d'IndexedDB (la base Dexie `mytv`), sans passer par l'application. */
const lireIdb = (page, table, cle) =>
  page.evaluate(
    ([t, c]) =>
      new Promise((ok, ko) => {
        const r = indexedDB.open('mytv')
        r.onerror = () => ko(r.error)
        r.onsuccess = () => {
          const base = r.result
          if (!base.objectStoreNames.contains(t)) { base.close(); return ok(undefined) }
          const st = base.transaction(t).objectStore(t)
          const q = c === undefined ? st.getAll() : st.get(c)
          q.onsuccess = () => { base.close(); ok(q.result) }
          q.onerror = () => { base.close(); ko(q.error) }
        }
      }),
    [table, cle],
  )

const compterIdb = (page, table) =>
  page.evaluate(
    (t) =>
      new Promise((ok, ko) => {
        const r = indexedDB.open('mytv')
        r.onerror = () => ko(r.error)
        r.onsuccess = () => {
          const base = r.result
          const q = base.transaction(t).objectStore(t).count()
          q.onsuccess = () => { base.close(); ok(q.result) }
          q.onerror = () => { base.close(); ko(q.error) }
        }
      }),
    table,
  )

const ecrireIdb = (page, table, valeur) =>
  page.evaluate(
    ([t, v]) =>
      new Promise((ok, ko) => {
        const r = indexedDB.open('mytv')
        r.onerror = () => ko(r.error)
        r.onsuccess = () => {
          const base = r.result
          const tx = base.transaction(t, 'readwrite')
          tx.objectStore(t).put(v)
          tx.oncomplete = () => { base.close(); ok() }
          tx.onerror = () => ko(tx.error)
        }
      }),
    [table, valeur],
  )

async function attendre(condition, { delai = 15_000, pas = 100, quoi = 'condition' } = {}) {
  const debut = Date.now()
  for (;;) {
    const v = await condition()
    if (v) return v
    if (Date.now() - debut > delai) throw new Error(`delai depasse : ${quoi}`)
    await new Promise((r) => setTimeout(r, pas))
  }
}

async function seConnecter(page, { profil = 'Salon', creer = true } = {}) {
  await page.getByLabel('Identifiant').fill(COMPTE)
  await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  if (creer) {
    await page.getByPlaceholder('Nom du profil').fill(profil)
    await page.getByRole('button', { name: 'Créer et utiliser' }).click()
  }
}

const catalogueComplet = (page, serveur) => async () => {
  // Version d'abord (une lecture) : compter 70 000 lignes a chaque sondage
  // ralentirait l'import qu'on mesure.
  const v = await lireIdb(page, 'reglages', 'catalogue.version')
  if (v?.valeur !== serveur.etat.version) return false
  const n = await compterIdb(page, 'catalogue')
  const t = serveur.etat.catalogue
  return v?.valeur === serveur.etat.version && n === t.live.length + t.vod.length + t.series.length
}

const exportsPar = (serveur) => {
  const c = {}
  for (const r of serveur.etat.requetes)
    if (r.chemin === '/api/v1/catalogue/export') {
      const t = new URLSearchParams(r.requete).get('type')
      c[t] = (c[t] ?? 0) + 1
    }
  return c
}

const requetesVers = (serveur, methode, debut) =>
  serveur.etat.requetes.filter((r) => r.methode === methode && r.chemin.startsWith(debut))

/** Ouvre un serveur, un navigateur, une page de connexion ; ferme tout a la fin. */
async function scenario(navigateur, options, corps) {
  const serveur = await demarrerServeurFactice({ dist: DIST, ...options })
  const ctx = await contexte(navigateur, serveur)
  try {
    const page = await nouvellePage(ctx, serveur)
    await corps({ serveur, ctx, page, navigateur })
    assert.deepEqual(page.erreurs, [], `erreurs de page : ${page.erreurs.join(' | ')}`)
  } finally {
    await ctx.close()
    await serveur.fermer()
  }
}

// --- Scenarios ----------------------------------------------------------------

const SCENARIOS = {
  // CA1 : connexion, session par cookie, deconnexion, pas de secret cote client.
  async connexion(navigateur) {
    await scenario(navigateur, {}, async ({ serveur, page }) => {
      await page.getByRole('button', { name: 'Se connecter' }).waitFor()
      await page.getByLabel('Identifiant').fill(COMPTE)
      await page.getByLabel('Mot de passe').fill('mauvais')
      await page.getByRole('button', { name: 'Se connecter' }).click()
      await page.getByText('Identifiant ou mot de passe incorrect.').waitFor()

      await seConnecter(page)
      await page.getByRole('button', { name: 'Réglages' }).waitFor()

      // Le jeton est HttpOnly : invisible de tout JavaScript.
      assert.equal(await page.evaluate(() => document.cookie), '')
      // Aucun secret ni dans les URL, ni dans le stockage du navigateur.
      for (const r of serveur.etat.requetes)
        assert.ok(!(r.chemin + r.requete).includes(MOT_DE_PASSE) && !(r.chemin + r.requete).includes(COMPTE), `secret dans l'URL ${r.chemin}`)
      const stockage = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }))
      assert.ok(!stockage.includes(MOT_DE_PASSE), 'mot de passe en stockage local')

      // Session conservee au rechargement (cookie), sans nouvelle saisie.
      await page.reload()
      await page.getByRole('button', { name: 'Réglages' }).waitFor()

      await page.getByRole('button', { name: 'Réglages' }).click()
      await page.getByRole('button', { name: 'Se déconnecter' }).first().click()
      await page.getByRole('button', { name: 'Se connecter' }).waitFor()
      assert.equal(serveur.etat.sessions.size, 0, 'session non revoquee cote serveur')
    })
  },

  // US-16b : le nom du compte vient du serveur quand il le donne (sinon : nom saisi).
  async nom(navigateur) {
    await scenario(navigateur, {}, async ({ serveur, page }) => {
      await serveur.appel('session-nom', { actif: true })
      await seConnecter(page)
      await page.getByRole('button', { name: 'Réglages' }).waitFor()
      // Stockage local perdu, cookie intact : le nom revient du serveur, pas du navigateur.
      await page.evaluate(() => localStorage.removeItem('mytv.compte'))
      await page.reload()
      await page.getByRole('button', { name: 'Réglages' }).click()
      await page.getByText(COMPTE, { exact: true }).first().waitFor()
    })
  },

  // CA2 : import en bloc, progression, ETag inchange = aucune donnee, nouvelle version.
  async import(navigateur) {
    await scenario(navigateur, { latenceChunk: 80 }, async ({ serveur, page }) => {
      await seConnecter(page)
      // La barre de progression doit passer par une valeur intermediaire.
      const parts = new Set()
      await attendre(async () => {
        const w = await page.getByTestId('bandeau-import-barre').evaluate((e) => e.style.width).catch(() => null)
        if (w) parts.add(w)
        return await catalogueComplet(page, serveur)()
      }, { delai: 30_000, pas: 30, quoi: 'import complet' })
      assert.ok([...parts].some((w) => parseInt(w) > 0 && parseInt(w) < 100), `pas de progression visible : ${[...parts]}`)
      assert.deepEqual(exportsPar(serveur), { categories: 1, live: 1, vod: 1, series: 1 })
      assert.equal((await lireIdb(page, 'categories')).length, serveur.etat.catalogue.categories.length)
      // Les compteurs de categories sont calcules a l'import.
      const comptes = (await lireIdb(page, 'categories')).filter((c) => c.type === 'vod').reduce((n, c) => n + c.compte, 0)
      assert.equal(comptes, serveur.etat.catalogue.vod.length)
      // Une entree : cle locale type:idServeur, pays separe du nom, categorie serveur.
      const chaine = await lireIdb(page, 'catalogue', 'live:iptva:100000')
      assert.equal(chaine.idServeur, 'iptva:100000')
      assert.equal(chaine.pays, 'FR')
      assert.equal(chaine.nom, 'Chaîne 0')
      assert.equal(chaine.lecture, '/api/v1/live/100000.m3u8')

      // Incremental : meme version => le manifeste repond 304, AUCUNE donnee.
      await serveur.lire('vider-requetes')
      await page.reload()
      await page.getByRole('button', { name: 'Réglages' }).waitFor()
      await attendre(() => requetesVers(serveur, 'GET', '/api/v1/catalogue/version').length > 0, { quoi: 'manifeste' })
      await page.waitForTimeout(1500)
      assert.deepEqual(exportsPar(serveur), {}, 'des donnees ont ete retelechargees alors que la version n\'a pas change')
      assert.ok(requetesVers(serveur, 'GET', '/api/v1/catalogue/version').every((r) => r.inm), 'manifeste sans If-None-Match')

      // Nouvelle version : 5 films retires, 3 ajoutes => la base locale suit.
      await serveur.appel('nouvelle-version', { retirerFilms: 5, ajouterFilms: 3 })
      await serveur.appel('latence', { ms: 0 })
      await page.reload()
      await attendre(catalogueComplet(page, serveur), { quoi: 'reimport apres nouvelle version' })
      assert.equal(await lireIdb(page, 'catalogue', 'vod:iptva:5000'), undefined, 'film retire encore present')
      assert.ok(await lireIdb(page, 'catalogue', 'vod:iptva:90000'), 'film ajoute absent')

      // Reimport force depuis les Reglages : meme version, mais les donnees repartent.
      await serveur.lire('vider-requetes')
      await page.getByRole('button', { name: 'Réglages' }).click()
      await page.getByRole('button', { name: 'Réimporter tout' }).click()
      await attendre(() => exportsPar(serveur).vod === 1, { quoi: 'reimport force' })
    })
  },

  // CA2 : reprise sur erreur (coupure en plein flux), au type pres.
  async reprise(navigateur) {
    await scenario(navigateur, {}, async ({ serveur, page }) => {
      await serveur.appel('echec-export', { type: 'vod', apres: 200 })
      await seConnecter(page)
      await attendre(catalogueComplet(page, serveur), { delai: 30_000, quoi: 'import apres coupure' })
      const e = exportsPar(serveur)
      assert.equal(e.live, 1, `les chaines ont ete retelechargees : ${JSON.stringify(e)}`)
      assert.equal(e.series, 1)
      assert.equal(e.vod, 2, 'le type interrompu doit etre repris une fois')
    })
  },

  // CA3 : recherche, facettes et listes avec les nouveaux identifiants.
  async recherche(navigateur) {
    await scenario(navigateur, {}, async ({ serveur, page }) => {
      await seConnecter(page)
      await attendre(catalogueComplet(page, serveur), { quoi: 'import' })
      await page.goto(`${serveur.origine}/recherche?q=${encodeURIComponent('Film Test 12')}`)
      await page.getByText('Film Test 12', { exact: true }).first().waitFor()
      await page.goto(`${serveur.origine}/films`)
      await page.getByText('Film Test 1', { exact: false }).first().waitFor()
      await page.goto(`${serveur.origine}/direct`)
      await page.getByText('Chaîne 1', { exact: false }).first().waitFor()
      await page.goto(`${serveur.origine}/series`)
      await page.getByText('Série Test 1', { exact: false }).first().waitFor()
    })
  },

  // CA4 : favoris/historique par profil, hors-ligne, autre machine.
  async etat(navigateur) {
    await scenario(navigateur, {}, async ({ serveur, ctx, page }) => {
      await seConnecter(page)
      await attendre(catalogueComplet(page, serveur), { quoi: 'import' })
      // Lot 10 : les favoris ne concernent plus que les CHAINES (US-44 CA6) ; le
      // geste part du lecteur d'une chaine (bouton « Ajouter aux favoris », touche F).
      await page.goto(`${serveur.origine}/lecture/live:iptva:100000`)
      const bouton = page.getByRole('button', { name: 'Ajouter aux favoris' }).first()
      await bouton.waitFor()
      await bouton.click()
      const favoris = () => serveur.etat.favoris.get('p1') ?? []
      await attendre(() => favoris().length === 1, { delai: 8000, quoi: 'PUT favori' })
      const id = favoris()[0]
      assert.equal(id, 'iptva:100000', 'le serveur doit recevoir l identifiant fournisseur:numero de la chaine')

      // Une autre machine (autre contexte, memes identifiants) retrouve le favori.
      const ctx2 = await contexte(navigateur, serveur)
      try {
        const page2 = await nouvellePage(ctx2, serveur)
        await seConnecter(page2, { creer: false })
        await page2.getByText('Salon').click()
        await page2.getByRole('button', { name: 'Réglages' }).waitFor()
        await attendre(catalogueComplet(page2, serveur), { quoi: 'import 2' })
        await attendre(async () => (await lireIdb(page2, 'favoris'))?.some((f) => f.cle.endsWith(id)), { delai: 20_000, quoi: 'favori recu' })

        // Hors-ligne : le geste est garde, rien ne part, puis tout part au retour du reseau.
        await ctx.setOffline(true)
        await page.getByRole('button', { name: 'Retirer des favoris' }).first().click()
        await page.waitForTimeout(3500)
        assert.equal(favoris().length, 1, 'le retrait ne doit pas atteindre le serveur hors ligne')
        assert.ok((await lireIdb(page, 'journal')).length > 0, 'le geste hors ligne doit rester au journal')
        assert.equal((await lireIdb(page, 'favoris')).length, 0, 'l\'etat local doit refleter le geste immediatement')
        await ctx.setOffline(false)
        await page.evaluate(() => window.dispatchEvent(new Event('online')))
        await attendre(() => favoris().length === 0, { delai: 10_000, quoi: 'DELETE au retour du reseau' })
        // Le journal se vide APRES la reponse du serveur : on attend, on ne suppose pas.
        await attendre(async () => (await lireIdb(page, 'journal')).length === 0, { delai: 5000, quoi: 'journal vide apres envoi' })
        // Et l'autre machine le voit disparaitre.
        await page2.evaluate(() => window.dispatchEvent(new Event('online')))
        await attendre(async () => (await lireIdb(page2, 'favoris')).length === 0, { delai: 10_000, quoi: 'retrait propage' })
        assert.deepEqual(page2.erreurs, [])
      } finally {
        await ctx2.close()
      }

      // Historique : ouvrir un film l'inscrit cote serveur sous son identifiant.
      await page.goto(`${serveur.origine}/lecture/vod:iptva:5003`)
      await attendre(() => (serveur.etat.historique.get('p1')?.has('iptva:5003')), { delai: 10_000, quoi: 'PUT historique' })

      // Position de reprise : ecrite localement (comme le fait le lecteur), elle part au serveur...
      const cleFilm = 'vod:iptva:5004'
      await ecrireIdb(page, 'historique', { cle: cleFilm, ouvertLe: Date.now() })
      await ecrireIdb(page, 'reprises', { cle: cleFilm, position: 120, duree: 3000, vuLe: Date.now() })
      await ecrireIdb(page, 'journal', { genre: 'reprise', cle: cleFilm, maj: Date.now(), supprime: 0 })
      await page.evaluate(() => window.dispatchEvent(new Event('online')))
      await attendre(() => {
        const h = serveur.etat.historique.get('p1')?.get('iptva:5004')
        return h && h.position === 120 && h.duree === 3000
      }, { delai: 10_000, quoi: 'PUT position de reprise' })
      // ... et celle posee depuis une autre machine revient.
      await serveur.appel('historique', { profil: 'p1', contenu: 'iptva:5005', position: 50, duree: 1000 })
      await page.evaluate(() => window.dispatchEvent(new Event('online')))
      await attendre(async () => {
        const r = await lireIdb(page, 'reprises', 'vod:iptva:5005')
        return r && r.position === 50 && r.duree === 1000
      }, { delai: 10_000, quoi: 'reprise recue du serveur' })

      // Episode : le serveur EXIGE la serie parente (le faux serveur renvoie 400 sinon).
      await page.goto(`${serveur.origine}/serie/${encodeURIComponent('series:iptva:s5000')}`)
      await page.getByText('Épisode 2').first().click()
      await attendre(() => [...(serveur.etat.historique.get('p1')?.values() ?? [])].some((h) => h.serie === 'iptva:s5000' && h.contenu.endsWith('.mkv')), { delai: 10_000, quoi: 'PUT historique episode avec serie' })
    })
  },

  // CA4 : conflit de revision des reglages => fusion puis nouvel essai.
  async conflit(navigateur) {
    await scenario(navigateur, {}, async ({ serveur, page }) => {
      await seConnecter(page)
      await attendre(catalogueComplet(page, serveur), { quoi: 'import' })
      // Premiere synchronisation faite : la base de fusion existe.
      await attendre(async () => (await lireIdb(page, 'reglages', 'synchro.reglages.p1')) !== undefined, { quoi: 'base de fusion' })
      const avant = requetesVers(serveur, 'PUT', '/api/v1/profil/reglages').length
      // Cette machine epingle une categorie ; PENDANT ce temps, une autre en epingle une autre.
      await ecrireIdb(page, 'reglages', { cle: 'epingles.live', valeur: ['live:iptva:100'] })
      await serveur.appel('conflit-prochain-put', { profil: 'p1', valeurs: { 'epingles.live': JSON.stringify(['live:iptva:101']), theme: 'light' } })
      await page.evaluate(() => window.dispatchEvent(new Event('online')))
      await attendre(() => {
        const v = serveur.etat.reglages.get('p1')?.valeurs['epingles.live']
        return v && JSON.parse(v).includes('live:iptva:100') && JSON.parse(v).includes('live:iptva:101')
      }, { delai: 12_000, quoi: 'fusion des epingles sur le serveur' })
      assert.ok(requetesVers(serveur, 'PUT', '/api/v1/profil/reglages').length - avant >= 2, 'un 409 puis un nouvel essai etaient attendus')
      const local = (await lireIdb(page, 'reglages', 'epingles.live')).valeur.sort()
      assert.deepEqual(local, ['live:iptva:100', 'live:iptva:101'], 'l\'etat local doit recevoir la fusion')
      // Le theme choisi ailleurs est applique ici.
      await attendre(() => page.evaluate(() => document.documentElement.dataset.theme === 'light'), { quoi: 'theme distant applique' })
    })
  },

  // CA5 : profils (creation, choix, changement, suppression) et cloisonnement de l'etat.
  async profils(navigateur) {
    await scenario(navigateur, {}, async ({ serveur, page }) => {
      await seConnecter(page)
      await attendre(catalogueComplet(page, serveur), { quoi: 'import' })
      // Un film et une serie de meme numero (5001 / s5001) : le type vient du
      // catalogue. Lot 10 : par Ma liste (les favoris ne sont plus que des chaines).
      await serveur.appel('a-voir', { profil: 'p1', elements: [{ contenu: 'vod:iptva:5001' }, { contenu: 'serie:iptva:s5001' }] })
      await page.evaluate(() => window.dispatchEvent(new Event('online')))
      await attendre(async () => (await lireIdb(page, 'a_voir'))?.length === 2, { delai: 10_000, quoi: 'Ma liste du profil 1' })
      assert.deepEqual((await lireIdb(page, 'a_voir')).map((f) => f.cle).sort(), ['series:iptva:s5001', 'vod:iptva:5001'])
      const listeDe = (profil) => (serveur.etat.aVoir.get(profil) ?? []).map((e) => e.contenu)

      await page.getByRole('button', { name: 'Réglages' }).click()
      await page.getByLabel('Nom du nouveau profil').fill('Enfants')
      await page.getByRole('button', { name: 'Ajouter' }).click()
      await page.getByTestId('liste-profils').getByText('Enfants').waitFor()
      await page.getByTestId('liste-profils').locator('div', { hasText: 'Enfants' }).getByRole('button', { name: 'Utiliser' }).click()
      await attendre(() => requetesVers(serveur, 'PUT', '/api/v1/compte/profil-actif').length >= 1, { quoi: 'PUT profil-actif' })
      // L'etat du profil precedent ne fuit pas dans le nouveau.
      await attendre(async () => (await lireIdb(page, 'a_voir')).length === 0, { delai: 10_000, quoi: 'Ma liste vide pour le profil 2' })
      assert.deepEqual(listeDe('p1'), ['vod:iptva:5001', 'serie:iptva:s5001'], 'le profil 1 ne doit pas etre touche')
      assert.ok(!listeDe('p2').length, 'rien ne doit avoir ete pousse dans le profil 2')
      // Retour au profil 1 par le menu du profil : sa liste revient du serveur.
      await page.locator('.entete-bouton-profil').click()
      await page.getByRole('menuitemradio', { name: 'Salon' }).click()
      await attendre(async () => (await lireIdb(page, 'a_voir'))?.length === 2, { delai: 10_000, quoi: 'Ma liste du profil 1 restauree' })
      // Suppression du profil 2 : dialogue de l'application (US-47 CA5), plus de confirm().
      await page.getByRole('button', { name: 'Réglages' }).click()
      await page.getByRole('button', { name: 'Supprimer le profil Enfants' }).click()
      await page.getByRole('dialog', { name: /Supprimer le profil/ }).getByRole('button', { name: 'Supprimer' }).click()
      await attendre(() => serveur.etat.profils.length === 1, { quoi: 'profil supprime' })
    })
  },

  // Session expiree : retour a la connexion, par evenement et par 401 de synchro.
  async session(navigateur) {
    await scenario(navigateur, {}, async ({ serveur, page }) => {
      await seConnecter(page)
      await page.getByRole('button', { name: 'Réglages' }).waitFor()
      await serveur.lire('expirer-sessions')
      await page.evaluate(() => window.dispatchEvent(new Event('mytv:session-expiree')))
      await page.getByRole('button', { name: 'Se connecter' }).waitFor()

      // Reconnexion : le profil n'a pas ete perdu, et la 401 d'un appel ordinaire suffit.
      await seConnecter(page, { creer: false })
      await page.getByText('Salon').click()
      await page.getByRole('button', { name: 'Réglages' }).waitFor()
      await serveur.lire('expirer-sessions')
      await page.evaluate(() => window.dispatchEvent(new Event('online')))
      await page.getByRole('button', { name: 'Se connecter' }).waitFor()
    })
  },

  // Migration : une base de l'ancienne version (cles numeriques) est videe, pas melangee.
  async migration(navigateur) {
    const serveur = await demarrerServeurFactice({ dist: DIST })
    const ctx = await contexte(navigateur, serveur)
    try {
      const page = await ctx.newPage()
      page.erreurs = []
      page.on('pageerror', (e) => page.erreurs.push(e.message))
      // Page vierge de la meme origine : on y fabrique la base « version 3 » de l'ancienne interface.
      await page.goto(`${serveur.origine}/img/vide.png`)
      await page.evaluate(() => new Promise((ok, ko) => {
        const r = indexedDB.open('mytv', 30) // Dexie multiplie ses versions par 10
        r.onerror = () => ko(r.error)
        r.onupgradeneeded = () => {
          const db = r.result
          const t = (nom, opts, idx) => { const st = db.createObjectStore(nom, opts); for (const [n, k] of idx) st.createIndex(n, k); return st }
          t('catalogue', { keyPath: 'cle' }, [['type', 'type'], ['categorie', 'categorie'], ['[type+categorie]', ['type', 'categorie']], ['nom', 'nom'], ['[type+ajouteLe]', ['type', 'ajouteLe']], ['[type+note]', ['type', 'note']]])
          t('categories', { keyPath: 'cle' }, [['type', 'type'], ['[type+masquee]', ['type', 'masquee']]])
          t('favoris', { keyPath: 'cle' }, [['ajouteLe', 'ajouteLe']])
          t('reprises', { keyPath: 'cle' }, [['vuLe', 'vuLe']])
          t('historique', { keyPath: 'cle' }, [['ouvertLe', 'ouvertLe']])
          t('reglages', { keyPath: 'cle' }, [])
          t('journal', { keyPath: 'n', autoIncrement: true }, [['[genre+cle]', ['genre', 'cle']]])
        }
        r.onsuccess = () => {
          const db = r.result
          const tx = db.transaction(['catalogue', 'favoris', 'reglages'], 'readwrite')
          tx.objectStore('catalogue').put({ cle: 'live:123', type: 'live', id: 123, nom: 'Ancienne chaine', recherche: 'x' })
          tx.objectStore('favoris').put({ cle: 'live:123', ajouteLe: 1 })
          tx.objectStore('reglages').put({ cle: 'dernierImport', valeur: 1 })
          tx.oncomplete = () => { db.close(); ok() }
        }
      }))
      await page.goto(`${serveur.origine}/`)
      await seConnecter(page)
      await attendre(catalogueComplet(page, serveur), { quoi: 'import apres migration' })
      assert.equal(await lireIdb(page, 'catalogue', 'live:123'), undefined, 'ancienne entree encore presente')
      assert.equal((await lireIdb(page, 'favoris')).length, 0, 'ancien favori encore present')
      assert.deepEqual(page.erreurs, [])
    } finally {
      await ctx.close()
      await serveur.fermer()
    }
  },

  // Service arrete pendant la connexion : on le DIT, on propose de reessayer.
  async injoignable(navigateur) {
    const serveur = await demarrerServeurFactice({ dist: DIST })
    const ctx = await contexte(navigateur, serveur)
    let ferme = false
    try {
      const page = await nouvellePage(ctx, serveur)
      await page.getByRole('button', { name: 'Se connecter' }).waitFor()
      await serveur.fermer()
      ferme = true
      await page.getByLabel('Identifiant').fill(COMPTE)
      await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE)
      await page.getByRole('button', { name: 'Se connecter' }).click()
      await page.getByText('Service injoignable').waitFor()
      await page.getByRole('button', { name: 'Réessayer' }).waitFor()
    } finally {
      await ctx.close()
      if (!ferme) await serveur.fermer()
    }
  },
}

if (process.env.CHARGE) {
  SCENARIOS.charge = async (navigateur) => {
    // CHARGE_TAILLE='{"chaines":22000,"films":107000,"series":25686}' rejoue la
    // mesure de reference de l'import complet (154 686 entrees, US-36 CA5).
    const taille = process.env.CHARGE_TAILLE ? JSON.parse(process.env.CHARGE_TAILLE) : { chaines: 25_000, films: 40_000, series: 5_000 }
    await scenario(navigateur, { taille }, async ({ serveur, page }) => {
      const t0 = Date.now()
      await seConnecter(page)
      await attendre(catalogueComplet(page, serveur), { delai: 120_000, pas: 200, quoi: 'import volumineux' })
      const ms = Date.now() - t0
      console.log(`  charge : ${(taille.chaines + taille.films + taille.series).toLocaleString('fr-FR')} entrees importees en ${ms} ms`)
    })
  }
}

// --- Execution ----------------------------------------------------------------

const demandes = process.argv.slice(2)
const noms = demandes.length ? demandes : Object.keys(SCENARIOS)
const navigateur = await chromium.launch()
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
