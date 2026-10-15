import { chromium } from 'playwright'
const nav = await chromium.launch()
const page = await nav.newPage({ viewport: { width: 1440, height: 900 } })
page.on('pageerror', e => console.log('[PAGEERROR]', e.message.slice(0,200)))
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /Réglages/ }).click()
await page.getByRole('button', { name: 'Importer le catalogue' }).click()
await page.waitForFunction(() => /entrées importées/.test(document.body.innerText), null, { timeout: 150000 })
const d = await page.evaluate(async () => {
  const db = await new Promise((res, rej) => { const q = indexedDB.open('mytv'); q.onsuccess=()=>res(q.result); q.onerror=()=>rej(q.error) })
  const lire = (t) => new Promise(r => { const q = db.transaction(t).objectStore(t).getAll(); q.onsuccess=()=>r(q.result) })
  const cats = await lire('categories')
  const RE = /nouveau|nouveaut|new\s*add|recemment|récemment|recent/i
  const idsNouv = cats.filter(c => c.type==='vod' && RE.test(c.nom)).map(c => c.id)
  const cat = await lire('catalogue')
  const vod = cat.filter(e => e.type==='vod')
  const dansNouv = vod.filter(e => idsNouv.includes(e.categorie))
  const idx = [...db.transaction('catalogue').objectStore('catalogue').indexNames]
  return {
    idsNouveautes: idsNouv,
    typeDesIds: idsNouv.map(x => typeof x),
    entreesVod: vod.length,
    entreesDansNouveautes: dansNouv.length,
    exempleCategorieEntree: vod.slice(0,3).map(e => ({ cat: e.categorie, type: typeof e.categorie })),
    indexCatalogue: idx,
  }
})
console.log(JSON.stringify(d, null, 1))
await nav.close()
