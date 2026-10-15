// Declenche l import depuis l interface et rapporte ce qui se passe reellement.
import { chromium } from 'playwright'

const navigateur = await chromium.launch()
const page = await navigateur.newPage({ viewport: { width: 1440, height: 900 } })

const journal = []
page.on('console', (m) => journal.push(`[${m.type()}] ${m.text()}`))
page.on('pageerror', (e) => journal.push(`[PAGEERROR] ${e.message}\n${e.stack ?? ''}`))
page.on('requestfailed', (r) => journal.push(`[ECHEC] ${r.url().slice(0, 120)} — ${r.failure()?.errorText}`))

await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle' })

await page.getByRole('button', { name: 'Réglages' }).click()
await page.waitForTimeout(800)
console.log('--- ecran Reglages ouvert ---')

await page.getByRole('button', { name: 'Importer le catalogue' }).click()
console.log('--- import declenche, suivi 180 s max ---')

let dernier = ''
const debut = Date.now()
while (Date.now() - debut < 180000) {
  const t = await page.evaluate(() => document.body.innerText)
  const ligne = t.split('\n').find((l) => l.includes('…') || l.includes('importées')) ?? ''
  if (ligne && ligne !== dernier) {
    console.log(`  t+${Math.round((Date.now() - debut) / 1000)}s  ${ligne}`)
    dernier = ligne
  }
  if (t.includes('importées')) break
  const rouge = await page.evaluate(() => {
    const n = [...document.querySelectorAll('div')].find((d) => d.innerText?.includes('Réessayer') && d.style.border)
    return n ? n.innerText.slice(0, 400) : null
  })
  if (rouge) { console.log('\n=== ERREUR AFFICHEE ===\n' + rouge); break }
  await page.waitForTimeout(1500)
}

const base = await page.evaluate(async () => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('mytv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
  })
  const compter = (n) => new Promise((res) => {
    const q = db.transaction(n).objectStore(n).count(); q.onsuccess = () => res(q.result); q.onerror = () => res('err')
  })
  return { catalogue: await compter('catalogue'), categories: await compter('categories') }
})

console.log('\n=== INDEXEDDB APRES IMPORT ===')
console.log(JSON.stringify(base))
console.log('\n=== JOURNAL (30 dernieres lignes) ===')
console.log(journal.slice(-30).join('\n') || '  vide')

await page.screenshot({ path: 'apres-import.png' })
await navigateur.close()
