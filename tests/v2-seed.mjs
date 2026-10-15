import { chromium } from 'playwright'
const DIR = '/tmp/claude-0/-root/af0bfe04-324f-47cd-9f6b-faadeffb4ea5/scratchpad/profil'
const ctx = await chromium.launchPersistentContext(DIR, { viewport: { width: 1440, height: 900 } })
const page = ctx.pages()[0] ?? await ctx.newPage()
page.on('console', (m) => { if (m.type() === 'error') console.log('[err]', m.text().slice(0, 150)) })
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle', timeout: 60000 })
// Catalogue
const dejaCat = await page.evaluate(async () => {
  const d = await new Promise((r) => { const q = indexedDB.open('mytv'); q.onsuccess = () => r(q.result); q.onerror = () => r(null) })
  if (!d || !d.objectStoreNames.contains('catalogue')) return 0
  return await new Promise((r) => { const t = d.transaction('catalogue').objectStore('catalogue').count(); t.onsuccess = () => r(t.result); t.onerror = () => r(0) })
})
console.log('catalogue existant:', dejaCat)
if (dejaCat < 1000) {
  await page.getByRole('button', { name: /Réglages/ }).click()
  await page.getByRole('button', { name: 'Importer le catalogue' }).click()
  await page.waitForFunction(() => /entrées importées/.test(document.body.innerText), null, { timeout: 300000 })
  console.log('catalogue importé')
}
// Guide EPG
const dejaEpg = await page.evaluate(async () => {
  const d = await new Promise((r) => { const q = indexedDB.open('mytv-epg'); q.onsuccess = () => r(q.result); q.onerror = () => r(null) })
  if (!d || !d.objectStoreNames.contains('programmes')) return 0
  return await new Promise((r) => { const t = d.transaction('programmes').objectStore('programmes').count(); t.onsuccess = () => r(t.result); t.onerror = () => r(0) })
})
console.log('programmes existants:', dejaEpg)
if (dejaEpg < 1000) {
  await page.getByRole('button', { name: /^Guide$/ }).first().click()
  await page.waitForTimeout(2000)
  const b = page.getByRole('button', { name: /Charger le guide|Reprendre le chargement/ }).first()
  if (await b.count()) { await b.click(); await page.waitForFunction(() => /chaînes/.test(document.body.innerText) && !/%/.test(document.body.innerText), null, { timeout: 600000 }).catch(()=>{}) }
  await page.waitForTimeout(5000)
}
const fin = await page.evaluate(async () => {
  const cnt = async (base, store) => { const d = await new Promise((r) => { const q = indexedDB.open(base); q.onsuccess = () => r(q.result); q.onerror = () => r(null) }); if (!d || !d.objectStoreNames.contains(store)) return 0
    return await new Promise((r) => { const t = d.transaction(store).objectStore(store).count(); t.onsuccess = () => r(t.result); t.onerror = () => r(0) }) }
  return { catalogue: await cnt('mytv','catalogue'), programmes: await cnt('mytv-epg','programmes'), chaines: await cnt('mytv-epg','chaines') }
})
console.log(JSON.stringify(fin))
await ctx.close()
