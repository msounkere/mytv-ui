// Recette de non-regression de l'etape 1 (routeur + preservation des ecrans).
//
// AUCUN FLUX N'EST OUVERT : voir garde-flux.mjs. Les chemins de lecture sont
// avortes DANS le navigateur, donc aucune requete n'atteint le relais.
import { chromium } from 'playwright'
import { couperLesFlux } from './garde-flux.mjs'

const ctx = await chromium.launchPersistentContext(process.env.PROFIL, { viewport: { width: 1440, height: 900 } })
const page = ctx.pages()[0] ?? (await ctx.newPage())
const incidents = []
page.on('pageerror', (e) => incidents.push(`pageerror: ${e.message}`))
const bloques = await couperLesFlux(page)

let ok = 0, ko = 0
function verdict(nom, vrai, detail = '') {
  if (vrai) { ok++; console.log(`  OK   ${nom}${detail ? ' — ' + detail : ''}`) }
  else { ko++; console.log(`  ECHEC ${nom}${detail ? ' — ' + detail : ''}`) }
}
const rail = (nom) => page.getByRole('button', { name: new RegExp(`^${nom}$`) }).first().click()
// CONSEQUENCE DE LA PRESERVATION, et elle vaut pour tous les tests a venir :
// les ecrans quittes restent dans le DOM. Un selecteur global attrape donc des
// elements masques. On vise la couche visible la plus INTERIEURE — `Couche`
// pose `aria-hidden="false"` sur celle qui est affichee, y compris pour les
// deux vues imbriquees de Parcours.
// `:visible` est essentiel : la vue « Films » de Parcours garde
// `aria-hidden="false"` alors qu'elle est enfouie dans une couche masquee, et
// un simple `.last()` la choisirait pendant qu'on regarde l'Accueil.
const couche = () => page.locator('main div[aria-hidden="false"]:visible').last()
const dans = (sel) => couche().locator(sel)
const pause = (ms = 1800) => page.waitForTimeout(ms)
const chemin = () => new URL(page.url()).pathname + new URL(page.url()).search
const titre = () => page.locator('.entete-titre').textContent()

// ── 1. Authentification ─────────────────────────────────────────────────────
console.log('\n[1] Authentification')
{
  const vierge = await chromium.launch()
  const p2 = await vierge.newPage()
  await couperLesFlux(p2)
  await p2.goto('http://localhost:5173/app/films', { waitUntil: 'load' })
  await p2.waitForTimeout(2500)
  verdict('page de connexion pour un visiteur anonyme',
    (await p2.locator('input[type="password"]').count()) === 1)
  await p2.locator('input').nth(0).fill('sounkere')
  await p2.locator('input').nth(1).fill('hktsIKymwGvDs2')
  await p2.keyboard.press('Enter')
  await p2.waitForSelector('nav[aria-label="Navigation principale"]', { timeout: 30000 })
  await p2.waitForTimeout(2500)
  const bis = await p2.context().cookies()
  verdict('cookie mytv_session pose', bis.some((c) => c.name === 'mytv_session'))
  verdict('la connexion retombe sur l\'URL demandee',
    new URL(p2.url()).pathname === '/app/films', new URL(p2.url()).pathname)
  await vierge.close()
}

await page.goto('http://localhost:5173/app/', { waitUntil: 'load' })
await page.waitForSelector('nav[aria-label="Navigation principale"]', { timeout: 30000 })
await pause(4000)

// ── 2. Volumes ──────────────────────────────────────────────────────────────
console.log('\n[2] Catalogue et guide')
const volumes = await page.evaluate(async () => {
  const lire = (nom, tables) => new Promise((r) => {
    const q = indexedDB.open(nom)
    q.onsuccess = async () => {
      const db = q.result, out = {}
      for (const t of tables) {
        out[t] = db.objectStoreNames.contains(t)
          ? await new Promise((r2) => { const c = db.transaction(t).objectStore(t).count(); c.onsuccess = () => r2(c.result) })
          : -1
      }
      r(out)
    }
  })
  return { mytv: await lire('mytv', ['catalogue', 'categories', 'favoris', 'journal']), epg: await lire('mytv-epg', ['programmes', 'chaines']) }
})
verdict('catalogue complet', volumes.mytv.catalogue > 150000, `${volumes.mytv.catalogue} entrees`)
verdict('guide EPG complet', volumes.epg.programmes > 190000, `${volumes.epg.programmes} programmes`)

