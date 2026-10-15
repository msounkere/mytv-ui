import { chromium } from 'playwright'
const nav = await chromium.launch()
const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message))
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Réglages' }).click()
await page.getByRole('button', { name: 'Importer le catalogue' }).click()
await page.waitForFunction(() => /entrées importées/.test(document.body.innerText), null, { timeout: 120000 })
await page.getByRole('button', { name: 'Guide' }).click()
await page.waitForTimeout(1500)
await page.getByRole('button', { name: 'Charger le guide' }).first().click()
await page.waitForFunction(() => /\d[\d  ]* programmes/.test(document.querySelector('main')?.innerText ?? ''), null, { timeout: 420000 })
console.log('import termine')
// Recharger la page : l EPG est deja en base.
await page.reload({ waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Guide' }).click()
await page.waitForTimeout(6000)

const d = await page.evaluate(() => {
  const main = document.querySelector('main')
  // Chercher le conteneur de defilement de la grille
  const scrollers = [...main.querySelectorAll('div')].filter(e => getComputedStyle(e).overflow === 'auto' || getComputedStyle(e).overflowY === 'auto')
  return {
    entete: main?.innerText?.split('\n').find(l => l.includes('affichée')) ?? '',
    nbScrollers: scrollers.length,
    dims: scrollers.slice(0,3).map(e => ({ h: Math.round(e.getBoundingClientRect().height), sh: e.scrollHeight, enfants: e.children.length })),
    boutonsLignes: main.querySelectorAll('button[title]').length,
    texteGrille: main?.innerText?.slice(0, 400),
  }
})
console.log(JSON.stringify(d, null, 1))
await page.screenshot({ path: 'ecran-guide2.png' })
await nav.close()
