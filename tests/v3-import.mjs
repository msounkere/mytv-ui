import { chromium } from 'playwright'
const DIR = '/tmp/claude-0/-root/af0bfe04-324f-47cd-9f6b-faadeffb4ea5/scratchpad/profil-rech'
const ctx = await chromium.launchPersistentContext(DIR, { viewport: { width: 1440, height: 900 } })
const page = ctx.pages()[0] ?? await ctx.newPage()
page.on('pageerror', (e) => console.log('[ERR]', e.message.slice(0, 200)))
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(1500)
const compte = async () => page.evaluate(async () => {
  const d = await new Promise((r) => { const q = indexedDB.open('mytv'); q.onsuccess = () => r(q.result) })
  if (!d.objectStoreNames.contains('catalogue')) return 0
  return new Promise((r) => { const q = d.transaction('catalogue').objectStore('catalogue').count(); q.onsuccess = () => r(q.result) })
})
let n = await compte()
console.log('avant', n)
if (n < 100000) {
  await page.getByRole('button', { name: /Réglages/ }).first().click().catch(() => {})
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Importer le catalogue' }).click()
  for (let i = 0; i < 180; i++) {
    await page.waitForTimeout(2000)
    n = await compte()
    if (i % 5 === 0) console.log('…', n)
    if (n > 150000) break
  }
}
console.log('APRES IMPORT', await compte())
await page.screenshot({ path: 'captures/v3-import.png' })
await ctx.close()
