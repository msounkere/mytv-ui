// US-47 CA3 : barre d'onglets a 320 px et au zoom 125 % (5 onglets, gouttieres),
// rail en paysage telephone, cibles >= 44 px sur tablette, guide telephone (jour
// visible, statistiques sur deux lignes), contenu qui reserve le mini-lecteur,
// grilles sans debordement. Derive de /opt/mytv-work/audit/D/balayage.mjs (D10,
// D12, D20, D21, D22). A lancer sur les trois moteurs :
//   NAVIGATEUR=chromium|firefox|webkit NODE_OPTIONS=--tls-max-v1.2 node tests/e2e/us47-responsive.mjs
import { demarrer, ouvrirSession, creerVerificateur, jusqua, attendre, texte, chemin, rect, ciblesPetites, deborde, NAVIGATEUR } from './us47-commun.mjs'

const v = creerVerificateur(`US-47 CA3 responsive (${NAVIGATEUR})`)
const TAILLE = { chaines: 30, films: 30, series: 6, variantes: 2 }

/** Rectangles des onglets de la barre basse, dans l'ordre. */
const onglets = (page) => page.locator('nav.rail button').evaluateAll((l) =>
  l.filter((e) => e.getBoundingClientRect().width > 0).map((e) => {
    const r = e.getBoundingClientRect()
    const lib = e.querySelector('.rail-libelle')
    return { nom: (e.getAttribute('aria-label') || e.textContent || '').trim(), x: r.x, r: r.right, y: r.y, b: r.bottom, h: r.height, libelleTronque: lib ? lib.scrollWidth > lib.clientWidth + 1 : false }
  }))

// --- 320 px et 390 px au zoom 125 % : cinq onglets avec gouttieres (D10) ----------
for (const cas of [{ gabarit: 'etroit', zoom: undefined }, { gabarit: 'telephone', zoom: 1.25 }]) {
  const nom = cas.zoom ? 'telephone zoom 125 %' : '320 px'
  console.log(`--- ${nom}`)
  const b = await demarrer({ gabarit: cas.gabarit, zoom: cas.zoom, taille: TAILLE })
  const { page } = b
  try {
    await ouvrirSession(b)
    await jusqua(async () => (await page.locator('nav.rail button').count()) >= 5, 10_000)
    const t = await onglets(page)
    v.ok(t.length === 5, `[${nom}] CA3 cinq onglets (${t.map((x) => x.nom).join(', ')})`)
    const noms = t.map((x) => x.nom.replace(/^Profil : .*/, 'Profil')).join('|')
    v.ok(noms === 'Accueil|Direct|Ma liste|Recherche|Profil', `[${nom}] CA3 Accueil, Direct, Ma liste, Recherche, Profil (${noms})`)
    const gouttieres = t.slice(1).map((x, i) => x.x - t[i].r)
    v.ok(gouttieres.every((g) => g >= 2), `[${nom}] CA3 gouttiere entre les onglets (${gouttieres.map((g) => g.toFixed(1)).join(', ')})`)
    v.ok(t.every((x) => !x.libelleTronque), `[${nom}] CA3 aucun libelle tronque`)
    v.ok(t.every((x) => x.h >= 44), `[${nom}] CA3 onglets >= 44 px (${t.map((x) => Math.round(x.h)).join(', ')})`)
    v.ok(!(await deborde(page)), `[${nom}] aucun debordement horizontal du document`)
    v.ok((await page.locator('nav.rail').getByRole('button', { name: /Profil/ }).count()) === 1, `[${nom}] onglet Profil`)
  } finally {
    await b.fermer()
  }
}

