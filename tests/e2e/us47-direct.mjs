// US-47 CA2 : Direct telephone / tablette / paysage (titre et compteur lisibles,
// commandes dans un menu « ⋯ », nom prioritaire sur le badge, cartes sans
// « Chaîn… »), tri par numero du bouquet, chaine en cours surlignee, zapping et
// mini-guide regroupes par variantes, « Guide TV » lien distinct ; CA7 : categorie
// et mode dans l'URL. Derive de /opt/mytv-work/audit/A/03-direct.mjs et D/balayage.mjs.
//   NODE_OPTIONS=--tls-max-v1.2 npm run build && node tests/e2e/us47-direct.mjs
import { demarrer, ouvrirSession, servirDirect, creerVerificateur, jusqua, attendre, texte, chemin, rect } from './us47-commun.mjs'

const v = creerVerificateur('US-47 CA2 direct')
const TAILLE = { chaines: 40, films: 30, series: 6, variantes: 3 }
const tronque = (loc) => loc.evaluate((el) => el.scrollWidth > el.clientWidth + 1)

// --- Telephone, tablette, paysage : lisibilite --------------------------------------
for (const gabarit of ['telephone', 'tablette', 'paysage']) {
  console.log(`--- ${gabarit}`)
  const b = await demarrer({ gabarit, taille: TAILLE })
  const { page } = b
  try {
    await ouvrirSession(b)
    await page.goto(`${b.serveur.origine}/direct`)
    const lignes = page.locator('[data-role="ligne-chaine"]')
    v.ok(await jusqua(async () => (await lignes.count()) > 0, 15_000), `[${gabarit}] liste du Direct affichee`)
    const titre = page.locator('[data-role="titre-direct"]')
    const compte = page.locator('[data-role="compte-direct"]')
    v.ok(/Généralistes/.test(await texte(titre)) && !(await tronque(titre)), `[${gabarit}] CA2 titre lisible, non tronque (${await texte(titre)})`)
    const rc = await rect(compte)
    v.ok(/chaînes/.test(await texte(compte)) && rc.h <= 20 && !(await tronque(compte)), `[${gabarit}] CA2 compteur sur une ligne (${await texte(compte)}, ${rc.h} px)`)
    v.ok((await page.getByLabel('Filtrer les chaînes de cette liste').count()) === 1, `[${gabarit}] CA2 un seul champ de filtre, dans la barre`)
    const menu = page.locator('[data-role="menu-direct"]')
    v.ok((await menu.count()) === 1, `[${gabarit}] CA2 bouton « ⋯ » sous 1100 px`)
    await menu.click()
    const entrees = page.getByRole('menu', { name: 'Options de la liste' }).getByRole('menuitem')
    v.ok(await jusqua(async () => (await entrees.count()) === 3, 3000), `[${gabarit}] CA2 menu : masquer la categorie, 4K, guide (${await entrees.count()})`)
    v.ok(await jusqua(() => page.evaluate(() => document.activeElement?.getAttribute('role') === 'menuitem'), 2000), `[${gabarit}] CA7 le focus entre dans le menu`)
    await page.keyboard.press('Escape')
    v.ok(await jusqua(async () => (await entrees.count()) === 0, 2000), `[${gabarit}] Echap ferme le menu`)
    v.ok(await jusqua(() => page.evaluate(() => document.activeElement?.getAttribute('data-role') === 'menu-direct'), 2000), `[${gabarit}] CA7 focus rendu au bouton « ⋯ »`)
    // Le nom prime sur le badge des variantes.
    const nom0 = lignes.first().locator('[data-role="nom-chaine"]')
    v.ok(/Chaîne 0/.test(await texte(nom0)) && !(await tronque(nom0)), `[${gabarit}] CA2 nom de la premiere ligne entier (${await texte(nom0)})`)
    const badge = lignes.first().locator('[data-role="variantes"]')
    v.ok((await badge.count()) === 1 && /^(4K|HD|FHD)$/.test((await texte(badge)).trim()), `[${gabarit}] CA2 badge replie en une qualite (${(await texte(badge)).trim()})`)
    const noms = await lignes.locator('[data-role="nom-chaine"]').evaluateAll((l) => l.slice(0, 8).map((e) => ({ t: e.textContent, tronque: e.scrollWidth > e.clientWidth + 1 })))
    v.ok(noms.every((n) => !n.tronque), `[${gabarit}] CA2 aucun nom tronque sur les premieres lignes (${noms.filter((n) => n.tronque).map((n) => n.t).join(', ') || 'aucun'})`)
    // Mode cartes.
    await page.getByRole('radio', { name: 'Cartes' }).click()
    v.ok(await jusqua(async () => (await page.getByRole('radio', { name: 'Cartes' }).getAttribute('aria-checked')) === 'true', 5000), `[${gabarit}] mode Cartes`)
    const cartes = page.locator('[data-role="carte-direct"] [data-role="nom-chaine"]')
    v.ok(await jusqua(async () => (await cartes.count()) > 0, 5000), `[${gabarit}] cartes affichees`)
    await attendre(300)
    const nomsCartes = await cartes.evaluateAll((l) => l.slice(0, 6).map((e) => ({ t: e.textContent, tronque: e.scrollWidth > e.clientWidth + 1 })))
    v.ok(nomsCartes.length > 0 && nomsCartes.every((n) => !n.tronque), `[${gabarit}] CA2 cartes sans « Chaîn… » (${nomsCartes.map((n) => n.t).join(', ')})`)
    v.ok(/mode=cartes/.test(await chemin(page)), `[${gabarit}] CA7 le mode est dans l'URL (${await chemin(page)})`)
    v.ok(b.erreurs.length === 0, `[${gabarit}] aucune erreur de page (${b.erreurs.join(' | ').slice(0, 200)})`)
  } finally {
    await b.fermer()
  }
}

