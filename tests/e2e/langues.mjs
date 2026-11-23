// Réglages > Catalogue : langues affichées par profil (retour du 22/11 : le filtre « FR » de la box
// ne s'appliquait pas a l'interface). Catalogue factice : films « Film Test i », categorie [FR]
// pour i % 3 = 0 ou 1, [EN] pour i % 3 = 2.
//   NODE_OPTIONS=--tls-max-v1.2 node tests/e2e/langues.mjs
import { demarrer, ouvrirSession, creerVerificateur, jusqua, texte } from './us47-commun.mjs'

const v = creerVerificateur('Langues affichees')
const b = await demarrer()
const { page, serveur } = b
const titres = (loc) => loc.evaluate((el) => el.innerText)
try {
  await ouvrirSession(b)
  const accueil = page.locator('section[aria-label="Films récemment ajoutés"]')
  await page.goto(`${serveur.origine}/`)
  v.ok(await jusqua(async () => /Film Test 2\b/.test(await titres(accueil).catch(() => '')), 15_000), 'au depart, l’Accueil propose aussi un film anglais (Film Test 2)')

  console.log('1. Reglages > Catalogue : cocher Français')
  await page.goto(`${serveur.origine}/reglages?onglet=catalogue`)
  const section = page.locator('[data-role="langues-affichees"]')
  await section.waitFor()
  v.ok(/Toutes les langues/.test(await texte(section.locator('[data-role="langues-resume"]'))), 'au depart : toutes les langues')
  await section.getByLabel('Français', { exact: true }).check()
  v.ok(await jusqua(async () => /^Français$/.test((await texte(section.locator('[data-role="langues-resume"]'))).trim()), 3000), 'le resume dit « Français »')
  v.ok(await jusqua(() => [...serveur.etat.reglages.values()].some((r) => r.valeurs['langues.preferees'] === '["fr"]'), 10_000), 'la preference part vers le serveur (profil, synchronisee)')

  console.log('2. Accueil : seulement du français')
  await page.goto(`${serveur.origine}/`)
  v.ok(await jusqua(async () => /Film Test 0\b/.test(await titres(accueil).catch(() => '')), 15_000), 'l’Accueil propose Film Test 0 (FR)')
  v.ok(!/Film Test (2|5|8)\b/.test(await titres(accueil)), 'et plus aucun film anglais (Film Test 2, 5, 8)')

  console.log('3. Films : s’ouvre filtre sur le français, un geste pour tout voir')
  await page.goto(`${serveur.origine}/films`)
  const grille = page.locator('main')
  v.ok(await jusqua(async () => /Film Test 0\b/.test(await titres(grille)), 15_000), 'la grille montre Film Test 0')
  v.ok(!/Film Test 2\b/.test(await titres(grille)), 'mais pas Film Test 2 (anglais)')
  v.ok(await page.getByRole('button', { name: 'Tout effacer' }).isVisible(), 'le filtre de langue est visible (pastille + « Tout effacer »)')
  await page.getByRole('button', { name: 'Tout effacer' }).click()
  v.ok(await jusqua(async () => /Film Test 2\b/.test(await titres(grille)), 10_000), '« Tout effacer » montre tout, anglais compris')
  v.ok(b.erreurs.length === 0, `aucune erreur de page (${b.erreurs.join(' | ')})`)
} finally {
  await b.fermer()
}
v.termine()