// ── 3. Routes, retour navigateur, rechargement ──────────────────────────────
console.log('\n[3] Routes et historique')
for (const [nom, url, t] of [['Direct', '/app/direct', 'Direct'], ['Films', '/app/films', 'Films'],
  ['Séries', '/app/series', 'Séries'], ['Guide', '/app/guide', 'Guide'], ['Accueil', '/app', 'Accueil']]) {
  await rail(nom); await pause()
  verdict(`${nom} : URL et titre`, chemin() === url && (await titre()) === t, `${chemin()} / ${await titre()}`)
}
await page.goBack(); await pause()
verdict('bouton retour du navigateur', chemin() === '/app/guide', chemin())
await page.goForward(); await pause()
verdict('bouton suivant du navigateur', chemin() === '/app', chemin())
await page.goto('http://localhost:5173/app/series', { waitUntil: 'load' }); await pause(3500)
verdict('rechargement sur une URL profonde', (await titre()) === 'Séries', await titre())
await page.goto('http://localhost:5173/app/nexistepas', { waitUntil: 'load' }); await pause(3000)
verdict('URL inconnue renvoyee sur l\'accueil', chemin() === '/app', chemin())

// ── 4. Preservation : les couches restent montees ───────────────────────────
console.log('\n[4] Preservation des ecrans')
for (const n of ['Direct', 'Films', 'Séries', 'Guide', 'Accueil']) { await rail(n); await pause(2200) }
const couches = await page.evaluate(() => [...document.querySelectorAll('main > div')].map((e) => ({
  vis: getComputedStyle(e).visibility, d: getComputedStyle(e).display,
  h: Math.round(e.getBoundingClientRect().height), n: e.querySelectorAll('*').length,
})))
verdict('toutes les couches sont montees', couches.length >= 4, `${couches.length} couches`)
verdict('une seule couche visible', couches.filter((c) => c.vis === 'visible').length === 1)
verdict('aucune couche en display:none', couches.every((c) => c.d !== 'none'))
verdict('les couches masquees gardent une hauteur reelle', couches.every((c) => c.h > 100),
  couches.map((c) => c.h).join('/'))
// `visibility` s'herite : un enfant qui le repose a `visible` se repeint par
// dessus l'ecran affiche. Parcours imbrique deux couches, donc on verifie.
const fuites = await page.evaluate(() => {
  const dedans = [...document.querySelectorAll('main > div')].filter((e) => getComputedStyle(e).visibility === 'hidden')
  return dedans.flatMap((d) => [...d.querySelectorAll('*')])
    .filter((e) => getComputedStyle(e).visibility === 'visible')
    .map((e) => e.className || e.tagName).slice(0, 5)
})
verdict('aucun element ne reapparait dans une couche masquee', fuites.length === 0, fuites.join(', '))

// ── 5. Direct : modes, defilement, epingles, categories masquees ────────────
console.log('\n[5] Direct')
await rail('Direct'); await pause(2500)
const lignesCat = dans('aside[aria-label="Catégories"] button[title]')
verdict('liste des categories peuplee', (await lignesCat.count()) > 5, `${await lignesCat.count()} lignes`)
const listeChaines = dans('[role="radiogroup"]').first()
verdict('selecteur de mode present', (await listeChaines.count()) === 1)
// Les trois modes, dont « Guide TV » qui est un raccourci vers l'ecran Guide.
await page.getByRole('radio', { name: 'Cartes' }).click(); await pause(2200)
const enCartes = await couche().evaluate((e) => e.querySelectorAll('img, [role="button"]').length)
verdict('mode Cartes', enCartes > 0, `${enCartes} elements`)
await page.getByRole('radio', { name: 'Guide TV' }).click(); await pause(2000)
verdict('mode « Guide TV » mene a l\'ecran Guide', chemin() === '/app/guide', chemin())
await rail('Direct'); await pause(2200)
await page.getByRole('radio', { name: 'Liste' }).click(); await pause(2500)

