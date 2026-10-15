import { chromium } from 'playwright'
const DIR = '/tmp/claude-0/-root/af0bfe04-324f-47cd-9f6b-faadeffb4ea5/scratchpad/profil-rech'
const ctx = await chromium.launchPersistentContext(DIR, { viewport: { width: 1440, height: 900 } })
const page = ctx.pages()[0] ?? await ctx.newPage()
page.on('pageerror', (e) => console.log('[ERR]', e.message.slice(0, 300)))
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(1200)
const r = await page.evaluate(async () => {
  const { default: MiniSearch } = await import('/app/node_modules/minisearch/dist/es/index.js')
  const d = await new Promise((r) => { const q = indexedDB.open('mytv'); q.onsuccess = () => r(q.result) })
  const t0 = performance.now()
  const entrees = await new Promise((r) => { const q = d.transaction('catalogue').objectStore('catalogue').getAll(); q.onsuccess = () => r(q.result) })
  const tLecture = performance.now() - t0
  const idx = new MiniSearch({ idField: 'cle', fields: ['recherche'],
    storeFields: ['cle','type','id','nom','pays','icone'],
    searchOptions: { prefix: true, fuzzy: 0.15, combineWith: 'AND' } })
  const t1 = performance.now(); idx.addAll(entrees); const tIndex = performance.now() - t1
  const mesures = {}
  for (const q of ['a','fr','fra','franc','pokemon','pokémon','breaking bad','tf1']) {
    const t = performance.now(); const res = idx.search(q); mesures[q] = { ms: +(performance.now()-t).toFixed(1), n: res.length }
  }
  // scan lineaire : tableau plat de chaines normalisees
  const t2 = performance.now()
  const plat = entrees.map(e => e.recherche)
  const tPlat = performance.now() - t2
  const scan = {}
  for (const q of ['a','fra','pokemon','breaking bad']) {
    const t = performance.now(); let c = 0
    for (let i = 0; i < plat.length; i++) if (plat[i].indexOf(q) >= 0) c++
    scan[q] = { ms: +(performance.now()-t).toFixed(1), n: c }
  }
  return { n: entrees.length, tLecture: Math.round(tLecture), tIndex: Math.round(tIndex), tPlat: Math.round(tPlat), mesures, scan,
    memeNote: entrees.filter(e=>e.note!=null).length, memeDate: entrees.filter(e=>e.ajouteLe!=null).length }
})
console.log(JSON.stringify(r, null, 1))
await ctx.close()
