import { chromium } from 'playwright'
const nav = await chromium.launch()
const page = await nav.newPage({ viewport: { width: 1440, height: 900 } })
page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message))
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Réglages' }).click()
await page.getByRole('button', { name: 'Importer le catalogue' }).click()
await page.waitForFunction(() => /entrées importées/.test(document.body.innerText), null, { timeout: 120000 })

await page.getByRole('button', { name: 'Rechercher' }).click()
await page.waitForFunction(() => /entrées indexées/.test(document.body.innerText), null, { timeout: 180000 })
await page.getByPlaceholder('Rechercher une chaîne, un film, une série').fill('breaking bad')
await page.waitForTimeout(1200)

// Cliquer le premier resultat de la section SERIES
const ok = await page.evaluate(() => {
  const sections = [...document.querySelectorAll('section')]
  const s = sections.find(x => /s[ée]ries/i.test(x.querySelector('h2')?.innerText ?? ''))
  const b = s?.querySelector('button')
  if (b) { b.click(); return b.title }
  return null
})
console.log('serie ouverte:', JSON.stringify(ok))
await page.waitForTimeout(6000)
const vu = await page.evaluate(() => document.querySelector('main')?.innerText?.slice(0, 700) ?? '(vide)')
console.log('--- fiche serie ---')
console.log(vu)
await page.screenshot({ path: 'ecran-serie.png' })
await nav.close()
