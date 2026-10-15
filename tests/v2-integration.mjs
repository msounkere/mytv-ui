import { chromium } from 'playwright'
const nav = await chromium.launch()
const page = await nav.newPage({ viewport: { width: 1440, height: 900 } })
const erreurs = []
page.on('pageerror', (e) => erreurs.push('[PAGEERROR] ' + e.message.slice(0, 200)))
page.on('console', (m) => { if (m.type() === 'error') erreurs.push('[CONSOLE] ' + m.text().slice(0, 160)) })
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(2500)

const allerA = async (lbl) => {
  await page.evaluate((l) => { const b=[...document.querySelectorAll('.rail-item')].find(e=>e.textContent.trim().endsWith(l)); b?.click() }, lbl)
  await page.waitForTimeout(2500)
}
// 1. Import du catalogue reel
await allerA('Réglages')
const btn = page.locator('button', { hasText: /Importer le catalogue/i }).first()
if (await btn.count()) {
  await btn.click()
  console.log('import lance…')
  for (let i = 0; i < 90; i++) {
    await page.waitForTimeout(2000)
    const t = await page.evaluate(() => document.body.innerText)
    if (/\b154\s?060\b|154060|entrées? importées|Catalogue à jour|importé/i.test(t)) break
  }
  await page.waitForTimeout(2000)
}
const txtReg = await page.evaluate(() => document.body.innerText.replace(/\s+/g,' ').slice(0, 300))
console.log('Réglages:', txtReg)

// 2. Comptage des lignes virtualisees
const compter = async (lbl) => {
  await allerA(lbl)
  await page.waitForTimeout(2200)
  const n = await page.evaluate(() => {
    const m = document.querySelector('main')
    return { lignes: m.querySelectorAll('[data-index]').length, boutons: m.querySelectorAll('button').length, txt: m.innerText.replace(/\s+/g,' ').slice(0,120) }
  })
  console.log(`${lbl}: ${n.lignes} elements virtualises, ${n.boutons} boutons | ${n.txt}`)
  await page.screenshot({ path: `captures/v2-${lbl.toLowerCase().replace(/[^a-z]/g,'')}.png` })
  return n.lignes
}
for (const l of ['Direct', 'Films', 'Séries', 'Guide']) await compter(l)

console.log('erreurs:', erreurs.length ? erreurs.slice(0,6) : 'aucune')
await nav.close()
