import { chromium } from 'playwright'
// Recette de la coque V2 : fidelite a la maquette, virtualisation intacte dans
// les deux etats de la barre, et aucune icone restee en toutes lettres.
const nav = await chromium.launch()
const page = await nav.newPage({ viewport: { width: 1440, height: 900 } })
const erreurs = []
page.on('pageerror', (e) => erreurs.push('[PAGEERROR] ' + e.message.slice(0, 200)))
page.on('console', (m) => { if (m.type() === 'error') erreurs.push('[CONSOLE] ' + m.text().slice(0, 160)) })
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(2500)
const allerA = async (l) => { await page.evaluate((x) => { const b=[...document.querySelectorAll('.rail-item')].find(e=>e.textContent.trim().endsWith(x)); b?.click() }, l); await page.waitForTimeout(2200) }
const montees = () => page.evaluate(() => {
  const r = []
  for (const s of document.querySelectorAll('main div')) {
    const c = getComputedStyle(s); if (c.overflowY !== 'auto' && c.overflow !== 'auto') continue
    const i = s.firstElementChild
    if (!i || i.getBoundingClientRect().height < 200 || !s.clientHeight) continue
    r.push([...i.children].filter(e => getComputedStyle(e).position === 'absolute').length)
  }
  return r
})
await allerA('Réglages')
await page.locator('button', { hasText: /Importer le catalogue/i }).first().click()
for (let i = 0; i < 100; i++) { await page.waitForTimeout(2000); if (/entrées importées/.test(await page.evaluate(() => document.body.innerText))) break }
await allerA('Guide')
const bg = page.locator('button', { hasText: /^Charger le guide$/ }).first()
if (await bg.count()) { await bg.click(); for (let i=0;i<90;i++){ await page.waitForTimeout(2000); if(!/n'est pas encore en base/.test(await page.evaluate(()=>document.querySelector('main').innerText))) break } }
await page.waitForTimeout(2500)

for (const deployee of [true, false]) {
  const l = await page.evaluate(() => document.querySelector('.rail').getBoundingClientRect().width)
  if ((l === 220) !== deployee) { await page.click('.rail-menu'); await page.waitForTimeout(800) }
  const etat = deployee ? 'déployée 220' : 'compacte 72'
  for (const ecran of ['Direct', 'Films', 'Séries', 'Guide']) {
    await allerA(ecran)
    // Direct garde son panneau de categories : il faut en ouvrir une pour que
    // la liste de droite ait quelque chose a virtualiser. Films et Series sont
    // passes aux filtres et affichent leur grille d'emblee.
    if (ecran === 'Direct') { await page.evaluate(() => { const b=[...document.querySelectorAll('main button')].filter(e=>/\d/.test(e.textContent)); b[3]?.click() }); await page.waitForTimeout(2200) }
    // Direct et Guide sont virtualises ; Films et Series sont une grille CSS,
    // donc on y compte les affiches rendues plutot que les lignes montees.
    const m = await montees()
    const affiches = await page.evaluate(() => document.querySelectorAll('main img, main [style*="aspect-ratio"]').length)
    const ok = m.some((n) => n > 0) || affiches > 0
    console.log(`${etat} · ${ecran} : lignes virtualisées ${JSON.stringify(m)}, affiches ${affiches} — ${ok ? 'OK' : 'ECHEC'}`)
  }
}
const clair = await page.evaluate(() => [...new Set([...document.querySelectorAll('span.icone')].map(e=>e.textContent.trim()).filter(Boolean))])
console.log('icônes en repli police :', clair.length ? clair : 'aucune')
console.log('barre mémorisée après rechargement :', await (async () => { await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2200); return page.evaluate(()=>document.querySelector('.rail').getBoundingClientRect().width) })(), 'px')
console.log('erreurs :', erreurs.length ? erreurs.slice(0,6) : 'aucune')
await nav.close()
