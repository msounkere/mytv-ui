import { chromium } from 'playwright'
const DIR = '/tmp/claude-0/-root/af0bfe04-324f-47cd-9f6b-faadeffb4ea5/scratchpad/profil-rech'
const ctx = await chromium.launchPersistentContext(DIR, { viewport: { width: 1440, height: 900 } })
const page = ctx.pages()[0] ?? await ctx.newPage()
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(1000)
const r = await page.evaluate(async () => {
  const d = await new Promise((r) => { const q = indexedDB.open('mytv'); q.onsuccess = () => r(q.result) })
  const e = await new Promise((r) => { const q = d.transaction('catalogue').objectStore('catalogue').getAll(); q.onsuccess = () => r(q.result) })
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const rang = (x, n) => x.startsWith(n) ? 0 : x.includes(' ' + n) ? 1 : x.includes(n) ? 2 : 3
  const out = {}
  for (const q of ['france', 'bein', 'canal', 'matrix', 'pokemon', 'dune', 'tf1', 'arte']) {
    const n = norm(q)
    const hits = e.filter((x) => x.recherche.includes(n))
    hits.sort((a, b) => (rang(a.recherche, n) - rang(b.recherche, n)) || (a.recherche.length - b.recherche.length))
    const top = {}
    for (const t of ['live', 'vod', 'series']) {
      const g = hits.filter((x) => x.type === t).slice(0, t === 'live' ? 6 : t === 'vod' ? 5 : 4)
      // Combien de ces tetes de liste sont a egalite parfaite (meme rang, meme longueur) ?
      const cles = g.map((x) => rang(x.recherche, n) * 1e6 + x.recherche.length)
      top[t] = { n: g.length, avecNote: g.filter((x) => x.note != null).length,
        exAequo: cles.length - new Set(cles).size }
    }
    out[q] = top
  }
  const couv = (t) => { const s = e.filter((x) => x.type === t)
    return { n: s.length, note: +(100 * s.filter((x) => x.note != null).length / s.length).toFixed(1),
      date: +(100 * s.filter((x) => x.ajouteLe != null).length / s.length).toFixed(1) } }
  return { couverture: { live: couv('live'), vod: couv('vod'), series: couv('series') }, tetes: out }
})
console.log(JSON.stringify(r, null, 1))
await ctx.close()