// --- Paysage 844×390 : rail compact lisible (D22) ---------------------------------
console.log('--- paysage 844x390')
{
  const b = await demarrer({ gabarit: 'paysage', taille: TAILLE })
  const { page } = b
  try {
    await ouvrirSession(b)
    await jusqua(async () => (await page.locator('nav.rail button').count()) >= 5, 10_000)
    const t = (await onglets(page)).filter((x) => x.nom !== 'Replier la navigation' && x.nom !== 'Déployer la navigation')
    v.ok(t.length === 8, `[paysage] CA3 huit entrees du rail (${t.length})`)
    v.ok(t.every((x) => x.b <= 390 && x.y >= 0), `[paysage] CA3 toutes les entrees tiennent dans 390 px de haut (bas max ${Math.round(Math.max(...t.map((x) => x.b)))})`)
    v.ok(t.every((x) => x.h >= 40), `[paysage] CA3 entrees >= 40 px (${t.map((x) => Math.round(x.h)).join(', ')})`)
    const chevauche = t.slice(1).some((x, i) => x.y < t[i].b - 1)
    v.ok(!chevauche, `[paysage] CA3 aucune entree ne chevauche la precedente`)
  } finally {
    await b.fermer()
  }
}

// --- Tablette 768 : cibles tactiles >= 44 px (D21) --------------------------------
console.log('--- tablette 768')
{
  const b = await demarrer({ gabarit: 'tablette', taille: TAILLE })
  const { page } = b
  try {
    await ouvrirSession(b)
    const entete = await ciblesPetites(page, 44, 'header.entete')
    v.ok(entete.length === 0, `[tablette] CA3 en-tete : boutons >= 44 px (${entete.join(' ; ') || 'ok'})`)
    await page.goto(`${b.serveur.origine}/reglages`)
    await page.getByRole('radiogroup', { name: 'Qualité' }).waitFor()
    const reglages = await ciblesPetites(page, 44, '.couche-ecran[aria-hidden="false"]')
    v.ok(reglages.length === 0, `[tablette] CA3 Reglages : boutons >= 44 px (${reglages.join(' ; ') || 'ok'})`)
    await page.goto(`${b.serveur.origine}/direct`)
    await jusqua(async () => (await page.locator('[data-role="ligne-chaine"]').count()) > 0, 15_000)
    const direct = await ciblesPetites(page, 44, 'main')
    // Le pas des lignes de categorie (34 px) et des chaines (56 px) est celui de la
    // maquette ; seules les COMMANDES doivent faire 44 px.
    const commandes = direct.filter((c) => !/^button:([A-Z]{2} \||Chaîne|Autres|Épingler|Désépingler)/.test(c))
    v.ok(commandes.length === 0, `[tablette] CA3 Direct : commandes >= 44 px (${commandes.join(' ; ') || 'ok'})`)
    v.ok(!(await deborde(page)), '[tablette] aucun debordement horizontal')
  } finally {
    await b.fermer()
  }
}