// --- Bureau : tri, N°, chaine en cours, zapping regroupe, guide, URL --------------------
console.log('--- bureau')
{
  const b = await demarrer({ gabarit: 'bureau', taille: TAILLE })
  const { page, serveur } = b
  const flux = await servirDirect(b)
  try {
    await ouvrirSession(b)
    await page.goto(`${serveur.origine}/direct`)
    const lignes = page.locator('[data-role="ligne-chaine"]')
    v.ok(await jusqua(async () => (await lignes.count()) > 3, 15_000), 'liste affichee')
    const noms = await lignes.locator('[data-role="nom-chaine"]').evaluateAll((l) => l.slice(0, 5).map((e) => e.textContent))
    // La 4K de « Chaîne 2 » vit dans cette categorie avec le numero 3 de sa
    // chaine mere : l'ordre du bouquet la place entre 0 et 3. Avant (tri par
    // nom), « Chaîne 12 » venait avant « Chaîne 3 » (A UX13).
    v.ok(noms.join('|') === 'Chaîne 0|Chaîne 2 4K|Chaîne 3|Chaîne 6|Chaîne 9', `CA2 triees par numero du bouquet, pas par nom (${noms.join(', ')})`)
    const numeros = await lignes.locator('span.num').evaluateAll((l) => l.filter((e) => /^\d+$/.test(e.textContent.trim())).slice(0, 3).map((e) => e.textContent.trim()))
    v.ok(numeros.join(',') === '1,3,4', `CA2 colonne N° = numero du fournisseur (${numeros.join(',')})`)
    v.ok((await page.getByRole('radio').evaluateAll((l) => l.map((e) => e.getAttribute('aria-label')))).join(',') === 'Liste,Cartes', 'CA5 le selecteur de mode n a plus « Guide TV »')
    const lienGuide = page.locator('[data-role="lien-guide"]')
    v.ok((await lienGuide.count()) === 1, 'CA5 « Guide TV » est un lien distinct')

    // Categorie dans l'URL, conservee au rechargement (CA7).
    const aside = page.locator('aside[aria-label="Catégories"]')
    await aside.locator('button[title="FR | Sport"]').first().click()
    v.ok(await jusqua(async () => /Sport/.test(await texte(page.locator('[data-role="titre-direct"]'))), 5000), 'categorie Sport choisie')
    const url1 = await chemin(page)
    v.ok(/^\/direct\?categorie=iptva%3A102/.test(url1), `CA7 la categorie est dans l'URL (${url1})`)
    await page.reload()
    v.ok(await jusqua(async () => /Sport/.test(await texte(page.locator('[data-role="titre-direct"]'))), 15_000), `CA7 rechargement : la categorie est conservee (${await texte(page.locator('[data-role="titre-direct"]'))})`)
    await page.locator('nav.rail').getByRole('button', { name: 'Films', exact: true }).click()
    await page.locator('nav.rail').getByRole('button', { name: /^Direct/ }).click()
    v.ok(await jusqua(async () => (await chemin(page)) === url1, 5000), `CA7 l'onglet Direct ramene a la categorie retenue (${await chemin(page)})`)
    await aside.locator('button[title="FR | Généralistes"]').first().click()
    await jusqua(async () => /Généralistes/.test(await texte(page.locator('[data-role="titre-direct"]'))), 5000)

    // Chaine en cours surlignee : ouvrir « Chaîne 0 » (variante HD recommandee), revenir.
    await lignes.first().click()
    v.ok(await jusqua(async () => /^\/lecture\/live:iptva:110000$/.test(await chemin(page)), 10_000), `la variante HD est ouverte (${await chemin(page)})`)
    v.ok(await jusqua(() => flux.some((p) => p.endsWith('.m3u8')), 10_000), 'playlist demandee (flux factice)')
    const bandeau = page.locator('[data-role="variante-jouee"]')
    v.ok(await jusqua(async () => (await bandeau.count()) > 0, 8000), `CA2 le bandeau annonce la variante jouee (${await texte(bandeau)})`)
    v.ok(/Variante HD/.test(await texte(bandeau)), 'CA2 « Variante HD · choisie pour votre liaison »')
    // Zapping regroupe : une entree par chaine.
    const zapping = page.locator('[data-role="entree-zapping"]')
    v.ok(await jusqua(async () => (await zapping.count()) > 0, 8000), 'colonne de zapping affichee')
    const titresZap = await zapping.evaluateAll((l) => l.map((e) => e.getAttribute('title')))
    v.ok(!titresZap.includes('Chaîne 0 HD'), `CA2 zapping sans ligne par variante (${titresZap.slice(0, 4).join(', ')})`)
    v.ok(titresZap.filter((t) => t === 'Chaîne 0').length === 1, 'CA2 une seule entree « Chaîne 0 »')
    const compteZap = await texte(page.locator('[data-role="zapping-compte"]'))
    v.ok(compteZap.trim() === String(titresZap.length), `compteur = nombre de groupes (${compteZap})`)
    v.ok((await zapping.first().getAttribute('aria-current')) === 'true', 'CA2 le groupe de la variante jouee est surligne')
    // Mini-guide regroupe.
    await page.locator('[tabindex="-1"]').first().focus()
    await page.keyboard.press('g')
    const mini = page.locator('[data-role="entree-mini-guide"]')
    v.ok(await jusqua(async () => (await mini.count()) > 0, 5000), 'mini-guide ouvert')
    const nomsMini = await mini.evaluateAll((l) => l.map((e) => e.textContent))
    v.ok(!nomsMini.some((t) => /Chaîne 0 HD|Chaîne 0 4K/.test(t)), 'CA2 mini-guide sans ligne par variante')
    await page.keyboard.press('Escape')
    // Retour a la liste : la chaine jouee est surlignee.
    await page.locator('nav.rail').getByRole('button', { name: /^Direct/ }).click()
    v.ok(await jusqua(async () => (await chemin(page)).startsWith('/direct'), 5000), 'retour a Direct')
    v.ok(await jusqua(async () => (await lignes.first().getAttribute('aria-current')) === 'true', 5000), 'CA2 la chaine en cours est surlignee dans la liste')
    v.ok((await lignes.nth(1).getAttribute('aria-current')) === null, 'les autres lignes ne le sont pas')
    // Lien Guide TV.
    await lienGuide.click()
    v.ok(await jusqua(async () => (await chemin(page)) === '/guide', 5000), `CA5 « Guide TV » ouvre le guide (${await chemin(page)})`)
    v.ok(b.erreurs.length === 0, `aucune erreur de page (${b.erreurs.join(' | ').slice(0, 200)})`)
    v.ok(b.externes.length === 0, 'aucune requete hors 127.0.0.1')
  } finally {
    await b.fermer()
  }
}
v.termine()
