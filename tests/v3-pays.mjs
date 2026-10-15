import { chromium } from 'playwright'
const DIR = '/tmp/claude-0/-root/af0bfe04-324f-47cd-9f6b-faadeffb4ea5/scratchpad/profil-rech'
const ctx = await chromium.launchPersistentContext(DIR, { viewport: { width: 1440, height: 900 } })
const page = ctx.pages()[0] ?? await ctx.newPage()
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle', timeout: 60000 })
const r = await page.evaluate(async () => {
  const d = await new Promise((r) => { const q = indexedDB.open('mytv'); q.onsuccess = () => r(q.result) })
  const e = await new Promise((r) => { const q = d.transaction('catalogue').objectStore('catalogue').getAll(); q.onsuccess = () => r(q.result) })
  const par = {}
  for (const x of e) { const k = x.type + '|' + (x.pays ?? '—'); par[k] = (par[k] ?? 0) + 1 }
  const top = Object.entries(par).sort((a, b) => b[1] - a[1]).slice(0, 40)
  const parType = {}
  for (const x of e) parType[x.type] = (parType[x.type] ?? 0) + 1
  return { parType, nDistincts: Object.keys(par).length, top }
})
console.log(JSON.stringify(r, null, 1))
await ctx.close()
