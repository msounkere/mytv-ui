// US-46 (lot 10) : Ma liste, Reprendre, Vu, cartes et menus -- application complete contre le
// faux serveur (serveur-factice.mjs, contrat US-44 simule). Aucun vrai fournisseur, aucune
// requete hors 127.0.0.1. Scripts de depart : audit A/02b, B/03, C/03, C/05, C/07 (reutilises
// en verifications : un bug corrige = un test qui echouait avant).
//   npm run build && NODE_OPTIONS=--tls-max-v1.2 node tests/e2e/us46.mjs [scenario ...]
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { demarrerServeurFactice, COMPTE, MOT_DE_PASSE } from './serveur-factice.mjs'

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist')
const violations = []
/** Catalogue court : l'import n'est pas ce qu'on mesure ici. */
const TAILLE = { chaines: 20, films: 30, series: 6 }

const GABARITS = {
  bureau: { viewport: { width: 1360, height: 860 }, locale: 'fr-FR' },
  mobile: { viewport: { width: 390, height: 844 }, locale: 'fr-FR', isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
}

async function contexte(navigateur, gabarit = 'bureau') {
  const ctx = await navigateur.newContext(GABARITS[gabarit])
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
/** Navigation DANS l'application (routeur, sans rechargement) : les caches en memoire survivent. */
const naviguer = (page, chemin) => page.evaluate((c) => { history.pushState({}, '', c); dispatchEvent(new PopStateEvent('popstate')) }, chemin)

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
const ecrireIdb = (page, table, objet) =>
  page.evaluate(([t, o]) => new Promise((ok, ko) => {
    const r = indexedDB.open('mytv')
    r.onerror = () => ko(r.error)
    r.onsuccess = () => {
      const d = r.result
      const tx = d.transaction(t, 'readwrite')
      tx.objectStore(t).put(o)
      tx.oncomplete = () => { d.close(); ok(true) }
      tx.onerror = () => { d.close(); ko(tx.error) }
    }
  }), [table, objet])

async function seConnecter(page, { profilExistant = false } = {}) {
  await page.getByLabel('Identifiant').fill(COMPTE)
  await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  // Un seul profil existant : l'application le choisit d'elle-meme.
  if (!profilExistant) {
    await page.getByPlaceholder('Nom du profil').fill('Salon')
    await page.getByRole('button', { name: 'Créer et utiliser' }).click()
  }
}

async function scenario(navigateur, corps, { gabarit = 'bureau' } = {}) {
  const serveur = await demarrerServeurFactice({ dist: DIST, taille: TAILLE })
  const ctx = await contexte(navigateur, gabarit)
  try {
    const page = await ctx.newPage()
    const erreurs = []
    page.on('pageerror', (e) => erreurs.push(e.message))
    await page.goto(`${serveur.origine}/`)
    await seConnecter(page)
    await attendre(async () => (await lireIdb(page, 'reglages', 'catalogue.version'))?.valeur === serveur.etat.version, { quoi: 'import du catalogue', delai: 30_000 })
    const profil = serveur.etat.profils[0].id
    const outils = {
      serveur, page, ctx, profil, navigateur, gabarit,
      /** Liste du profil cote serveur : identifiants dans l'ordre. */
      liste: () => (serveur.etat.aVoir.get(profil) ?? []).map((e) => e.contenu),
      element: (id) => (serveur.etat.aVoir.get(profil) ?? []).find((e) => e.contenu === id),
      requetes: (f) => serveur.etat.requetes.filter(f),
      chemin: () => page.evaluate(() => location.pathname + location.search),
      reprise: (cle) => lireIdb(page, 'reprises', cle),
      semerReprise: (cle, position, duree, extra = {}) => ecrireIdb(page, 'reprises', { cle, position, duree, vuLe: Date.now() - (extra.age ?? 0), ...(extra.serie ? { serie: extra.serie } : {}) }),
      toast: () => page.locator('[data-role="toast"]'),
      menu: () => page.locator('[role="menu"]'),
      item: (nom) => page.locator('[role="menu"]').getByRole('menuitem', { name: nom, exact: true }),
      activer: async (loc) => (gabarit === 'mobile' ? loc.tap() : loc.click()),
      focus: () => page.evaluate(() => { const a = document.activeElement; return (a?.getAttribute('aria-label') || a?.textContent || a?.tagName || '').replace(/\s+/g, ' ').trim().slice(0, 60) }),
      texte: async (loc) => (await loc.innerText()).replace(/\s+/g, ' ').trim(),
    }
    await corps(outils)
    assert.deepEqual(erreurs, [], `erreurs de page : ${erreurs.join(' | ')}`)
  } finally {
    await ctx.close()
    await serveur.fermer()
  }
}

/** Deux films entames en base locale, puis l'Accueil : la rangee « Reprendre » a deux cartes. */
async function accueilAvecReprises({ page, serveur, semerReprise }) {
  await semerReprise('vod:iptva:5011', 300, 6000, { age: 2000 })
  await semerReprise('vod:iptva:5012', 400, 6000, { age: 1000 })
  await page.goto(`${serveur.origine}/`)
  const rangee = page.locator('section[aria-label="Reprendre"]')
  await rangee.waitFor()
  await attendre(async () => (await rangee.locator('[data-role="carte-reprise"]').count()) === 2, { quoi: '2 cartes Reprendre' })
  return rangee
}

const SCENARIOS = {
  // CA1 (A1, B2, C1, C2, A1bis, D11) : le menu « ⋯ » agit a la souris, au doigt et au clavier ;
  // Entree sur « ⋯ » n'ouvre PAS la lecture ; clic exterieur, Echap, focus.
  // Mutation : fermeture au pointerdown (ancien code) -> le clic souris n'agit plus -> rouge.
  async ca1MenuSouris(navigateur) {
    await scenario(navigateur, async (o) => {
      const { page, menu, item, toast, reprise, texte, chemin } = o
      const rangee = await accueilAvecReprises(o)
      const bouton = rangee.getByRole('button', { name: 'Plus d’options pour Film Test 12' })
      await bouton.click()
      await menu().waitFor()
      assert.deepEqual(await menu().getByRole('menuitem').allInnerTexts().then((l) => l.map((t) => t.trim())), ['Reprendre', 'Marquer comme vu', 'Retirer de Reprendre'], 'CA1 les trois entrees du modele cible')
      // Le menu est encore la pendant l'appui : il ne se ferme qu'au clic complet (C7 du rapport C : 07-menu-pointerdown).
      const b = await item('Marquer comme vu').boundingBox()
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
      await page.mouse.down()
      await pause(80)
      assert.equal(await menu().count(), 1, 'CA1 le menu reste ouvert au pointerdown sur une entree')
      await page.mouse.up()
      await attendre(async () => { const r = await reprise('vod:iptva:5012'); return r && r.position === r.duree }, { quoi: 'CA1 « Marquer comme vu » a la souris agit (reprise a la fin)' })
      await attendre(async () => (await menu().count()) === 0, { quoi: 'menu ferme apres le clic' })
      await attendre(async () => (await rangee.locator('[data-role="carte-reprise"]').count()) === 1, { quoi: 'la carte du film vu sort de Reprendre' })
      assert.match(await texte(toast()), /Film Test 12 marqué comme vu/, 'CA4 toast du geste')
      assert.equal(await chemin(), '/', 'aucune lecture lancee')

      // Clic exterieur : ferme sans agir.
      await rangee.getByRole('button', { name: 'Plus d’options pour Film Test 11' }).click()
      await menu().waitFor()
      await rangee.locator('h2').click()
      await attendre(async () => (await menu().count()) === 0, { quoi: 'CA1 clic exterieur ferme le menu' })
      assert.equal((await reprise('vod:iptva:5011')).position, 300, 'rien n a change')
      // Largeur adaptee au contenu : au moins 220 px, jamais plus de 90 vw (D11).
      await rangee.getByRole('button', { name: 'Plus d’options pour Film Test 11' }).click()
      const boite = await menu().boundingBox()
      assert.ok(boite.width >= 220 && boite.width <= 1360 * 0.9, `CA1 largeur du menu ${boite.width}`)
      assert.ok(boite.x >= 0 && boite.x + boite.width <= 1360, 'le menu reste dans la fenetre')
      await page.keyboard.press('Escape')
      await attendre(async () => (await menu().count()) === 0, { quoi: 'Echap ferme' })
    })
  },

  async ca1MenuTactile(navigateur) {
    await scenario(navigateur, async (o) => {
      const { page, menu, item, toast, reprise, texte } = o
      const rangee = await accueilAvecReprises(o)
      const bouton = rangee.getByRole('button', { name: 'Plus d’options pour Film Test 12' })
      const b = await bouton.boundingBox()
      assert.ok(b.width >= 44 && b.height >= 44, `CA1/CA2 bouton « ⋯ » de ${b.width}×${b.height} au doigt`)
      await bouton.tap()
      await menu().waitFor()
      await item('Retirer de Reprendre').tap()
      await attendre(async () => (await rangee.locator('[data-role="carte-reprise"]').count()) === 1, { quoi: 'CA1 « Retirer de Reprendre » au doigt agit' })
      assert.equal((await reprise('vod:iptva:5012')).position, 400, 'CA3 la position est conservee')
      assert.equal(await page.evaluate(() => location.pathname), '/', 'le tap n a pas atteint la carte dessous')
      assert.match(await texte(toast()), /Film Test 12 · retiré de Reprendre/, 'CA4 toast « Retiré de Reprendre »')
      await toast().getByRole('button', { name: 'Annuler' }).tap()
      await attendre(async () => (await rangee.locator('[data-role="carte-reprise"]').count()) === 2, { quoi: 'CA4 « Annuler » remet la carte' })
    }, { gabarit: 'mobile' })
  },

  async ca1MenuClavier(navigateur) {
    await scenario(navigateur, async (o) => {
      const { page, menu, reprise, focus, chemin } = o
      const rangee = await accueilAvecReprises(o)
      const bouton = rangee.getByRole('button', { name: 'Plus d’options pour Film Test 12' })
      await bouton.focus()
      await page.keyboard.press('Enter')
      await menu().waitFor()
      assert.equal(await chemin(), '/', 'CA1 Entree sur « ⋯ » n ouvre PAS la lecture (B2)')
      assert.equal(await focus(), 'Reprendre', 'CA1 le focus est sur la premiere entree')
      await page.keyboard.press('ArrowDown')
      assert.equal(await focus(), 'Marquer comme vu', 'CA1 ↓ passe a l entree suivante')
      await page.keyboard.press('ArrowDown')
      assert.equal(await focus(), 'Retirer de Reprendre')
      await page.keyboard.press('ArrowDown')
      assert.equal(await focus(), 'Reprendre', 'les fleches bouclent')
      await page.keyboard.press('ArrowUp')
      await page.keyboard.press('ArrowUp')
      assert.equal(await focus(), 'Marquer comme vu')
      await page.keyboard.press('Enter')
      await attendre(async () => { const r = await reprise('vod:iptva:5012'); return r && r.position === r.duree }, { quoi: 'CA1 Entree sur « Marquer comme vu » agit' })
      await attendre(async () => (await menu().count()) === 0, { quoi: 'menu ferme' })
      // Echap rend le focus a l'ancre.
      const autre = rangee.getByRole('button', { name: 'Plus d’options pour Film Test 11' })
      await autre.focus()
      await page.keyboard.press('Space')
      await menu().waitFor()
      await page.keyboard.press('Escape')
      await attendre(async () => (await menu().count()) === 0, { quoi: 'Echap ferme' })
      assert.equal(await focus(), 'Plus d’options pour Film Test 11', 'CA1 Echap rend le focus a « ⋯ »')
      // Tab (perte de focus) ferme aussi.
      await page.keyboard.press('Enter')
      await menu().waitFor()
      await page.keyboard.press('Tab')
      await attendre(async () => (await menu().count()) === 0, { quoi: 'CA1 la perte de focus ferme le menu' })
      assert.equal(await chemin(), '/')
    })
  },

  // CA2 (A UX8, C3, C4, C14, B UX2) : tap sur une carte = FICHE, partout ; « ⋯ » visible et
  // operant au doigt ; aucune requete de flux.
  async ca2CartesTelephone(navigateur) {
    await scenario(navigateur, async (o) => {
      const { page, serveur, requetes, chemin, menu, item, liste, toast, texte } = o
      const flux = () => requetes((r) => r.chemin.startsWith('/api/v1/vod/') && !r.chemin.endsWith('/disponibilite'))
      // Recherche.
      await page.goto(`${serveur.origine}/recherche?q=${encodeURIComponent('Film Test 3')}`)
      const carte = page.getByRole('button', { name: 'Film Test 3', exact: true }).first()
      await carte.waitFor()
      await carte.tap()
      await attendre(async () => (await chemin()) === '/film/vod:iptva:5003', { quoi: 'CA2 tap sur une carte de recherche = fiche' })
      assert.equal(flux().length, 0, 'CA2 aucune requete de flux')
      // Accueil : rangee « Films recemment ajoutes ».
      await page.goto(`${serveur.origine}/`)
      const rangee = page.locator('section[aria-label="Films récemment ajoutés"]')
      await rangee.waitFor()
      const premiere = rangee.getByRole('button', { name: /^Film Test \d+$/ }).first()
      const nom = await premiere.getAttribute('aria-label')
      await premiere.tap()
      await attendre(async () => /^\/film\/vod:iptva:\d+$/.test(await chemin()), { quoi: 'CA2 tap sur une carte de l accueil = fiche' })
      assert.equal(flux().length, 0, 'CA2 toujours aucune requete de flux')
      // « ⋯ » : visible sans survol, 44 px, et son menu ajoute a Ma liste.
      await page.goto(`${serveur.origine}/`)
      await rangee.waitFor()
      const plus = rangee.getByRole('button', { name: `Plus d’options pour ${nom}` })
      await plus.waitFor()
      const b = await plus.boundingBox()
      assert.ok(b && b.width >= 44 && b.height >= 44, `CA2 « ⋯ » visible, ${b?.width}×${b?.height}`)
      await plus.tap()
      await menu().waitFor()
      assert.deepEqual((await menu().getByRole('menuitem').allInnerTexts()).map((t) => t.trim()), ['Lecture', '+ Ma liste', 'Détails'], 'CA2 Lecture · + Ma liste · Détails')
      await item('+ Ma liste').tap()
      await attendre(() => liste().length === 1, { quoi: 'CA2 « + Ma liste » depuis le menu de la carte' })
      assert.match(await texte(toast()), /ajouté à Ma liste/, 'CA4 toast d ajout')
      assert.equal(await chemin(), '/', 'le tap sur l entree n a pas atteint la carte')
      // La carte dit maintenant « Retirer de Ma liste » et porte le badge de coin.
      await plus.tap()
      await menu().waitFor()
      assert.ok((await menu().getByRole('menuitem').allInnerTexts()).some((t) => /Retirer de Ma liste/.test(t)), 'CA2 l entree devient « Retirer de Ma liste »')
      await page.keyboard.press('Escape')
      await attendre(async () => (await rangee.locator('[data-role="badge-preparation"]').count()) >= 1, { quoi: 'CA2 badge de coin sur la carte ajoutee' })
      // Grille Films : tap = fiche, « ⋯ » present.
      await page.goto(`${serveur.origine}/films`)
      const affiche = page.locator('[data-role="menu-carte"]').first()
      await affiche.waitFor()
      await page.getByRole('button', { name: /^Film Test \d+/ }).first().tap()
      await attendre(async () => /^\/film\//.test(await chemin()), { quoi: 'CA2 tap sur une affiche de la grille = fiche' })
      assert.equal(flux().length, 0)
    }, { gabarit: 'mobile' })
  },

  async ca2CartesBureau(navigateur) {
    await scenario(navigateur, async (o) => {
      const { page, serveur, chemin, menu, focus } = o
      await page.goto(`${serveur.origine}/`)
      const rangee = page.locator('section[aria-label="Films récemment ajoutés"]')
      await rangee.waitFor()
      const carte = rangee.getByRole('button', { name: /^Film Test \d+$/ }).first()
      await carte.hover()
      // Survol bureau : ▶ et + en plus du « ⋯ » (36 px) ; aucune etoile (CA6).
      await carte.getByRole('button', { name: 'Lecture' }).waitFor()
      await carte.getByRole('button', { name: 'Ajouter à Ma liste' }).waitFor()
      assert.equal(await carte.getByRole('button', { name: /favoris/ }).count(), 0, 'CA6 plus d etoile sur les cartes')
      const plus = carte.getByRole('button', { name: /Plus d’options/ })
      const b = await plus.boundingBox()
      assert.ok(b.width >= 36 && b.height >= 36, `CA2 « ⋯ » de ${b.width}×${b.height} au bureau`)
      // Clavier : Entree sur « ⋯ » ouvre le menu, pas la fiche ni la lecture.
      await plus.focus()
      await page.keyboard.press('Enter')
      await menu().waitFor()
      assert.equal(await chemin(), '/', 'CA2 Entree sur « ⋯ » n ouvre rien d autre')
      assert.equal(await focus(), 'Lecture')
      await page.keyboard.press('Escape')
      // Clic sur l'affiche : la fiche.
      await carte.click()
      await attendre(async () => /^\/film\//.test(await chemin()), { quoi: 'CA2 clic = fiche' })
      // Entree sur l'affiche focalisee : la fiche aussi.
      await page.goto(`${serveur.origine}/`)
      await rangee.waitFor()
      await rangee.getByRole('button', { name: /^Film Test \d+$/ }).first().focus()
      await page.keyboard.press('Enter')
      await attendre(async () => /^\/film\//.test(await chemin()), { quoi: 'CA2 Entree sur l affiche = fiche' })
    })
  },

  // CA3 (C7, C16, B15, B16, C14) : la carte d'une serie pointe l'episode a lire et le LANCE ;
  // une serie reste tant qu'il reste un episode ; « Marquer comme vu » avance ; « Retirer »
  // cache sans effacer ; seuil 0,9 ; « reste 1 min ».
  // Mutation : seuil 0,95 (ancien) -> S01E01 a 92 % serait « entame » : legende et URL changent -> rouge.
  async ca3Reprendre(navigateur) {
    await scenario(navigateur, async (o) => {
      const { page, serveur, semerReprise, reprise, chemin, menu, item, toast, texte, requetes } = o
      // S01E01 vu a 92 % (entre les anciens seuils 90/95), un film a 45 s de la fin.
      await semerReprise('series:iptva:500111.mkv', 2208, 2400, { serie: 'series:iptva:s5001', age: 1000 })
      await semerReprise('vod:iptva:5005', 55, 100, { age: 2000 })
      await page.goto(`${serveur.origine}/`)
      const rangee = page.locator('section[aria-label="Reprendre"]')
      await rangee.waitFor()
      const carteSerie = () => rangee.locator('[data-role="carte-reprise"]', { hasText: 'Série Test 1' })
      await carteSerie().waitFor()
      assert.equal(await carteSerie().getAttribute('aria-label'), 'Reprendre Série Test 1, S01E02 · épisode suivant', 'CA3 S01E01 vu a 92 % : la carte pointe S01E02, « épisode suivant »')
      assert.match(await texte(rangee), /S01E02 · épisode suivant/, 'CA3 legende « S01E02 · épisode suivant »')
      assert.match(await texte(rangee), /reste 1 min/, 'CA3 « reste 1 min », jamais « 0 min »')
      assert.ok(!/0 min/.test(await texte(rangee)))
      assert.equal(await rangee.locator('h2').innerText(), 'Reprendre', 'CA3 rangee renommee')
      assert.equal(await page.locator('section[aria-label="Continuer à regarder"]').count(), 0)

      // L'episode entame : « S01E02 · reste 33 min ».
      await semerReprise('series:iptva:500112.mkv', 400, 2400, { serie: 'series:iptva:s5001' })
      await page.reload()
      await rangee.waitFor()
      await attendre(async () => /S01E02/.test(await texte(rangee)) && /reste 33 min/.test(await texte(rangee)), { quoi: 'CA3 « S01E02 · reste 33 min »' })

      // « Marquer comme vu » sur la serie : S01E02 marque, la carte passe a S01E03.
      await rangee.getByRole('button', { name: 'Plus d’options pour Série Test 1' }).click()
      await menu().waitFor()
      await item('Marquer comme vu').click()
      await attendre(async () => { const r = await reprise('series:iptva:500112.mkv'); return r && r.position === r.duree }, { quoi: 'CA3 S01E02 marque vu' })
      await attendre(async () => /S01E03 · épisode suivant/.test(await texte(rangee)), { quoi: 'CA3 la carte passe a S01E03' })
      assert.match(await texte(toast()), /✓ S01E02 marqué vu · Reprendre passe à S01E03/, 'CA4 toast « marqué vu · Reprendre passe à »')
      // « Annuler » du toast : S01E02 redevient entame, la carte revient dessus.
      await toast().getByRole('button', { name: 'Annuler' }).click()
      await attendre(async () => (await reprise('series:iptva:500112.mkv'))?.position === 400, { quoi: 'CA4 « Annuler » restaure la position' })
      await attendre(async () => /S01E02/.test(await texte(rangee)) && /reste 33 min/.test(await texte(rangee)), { quoi: 'la carte revient sur S01E02' })

      // « Retirer de Reprendre » : la carte disparait, les positions restent ; « Annuler » la remet.
      await rangee.getByRole('button', { name: 'Plus d’options pour Série Test 1' }).click()
      await menu().waitFor()
      await item('Retirer de Reprendre').click()
      await attendre(async () => (await carteSerie().count()) === 0, { quoi: 'CA3 serie retiree de Reprendre' })
      assert.equal((await reprise('series:iptva:500111.mkv')).position, 2208, 'CA3 positions conservees (S01E01)')
      assert.equal((await reprise('series:iptva:500112.mkv')).position, 400, 'CA3 positions conservees (S01E02)')
      assert.ok((await lireIdb(page, 'reprises_cachees', 'series:iptva:s5001')) !== undefined, 'la serie est cachee, pas effacee')
      await toast().getByRole('button', { name: 'Annuler' }).click()
      await attendre(async () => (await carteSerie().count()) === 1, { quoi: 'CA4 « Annuler » remet la carte' })

      // Tap = LECTURE de l'episode a lire (S01E02 entame), jamais la fiche.
      await carteSerie().click()
      await attendre(async () => (await chemin()) === '/lecture/series:iptva:500112.mkv', { quoi: 'CA3 la carte lance l episode a lire' })
      await attendre(() => requetes((r) => r.chemin === '/api/v1/vod/iptva:500112.mkv').length >= 1, { quoi: 'flux de S01E02 demande' })
    })
  },

  // CA4 (C UX1, UX3, UX8) : toasts avec « Annuler » pour l'ajout, le retrait, la sortie
  // automatique d'un titre vu (difference entre deux GET) et l'echec de preparation (« Réessayer »).
  async ca4Toasts(navigateur) {
    await scenario(navigateur, async (o) => {
      const { page, serveur, profil, liste, toast, texte, semerReprise } = o
      await page.goto(`${serveur.origine}/film/vod:iptva:5003`)
      const fiche = page.locator('[data-role="fiche-film"]')
      await fiche.getByRole('button', { name: 'Regarder' }).waitFor()
      await fiche.locator('[data-role="ma-liste"]').first().click()
      await attendre(() => liste().includes('vod:iptva:5003'), { quoi: 'ajoute' })
      await toast().waitFor()
      assert.equal(await texte(toast()), 'Film Test 3 · ajouté à Ma liste · préparation d’avance sur le serveur Annuler', 'CA4 toast d ajout')
      assert.equal(await toast().getAttribute('aria-live'), 'polite')
      // Un seul a la fois : le retrait remplace l'ajout, et « Annuler » refait l'ajout (PUT).
      await fiche.locator('[data-role="ma-liste"]').first().click()
      await attendre(() => !liste().includes('vod:iptva:5003'), { quoi: 'retire' })
      await attendre(async () => /retiré de Ma liste/.test(await texte(toast())), { quoi: 'CA4 toast de retrait' })
      assert.equal(await toast().count(), 1, 'CA4 un seul toast a la fois')
      await toast().getByRole('button', { name: 'Annuler' }).click()
      await attendre(() => liste().includes('vod:iptva:5003'), { quoi: 'CA4 « Annuler » refait le PUT' })
      await attendre(async () => (await toast().count()) === 0, { quoi: 'le toast se ferme apres « Annuler »' })
      // Le toast d'un geste silencieux (l'inverse) n'existe pas ; la fiche dit « Dans ma liste ».
      await attendre(async () => (await fiche.locator('[data-role="ma-liste"]').first().getAttribute('aria-pressed')) === 'true', { quoi: 'bouton presse' })
      // Duree : 6 s avec « Annuler » (un geste sans annulation possible : 4 s).
      await fiche.locator('[data-role="ma-liste"]').first().click()
      await toast().waitFor()
      await pause(4500)
      assert.equal(await toast().count(), 1, 'CA4 un toast annulable dure plus de 4 s')
      await pause(2200)
      assert.equal(await toast().count(), 0, 'CA4 ... et moins de 7 s')

      // Sortie automatique : le serveur retire un film VU au GET suivant -> toast « ✓ Vu · retiré », Annuler.
      await serveur.appel('a-voir', { profil, elements: [{ contenu: 'vod:iptva:5004' }, { contenu: 'vod:iptva:5006' }] })
      await serveur.appel('preparation', { contenu: 'vod:iptva:5006', reglage: { etat: 'attente' } })
      await page.goto(`${serveur.origine}/a-voir`)
      await attendre(async () => (await page.locator('[data-role="element-ma-liste"]').count()) === 2, { quoi: '2 lignes' })
      await semerReprise('vod:iptva:5004', 5900, 6000)
      await serveur.appel('a-voir', { profil, elements: [{ contenu: 'vod:iptva:5006' }] })
      await attendre(async () => /✓ Vu · Film Test 4 retiré de Ma liste/.test(await texte(toast())), { delai: 13_000, quoi: 'CA4 toast « Vu · retiré de Ma liste »' })
      await toast().getByRole('button', { name: 'Annuler' }).click()
      await attendre(() => liste().includes('vod:iptva:5004'), { quoi: 'CA4 « Annuler » remet le film dans la liste' })

      // Echec de preparation -> toast « Échec de préparation : Titre · Réessayer » -> POST .../reessayer.
      await serveur.appel('preparation', { contenu: 'vod:iptva:5006', reglage: { etat: 'echec', cause: 'disque plein' } })
      await attendre(async () => /Échec de préparation : Film Test 6/.test(await texte(toast())), { delai: 13_000, quoi: 'CA4 toast d echec' })
      await toast().getByRole('button', { name: 'Réessayer' }).click()
      await attendre(() => (serveur.etat.reessais ?? 0) >= 1, { quoi: 'CA4 POST /profil/a_voir/{id}/reessayer' })
      assert.ok(serveur.etat.requetes.some((r) => r.methode === 'POST' && r.chemin === '/api/v1/profil/a_voir/vod:iptva:5006/reessayer'))
    })
  },

  // CA5 (C 5.1, C 5.5, C8, C9, C UX15-26) : ecran « Ma liste » au bureau.
  async ca5EcranBureau(navigateur) {
    await scenario(navigateur, async (o) => {
      const { page, serveur, profil, liste, element, texte, menu, item, chemin, focus } = o
      await serveur.appel('preparation-auto', { actif: false })
      await serveur.appel('budget', { utilise: 4_509_715_660, total: 10_737_418_240 })
      await serveur.appel('a-voir', { profil, elements: [
        { contenu: 'vod:iptva:5003' }, { contenu: 'vod:iptva:5001' }, { contenu: 'serie:iptva:s5002', depuis: { saison: 1, episode: 2 } }, { contenu: 'vod:iptva:5006' }, { contenu: 'serie:iptva:s5003', episodes_avance: 3 },
      ] })
      await serveur.appel('preparation', { contenu: 'vod:iptva:5003', reglage: { etat: 'pret' } })
      await serveur.appel('preparation', { contenu: 'vod:iptva:5001', reglage: { etat: 'en_cours', octets: 420_000_000, total: 1_000_000_000, debit_kbps: 8000 } })
      await serveur.appel('preparation', { contenu: 'vod:iptva:5006', reglage: { etat: 'echec', cause: 'disque plein' } })
      await serveur.appel('preparation', { contenu: 'iptva:500212.mkv', reglage: { etat: 'pret' } })
      await serveur.appel('preparation', { contenu: 'iptva:500213.mkv', reglage: { etat: 'en_cours', octets: 100, total: 1000, debit_kbps: 1900 } })
      await serveur.appel('preparation', { contenu: 'iptva:500311.mkv', reglage: { etat: 'echec', cause: 'fournisseur injoignable' } })
      await page.goto(`${serveur.origine}/a-voir`)
      const lignes = () => page.locator('[data-role="element-ma-liste"]')
      await attendre(async () => (await lignes().count()) === 5, { quoi: '5 lignes' })
      await attendre(async () => (await texte(page.locator('[data-role="en-tete-ma-liste"]'))) === '5 titres · 2 prêts · 1 en préparation · 4,2 Go sur 10 Go', { quoi: 'CA5 en-tete « 5 titres · 2 prêts · 1 en préparation · 4,2 Go sur 10 Go »' })
      assert.equal(await page.locator('[data-role="ecran-ma-liste"] h1').innerText(), 'Ma liste')
      await attendre(async () => /Mis à jour il y a \d+ s/.test(await texte(page.locator('[data-role="ecran-ma-liste"] header'))), { quoi: 'CA5 « Mis à jour il y a N s »' })
      const chip = (i) => texte(lignes().nth(i).locator('[data-role="chip-preparation"]'))
      assert.equal(await chip(0), '● Prêt')
      assert.match(await chip(1), /^⟳ En préparation · 42 % · ~\d+ min$/, 'CA5 « ⟳ En préparation · 42 % · ~N min »')
      assert.equal(await chip(2), '● S01E02 prêt · S01E03 en préparation', 'CA5 une serie en une ligne')
      assert.equal(await chip(3), '✕ Échec · disque plein Réessayer', 'CA5 « ✕ Échec · disque plein » + Réessayer')
      assert.equal(await chip(4), '✕ S01E01 échec · fournisseur injoignable · S01E02 en attente Réessayer')
      assert.equal(await lignes().nth(2).locator('[data-role="chip-preparation"]').count(), 1, 'une seule ligne d etat pour la serie')
      assert.match(await texte(lignes().nth(2)), /dès S01E02/, 'le point de depart est dit')
      assert.match(await texte(lignes().nth(4)), /3 épisodes d’avance/)
      assert.equal(await lignes().nth(0).locator('[data-role="lire-ma-liste"]').getAttribute('aria-label'), 'Regarder')
      assert.equal(await lignes().nth(2).locator('[data-role="lire-ma-liste"]').getAttribute('aria-label'), 'Lire S01E02', 'CA5 « ▶ Lire S01E02 »')
      assert.equal(await page.locator('[data-role="poignee"]').count(), 5, 'poignee ⋮⋮')

      // Menu « ⋯ » d'un film : Monter · Descendre · Réessayer · Retirer, raccourcis annonces.
      await lignes().nth(3).locator('[data-role="menu-ma-liste"]').click()
      await menu().waitFor()
      const entrees = (await menu().getByRole('menuitem').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim())
      assert.deepEqual(entrees, ['Monter Alt+↑', 'Descendre Alt+↓', 'Réessayer', 'Retirer de Ma liste Suppr'], `CA5 menu d un film : ${entrees}`)
      await item('Réessayer').click()
      await attendre(() => (serveur.etat.reessais ?? 0) >= 1, { quoi: 'CA5 Réessayer -> POST' })
      // Menu d'une serie : Préparer N épisodes d'avance (−/+), À partir de…
      await lignes().nth(2).locator('[data-role="menu-ma-liste"]').click()
      await menu().waitFor()
      const libelles = (await menu().getByRole('menuitem').evaluateAll((l) => l.map((e) => e.getAttribute('aria-label') || e.textContent))).map((t) => t.replace(/\s+/g, ' ').trim())
      assert.ok(libelles.some((t) => t.startsWith('Préparer 2 (réglage du serveur) épisode')), `CA5 « Préparer 2 (réglage du serveur) épisodes d’avance » : ${libelles}`)
      assert.ok(libelles.some((t) => t.startsWith('À partir de')), 'CA5 « À partir de… »')
      await menu().locator('[data-role="menu-plus"]').click()
      await attendre(() => element('serie:iptva:s5002')?.episodes_avance === 3, { quoi: 'CA5 + -> episodes_avance = 3' })
      await attendre(async () => (await menu().count()) === 1 && /Préparer 3 épisodes/.test(await texte(menu())), { quoi: 'le menu reste ouvert et dit 3' })
      await menu().locator('select').selectOption('2:1')
      await attendre(() => element('serie:iptva:s5002')?.depuis?.saison === 2, { quoi: 'CA5 À partir de S02E01' })
      await page.keyboard.press('Escape')
      await attendre(async () => (await menu().count()) === 0, { quoi: 'Echap ferme le menu apres un choix' })
      // Bornes 1..5.
      await lignes().nth(4).locator('[data-role="menu-ma-liste"]').click()
      await menu().waitFor()
      await menu().locator('[data-role="menu-plus"]').click()
      await menu().locator('[data-role="menu-plus"]').click()
      await attendre(() => element('serie:iptva:s5003')?.episodes_avance === 5, { quoi: '5 au plus' })
      await attendre(async () => (await menu().locator('[data-role="menu-plus"]').isDisabled()), { quoi: 'CA5 + desactive a 5' })
      await page.keyboard.press('Escape')

      // Reordonner : menu « Monter », Alt+↑, glisser.
      const cles = async () => Promise.all((await lignes().all()).map((l) => l.getAttribute('data-cle')))
      await lignes().nth(1).locator('[data-role="menu-ma-liste"]').click()
      await menu().waitFor()
      await item('Monter').click()
      await attendre(async () => (await cles())[0] === 'vod:iptva:5001', { quoi: 'CA5 Monter' })
      await attendre(() => liste()[0] === 'vod:iptva:5001', { quoi: 'ordre synchronise' })
      await lignes().nth(2).focus()
      await page.keyboard.press('Alt+ArrowUp')
      await attendre(async () => (await cles())[1] === 'series:iptva:s5002', { quoi: 'CA5 Alt+↑' })
      await lignes().nth(4).dragTo(lignes().nth(0))
      await attendre(async () => (await cles())[0] === 'series:iptva:s5003', { quoi: 'CA5 glisser 5 -> 1' })
      // Entree = fiche ; Suppr = retirer (toast + Annuler).
      await lignes().nth(1).focus()
      assert.equal(await focus(), '2. Film Test 1')
      await page.keyboard.press('Enter')
      await attendre(async () => (await chemin()) === '/film/vod:iptva:5001', { quoi: 'CA5 Entree = fiche' })
      await page.goto(`${serveur.origine}/a-voir`)
      await attendre(async () => (await lignes().count()) === 5)
      await lignes().nth(0).focus()
      await page.keyboard.press('Delete')
      await attendre(async () => (await lignes().count()) === 4, { quoi: 'CA5 Suppr retire' })
      await attendre(() => !liste().includes('serie:iptva:s5003'), { quoi: 'DELETE synchronise' })
      await page.locator('[data-role="toast"]').getByRole('button', { name: 'Annuler' }).click()
      await attendre(async () => (await lignes().count()) === 5, { quoi: 'CA5 « Annuler » remet la ligne' })
      await attendre(() => liste().includes('serie:iptva:s5003'), { quoi: 'PUT de retour' })
      // Titre -> fiche.
      await lignes().nth(1).locator('[data-role="titre-ma-liste"]').click()
      await attendre(async () => /^\/(film|serie)\//.test(await chemin()), { quoi: 'CA5 titre = fiche' })

      // Rangee de l'Accueil : l'ORDRE de la liste, compteur « 5 · 2 prêts », badges de coin, legende conservee.
      await page.goto(`${serveur.origine}/`)
      const rangee = page.locator('section[aria-label="Ma liste"]')
      await rangee.waitFor()
      await attendre(async () => (await rangee.getByRole('button', { name: /^Film Test|^Série Test/ }).count()) === 5, { quoi: '5 cartes' })
      const titres = (await rangee.getByRole('button', { name: /^Film Test|^Série Test/ }).evaluateAll((l) => l.map((e) => e.getAttribute('aria-label'))))
      const attendu = liste().map((id) => (id.startsWith('vod:') ? `Film Test ${Number(id.split(':').pop()) - 5000}` : `Série Test ${Number(id.replace(/.*s/, '')) - 5000}`))
      assert.deepEqual(titres, attendu, 'CA5 rangee dans l ordre de la liste')
      // (La serie 2 part desormais de S02E01, en attente, et le film 6 a ete relance : il reste un seul pret.)
      assert.equal(await texte(rangee.locator('h2 + span')), '5 · 1 prêt', 'CA5 compteur « N · N prêts »')
      const badges = (await rangee.locator('[data-role="badge-preparation"]').allInnerTexts()).map((t) => t.trim())
      assert.deepEqual(badges.sort(), ['Prêt', 'En attente', 'En attente', '⟳ 42 %', '✕ Échec'].sort(), `CA5 badges de coin : ${badges}`)
      assert.match(await texte(rangee), /Film · 20\d\d/, 'CA5 la legende (type · annee) reste')
      assert.equal(await rangee.locator('section[aria-label="Reprendre"]').count(), 0)
      // « Reprendre » vient AVANT « Ma liste » quand elle existe (verifie dans ca3 : ordre des sections).
      const sections = await page.locator('main section[aria-label]').evaluateAll((l) => l.map((e) => e.getAttribute('aria-label')))
      assert.ok(sections.indexOf('Ma liste') < sections.indexOf('Chaînes récemment regardées') || sections.indexOf('Chaînes récemment regardées') < 0)
      assert.ok(!sections.includes('Films et séries favoris'), 'CA6 rangee des favoris supprimee')

      // Etat vide.
      await serveur.appel('a-voir', { profil, elements: [] })
      await page.goto(`${serveur.origine}/a-voir`)
      await attendre(async () => (await page.locator('[data-role="ma-liste-vide"]').count()) === 1, { delai: 13_000, quoi: 'etat vide' })
      assert.match(await texte(page.locator('[data-role="ma-liste-vide"]')), /^Votre liste est vide\. Ajoutez un film ou une série avec “\+ Ma liste”/, 'CA5 etat vide du modele cible')
      assert.equal(await texte(page.locator('[data-role="en-tete-ma-liste"]')), 'Votre liste est vide')
    })
  },

  async ca5EcranTelephone(navigateur) {
    await scenario(navigateur, async (o) => {
      const { page, serveur, profil, ctx, texte, menu, item, chemin } = o
      await serveur.appel('preparation-auto', { actif: false })
      await serveur.appel('budget', { utilise: 4_509_715_660, total: 10_737_418_240 })
      await serveur.appel('a-voir', { profil, elements: [{ contenu: 'vod:iptva:5003' }, { contenu: 'vod:iptva:5001' }, { contenu: 'serie:iptva:s5002' }, { contenu: 'vod:iptva:5006' }] })
      await serveur.appel('preparation', { contenu: 'vod:iptva:5003', reglage: { etat: 'attente', raison: 'lecture_en_cours' } })
      await serveur.appel('preparation', { contenu: 'vod:iptva:5001', reglage: { etat: 'en_cours', octets: 420_000_000, total: 1_000_000_000, debit_kbps: 8000 } })
      await serveur.appel('preparation', { contenu: 'vod:iptva:5006', reglage: { etat: 'echec', cause: 'disque plein' } })
      await serveur.appel('preparation', { contenu: 'iptva:500211.mkv', reglage: { etat: 'pret' } })
      await page.goto(`${serveur.origine}/a-voir`)
      const lignes = () => page.locator('[data-role="element-ma-liste"]')
      await attendre(async () => (await lignes().count()) === 4, { quoi: '4 lignes' })
      await attendre(async () => (await texte(page.locator('[data-role="en-tete-ma-liste"]'))) === '4 · 1 prêt · 4,2/10 Go', { quoi: 'CA5 en-tete court du telephone' })
      const chip = (i) => texte(lignes().nth(i).locator('[data-role="chip-preparation"]'))
      assert.equal(await chip(0), '○ En attente · lecture en cours', 'CA5 raison de l attente (US-44 CA1)')
      assert.match(await chip(1), /^⟳ 42 % · ~\d+ min$/, 'CA5 phrase courte « ⟳ 42 % · ~6 min »')
      assert.equal(await chip(2), '● S01E01 prêt · suivant ○', 'CA5 serie courte « ● S01E01 prêt · suivant ○ »')
      assert.equal(await chip(3), '✕ Échec · disque plein Réessayer')
      // Une ligne par titre : pas de bouton Regarder ni Monter/Descendre a plat, un seul « ⋯ » de 44 px.
      assert.equal(await lignes().nth(0).locator('[data-role="lire-ma-liste"]').count(), 0, 'CA5 telephone : pas de bouton a plat')
      const plus = lignes().nth(0).locator('[data-role="menu-ma-liste"]')
      const b = await plus.boundingBox()
      assert.ok(b.width >= 44 && b.height >= 44, `« ⋯ » de ${b.width}×${b.height}`)
      const h = (await lignes().nth(0).boundingBox()).height
      assert.ok(h <= 120, `CA5 une ligne de ${h} px (pas deux ecrans pour cinq titres)`)
      await plus.tap()
      await menu().waitFor()
      const entrees = (await menu().getByRole('menuitem').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim())
      assert.deepEqual(entrees, ['Regarder', 'Monter Alt+↑', 'Descendre Alt+↓', 'Retirer de Ma liste Suppr'], `CA5 menu telephone : ${entrees}`)
      await item('Descendre').tap()
      await attendre(async () => (await lignes().nth(1).getAttribute('data-cle')) === 'vod:iptva:5003', { quoi: 'CA5 reordonne par le menu' })
      // Tap sur la ligne (titre) = fiche.
      await lignes().nth(0).locator('[data-role="titre-ma-liste"]').tap()
      await attendre(async () => (await chemin()) === '/film/vod:iptva:5001', { quoi: 'CA5 tap = fiche' })
      // Hors ligne : bandeau sur l'ecran.
      const t0 = Date.now()
      await page.goto(`${serveur.origine}/a-voir`)
      await lignes().first().waitFor()
      // L'heure du bandeau est celle de la derniere reception : on attend qu'une ait eu lieu apres le rechargement.
      await attendre(() => o.requetes((r) => r.chemin === '/api/v1/profil/a_voir' && r.methode === 'GET' && r.t > t0).length >= 1, { quoi: 'une reception' })
      await pause(400)
      await ctx.setOffline(true)
      await attendre(async () => (await page.locator('[data-role="bandeau-hors-ligne"]').count()) === 1, { delai: 14_000, quoi: 'CA5 bandeau hors ligne' })
      assert.match(await texte(page.locator('[data-role="bandeau-hors-ligne"]')), /^Hors ligne — états du \d\d:\d\d ; vos changements partiront au retour du réseau\.$/, 'CA5 bandeau du modele cible')
      await ctx.setOffline(false)
    }, { gabarit: 'mobile' })
  },

  // CA6 (C UX9, US-44 CA6, A rangee favoris) : favoris reserves aux chaines ; « + Ma liste » sur
  // « À la une » et les grilles ; la synchro ignore les favoris non-chaines, le serveur refuse (422).
  async ca6Favoris(navigateur) {
    await scenario(navigateur, async (o) => {
      const { page, serveur, profil, liste, menu, item, chemin, requetes } = o
      await serveur.appel('favoris', { profil, ids: ['iptva:5000', 'iptva:s5001', 'iptva:100000'] })
      await page.reload()
      const favorites = page.locator('section[aria-label="Mes chaînes favorites"]')
      await favorites.waitFor({ timeout: 20_000 })
      await attendre(async () => ((await lireIdb(page, 'favoris')) ?? []).length === 1, { quoi: 'CA6 la synchro n a garde que la chaine' })
      assert.deepEqual((await lireIdb(page, 'favoris')).map((f) => f.cle), ['live:iptva:100000'])
      assert.equal(await page.locator('section[aria-label="Films et séries favoris"]').count(), 0, 'CA6 rangee supprimee')
      // « À la une » : « + Ma liste », pas d'etoile.
      const une = page.locator('section[aria-label="À la une"]')
      await une.waitFor()
      assert.equal(await une.getByRole('button', { name: /favoris/ }).count(), 0, 'CA6 plus d etoile sur « À la une »')
      await une.getByRole('button', { name: 'Ajouter à Ma liste' }).click()
      await attendre(() => liste().length === 1, { quoi: 'CA6 « + Ma liste » sur « À la une »' })
      await attendre(async () => (await une.getByRole('button', { name: 'Retirer de Ma liste' }).count()) === 1, { quoi: 'CA6 « ✓ Dans ma liste »' })
      // Grille Films : « ⋯ » -> « + Ma liste ».
      await page.goto(`${serveur.origine}/films`)
      // La 4e affiche : la premiere est le film de « À la une », deja dans la liste.
      const plus = page.locator('[data-role="menu-carte"]').nth(3)
      await plus.waitFor()
      await plus.click()
      await menu().waitFor()
      await item('+ Ma liste').click()
      await attendre(() => liste().length === 2, { quoi: 'CA6 « + Ma liste » depuis la grille Films' })
      await page.goto(`${serveur.origine}/series`)
      await page.locator('[data-role="menu-carte"]').first().waitFor()
      await page.locator('[data-role="menu-carte"]').first().click()
      await menu().waitFor()
      assert.deepEqual((await menu().getByRole('menuitem').allInnerTexts()).map((t) => t.trim()), ['+ Ma liste', 'Détails'], 'CA6 une serie : pas de « Lecture » directe')
      await item('Détails').click()
      await attendre(async () => /^\/serie\//.test(await chemin()), { quoi: 'Détails = fiche' })
      // Un favori de film n'est jamais envoye (et serait refuse 422).
      assert.equal(requetes((r) => r.chemin.startsWith('/api/v1/profil/favoris/iptva:5')).length, 0, 'CA6 aucun PUT/DELETE de favori pour un film')
      const r = await fetch(`${serveur.origine}/api/v1/profil/favoris/iptva:5000`, { method: 'PUT', headers: { cookie: `mytv=${[...serveur.etat.sessions.keys()][0]}` } })
      assert.equal(r.status, 422, 'le faux serveur implemente le 422 du contrat US-44')
      assert.equal((await r.json()).code, 'favori_chaines_seulement')
    })
  },

  // CA7 (C10, C17, C UX4, C UX27) : trois phrases de la sonde, debit en detail, cache invalide par « Prêt ».
  async ca7Sonde(navigateur) {
    await scenario(navigateur, async (o) => {
      const { page, serveur, profil, requetes, liste, texte } = o
      const sondes = (id) => requetes((r) => r.chemin === `/api/v1/vod/${id}/disponibilite`)
      await serveur.appel('disponibilite', { id: 'iptva:5001', reponse: { etat: 'lent', debit_kbps: 2700, requis_kbps: 4400 } })
      await serveur.appel('disponibilite', { id: 'iptva:5002', reponse: { etat: 'immediat', debit_kbps: 12000 } })
      await page.goto(`${serveur.origine}/film/vod:iptva:5001`)
      const ligne = page.locator('[data-role="fiche-film"] [data-role="disponibilite"]')
      await ligne.waitFor()
      assert.equal(await texte(ligne), 'Risque de coupures — préparer d’avance ? 2,7 Mbit/s mesurés pour 4,4 nécessaires Ma liste', 'CA7 phrase humaine, debit en detail, « + Ma liste »')
      assert.equal(await ligne.locator('[data-role="ma-liste"]').getAttribute('aria-label'), 'Ajouter à Ma liste')
      assert.ok(!/^Lent/.test(await texte(ligne)))
      await naviguer(page, '/film/vod:iptva:5002')
      await attendre(async () => (await ligne.getAttribute('data-etat')) === 'immediat', { quoi: 'fiche du film 2' })
      assert.equal(await texte(ligne), 'Lecture fluide 12 Mbit/s mesurés', 'CA7 « Lecture fluide »')
      // Retour sur la fiche du film 1 dans l'application : le cache de 10 min evite une seconde sonde.
      await naviguer(page, '/film/vod:iptva:5001')
      await attendre(async () => (await ligne.getAttribute('data-etat')) === 'lent', { quoi: 'fiche du film 1' })
      await pause(500)
      assert.equal(sondes('iptva:5001').length, 1, 'une seule sonde pour ce film (cache 10 min)')
      // Le fichier devient pret cote serveur : la fiche dit « Prêt » SANS resonder (cache de 10 min invalide par l'etat).
      await serveur.appel('a-voir', { profil, elements: [{ contenu: 'vod:iptva:5001' }] })
      await serveur.appel('preparation', { contenu: 'vod:iptva:5001', reglage: { etat: 'pret' } })
      await naviguer(page, '/a-voir')
      await attendre(async () => (await page.locator('[data-role="element-ma-liste"][data-etat="pret"]').count()) === 1, { delai: 13_000, quoi: 'pret recu' })
      await page.locator('[data-role="titre-ma-liste"]').click()
      await ligne.waitFor()
      assert.equal(await texte(ligne), '● Prêt · préparé sur le serveur', 'CA7 « ● Prêt · préparé sur le serveur » : le cache « lent » est invalide par l etat')
      assert.equal(sondes('iptva:5001').length, 1, 'CA7 aucune nouvelle sonde pour un fichier pret')
      assert.ok(liste().includes('vod:iptva:5001'))
    })
  },

  // CA8 (A10, A9, D18) : la synchro de l'historique invalide la recommandation ; « À la une »
  // apparait apres l'import sans rechargement ; « Tout voir » des favorites = Direct filtre.
  async ca8Synchro(navigateur) {
    await scenario(navigateur, async (o) => {
      const { page, serveur, profil, chemin, navigateur: nav } = o
      // (A9) « Tout voir » des chaines favorites.
      await serveur.appel('favoris', { profil, ids: ['iptva:100000', 'iptva:100001'] })
      await page.reload()
      const favorites = page.locator('section[aria-label="Mes chaînes favorites"]')
      await favorites.waitFor({ timeout: 20_000 })
      await favorites.getByRole('button', { name: 'Tout voir' }).click()
      await attendre(async () => (await chemin()) === '/direct?favoris=1', { quoi: 'CA8 « Tout voir » ouvre le Direct filtre sur les favorites' })

      // (A10, D18) Nouvel appareil, profil existant, historique cote serveur : l'Accueil se monte
      // pendant l'import ; « À la une » ET « Parce que vous avez regardé » apparaissent sans rechargement.
      await serveur.appel('historique', { profil, contenu: 'iptva:5000', position: 120, duree: 6000 })
      const ctx2 = await contexte(nav)
      try {
        const p2 = await ctx2.newPage()
        const erreurs = []
        p2.on('pageerror', (e) => erreurs.push(e.message))
        await p2.goto(`${serveur.origine}/`)
        await seConnecter(p2, { profilExistant: true })
        await attendre(async () => (await lireIdb(p2, 'reglages', 'catalogue.version'))?.valeur === serveur.etat.version, { quoi: 'import', delai: 30_000 })
        await attendre(async () => (await p2.locator('section[aria-label="À la une"]').count()) === 1, { quoi: 'CA8 « À la une » apres l import, sans rechargement (D18)' })
        assert.equal(await p2.getByText('Rien à mettre à la une').count(), 0, 'CA8 jamais « Rien à mettre à la une » apres un import reussi')
        await attendre(async () => (await p2.locator('section[aria-label^="Parce que vous avez regardé"]').count()) === 1, { quoi: 'CA8 « Parce que vous avez regardé » des la synchro de l historique (A10)' })
        assert.match(await p2.locator('section[aria-label^="Parce que vous avez regardé"] h2').innerText(), /Film Test 0/)
        assert.deepEqual(erreurs, [])
      } finally {
        await ctx2.close()
      }
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
