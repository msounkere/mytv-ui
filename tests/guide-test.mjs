import { chromium } from 'playwright'
const nav = await chromium.launch()
const page = await nav.newPage({ viewport: { width: 1440, height: 900 } })
page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message))
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Réglages' }).click()
await page.getByRole('button', { name: 'Importer le catalogue' }).click()
await page.waitForFunction(() => /entrées importées/.test(document.body.innerText), null, { timeout: 120000 })

await page.getByRole('button', { name: 'Guide' }).click()
await page.waitForTimeout(2500)
console.log('--- etat initial du guide ---')
console.log((await page.evaluate(() => document.querySelector('main')?.innerText?.slice(0,400))) ?? '(vide)')

// Declencher l import EPG si un bouton le propose
const boutons = await page.evaluate(() => [...document.querySelectorAll('main button')].map(b => b.innerText.trim()).filter(Boolean))
console.log('boutons:', JSON.stringify(boutons.slice(0, 10)))
const imp = boutons.find(b => /import|charg|télécharg/i.test(b))
if (imp) {
  console.log('-> clic sur:', imp)
  const t0 = Date.now()
  await page.getByRole('button', { name: imp }).first().click()
  await page.waitForFunction(
    () => /programmes|chaînes avec guide|affichées/i.test(document.querySelector('main')?.innerText ?? ''),
    null, { timeout: 300000 })
  console.log(`import EPG: ${((Date.now()-t0)/1000).toFixed(1)} s`)
}
await page.waitForTimeout(4000)
console.log('--- guide apres import ---')
console.log((await page.evaluate(() => document.querySelector('main')?.innerText?.slice(0,600))) ?? '(vide)')
await page.screenshot({ path: 'ecran-guide.png' })
await nav.close()
