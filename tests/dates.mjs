import { chromium } from 'playwright'
const nav = await chromium.launch()
const page = await nav.newPage({ viewport: { width: 1440, height: 900 } })
page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message.slice(0,160)))
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /Réglages/ }).click()
await page.getByRole('button', { name: 'Importer le catalogue' }).click()
await page.waitForFunction(() => /entrées importées/.test(document.body.innerText), null, { timeout: 150000 })
const r = await page.evaluate(async () => {
  const db = await new Promise((res, rej) => { const q = indexedDB.open('mytv'); q.onsuccess=()=>res(q.result); q.onerror=()=>rej(q.error) })
  const tout = await new Promise(res => { const q = db.transaction('catalogue').objectStore('catalogue').getAll(); q.onsuccess=()=>res(q.result) })
  const avecDate = tout.filter(e => e.ajouteLe)
  const avecNote = tout.filter(e => e.note)
  const recents = [...avecDate].sort((a,b)=>b.ajouteLe-a.ajouteLe).slice(0,4)
  return {
    total: tout.length,
    avecDate: avecDate.length,
    avecNote: avecNote.length,
    recents: recents.map(e => `${new Date(e.ajouteLe).toLocaleDateString('fr-FR')} · ${e.type} · ${e.nom.slice(0,34)}${e.note ? ' · '+e.note : ''}`),
  }
})
console.log(`catalogue       : ${r.total.toLocaleString('fr-FR')}`)
console.log(`avec date ajout : ${r.avecDate.toLocaleString('fr-FR')} (${Math.round(100*r.avecDate/r.total)} %)`)
console.log(`avec note       : ${r.avecNote.toLocaleString('fr-FR')} (${Math.round(100*r.avecNote/r.total)} %)`)
console.log('les plus récents :')
r.recents.forEach(x => console.log('  ' + x))
await nav.close()
