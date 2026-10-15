// Recette de non-regression de l'etape 2 : tout ce que le passage des 22
// `createResource` a TanStack Query ne doit pas avoir casse.
//
// AUCUN FLUX N'EST OUVERT. Les chemins de lecture sont coupes a la racine par
// `garde-flux.mjs` ; le lecteur est bien monte, mais sa source est refusee avant
// d'atteindre le reseau -- c'est la seule facon d'eprouver ses raccourcis et le
// mini-lecteur sans prendre la connexion unique de l'abonnement.
import { chromium } from 'playwright'
import { couperLesFlux, connecter } from './garde-flux.mjs'

const BASE = 'http://localhost:5173/app'
let reussis = 0
let echoues = 0
const dire = (ok, titre, detail = '') => {
  if (ok) reussis++
  else echoues++
  console.log(`  ${ok ? 'OK   ' : 'ECHEC'} ${titre}${detail ? ` — ${detail}` : ''}`)
}

const ctx = await chromium.launchPersistentContext(process.env.PROFIL, {
  viewport: { width: 1440, height: 900 },
})
const page = ctx.pages()[0] ?? (await ctx.newPage())
const plantages = []
page.on('pageerror', (e) => plantages.push(String(e).slice(0, 200)))
await couperLesFlux(page)

const texte = () => page.evaluate(() => document.querySelector('main')?.innerText ?? '')
const chemin = () => new URL(page.url()).pathname
const base = (f, arg) => (arg === undefined ? page.evaluate(f) : page.evaluate(f, arg))

await page.goto(`${BASE}/`, { waitUntil: 'load' })
// Sur un profil neuf la page de connexion s'affiche d'abord : se connecter
// AVANT d'attendre la navigation, qui n'existe pas tant qu'on est dehors.
await connecter(page)
await page.waitForSelector('nav[aria-label="Navigation principale"]', { timeout: 30000 })
await page.waitForTimeout(4000)

// ── 1. Authentification ────────────────────────────────────────────────────
console.log('\n=== 1. authentification ===')
const biscuits = await ctx.cookies()
dire(biscuits.some((c) => c.name === 'mytv_session'), 'cookie mytv_session pose')
await page.reload({ waitUntil: 'load' })
await page.waitForSelector('nav[aria-label="Navigation principale"]', { timeout: 30000 })
await page.waitForTimeout(3500)
dire((await page.locator('input[type="password"]').count()) === 0, 'la session survit au rechargement')

// ── 2. Donnees en base ─────────────────────────────────────────────────────
console.log('\n=== 2. catalogue et guide ===')
const comptes = await base(async () => {
  const ouvrir = (n) => new Promise((r) => { const q = indexedDB.open(n); q.onsuccess = () => r(q.result) })
  const compter = (db, t) => new Promise((r) => {
    try { const q = db.transaction(t).objectStore(t).count(); q.onsuccess = () => r(q.result) } catch { r(-1) }
  })
  const a = await ouvrir('mytv')
  const b = await ouvrir('mytv-epg')
  return {
    catalogue: await compter(a, 'catalogue'),
    programmes: await compter(b, 'programmes'),
    chaines: await compter(b, 'chaines'),
  }
})
dire(comptes.catalogue === 154106, `catalogue : ${comptes.catalogue} entrees`)
dire(comptes.programmes > 190000, `guide EPG : ${comptes.programmes} programmes sur ${comptes.chaines} chaines`)

await page.getByRole('button', { name: /^Guide$/ }).first().click()
await page.waitForTimeout(5000)
const tGuide = await texte()
dire(/chaîne\(s\) affichée/.test(tGuide), 'le Guide annonce ses chaines', (tGuide.match(/\d[\d\s\u00a0\u202f]*chaîne\(s\) affichée\(s\)[^\n]*/) ?? [''])[0].trim())
dire(/programmes/.test(tGuide), 'le Guide annonce ses programmes')

// ── 3. Films et Series : compteurs, filtres, tri, squelette ────────────────
console.log('\n=== 3. filtres, tri et squelette de Films/Series ===')
await page.getByRole('button', { name: /^Films$/ }).first().click()
await page.waitForTimeout(4000)
// Les compteurs sont formates par Intl : le separateur de milliers est une
// espace INSECABLE etroite, pas une espace ordinaire.
const CHIFFRES = /(\d[\d\s\u00a0\u202f]*)\s*(?:films?|séries?|catégories|chaînes?)/
const nbDe = (t) => Number((t.match(CHIFFRES) ?? ['', '0'])[1].replace(/[^\d]/g, ''))
const totalFilms = nbDe(await texte())
dire(totalFilms > 100000, `compteur de films : ${totalFilms}`)

