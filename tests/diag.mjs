// Diagnostic automatise : ouvre l interface, collecte la console, les erreurs
// et les requetes en echec, puis rapporte l etat reel du DOM et d IndexedDB.
import { chromium } from 'playwright'

const URL = process.argv[2] ?? 'http://localhost:5173/app/'
const navigateur = await chromium.launch()
const page = await navigateur.newPage({ viewport: { width: 1440, height: 900 } })

const console_ = []
const erreurs = []
const echecs = []

page.on('console', (m) => console_.push(`[${m.type()}] ${m.text()}`))
page.on('pageerror', (e) => erreurs.push(`${e.name}: ${e.message}\n${e.stack ?? ''}`))
page.on('requestfailed', (r) => echecs.push(`${r.method()} ${r.url()} — ${r.failure()?.errorText}`))

await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 })
await page.waitForTimeout(3500)

const etatBase = await page.evaluate(async () => {
  const ouvrir = () =>
    new Promise((res, rej) => {
      const r = indexedDB.open('mytv')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
  try {
    const db = await ouvrir()
    const noms = [...db.objectStoreNames]
    const compter = (nom) =>
      new Promise((res) => {
        try {
          const req = db.transaction(nom).objectStore(nom).count()
          req.onsuccess = () => res(req.result)
          req.onerror = () => res('erreur')
        } catch (e) {
          res('absent')
        }
      })
    const out = {}
    for (const n of noms) out[n] = await compter(n)
    return { magasins: noms, comptes: out }
  } catch (e) {
    return { erreur: String(e) }
  }
})

const dom = await page.evaluate(() => ({
  texteVisible: document.body.innerText.slice(0, 900),
  boutons: [...document.querySelectorAll('button')].map((b) => b.innerText.trim()).filter(Boolean).slice(0, 20),
  nbBoutons: document.querySelectorAll('button').length,
}))

await page.screenshot({ path: 'diag.png', fullPage: false })

console.log('=== ERREURS DE PAGE ===')
console.log(erreurs.length ? erreurs.join('\n---\n') : '  aucune')
console.log('\n=== REQUETES EN ECHEC ===')
console.log(echecs.length ? echecs.slice(0, 10).join('\n') : '  aucune')
console.log('\n=== CONSOLE ===')
console.log(console_.length ? console_.slice(0, 25).join('\n') : '  vide')
console.log('\n=== INDEXEDDB ===')
console.log(JSON.stringify(etatBase, null, 1))
console.log('\n=== DOM ===')
console.log('boutons:', dom.nbBoutons, '->', JSON.stringify(dom.boutons))
console.log('--- texte visible ---')
console.log(dom.texteVisible)

await navigateur.close()
