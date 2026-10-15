import { chromium } from 'playwright'
const PROFIL = '/tmp/claude-0/-root/af0bfe04-324f-47cd-9f6b-faadeffb4ea5/scratchpad/profil-mytv'
const nav = await chromium.launchPersistentContext(PROFIL, { viewport: { width: 1440, height: 900 } })
const page = nav.pages()[0] ?? await nav.newPage()
page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message.slice(0, 200)))
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
const pret = () => page.waitForFunction(
  () => [...document.querySelectorAll('div')].some(d => getComputedStyle(d).overflowY === 'auto' && d.querySelector('button[title]')),
  null, { timeout: 30000 })

await page.locator('.rail-item', { hasText: 'Films' }).first().click()
await pret(); await page.waitForTimeout(1500)
await page.screenshot({ path: 'captures/v2-apres-films.png' })

await page.getByRole('button', { name: /^Genre/ }).first().click(); await page.waitForTimeout(300)
await page.getByRole('option', { name: 'Comédie', exact: true }).first().click(); await page.waitForTimeout(200)
await page.keyboard.press('Escape'); await page.waitForTimeout(200)
await page.getByRole('button', { name: /^Pays/ }).first().click(); await page.waitForTimeout(300)
await page.getByRole('option', { name: 'France', exact: true }).first().click(); await page.waitForTimeout(200)
await page.keyboard.press('Escape'); await page.waitForTimeout(900)
await page.screenshot({ path: 'captures/v2-apres-films-filtre.png' })

await page.getByRole('button', { name: /^Année/ }).first().click(); await page.waitForTimeout(300)
await page.screenshot({ path: 'captures/v2-apres-menu.png' })
await page.getByRole('option', { name: '2020 – 2024', exact: true }).first().click(); await page.waitForTimeout(900)
await page.getByRole('button', { name: 'Son lisible' }).first().click(); await page.waitForTimeout(900)
await page.screenshot({ path: 'captures/v2-apres-films-combine.png' })
console.log('combiné :', await page.evaluate(() => [...document.querySelectorAll('h1')].pop()?.nextElementSibling?.textContent))

await page.getByRole('button', { name: /^Service/ }).first().click(); await page.waitForTimeout(300)
await page.getByRole('option', { name: 'Movistar+', exact: true }).first().click().catch(() => {}); await page.waitForTimeout(200)
await page.keyboard.press('Escape'); await page.waitForTimeout(900)
await page.screenshot({ path: 'captures/v2-apres-films-vide.png' })

await page.getByRole('button', { name: 'Tout effacer' }).first().click(); await page.waitForTimeout(900)
await page.locator('.rail-item', { hasText: 'Séries' }).first().click()
await pret(); await page.waitForTimeout(1500)
await page.screenshot({ path: 'captures/v2-apres-series.png' })
await page.locator('.rail-item', { hasText: 'Direct' }).first().click(); await page.waitForTimeout(2200)
await page.screenshot({ path: 'captures/v2-apres-direct.png' })
console.log('captures faites')
await nav.close()
