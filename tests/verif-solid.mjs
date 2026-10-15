import { chromium } from 'playwright'
const nav = await chromium.launch()
const page = await nav.newPage({ viewport: { width: 1440, height: 900 } })
const avert = []
page.on('console', (m) => { if (m.type() !== 'debug') avert.push(`[${m.type()}] ${m.text().slice(0,200)}`) })
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
console.log('=== CONSOLE ===')
console.log(avert.join('\n') || '  rien')
await nav.close()
