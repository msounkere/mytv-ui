import { chromium } from 'playwright'
const nav = await chromium.launch()
const page = await nav.newPage({ viewport: { width: 1440, height: 900 } })
const err = []
page.on('pageerror', (e) => err.push(e.message.slice(0,140)))
page.on('console', (m) => { if (m.type()==='error') err.push(m.text().slice(0,140)) })
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /Réglages/ }).click()
await page.getByRole('button', { name: 'Importer le catalogue' }).click()
await page.waitForFunction(() => /entrées importées/.test(document.body.innerText), null, { timeout: 150000 })
await page.getByRole('button', { name: /^Accueil$/ }).first().click()
await page.waitForTimeout(6000)
const a = await page.evaluate(() => {
  const t = document.querySelector('main')?.innerText ?? ''
  return {
    rangees: [...document.querySelectorAll('main h2')].map(h => h.innerText.trim()),
    cartes: document.querySelectorAll('main button[title], main article').length,
    debut: t.slice(0, 160).replace(/\n+/g, ' | '),
  }
})
console.log('rangées Accueil :', JSON.stringify(a.rangees))
console.log('éléments        :', a.cartes)
console.log('début           :', a.debut)
await page.screenshot({ path: 'captures/nonreg-accueil.png' })
console.log('erreurs :', err.length ? err.slice(0,4).join(' | ') : 'aucune')
await nav.close()
