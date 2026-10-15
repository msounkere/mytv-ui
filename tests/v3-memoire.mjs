import { chromium } from 'playwright'
const PROFIL = '/tmp/claude-0/-root/af0bfe04-324f-47cd-9f6b-faadeffb4ea5/scratchpad/profil-mytv'
const nav = await chromium.launchPersistentContext(PROFIL, { viewport: { width: 1440, height: 900 } })
const page = nav.pages()[0] ?? await nav.newPage()
page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message.slice(0, 200)))
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await page.locator('.rail-item', { hasText: 'Direct' }).first().click()
await page.waitForTimeout(2500)

const trouver = `[...document.querySelectorAll('div')].find(d => getComputedStyle(d).overflowY === 'auto' && d.closest('section') && d.querySelector('button[title]'))`
const zone = () => page.evaluate(new Function(`const z = ${trouver}; return z ? Math.round(z.scrollTop) : null`))
const defiler = (y) => page.evaluate(new Function('y', `const z = ${trouver}; if (z) z.scrollTop = y`), y)
const titre2 = () => page.evaluate(() => [...document.querySelectorAll('h1')].pop()?.textContent)
const choisir = async (titre) => {
  await page.locator(`button[title="${titre}"]`).first().click()
  await page.waitForTimeout(1800)
}
const titre = titre2

await choisir('USA NEWS')
await defiler(900); await page.waitForTimeout(500)
console.log('A · liste · défilé à', await zone(), '—', await titre())
await choisir('USA KIDS')
await defiler(400); await page.waitForTimeout(500)
console.log('B · liste · défilé à', await zone(), '—', await titre())
await choisir('USA NEWS')
console.log('retour A · liste →', await zone(), '(attendu 900)')

await page.getByRole('radio', { name: 'Cartes' }).click()
await page.waitForTimeout(2000)
console.log('A · cartes · à l’ouverture →', await zone(), '(attendu 0 : autre mode)')
await defiler(1500); await page.waitForTimeout(500)
console.log('A · cartes · défilé à', await zone())
await page.getByRole('radio', { name: 'Liste' }).click()
await page.waitForTimeout(1800)
console.log('A · liste · retour →', await zone(), '(attendu 900)')
await page.getByRole('radio', { name: 'Cartes' }).click()
await page.waitForTimeout(1800)
console.log('A · cartes · retour →', await zone(), '(attendu 1500)')
await choisir('USA KIDS')
console.log('B · cartes →', await zone(), '(attendu 0 : jamais défilé en cartes)')
await nav.close()
