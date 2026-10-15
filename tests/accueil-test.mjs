import { chromium } from 'playwright'
const nav = await chromium.launch()
const page = await nav.newPage({ viewport: { width: 1440, height: 900 } })
const journal = []
page.on('pageerror', (e) => journal.push(`[ERREUR] ${e.message}`))

await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Réglages' }).click()
await page.getByRole('button', { name: 'Importer le catalogue' }).click()
await page.waitForFunction(() => /entrées importées/.test(document.body.innerText), null, { timeout: 120000 })

// Creer de l historique et un favori en ouvrant une chaine.
await page.getByRole('button', { name: 'Parcours' }).click()
await page.waitForTimeout(1000)
await page.getByPlaceholder('Filtrer les catégories').fill('FR')
await page.waitForTimeout(700)
await page.locator('aside button[title]').first().click()
await page.waitForTimeout(1200)
await page.locator('section button[title]').nth(1).click()
await page.waitForTimeout(2500)
await page.getByRole('button', { name: /Favori/ }).click()
await page.waitForTimeout(600)
console.log('favori marque:', await page.getByRole('button', { name: /Favori/ }).innerText())

await page.getByRole('button', { name: 'Accueil' }).click()
await page.waitForTimeout(2000)
const vu = await page.evaluate(() => document.body.innerText.slice(0, 500))
console.log('--- contenu de l Accueil ---')
console.log(vu)
await page.screenshot({ path: 'ecran-accueil.png' })

// La recherche depuis l Accueil doit arriver pre-remplie.
const champ = page.locator('input').first()
await champ.fill('matrix')
await champ.press('Enter')
await page.waitForTimeout(3500)
console.log('\n--- apres recherche depuis l Accueil ---')
console.log(await page.evaluate(() => document.body.innerText.split('\n').filter(l=>l.trim()).slice(0,6).join(' | ')))
console.log('\njournal:', journal.length ? journal.join('\n') : 'aucune erreur')
await nav.close()