await page.getByRole('button', { name: /^Séries$/ }).first().click()
await page.waitForTimeout(4000)
const totalSeries = nbDe(await texte())
dire(totalSeries > 20000 && totalSeries < 40000, `compteur de series : ${totalSeries}`)

await page.getByRole('button', { name: /^Films$/ }).first().click()
await page.waitForTimeout(3500)
dire(nbDe(await texte()) === totalFilms, 'le compteur de films est retrouve apres la bascule')

// Squelette de 320 ms : il doit apparaitre puis disparaitre.
const squelette = await page.evaluate(async () => {
  const zone = document.querySelector('main')
  let vu = false
  const obs = new MutationObserver(() => {
    if (zone.querySelector('[aria-busy="true"]')) vu = true
  })
  obs.observe(zone, { childList: true, subtree: true, attributes: true })
  globalThis.__squelette = () => { obs.disconnect(); return vu }
  return true
})
dire(squelette, 'observateur du squelette arme')

// Un genre, puis le tri alphabetique.
await page.getByRole('button', { name: /Genre/ }).first().click()
await page.waitForTimeout(400)
const premierGenre = page.locator('[role="option"]').first()
const nomGenre = (await premierGenre.innerText()).split('\n')[0]
await premierGenre.click()
await page.waitForTimeout(1200)
await page.keyboard.press('Escape')
await page.waitForTimeout(600)
const apresGenre = nbDe(await texte())
dire(apresGenre > 0 && apresGenre < totalFilms, `filtre « ${nomGenre} » : ${apresGenre} films sur ${totalFilms}`)
dire(await page.evaluate(() => globalThis.__squelette()), 'le squelette de 320 ms est passe')

// L'infobulle d'une affiche porte « <titre> — ajouté le … » : c'est le seul
// `title` de la grille qui designe le CONTENU et non l'etoile des favoris.
const premiereAffiche = () => page.locator('main [title*="ajouté le"]').first().getAttribute('title')
const titreAvantTri = await premiereAffiche()
await page.locator('[aria-label="Trier par"] button[title*="Titre"]').first().click()
await page.waitForTimeout(2000)
const titreApresTri = await premiereAffiche()
dire(titreAvantTri !== titreApresTri, 'le tri « Titre (A–Z) » change la premiere affiche',
     `${String(titreAvantTri).slice(0, 28)} → ${String(titreApresTri).slice(0, 28)}`)

await page.getByRole('button', { name: /^Effacer$|Tout effacer|Effacer les filtres/ }).first().click().catch(() => {})
await page.waitForTimeout(1200)

// ── 4. Direct : modes, categorie, defilement memorise ─────────────────────
console.log('\n=== 4. Direct : modes et defilement ===')
await page.getByRole('button', { name: /^Direct$/ }).first().click()
await page.waitForTimeout(4000)
const tDirect = await texte()
dire(/catégories/.test(tDirect), 'la colonne annonce ses categories',
     (tDirect.match(/\d[\d\s\u00a0\u202f]*catégories/) ?? [''])[0].trim())
dire(/chaîne/.test(tDirect), 'la liste annonce ses chaines',
     (tDirect.match(/\d[\d\s\u00a0\u202f]*chaînes?[^\n]*/) ?? [''])[0].trim())

// La colonne des categories defile AUSSI : on l'ecarte, sinon sa position
// masquerait celle de la liste de chaines, qui est ce qu'on mesure.
// Trois pieges cumules : la colonne des categories defile AUSSI (on l'ecarte,
// sinon sa position masquerait celle de la liste de chaines), et les ecrans
// preserves restent MONTES derriere celui qu'on regarde -- la zone de l'Accueil
// est donc toujours la, scrollable, et `visibility: hidden`.
const ZONES = `[...document.querySelectorAll('main div')].filter((e) => {
  const s = getComputedStyle(e)
  return (s.overflowY === 'auto' || s.overflowY === 'scroll')
    && s.visibility !== 'hidden'
    && e.scrollHeight > e.clientHeight + 50 && !e.closest('aside')
})`
const zoneY = () => page.evaluate(`(${ZONES}).map((e) => e.scrollTop)`)
const defiler = (y) => page.evaluate(`{ const z = ${ZONES}; for (const e of z) e.scrollTop = ${y}; z.length }`)
const colonneEnHaut = () => page.evaluate(
  `for (const e of document.querySelectorAll('aside div')) e.scrollTop = 0`,
)

