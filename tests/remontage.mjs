import { chromium } from 'playwright'
const nav = await chromium.launch()
const page = await nav.newPage({ viewport: { width: 1440, height: 900 } })
// Aucun flux : on ne mesure que la navigation.
await page.route('**/live/**', r => r.abort())
await page.route('**/movie/**', r => r.abort())
await page.route('**/series/**', r => r.abort())

await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle' })
// L'application est desormais derriere une page de connexion.
const champs = page.locator('input')
if (await champs.count() >= 2 && !(await page.evaluate(() => !!document.querySelector('nav')))) {
  await champs.nth(0).fill('sounkere')
  await champs.nth(1).fill('hktsIKymwGvDs2')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(4000)
  console.log('connecte')
}
// Les identifiants viennent desormais du serveur : rien a saisir.
const n = await page.evaluate(async () => {
  const db = await new Promise(r=>{const q=indexedDB.open('mytv');q.onsuccess=()=>r(q.result)})
  return await new Promise(r=>{const q=db.transaction('catalogue').objectStore('catalogue').count();q.onsuccess=()=>r(q.result)})
})
console.log('catalogue en base :', n)
if (n === 0) {
  await page.getByRole('button', { name: /Réglages/ }).click(); await page.waitForTimeout(1000)
  await page.getByRole('button', { name: 'Importer le catalogue' }).click()
  await page.waitForFunction(() => /entrées importées/.test(document.body.innerText), null, { timeout: 240000 })
}

async function aller(nom) {
  let reqs = 0
  const compte = () => reqs++
  page.on('request', compte)
  const t = Date.now()
  await page.getByRole('button', { name: new RegExp(`^${nom}$`) }).first().click()
  await page.waitForTimeout(2500)
  page.off('request', compte)
  const dom = await page.evaluate(() => document.querySelectorAll('main *').length)
  return { nom, ms: Date.now() - t, reqs, dom }
}
console.log('=== navigation entre ecrans ===')
for (const e of ['Direct','Films','Accueil','Direct','Films']) {
  const r = await aller(e)
  console.log(`  ${r.nom.padEnd(8)} ${String(r.ms).padStart(5)} ms · ${String(r.reqs).padStart(3)} requetes · ${r.dom} noeuds`)
}
// Le defilement survit-il a un aller-retour ?
await page.getByRole('button', { name: /^Films$/ }).first().click(); await page.waitForTimeout(2000)
await page.evaluate(() => { const s=[...document.querySelectorAll('div')].find(e=>getComputedStyle(e).overflowY==='auto'); if(s) s.scrollTop=3000 })
await page.waitForTimeout(600)
const avant = await page.evaluate(() => { const s=[...document.querySelectorAll('div')].find(e=>getComputedStyle(e).overflowY==='auto'); return s?.scrollTop ?? -1 })
await page.getByRole('button', { name: /^Accueil$/ }).first().click(); await page.waitForTimeout(1500)
await page.getByRole('button', { name: /^Films$/ }).first().click(); await page.waitForTimeout(2500)
const apres = await page.evaluate(() => { const s=[...document.querySelectorAll('div')].find(e=>getComputedStyle(e).overflowY==='auto'); return s?.scrollTop ?? -1 })
console.log(`\n=== defilement ===\n  avant sortie : ${avant}px · au retour : ${apres}px`)
await nav.close()
