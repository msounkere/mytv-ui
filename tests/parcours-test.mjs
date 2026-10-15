import { chromium } from 'playwright'

const navigateur = await chromium.launch()
const page = await navigateur.newPage({ viewport: { width: 1440, height: 900 } })
const journal = []
page.on('pageerror', (e) => journal.push(`[PAGEERROR] ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') journal.push(`[${m.type()}] ${m.text().slice(0,160)}`) })

// Import prealable dans ce profil neuf.
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Réglages' }).click()
await page.getByRole('button', { name: 'Importer le catalogue' }).click()
await page.waitForFunction(
  () => /\d[\d\u202f\u00a0 ]* entrées importées/.test(document.body.innerText),
  null,
  { timeout: 120000 },
)
console.log('import: ok')

await page.getByRole('button', { name: 'Parcours' }).click()
await page.waitForTimeout(1500)

const diag = await page.evaluate(() => {
  const t = document.body.innerText
  return t.split('\n').find((l) => l.includes('en base')) ?? '(ligne de diagnostic absente)'
})
console.log('diagnostic:', diag)

// Combien de lignes de categorie sont reellement montees dans le DOM ?
const nbCat = await page.evaluate(() => document.querySelectorAll('aside button[title]').length)
console.log('categories montees dans le DOM:', nbCat)

const premieres = await page.evaluate(() =>
  [...document.querySelectorAll('aside button[title]')].slice(0, 6).map((b) => b.title))
console.log('exemples:', JSON.stringify(premieres))

// Filtrer sur « FR » puis ouvrir la premiere categorie trouvee.
await page.getByPlaceholder('Filtrer les catégories').fill('FR')
await page.waitForTimeout(900)
const apresFiltre = await page.evaluate(() =>
  [...document.querySelectorAll('aside button[title]')].slice(0, 5).map((b) => b.title))
console.log('apres filtre « FR »:', JSON.stringify(apresFiltre))

if (apresFiltre.length) {
  await page.locator('aside button[title]').first().click()
  await page.waitForTimeout(1500)
  const nbChaines = await page.evaluate(() => document.querySelectorAll('section button[title]').length)
  const exemples = await page.evaluate(() =>
    [...document.querySelectorAll('section button[title]')].slice(0, 5).map((b) => b.title))
  console.log('chaines montees:', nbChaines)
  console.log('exemples:', JSON.stringify(exemples))
}

await page.screenshot({ path: 'parcours.png' })
console.log('\njournal:', journal.length ? journal.slice(0, 10).join('\n') : 'aucune erreur')
await navigateur.close()