await defiler(900)
await page.waitForTimeout(700)
const yAvant = await zoneY()
await page.getByRole('button', { name: /^Accueil$/ }).first().click()
await page.waitForTimeout(2500)
await page.getByRole('button', { name: /^Direct$/ }).first().click()
await page.waitForTimeout(3000)
const yApres = await zoneY()
dire(yApres.some((y) => y > 400), 'le defilement de Direct est retrouve au retour',
     `${JSON.stringify(yAvant)} → ${JSON.stringify(yApres)}`)

// Les segments sont des `role=radio`, pas des boutons : ils se designent par
// leur infobulle dans le groupe du mode d'affichage.
const segment = (nom) => page.locator(`[aria-label="Mode d’affichage"] button[title="${nom}"]`).first()
for (const mode of ['Cartes', 'Liste']) {
  await segment(mode).click()
  await page.waitForTimeout(2800)
  dire(/chaîne/.test(await texte()), `mode ${mode} peuple`)
}

// « par categorie ET par mode » : la position de Liste ne doit pas suivre
// Cartes, et se retrouver au retour.
await defiler(1200)
await page.waitForTimeout(800)
await segment('Cartes').click()
await page.waitForTimeout(2500)
const yCartes = Math.max(0, ...(await zoneY()))
await segment('Liste').click()
await page.waitForTimeout(2800)
const yListe = Math.max(0, ...(await zoneY()))
dire(yListe > 400 && yCartes < 400, 'le defilement est memorise par MODE',
     `Cartes a ${yCartes}px, retour sur Liste a ${yListe}px`)

await segment('Guide TV').click()
await page.waitForTimeout(2500)
dire(chemin().endsWith('/guide'), 'le mode « Guide TV » mene a l ecran Guide', chemin())
await page.getByRole('button', { name: /^Direct$/ }).first().click()
await page.waitForTimeout(2500)

// ── 5. Epingles et categories masquees ────────────────────────────────────
console.log('\n=== 5. epingles et categories masquees ===')
const etatPrefs = () => base(async () => {
  const { db } = await import('/app/src/lib/db.ts')
  return {
    epingles: (await db.reglages.get('epingles.live'))?.valeur ?? [],
    masquees: (await db.categories.where('[type+masquee]').equals(['live', 1]).toArray()).map((c) => c.cle),
  }
})
const prefsAvant = await etatPrefs()
// La colonne est virtualisee : une section hors de la fenetre visible n'est pas
// dans le DOM, et l'assertion ne mesurerait que le defilement laisse plus haut.
await colonneEnHaut()
await page.waitForTimeout(600)
// La DEUXIEME ligne, pas la premiere : « Masquer la catégorie » porte sur la
// categorie ACTIVE, qui est la premiere de la colonne. Epingler puis masquer la
// meme categorie la fait disparaitre des deux listes -- ce qui est juste, mais
// ne prouve rien sur la persistance de l'epingle.
const epingler = page.getByRole('button', { name: /^Épingler / }).nth(1)
const nomEpingle = (await epingler.getAttribute('aria-label')) ?? ''
await epingler.click()
await page.waitForTimeout(1200)
dire(/épinglées/i.test(await texte()), `la section « Épinglées » apparait (${nomEpingle})`)
const prefsApres = await etatPrefs()
dire(prefsApres.epingles.length === prefsAvant.epingles.length + 1,
     'l epingle est ecrite en base', JSON.stringify(prefsApres.epingles))

const masquer = page.getByRole('button', { name: 'Masquer la catégorie' }).first()
const nbCat = (t) => Number((t.match(/(\d[\d\s\u00a0\u202f]*)\s*catégories/) ?? ['', '0'])[1].replace(/[^\d]/g, ''))
const nbCatAvant = nbCat(await texte())
await masquer.click()
await page.waitForTimeout(1800)
const nbCatApres = nbCat(await texte())
dire(nbCatApres === nbCatAvant - 1, `masquer retire la categorie de la colonne : ${nbCatAvant} → ${nbCatApres}`)
dire(/masquée/.test(await texte()), 'le rappel « Afficher les N masquées » est la')

