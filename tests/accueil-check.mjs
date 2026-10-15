import { chromium } from 'playwright'
const nav = await chromium.launch()
const page = await nav.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /Réglages/ }).click()
await page.getByRole('button', { name: 'Importer le catalogue' }).click()
await page.waitForFunction(() => /entrées importées/.test(document.body.innerText), null, { timeout: 120000 })
await page.getByRole('button', { name: /^Accueil$/ }).first().click()
await page.waitForTimeout(3000)
const d = await page.evaluate(() => ({
  balises: [...document.body.querySelectorAll('main, aside, nav, section')].map(e => e.tagName.toLowerCase()),
  boutonsTotal: document.querySelectorAll('button').length,
  inputs: document.querySelectorAll('input').length,
  texte: document.body.innerText.slice(0, 300).replace(/\n+/g, ' | '),
}))
console.log(JSON.stringify(d, null, 1))
await nav.close()
