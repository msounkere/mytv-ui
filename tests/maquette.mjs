import { chromium } from 'playwright'
const nav = await chromium.launch()
const page = await nav.newPage({ viewport: { width: 1440, height: 900 } })
page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message.slice(0, 200)))
await page.goto('http://127.0.0.1:8777/Lecteur%20IPTV.dc.html', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(5000)
const t = await page.evaluate(() => document.body.innerText.slice(0, 600))
console.log('--- texte de la maquette ---')
console.log(t)
await page.screenshot({ path: 'captures/maquette-1.png' })
// Les ecrans de la maquette sont pilotes par des boutons : on les enumere.
const btns = await page.evaluate(() => [...document.querySelectorAll('button')].map(b => b.innerText.trim()).filter(Boolean).slice(0, 30))
console.log('\nboutons:', JSON.stringify(btns))
await nav.close()
