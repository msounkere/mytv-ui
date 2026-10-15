import { chromium } from 'playwright'
const nav = await chromium.launch()
const page = await nav.newPage({ viewport: { width: 1440, height: 900 } })
const journal = []
page.on('pageerror', (e) => journal.push(`[ERREUR] ${e.message}`))

await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Réglages' }).click()
await page.getByRole('button', { name: 'Importer le catalogue' }).click()
await page.waitForFunction(() => /entrées importées/.test(document.body.innerText), null, { timeout: 120000 })

await page.getByRole('button', { name: 'Rechercher' }).click()
const t0 = Date.now()
await page.waitForFunction(() => /entrées indexées/.test(document.body.innerText), null, { timeout: 180000 })
console.log(`indexation: ${((Date.now() - t0) / 1000).toFixed(1)} s`)
console.log('etat:', await page.evaluate(() => document.body.innerText.split('\n').find(l => l.includes('indexées'))))

for (const terme of ['tf1', 'canal', 'matrix']) {
  const d = Date.now()
  await page.getByPlaceholder('Rechercher une chaîne, un film, une série').fill(terme)
  await page.waitForTimeout(700)
  const res = await page.evaluate(() => {
    const t = document.body.innerText
    return {
      compte: t.split('\n').find(l => l.includes('résultat')) ?? '(aucun)',
      premiers: [...document.querySelectorAll('button[title]')].map(b => b.title).filter(x => x !== 'Masquer cette catégorie').slice(0, 5),
    }
  })
  console.log(`\n« ${terme} » en ${Date.now() - d} ms`)
  console.log('  ', res.compte)
  console.log('  ', JSON.stringify(res.premiers))
}
await page.screenshot({ path: 'ecran-recherche.png' })
console.log('\njournal:', journal.length ? journal.join('\n') : 'aucune erreur')
await nav.close()