// defilement memorise par categorie
// Scopee a la couche visible : l'Accueil, reste monte, porte lui aussi une
// zone de defilement large — et elle vient AVANT dans le DOM.
const ZONE = `
  const vus = [...document.querySelectorAll('main div[aria-hidden="false"]')]
    .filter((e) => getComputedStyle(e).visibility === 'visible')
  const d = vus[vus.length - 1]
  const z = d && [...d.querySelectorAll('div')].find((e) =>
    getComputedStyle(e).overflowY === 'auto' &&
    e.getBoundingClientRect().width > 400 && e.scrollHeight > e.clientHeight + 50)
`
const zone = () => page.evaluate(new Function(`${ZONE} return z ? z.scrollTop : -1`))
const defiler = (y) => page.evaluate(new Function('y', `${ZONE} if (z) z.scrollTop = y`), y)

await defiler(1200); await pause(900)
const yA = await zone()
await rail('Accueil'); await pause(2000)
await rail('Direct'); await pause(2500)
const yRetour = await zone()
verdict('defilement de la liste conserve a l\'aller-retour', Math.abs(yRetour - yA) < 60, `${yA} -> ${yRetour}`)

// ... et par mode d'affichage, comme l'exigent les regles de comportement.
await page.getByRole('radio', { name: 'Cartes' }).click(); await pause(2500)
await defiler(800); await pause(900)
const yCartes = await zone()
await page.getByRole('radio', { name: 'Liste' }).click(); await pause(2500)
const yListe = await zone()
await page.getByRole('radio', { name: 'Cartes' }).click(); await pause(2500)
verdict('defilement memorise par MODE d\'affichage',
  Math.abs(yListe - yA) < 60 && Math.abs((await zone()) - yCartes) < 60,
  `liste ${yA}->${yListe}, cartes ${yCartes}->${await zone()}`)
await page.getByRole('radio', { name: 'Liste' }).click(); await pause(2000)

// epingle
const epingler = dans('button[aria-label^="Épingler"]').first()
const avantEp = await page.evaluate(async () => {
  const q = indexedDB.open('mytv')
  const db = await new Promise((r) => { q.onsuccess = () => r(q.result) })
  return await new Promise((r) => { const c = db.transaction('reglages').objectStore('reglages').get('epingles.live'); c.onsuccess = () => r((c.result?.valeur ?? []).length) })
})
if (await epingler.count()) {
  await epingler.click({ force: true }); await pause(1200)
  const apresEp = await page.evaluate(async () => {
    const q = indexedDB.open('mytv')
    const db = await new Promise((r) => { q.onsuccess = () => r(q.result) })
    return await new Promise((r) => { const c = db.transaction('reglages').objectStore('reglages').get('epingles.live'); c.onsuccess = () => r((c.result?.valeur ?? []).length) })
  })
  verdict('epingle persistee', apresEp !== avantEp, `${avantEp} -> ${apresEp}`)
  await dans('button[aria-label^="Désépingler"]').first().click({ force: true }); await pause(1000)
} else verdict('bouton d\'epingle trouve', false)

// categorie masquee
const masquer = dans('button[aria-label="Masquer la catégorie"]').first()
if (await masquer.count()) {
  await masquer.click(); await pause(1800)
  const texte = await dans('aside[aria-label="Catégories"]').innerText()
  verdict('categorie masquee et reprise possible', /masquée|masquées/i.test(texte))
  const revoir = dans('aside[aria-label="Catégories"] button').filter({ hasText: /masquée/i }).first()
  if (await revoir.count()) { await revoir.click(); await pause(1500) }
  const rendre = dans('button[aria-label="Réafficher la catégorie"]').first()
  if (await rendre.count()) { await rendre.click(); await pause(1500) }
} else verdict('bouton de masquage trouve', false)

