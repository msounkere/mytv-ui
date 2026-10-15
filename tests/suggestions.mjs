import { chromium } from 'playwright'
const nav = await chromium.launch()
const page = await nav.newPage({ viewport: { width: 1440, height: 900 } })
page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message.slice(0,160)))
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /Réglages/ }).click()
await page.getByRole('button', { name: 'Importer le catalogue' }).click()
await page.waitForFunction(() => /entrées importées/.test(document.body.innerText), null, { timeout: 150000 })
await page.getByRole('button', { name: /^Accueil$/ }).first().click()
await page.waitForTimeout(1500)

// La touche « / » doit ouvrir la recherche depuis l'Accueil
await page.keyboard.press('/')
await page.waitForTimeout(400)
await page.keyboard.type('matrix', { delay: 60 })
await page.waitForTimeout(2500)
const d = await page.evaluate(() => {
  const t = document.body.innerText
  const bloc = t.slice(t.indexOf('matrix'))
  return { extrait: bloc.slice(0, 420).replace(/\n+/g, ' | ') }
})
console.log('--- panneau de suggestions ---')
console.log(d.extrait)
await page.screenshot({ path: 'captures/suggestions.png' })
// Navigation clavier puis Entrée
await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown')
await page.waitForTimeout(300)
await page.keyboard.press('Enter')
await page.waitForTimeout(3000)
console.log('\naprès Entrée → écran :', await page.evaluate(() => document.querySelector('h1')?.innerText ?? '?'))
await nav.close()
