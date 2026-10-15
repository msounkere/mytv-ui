import { chromium } from 'playwright'
const nav = await chromium.launch()
const page = await nav.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(2500)
const allerA = async (l) => { await page.evaluate((x) => { const b=[...document.querySelectorAll('.rail-item')].find(e=>e.textContent.trim().endsWith(x)); b?.click() }, l); await page.waitForTimeout(2200) }
await allerA('Réglages')
await page.locator('button', { hasText: /Importer le catalogue/i }).first().click()
for (let i = 0; i < 100; i++) { await page.waitForTimeout(2000); if (/entrées importées/.test(await page.evaluate(() => document.body.innerText))) break }
await allerA('Films')
await page.evaluate(() => { const t=[...document.querySelectorAll('main *')].find(e=>e.textContent.trim()==='Lenin'&&e.children.length===0); (t.closest('button')||t.closest('[role=button]')||t.parentElement).click() })
await page.waitForTimeout(10000)
await page.mouse.move(700, 450); await page.waitForTimeout(1000)
await page.screenshot({ path: 'captures/V2-apres-lecteur.png' })
console.log('écran:', await page.evaluate(()=>document.querySelector('.entete-titre').textContent))
console.log('repli visible:', await page.evaluate(() => [...document.querySelectorAll('span.icone')].filter(e=>e.textContent.trim()&&e.getBoundingClientRect().width>0).map(e=>`"${e.textContent.trim()}" ${Math.round(e.getBoundingClientRect().width)}px`)))
await nav.close()