// --- Telephone 390 : guide, mini-lecteur, profil/reglages, grilles ----------------
console.log('--- telephone 390')
{
  const b = await demarrer({ gabarit: 'telephone', taille: TAILLE })
  const { page, serveur } = b
  try {
    await ouvrirSession(b)
    // Guide : jour visible, statistiques sur deux lignes (D12).
    await page.goto(`${serveur.origine}/guide`)
    const jour = page.locator('[data-role="jour-guide"]')
    v.ok(await jusqua(async () => (await jour.count()) > 0, 10_000), '[telephone] guide affiche')
    const rj = await rect(jour)
    v.ok(rj.x >= 0 && rj.x + rj.w <= 390 && !(await jour.first().evaluate((el) => el.scrollWidth > el.clientWidth + 1)), `[telephone] CA3 le jour est visible et entier (${await texte(jour)})`)
    const stats = page.locator('[data-role="stats-guide"]')
    v.ok(await jusqua(async () => /avec guide/.test(await texte(stats)), 10_000), 'statistiques du guide')
    const rs = await rect(stats)
    v.ok(rs.h >= 30 && !(await stats.first().evaluate((el) => el.scrollWidth > el.clientWidth + 1)), `[telephone] CA3 statistiques sur deux lignes, non tronquees (${rs.h} px)`)
    v.ok((await page.locator('header').getByRole('button', { name: 'Revenir à maintenant' }).count()) === 0, 'Maintenant vit dans la regle, pas dans la barre')

    // Onglet Profil : Reglages en premier ; onglet Recherche : champ focalise (CA3/CA5).
    await page.locator('nav.rail').getByRole('button', { name: /Profil/ }).click()
    const menu = page.getByRole('menu', { name: 'Profil' })
    v.ok(await jusqua(async () => (await menu.count()) > 0, 3000), '[telephone] feuille du profil ouverte')
    const items = await menu.getByRole('menuitem').evaluateAll((l) => l.map((e) => e.textContent.trim()))
    v.ok(items[0] === 'Réglages', `[telephone] CA5 Reglages en premier dans l'onglet Profil (${items.join(', ')})`)
    v.ok(items.includes('Films') && items.includes('Séries') && items.includes('Guide'), '[telephone] CA3 Films, Séries, Guide dans la feuille du profil')
    await menu.getByRole('menuitem', { name: 'Réglages' }).click()
    v.ok(await jusqua(async () => (await chemin(page)) === '/reglages', 5000), `[telephone] CA5 Reglages en un tap (${await chemin(page)})`)
    await page.locator('nav.rail').getByRole('button', { name: 'Recherche', exact: true }).click()
    v.ok(await jusqua(async () => (await chemin(page)) === '/recherche', 5000), `[telephone] onglet Recherche -> /recherche`)
    v.ok(await jusqua(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Recherche universelle'), 3000), '[telephone] onglet Recherche : le champ est focalise')

    // Mini-lecteur : le contenu reserve sa hauteur (D20).
    await page.goto(`${serveur.origine}/film/vod:iptva:5001`)
    const regarder = page.locator('[data-role="fiche-film"]').getByRole('button', { name: /^Regarder/ })
    await regarder.waitFor()
    await regarder.click()
    v.ok(await jusqua(async () => /^\/lecture\//.test(await chemin(page)), 8000), 'lecture ouverte')
    await attendre(1200)
    await page.getByRole('button', { name: 'Quitter le lecteur' }).click()
    const mini = page.locator('[data-role="mini-lecteur"]')
    v.ok(await jusqua(async () => (await mini.count()) > 0 && (await chemin(page)).startsWith('/film/'), 8000), `[telephone] retour a la fiche, mini-lecteur affiche (${await chemin(page)})`)
    const reserve = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.coque-contenu')).paddingBottom))
    const rm = await rect(mini)
    v.ok(reserve >= 64 + rm.h - 1, `[telephone] CA3 le contenu reserve la barre et le mini-lecteur (${reserve} px pour ${rm.h} px de mini-lecteur)`)
    // De retour dans le lecteur, le mini-lecteur n'est plus la : la reserve tombe.
    await mini.getByRole('button', { name: 'Revenir au lecteur' }).first().click()
    v.ok(await jusqua(async () => /^\/lecture\//.test(await chemin(page)), 5000), 'retour au lecteur')
    v.ok(await jusqua(() => page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.coque-contenu')).paddingBottom) < 100), 3000), `[telephone] la reserve disparait sans mini-lecteur`)
    await page.getByRole('button', { name: 'Quitter le lecteur' }).click()
    await jusqua(async () => (await mini.count()) > 0, 5000)
    await mini.getByRole('button', { name: 'Fermer la lecture' }).click()
    v.ok(await jusqua(async () => (await mini.count()) === 0, 5000), 'mini-lecteur ferme')

    // Grilles et en-tetes : aucun debordement horizontal (D6 cote coque).
    for (const ecran of ['/', '/films', '/series', '/ma-liste', '/reglages']) {
      await page.goto(`${serveur.origine}${ecran}`)
      await attendre(600)
      v.ok(!(await deborde(page)) && !(await deborde(page, 'main')), `[telephone] CA3 ${ecran} sans debordement horizontal`)
    }
    // « Stale read from <Show> » a l'arret de la lecture : bug D1/B1, corrige par ui-6 (US-45 CA1).
    const erreurs = b.erreurs.filter((e) => !/Stale read/.test(e))
    v.ok(erreurs.length === 0, `[telephone] aucune erreur de page hors lecteur (${erreurs.join(' | ').slice(0, 200)})`)
    v.ok(b.externes.length === 0, 'aucune requete hors 127.0.0.1')
  } finally {
    await b.fermer()
  }
}
v.termine()