// ── 6. Films : filtres, tri, et leur survie a la navigation ─────────────────
console.log('\n[6] Films : filtres et tri')
await rail('Films'); await pause(3000)
const compteur = () => page.locator('main').innerText().then((t) => (/([\d   ]+) films?/.exec(t) ?? [])[1] ?? '?')
const avantFiltre = await compteur()
await page.getByRole('button', { name: /^Genre/ }).first().click(); await pause(1200)
const options = page.locator('[role="listbox"][aria-label="Genre"] [role="option"]')
await options.first().waitFor({ timeout: 15000 })
await options.first().click(); await pause(2200)
await page.keyboard.press('Escape'); await pause(1500)
const apresFiltre = await compteur()
verdict('un filtre de genre reduit le compte', avantFiltre !== apresFiltre, `${avantFiltre} -> ${apresFiltre}`)
await page.getByRole('radio', { name: 'Titre (A–Z)' }).click(); await pause(2000)
// Une affiche de la grille est un `<button title>` haut de ~300 px ; les
// boutons de la barre de filtres en portent un aussi, mais font 30 px.
const premiereAffiche = () => couche().evaluate((e) => {
  const b = [...e.querySelectorAll('button[title]')].find((x) => x.getBoundingClientRect().height > 120)
  return b?.getAttribute('title') ?? null
})
const premierTitre = await premiereAffiche()
verdict('tri par titre applique', !!premierTitre, premierTitre?.slice(0, 40))
// LE PIEGE de l'etape : une liste virtualisee ne monte aucune ligne si son
// conteneur n'a pas de hauteur quand elle s'y attache, et elle se tait.
const virtuel = await couche().evaluate((e) => {
  const zone = [...e.querySelectorAll('div')].find((d) => getComputedStyle(d).overflowY === 'auto')
  const interne = zone?.firstElementChild
  return {
    lignes: interne?.children.length ?? 0,
    hauteur: Math.round(interne?.getBoundingClientRect().height ?? 0),
    zone: Math.round(zone?.getBoundingClientRect().height ?? 0),
  }
})
verdict('la grille virtualisee monte ses lignes dans une couche preservee',
  virtuel.lignes > 0 && virtuel.hauteur > 1000 && virtuel.zone > 100,
  `${virtuel.lignes} lignes · hauteur totale ${virtuel.hauteur} px · zone ${virtuel.zone} px`)
await rail('Accueil'); await pause(2000)
await rail('Films'); await pause(2500)
verdict('filtre et tri survivent a l\'aller-retour',
  (await compteur()) === apresFiltre && (await premiereAffiche()) === premierTitre,
  `${await compteur()} · ${(await premiereAffiche())?.slice(0, 30)}`)
// Remise a zero : la pastille du filtre pose porte son propre retrait.
const pastille = page.locator('button[aria-label^="Retirer le filtre"]').first()
if (await pastille.count()) { await pastille.click(); await pause(2000) }
verdict('le filtre se retire', (await compteur()) === avantFiltre, `${await compteur()}`)