await page.reload({ waitUntil: 'load' })
await page.waitForSelector('nav[aria-label="Navigation principale"]', { timeout: 30000 })
await page.waitForTimeout(4500)
await colonneEnHaut()
await page.waitForTimeout(600)
const prefsRelues = await etatPrefs()
dire(prefsRelues.epingles.length === prefsApres.epingles.length, 'les epingles survivent au rechargement')
dire(prefsRelues.masquees.length > prefsAvant.masquees.length, 'le masquage survit au rechargement')
// Attente et non instantane : au demarrage la colonne lit la base, et la
// section n'existe qu'une fois les 358 categories groupees.
const repeinte = await page.waitForFunction(
  () => /épinglées/i.test(document.querySelector('main')?.innerText ?? ''),
  null, { timeout: 15000 },
).then(() => true).catch(() => false)
dire(repeinte, 'la section « Épinglées » est repeinte au demarrage')

// On remet la colonne comme on l'a trouvee.
await page.getByRole('button', { name: /^Désépingler / }).first().click().catch(() => {})
await page.waitForTimeout(800)
await base(async (cles) => {
  const { db } = await import('/app/src/lib/db.ts')
  for (const c of await db.categories.where('[type+masquee]').equals(['live', 1]).toArray())
    if (!cles.includes(c.cle)) await db.categories.update(c.cle, { masquee: 0 })
}, prefsAvant.masquees)

// ── 6. Favori : vu SANS rechargement sur un autre ecran ───────────────────
console.log('\n=== 6. favori repercute sans rechargement (invalidation) ===')
await page.getByRole('button', { name: /^Films$/ }).first().click()
await page.waitForTimeout(4000)
const favorisAvant = await base(async () => {
  const { db } = await import('/app/src/lib/db.ts')
  return db.favoris.count()
})
// On pose le favori par la VRAIE fonction, comme le fait la touche « f » du
// lecteur : c'est le chemin qui doit maintenant perimer les lectures.
const posee = await base(async () => {
  const { db } = await import('/app/src/lib/db.ts')
  const p = await import('/app/src/lib/preferences.ts')
  const candidats = await db.catalogue.where('type').equals('vod').limit(60).toArray()
  let film
  for (const c of candidats) if (!(await db.favoris.get(c.cle))) { film = c; break }
  await p.basculerFavori(film.cle)
  return { cle: film.cle, nom: film.nom }
})
await page.waitForTimeout(1500)
const favorisApres = await base(async () => {
  const { db } = await import('/app/src/lib/db.ts')
  return db.favoris.count()
})
dire(favorisApres !== favorisAvant, `favori basculé en base : ${favorisAvant} → ${favorisApres}`)
await page.getByRole('button', { name: /^Accueil$/ }).first().click()
await page.waitForTimeout(3500)
dire((await texte()).includes(posee.nom.slice(0, 18)),
     'l Accueil montre le favori sans avoir ete remonte', posee.nom.slice(0, 40))
// Remise en etat.
await base(async (cle) => {
  const p = await import('/app/src/lib/preferences.ts')
  await p.basculerFavori(cle)
}, posee.cle)
await page.waitForTimeout(1200)

// ── 7. Recherche : raccourci « / », panneau, page, lien profond ───────────
console.log('\n=== 7. recherche et suggestions ===')
await page.keyboard.press('/')
await page.waitForTimeout(400)
dire(await page.evaluate(() => document.activeElement?.closest('.entete-recherche') !== null),
     'la touche « / » donne le focus au champ de l en-tete')
await page.keyboard.type('tf1', { delay: 40 })
await page.waitForSelector('[aria-label="Suggestions de recherche"] [role="option"]', { timeout: 15000 })
const nbSugg = await page.locator('[aria-label="Suggestions de recherche"] [role="option"]').count()
dire(nbSugg > 0, `le panneau de suggestions rend ${nbSugg} lignes`)
await page.keyboard.press('ArrowDown')
await page.waitForTimeout(250)
dire((await page.locator('[aria-label="Suggestions de recherche"] [aria-selected="true"]').count()) > 0,
     'la fleche bas deplace la selection dans le panneau')
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
dire((await page.locator('[aria-label="Suggestions de recherche"]').count()) === 0,
     'Échap ferme le panneau de suggestions')

await page.goto(`${BASE}/recherche?q=walking`, { waitUntil: 'load' })
await page.waitForTimeout(5000)
dire(/résultats? ·/.test(await texte()), 'lien profond /recherche?q= rend ses resultats',
     ((await texte()).match(/[^\n]*résultats? ·[^\n]*/) ?? [''])[0].trim())

