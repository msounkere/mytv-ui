import { chromium } from 'playwright'
const PROFIL = '/tmp/claude-0/-root/af0bfe04-324f-47cd-9f6b-faadeffb4ea5/scratchpad/profil-mytv'
const nav = await chromium.launchPersistentContext(PROFIL, { viewport: { width: 1440, height: 900 } })
const page = nav.pages()[0] ?? await nav.newPage()
const journal = []
page.on('pageerror', (e) => journal.push('[PAGEERROR] ' + e.message.slice(0, 220)))
page.on('console', (m) => { if (m.type() === 'error') journal.push('[err] ' + m.text().slice(0, 200)) })
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
// Remise à plat des épingles laissées par les essais.
await page.evaluate(async () => {
  const d = await new Promise((r) => { const q = indexedDB.open('mytv'); q.onsuccess = () => r(q.result) })
  await new Promise((r) => { const q = d.transaction('reglages', 'readwrite').objectStore('reglages').delete('epingles.live'); q.onsuccess = () => r() })
})
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

await page.locator('.rail-item', { hasText: 'Accueil' }).first().click()
await page.waitForTimeout(3000)
await page.screenshot({ path: 'captures/v3-accueil.png' })

await page.locator('.rail-item', { hasText: 'Direct' }).first().click()
await page.waitForTimeout(3000)
// Une catégorie française, plus parlante pour le guide
await page.getByPlaceholder('Rechercher une catégorie').fill('france')
await page.waitForTimeout(900)
await page.screenshot({ path: 'captures/v3-direct-recherche.png' })
const cible = page.locator('button[title="FRANCE HEVC"]').first()
if (await cible.count()) await cible.click()
await page.waitForTimeout(1500)
await page.locator('button[aria-label^="Épingler"]').first().click()
await page.waitForTimeout(600)
await page.getByLabel('Effacer la recherche').click()
await page.waitForTimeout(1800)
await page.screenshot({ path: 'captures/v3-direct-liste.png' })
console.log('LISTE :', await page.evaluate(() => {
  const sec = [...document.querySelectorAll('section')].find(s => s.querySelector('h1'))
  const zone = [...sec.querySelectorAll('div')].find(d => getComputedStyle(d).overflowY === 'auto')
  const l = [...zone.querySelectorAll('button[title]')]
  return JSON.stringify({ titre: sec.querySelector('h1').textContent, lignesDOM: l.length,
    total: zone.firstElementChild.style.height, exemple: l[0]?.innerText.replace(/\n/g, ' · ').slice(0, 70) })
}))

await page.getByRole('radio', { name: 'Cartes' }).click()
await page.waitForTimeout(2500)
await page.screenshot({ path: 'captures/v3-direct-cartes.png' })
console.log('CARTES :', await page.evaluate(() => {
  const sec = [...document.querySelectorAll('section')].find(s => s.querySelector('h1'))
  const zone = [...sec.querySelectorAll('div')].find(d => getComputedStyle(d).overflowY === 'auto')
  const c = [...zone.querySelectorAll('button[title]')]
  const rangees = [...sec.querySelectorAll('div')].filter(d => /^repeat\(/.test(d.style.gridTemplateColumns||''))
  return JSON.stringify({ cartesDOM: c.length, rangeesDOM: rangees.length, cols: rangees[0]?.style.gridTemplateColumns,
    total: zone.firstElementChild.style.height, exemple: c[0]?.innerText.replace(/\n/g, ' · ').slice(0, 70) })
}))
await page.getByRole('radio', { name: 'Liste' }).click()
await page.waitForTimeout(1200)
await page.getByRole('radio', { name: 'Guide TV' }).click()
await page.waitForTimeout(3500)
await page.screenshot({ path: 'captures/v3-direct-guide.png' })

await page.locator('.rail-item', { hasText: 'Films' }).first().click()
await page.waitForFunction(() => /films$/.test([...document.querySelectorAll('h1')].pop()?.nextElementSibling?.textContent || ''), null, { timeout: 40000 })
await page.waitForTimeout(1800)
await page.screenshot({ path: 'captures/v3-films.png' })
await page.getByRole('button', { name: 'Nouveautés' }).first().click()
await page.waitForTimeout(1200)
await page.screenshot({ path: 'captures/v3-films-nouveautes.png' })
await page.getByRole('button', { name: 'Tout effacer' }).first().click()
await page.waitForTimeout(900)
await page.locator('.rail-item', { hasText: 'Séries' }).first().click()
await page.waitForTimeout(4000)
await page.screenshot({ path: 'captures/v3-series.png' })
console.log('\nJOURNAL:', journal.length ? journal.join('\n') : 'aucune erreur')
await nav.close()