// ── 7. Recherche : touche « / », panneau, ecran ─────────────────────────────
console.log('\n[7] Recherche')
await rail('Direct'); await pause(2000)
await page.keyboard.press('/'); await pause(600)
verdict('la touche « / » donne le focus au champ',
  await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Recherche universelle'))
await page.keyboard.press('Escape'); await pause(600)
await rail('Accueil'); await pause(2200)
await page.keyboard.press('/'); await pause(2000)
verdict('« / » depuis l\'Accueil mene a l\'ecran Recherche', chemin() === '/app/recherche', chemin())
await rail('Direct'); await pause(2000)
await page.keyboard.press('/'); await pause(600)
await page.keyboard.type('matrix', { delay: 60 }); await pause(2200)
verdict('panneau de suggestions ouvert', (await page.locator('[role="listbox"][aria-label="Suggestions de recherche"]').count()) === 1)
// Panneau ouvert, « Entree » ouvre la suggestion surlignee : c'est le
// comportement du panneau, inchange. On le ferme pour soumettre la requete.
await page.keyboard.press('Escape'); await pause(800)
await page.keyboard.press('Enter'); await pause(2500)
verdict('ecran Recherche et requete dans l\'URL', chemin() === '/app/recherche?q=matrix', chemin())
const resultats = await dans('button[title], div[role="button"]').count()
verdict('resultats affiches', resultats > 0, `${resultats} resultats`)
await page.goto('http://localhost:5173/app/recherche?q=matrix', { waitUntil: 'load' }); await pause(3500)
verdict('un lien de recherche est partageable', (await couche().innerText()).length > 50)

// ── 8. Favoris ──────────────────────────────────────────────────────────────
console.log('\n[8] Favoris')
await rail('Films'); await pause(3000)

const compteFavoris = () => page.evaluate(async () => {
  const q = indexedDB.open('mytv')
  const db = await new Promise((r) => { q.onsuccess = () => r(q.result) })
  const un = (t) => new Promise((r) => { const c = db.transaction(t).objectStore(t).count(); c.onsuccess = () => r(c.result) })
  return { favoris: await un('favoris'), journal: await un('journal') }
})
const favAvant = await compteFavoris()
await rail('Accueil'); await pause(2500)
// L'Accueil porte des `CarteAffiche`, qui ont le bouton de survol « favori ».
const afficheAccueil = dans('div[role="button"][tabindex="0"]').first()
await afficheAccueil.waitFor({ state: 'visible', timeout: 30000 })
await afficheAccueil.hover(); await pause(800)
const boutonFav = dans('[role="button"][aria-label="Ajouter aux favoris"], [role="button"][aria-label="Retirer des favoris"]').first()
if (await boutonFav.count()) {
  await boutonFav.click({ force: true }); await pause(1500)
  const favApres = await compteFavoris()
  verdict('favori ecrit et journalise',
    favApres.favoris !== favAvant.favoris && favApres.journal > favAvant.journal,
    `favoris ${favAvant.favoris}->${favApres.favoris}, journal ${favAvant.journal}->${favApres.journal}`)
  await boutonFav.click({ force: true }); await pause(1200)
} else verdict('bouton favori trouve', false)

// ── 9. Lecteur : URL, mini-lecteur, raccourcis — SANS OUVRIR DE FLUX ───────
// Les chemins de lecture sont avortes par Playwright AVANT de quitter le
// navigateur : le lecteur affiche donc son bandeau d'erreur, et le relais ne
// voit passer aucune connexion. C'est le seul moyen d'eprouver les raccourcis
// sur un abonnement a un flux unique.
console.log('\n[9] Lecteur (flux avortes, aucune connexion au relais)')
const cle = await page.evaluate(async () => {
  const q = indexedDB.open('mytv')
  const db = await new Promise((r) => { q.onsuccess = () => r(q.result) })
  return await new Promise((r) => {
    const c = db.transaction('catalogue').objectStore('catalogue').index('type').getAll('live', 1)
    c.onsuccess = () => r(c.result[0]?.cle)
  })
})
await page.goto(`http://localhost:5173/app/lecture/${cle}`, { waitUntil: 'load' })
await page.waitForSelector('nav[aria-label="Navigation principale"]', { timeout: 30000 })
await pause(7000)
const lecteur = page.locator('.couche-lecteur')
const vis = () => lecteur.evaluate((e) => getComputedStyle(e).visibility)
verdict('URL de lecture rechargeable, entree relue dans le catalogue',
  chemin() === `/app/lecture/${cle}` && (await lecteur.count()) === 1, chemin())
verdict('la couche du lecteur est visible', (await vis()) === 'visible')
verdict('aucun flux n\'a quitte le navigateur', bloques.length > 0,
  `${bloques.length} requetes de lecture avortees : ${[...new Set(bloques)].slice(0, 3).join(', ')}`)

const panneau = (nom) => page.locator(`[role="dialog"][aria-label="${nom}"]`).count()
await page.keyboard.press('i'); await pause(2000)
verdict('« I » ouvre les informations', (await panneau('Informations sur la chaîne')) === 1)
await page.keyboard.press('Escape'); await pause(1500)
verdict('« Échap » ferme le calque sans quitter le lecteur',
  (await panneau('Informations sur la chaîne')) === 0 && chemin() === `/app/lecture/${cle}`, chemin())
await page.keyboard.press('g'); await pause(2000)
verdict('« G » ouvre le mini-guide', (await panneau('Mini-guide')) === 1)
await page.keyboard.press('Escape'); await pause(1500)
verdict('« Échap » ferme le mini-guide', (await panneau('Mini-guide')) === 0)

await page.keyboard.press('ArrowDown'); await pause(3000)
const zappe = chemin()
verdict('« ↓ » zappe et l\'URL suit la chaine',
  zappe !== `/app/lecture/${cle}` && zappe.startsWith('/app/lecture/'), `${cle} -> ${zappe}`)
await page.keyboard.press('ArrowUp'); await pause(3000)
verdict('« ↑ » zappe en arriere', chemin() === `/app/lecture/${cle}`, chemin())
await page.keyboard.press('ArrowDown'); await pause(3000)
await page.keyboard.press('r'); await pause(3000)
verdict('« R » revient a la chaine precedente', chemin() === `/app/lecture/${cle}`, chemin())
const favDeLecture = await compteFavoris()
await page.keyboard.press('f'); await pause(2000)
verdict('« f » bascule le favori', (await compteFavoris()).favoris !== favDeLecture.favoris,
  `${favDeLecture.favoris} -> ${(await compteFavoris()).favoris}`)
await page.keyboard.press('f'); await pause(1500)

// Le zapping ne doit pas remplir l'historique : le retour quitte le lecteur.
await page.goBack(); await pause(2500)
verdict('le retour navigateur quitte le lecteur au lieu de redescendre les chaines',
  !chemin().startsWith('/app/lecture/'), chemin())
await page.goForward(); await pause(2500)

await rail('Films'); await pause(2500)
verdict('le lecteur est masque et non demonte',
  (await lecteur.count()) === 1 && (await vis()) === 'hidden')
verdict('mini-lecteur persistant affiche',
  (await page.locator('[aria-label="Mini-lecteur"]').count()) === 1)
const reprise = page.locator('.entete-reprise')
verdict('raccourci « retour au lecteur » dans l\'en-tete', (await reprise.count()) === 1)
await reprise.click(); await pause(2500)
verdict('retour au lecteur par l\'en-tete', chemin().startsWith('/app/lecture/'), chemin())
await page.keyboard.press('Escape'); await pause(2000)
verdict('« Échap » sans calque rend l\'ecran SANS couper la lecture',
  !chemin().startsWith('/app/lecture/') && (await lecteur.count()) === 1 &&
  (await page.locator('[aria-label="Mini-lecteur"]').count()) === 1, chemin())
const fermer = page.locator('[aria-label="Mini-lecteur"] button').last()
await fermer.click({ force: true }).catch(() => {})
await pause(2000)

// ── 10. Fiche serie ─────────────────────────────────────────────────────────
console.log('\n[10] Fiche serie')
const cleSerie = await page.evaluate(async () => {
  const q = indexedDB.open('mytv')
  const db = await new Promise((r) => { q.onsuccess = () => r(q.result) })
  return await new Promise((r) => {
    const c = db.transaction('catalogue').objectStore('catalogue').index('type').getAll('series', 1)
    c.onsuccess = () => r(c.result[0]?.cle)
  })
})
await page.goto(`http://localhost:5173/app/serie/${cleSerie}`, { waitUntil: 'load' }); await pause(5000)
verdict('fiche serie rechargeable par son URL',
  chemin() === `/app/serie/${cleSerie}` && (await titre()) === 'Séries', `${chemin()} / ${await titre()}`)

await page.goto(`http://localhost:5173/app/lecture/${cleSerie}:999999`, { waitUntil: 'load' })
await pause(5000)
verdict('une cle d\'episode inconnue renvoie sur la fiche de la serie',
  chemin() === `/app/serie/${cleSerie}`, chemin())

console.log(`\n=== ${ok} OK, ${ko} ECHEC ===`)
if (incidents.length) console.log('incidents :', incidents.slice(0, 8))
await ctx.close()
