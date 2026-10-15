import { chromium } from 'playwright'
const PROFIL = '/tmp/claude-0/-root/af0bfe04-324f-47cd-9f6b-faadeffb4ea5/scratchpad/profil-mytv'
const nav = await chromium.launchPersistentContext(PROFIL, { viewport: { width: 1440, height: 900 } })
const page = nav.pages()[0] ?? await nav.newPage()
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
const r = await page.evaluate(async () => {
  const db = await new Promise((r) => { const q = indexedDB.open('mytv'); q.onsuccess = () => r(q.result) })
  // Horloge d'animation : tout intervalle > 50 ms est une tâche longue.
  const mesurer = async (f) => {
    const t = []; let v = true, p = performance.now()
    const tic = () => { const n = performance.now(); t.push(n - p); p = n; if (v) requestAnimationFrame(tic) }
    requestAnimationFrame(tic)
    const t0 = performance.now(); const out = await f(); const total = performance.now() - t0
    v = false
    return { total: +total.toFixed(0), pire: +Math.max(...t).toFixed(0), bloque: +t.filter(x => x > 50).reduce((a, b) => a + b, 0).toFixed(0), n: out }
  }
  const dun = await mesurer(() => new Promise((r) => { const q = db.transaction('catalogue').objectStore('catalogue').index('type').getAll('vod'); q.onsuccess = () => r(q.result.length) }))
  await new Promise((r) => setTimeout(r, 400))
  // Par tranches : getAll borné sur l'index [type+categorie] n'existe pas, on
  // pagine sur l'index « type » avec un curseur à sauts.
  const parTranches = await mesurer(async () => {
    let n = 0, cle = undefined
    for (;;) {
      const lot = await new Promise((r) => {
        const st = db.transaction('catalogue').objectStore('catalogue').index('type')
        const plage = cle === undefined ? IDBKeyRange.only('vod') : IDBKeyRange.bound(['vod'], ['vod'])
        const q = st.getAll(IDBKeyRange.only('vod'), 8000)
        q.onsuccess = () => r(q.result)
      })
      n += lot.length
      break
    }
    return n
  })
  return { dun, parTranches }
})
console.log(JSON.stringify(r, null, 1))
await nav.close()
