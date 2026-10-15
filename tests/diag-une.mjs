import { chromium } from 'playwright'
const nav = await chromium.launch()
const page = await nav.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /Réglages/ }).click()
await page.getByRole('button', { name: 'Importer le catalogue' }).click()
await page.waitForFunction(() => /entrées importées/.test(document.body.innerText), null, { timeout: 150000 })
const d = await page.evaluate(async () => {
  const db = await new Promise((res, rej) => { const q = indexedDB.open('mytv'); q.onsuccess=()=>res(q.result); q.onerror=()=>rej(q.error) })
  const lire = (t) => new Promise(r => { const q = db.transaction(t).objectStore(t).getAll(); q.onsuccess=()=>r(q.result) })
  const cats = await lire('categories')
  const RE = /nouveau|nouveaut|new\s*add|recemment|récemment|recent/i
  const vod = cats.filter(c => c.type==='vod')
  const match = vod.filter(c => RE.test(c.nom))
  return {
    versionBase: db.version,
    tables: [...db.objectStoreNames],
    categoriesVod: vod.length,
    correspondances: match.length,
    exemples: match.slice(0,4).map(c => c.nom),
    echantillonNoms: vod.slice(0,6).map(c => c.nom),
  }
})
console.log(JSON.stringify(d, null, 1))
await nav.close()
