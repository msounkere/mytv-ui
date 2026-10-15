import { chromium } from 'playwright'
const nav = await chromium.launch()
const page = await nav.newPage({ viewport: { width: 1440, height: 900 } })
page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message))
page.on('console', (m) => { if (m.type()==='error') console.log('[console.error]', m.text().slice(0,250)) })
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Réglages' }).click()
await page.getByRole('button', { name: 'Importer le catalogue' }).click()
await page.waitForFunction(() => /entrées importées/.test(document.body.innerText), null, { timeout: 120000 })
await page.getByRole('button', { name: 'Guide' }).click()
await page.waitForTimeout(1500)
await page.getByRole('button', { name: 'Charger le guide' }).first().click()

const t0 = Date.now()
let dernier = ''
for (let i = 0; i < 100; i++) {
  await page.waitForTimeout(3000)
  const t = await page.evaluate(() => document.querySelector('main')?.innerText ?? '')
  const ligne = t.split('\n').map(l=>l.trim()).filter(l => /%|programme|chaîne|indexa|téléchar|erreur|échec/i.test(l)).slice(0,3).join(' | ')
  if (ligne && ligne !== dernier) { console.log(`t+${Math.round((Date.now()-t0)/1000)}s  ${ligne}`); dernier = ligne }
  const base = await page.evaluate(async () => {
    try {
      const db = await new Promise((res, rej) => { const r = indexedDB.open('mytv-epg'); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error) })
      const noms = [...db.objectStoreNames]
      const out = {}
      for (const n of noms) out[n] = await new Promise(r => { const q = db.transaction(n).objectStore(n).count(); q.onsuccess=()=>r(q.result); q.onerror=()=>r('err') })
      return out
    } catch(e) { return { erreur: String(e).slice(0,80) } }
  })
  if (typeof base.chaines === 'number' && base.chaines > 0) { console.log('base mytv-epg:', JSON.stringify(base)); break }
}
await page.waitForTimeout(3000)
console.log('\n--- guide final ---')
console.log((await page.evaluate(() => document.querySelector('main')?.innerText?.slice(0,700))) ?? '(vide)')
await page.screenshot({ path: 'ecran-guide.png' })
await nav.close()
