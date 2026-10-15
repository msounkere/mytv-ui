import { chromium } from 'playwright'
const nav = await chromium.launch()
const page = await nav.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(2500)
const allerA = async (l) => { await page.evaluate((x) => { const b=[...document.querySelectorAll('.rail-item')].find(e=>e.textContent.trim().endsWith(x)); b?.click() }, l); await page.waitForTimeout(2200) }
await allerA('Réglages')
await page.locator('button', { hasText: /Importer le catalogue/i }).first().click()
for (let i = 0; i < 100; i++) { await page.waitForTimeout(2000); if (/entrées importées/.test(await page.evaluate(() => document.body.innerText))) break }
for (const e of ['Films', 'Séries']) {
  await allerA(e)
  console.log(e, '— affiches rendues :', await page.evaluate(() => document.querySelectorAll('main img, main [style*="aspect-ratio"]').length), '| entête :', await page.evaluate(()=>document.querySelector('main').innerText.replace(/\s+/g,' ').slice(0,46)))
}
// Lecteur VOD : c'est la que vivent `restore` et `ondemand_video`
await allerA('Films')
await page.evaluate(() => { const b=[...document.querySelectorAll('main button')].filter(e=>e.offsetWidth>100&&e.offsetWidth<260); b[0]?.click() })
await page.waitForTimeout(9000)
await page.mouse.move(700, 500); await page.waitForTimeout(1200)
await page.screenshot({ path: 'captures/V2-apres-lecteur-repli.png' })
const repli = await page.evaluate(() => [...document.querySelectorAll('span.icone')].filter(e=>e.textContent.trim()).map(e => {
  const r = e.getBoundingClientRect(); const c = getComputedStyle(e)
  return `"${e.textContent.trim()}" ${Math.round(r.width)}x${Math.round(r.height)} police:${c.fontFamily}`
}))
console.log('repli dans le lecteur :', repli.length ? repli : 'aucun')
await nav.close()