// ── 8. Routeur : liens profonds et bouton retour ──────────────────────────
console.log('\n=== 8. routeur et liens profonds ===')
for (const [url, marqueur] of [['/films', /films?/i], ['/series', /séries?/i], ['/guide', /chaîne\(s\) affichée/], ['/direct', /catégories/]]) {
  await page.goto(`${BASE}${url}`, { waitUntil: 'load' })
  await page.waitForTimeout(5000)
  dire(marqueur.test(await texte()) && chemin().endsWith(url), `lien profond ${url}`)
}
await page.getByRole('button', { name: /^Films$/ }).first().click()
await page.waitForTimeout(2500)
await page.goBack()
await page.waitForTimeout(2500)
dire(chemin().endsWith('/direct'), 'le bouton retour du navigateur revient sur Direct', chemin())

// ── 9. Lecteur : raccourcis et mini-lecteur, SANS flux ────────────────────
console.log('\n=== 9. lecteur : raccourcis et mini-lecteur (flux coupe) ===')
const chaine = await base(async () => {
  const { db } = await import('/app/src/lib/db.ts')
  const c = (await db.catalogue.where('type').equals('live').limit(1).toArray())[0]
  return { cle: c.cle, nom: c.nom }
})
await page.goto(`${BASE}/lecture/${encodeURIComponent(chaine.cle)}`, { waitUntil: 'load' })
await page.waitForTimeout(6000)
dire(chemin().includes('/lecture/'), 'le lecteur est monte sur son URL', chemin())

const favAvant = await base(async (cle) => {
  const { db } = await import('/app/src/lib/db.ts')
  return !!(await db.favoris.get(cle))
}, chaine.cle)
// Aucun clic prealable : les touches sont ecoutees sur la FENETRE. Un clic
// dans le lecteur tombe sur le champ de filtre de la colonne de zapping, et le
// lecteur ignore alors toutes les lettres -- c'est la saisie qui gagne.
await page.keyboard.press('f')
await page.waitForTimeout(1200)
const favApres = await base(async (cle) => {
  const { db } = await import('/app/src/lib/db.ts')
  return !!(await db.favoris.get(cle))
}, chaine.cle)
dire(favAvant !== favApres, `raccourci « f » bascule le favori de la chaine : ${favAvant} → ${favApres}`)
if (favAvant !== favApres) { await page.keyboard.press('f'); await page.waitForTimeout(800) }

// Les calques du lecteur ont chacun leur dialogue nomme : on verifie l'effet
// du raccourci, et non une longueur de texte. Et on garde l'oeil sur le chemin
// -- Échap sans calque ouvert quitte le lecteur, et une sequence qui derape le
// fermerait sans que l'assertion suivante le voie.
const calque = (nom) => page.locator(`[role="dialog"][aria-label="${nom}"]`).count()

await page.keyboard.press('g')
await page.waitForTimeout(1800)
dire((await calque('Mini-guide')) === 1, 'raccourci « G » ouvre le mini-guide')
await page.keyboard.press('g')
await page.waitForTimeout(1000)
dire((await calque('Mini-guide')) === 0, 'raccourci « G » le referme')

await page.keyboard.press('i')
await page.waitForTimeout(1500)
dire((await calque('Informations sur la chaîne')) === 1, 'raccourci « I » ouvre le panneau d infos')
await page.keyboard.press('Escape')
await page.waitForTimeout(1200)
dire((await calque('Informations sur la chaîne')) === 0 && chemin().includes('/lecture/'),
     'Échap ferme le panneau sans quitter le lecteur', chemin())

const urlAvantZap = page.url()
await page.keyboard.press('ArrowDown')
await page.waitForTimeout(3000)
dire(page.url() !== urlAvantZap && chemin().includes('/lecture/'),
     'la fleche bas zappe (l URL suit la chaine)', chemin())
const urlZappee = page.url()
await page.keyboard.press('r')
await page.waitForTimeout(2500)
dire(page.url() !== urlZappee, 'raccourci « R » revient sur la chaine precedente', chemin())

await page.keyboard.press('Escape')
await page.waitForTimeout(2000)
dire(!chemin().includes('/lecture/'), 'Échap quitte le lecteur sans couper la lecture', chemin())
const mini = await page.evaluate(() => {
  const t = document.body.innerText
  const hors = [...document.querySelectorAll('body > div')].filter((d) => !d.querySelector('main'))
  return { present: hors.some((d) => d.innerText.trim().length > 0), extrait: t.slice(-120) }
})
dire(mini.present, 'le mini-lecteur persiste hors de la surface principale')

// ── bilan ─────────────────────────────────────────────────────────────────
console.log(`\n=== plantages JS (${plantages.length}) ===`)
for (const p of plantages.slice(0, 8)) console.log(`  ${p}`)
console.log(`\n===== ${reussis} verifications passees, ${echoues} en echec =====`)
await ctx.close()
