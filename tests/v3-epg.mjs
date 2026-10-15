import { chromium } from 'playwright'
const PROFIL = '/tmp/claude-0/-root/af0bfe04-324f-47cd-9f6b-faadeffb4ea5/scratchpad/profil-mytv'
const nav = await chromium.launchPersistentContext(PROFIL, { viewport: { width: 1440, height: 900 } })
const page = nav.pages()[0] ?? await nav.newPage()
page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message.slice(0, 200)))
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await page.locator('.rail-item', { hasText: 'Guide' }).first().click()
await page.waitForTimeout(2000)
const b = page.getByRole('button', { name: /Charger le guide|Charger|Recharger/ }).first()
if (await b.count()) { await b.click(); console.log('chargement lancé') }
await page.waitForFunction(async () => {
  const d = await new Promise((r) => { const q = indexedDB.open('mytv-epg'); q.onsuccess = () => r(q.result) })
  if (!d.objectStoreNames.contains('programmes')) return false
  return await new Promise((r) => { const q = d.transaction('programmes').objectStore('programmes').count(); q.onsuccess = () => r(q.result > 1000) })
}, null, { timeout: 600000, polling: 4000 })
// Le worker écrit encore après le premier millier : on attend que le compteur
// se stabilise, sinon fermer le navigateur tronque la transaction en cours.
let precedent = -1
for (let k = 0; k < 120; k++) {
  await page.waitForTimeout(5000)
  const n = await page.evaluate(async () => {
    const d = await new Promise((r) => { const q = indexedDB.open('mytv-epg'); q.onsuccess = () => r(q.result) })
    return await new Promise((r) => { const q = d.transaction('programmes').objectStore('programmes').count(); q.onsuccess = () => r(q.result) })
  })
  console.log('programmes :', n)
  if (n === precedent && n > 1000) break
  precedent = n
}
await page.waitForTimeout(3000)
console.log('EPG chargé')
await nav.close()
