import { chromium } from 'playwright'
const DIR = '/tmp/claude-0/-root/af0bfe04-324f-47cd-9f6b-faadeffb4ea5/scratchpad/profil'
const ctx = await chromium.launchPersistentContext(DIR, { viewport: { width: 1440, height: 900 } })
const page = ctx.pages()[0] ?? await ctx.newPage()
await page.goto('http://localhost:5173/app/', { waitUntil: 'domcontentloaded', timeout: 60000 })
const r = await page.evaluate(async () => {
  const ouvrir = (n) => new Promise((res, rej) => { const q = indexedDB.open(n); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error) })
  const tous = (d, s, idx, n) => new Promise((res) => { const o = d.transaction(s).objectStore(s); const src = idx ? o.index(idx) : o; const out = []
    const c = src.openCursor(); c.onsuccess = (e) => { const cur = e.target.result; if (!cur || out.length >= n) return res(out); out.push(cur.value); cur.continue() }; c.onerror = () => res(out) })
  const mettre = (d, s, vals) => new Promise((res, rej) => { const t = d.transaction(s, 'readwrite'); const o = t.objectStore(s); vals.forEach(v => o.put(v)); t.oncomplete = res; t.onerror = () => rej(t.error) })
  const get = (d, s, k) => new Promise((res) => { const q = d.transaction(s).objectStore(s).get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined) })

  const dbE = await ouvrir('mytv-epg')
  const chGuide = await tous(dbE, 'chaines', null, 4200)
  const db = await ouvrir('mytv')
  // Chaînes favorites : des chaînes qui ont vraiment un guide et un nom court.
  const voulues = ['TF1', 'France 2', 'France 3', 'France 5', 'Arte', 'M6', 'Canal+', 'BFM', 'franceinfo', 'TMC', 'W9', 'C8']
  const favCh = []
  for (const v of voulues) {
    const c = chGuide.find(c => new RegExp('^(FR[ -]*)?' + v.replace('+', '\\+') + '\\b', 'i').test(c.nom) && !favCh.some(f => f.streamId === c.streamId))
    if (c) { const e = await get(db, 'catalogue', 'live:' + c.streamId); if (e) favCh.push({ ...c, cle: e.cle, nom: e.nom }) }
  }
  // Films et séries : on prend dans les catégories « nouveautés » comme l'écran.
  const cats = await tous(db, 'categories', null, 2000)
  const re = /(new\s*added|r[ée]cemment\s*ajout|nouveaut)/i
  const pick = async (type) => {
    const ids = cats.filter(c => c.type === type && re.test(c.nom)).map(c => c.id)
    const out = []
    for (const id of ids) {
      const o = db.transaction('catalogue').objectStore('catalogue').index('[type+categorie]')
      const got = await new Promise((res) => { const acc = []; const c = o.openCursor(IDBKeyRange.only([type, id])); c.onsuccess = (e) => { const cur = e.target.result; if (!cur || acc.length >= 400) return res(acc); acc.push(cur.value); cur.continue() }; c.onerror = () => res(acc) })
      out.push(...got)
    }
    return out.sort((a, b) => b.id - a.id)
  }
  const films = await pick('vod'), series = await pick('series')
  const maintenant = Date.now()
  const favoris = [
    ...favCh.map((c, i) => ({ cle: c.cle, ajouteLe: maintenant - i * 60000 })),
    ...films.slice(3, 6).map((f, i) => ({ cle: f.cle, ajouteLe: maintenant - 3600000 - i * 60000 })),
    ...series.slice(2, 4).map((s, i) => ({ cle: s.cle, ajouteLe: maintenant - 7200000 - i * 60000 })),
  ]
  await mettre(db, 'favoris', favoris)
  // Un film d'une vraie catégorie de genre : c'est lui qui nourrit « Parce que
  // vous avez regardé… », qui ignore les catégories « nouveautés ».
  const genre = cats.find(c => c.type === 'vod' && /ACTION \[FR\]/.test(c.nom))
  const deGenre = await new Promise((res) => { const acc = []
    const c = db.transaction('catalogue').objectStore('catalogue').index('[type+categorie]').openCursor(IDBKeyRange.only(['vod', genre.id]))
    c.onsuccess = (e) => { const cur = e.target.result; if (!cur || acc.length >= 60) return res(acc); acc.push(cur.value); cur.continue() }; c.onerror = () => res(acc) })
  const vus = [deGenre[11], films[7], films[12], series[5], favCh[0] && { cle: favCh[0].cle }].filter(Boolean)
  await mettre(db, 'historique', vus.map((e, i) => ({ cle: e.cle, ouvertLe: maintenant - i * 1800000 })))
  const reprises = [
    { cle: films[7].cle, position: 3480, duree: 6900, vuLe: maintenant - 600000 },
    { cle: films[12].cle, position: 1200, duree: 5400, vuLe: maintenant - 90000000 },
    { cle: series[5].cle, position: 900, duree: 2700, vuLe: maintenant - 4000000 },
  ]
  await mettre(db, 'reprises', reprises)
  return { vus: vus.map(v => v.nom ?? v.cle), favCh: favCh.map(c => c.nom), films: films.slice(0, 3).map(f => f.nom), nbFilms: films.length, nbSeries: series.length }
})
console.log(JSON.stringify(r, null, 1))
await ctx.close()
