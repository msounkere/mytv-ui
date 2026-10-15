import { chromium } from 'playwright'
const nav = await chromium.launch()
const page = await nav.newPage({ viewport: { width: 1440, height: 900 } })
const erreurs = []
page.on('pageerror', (e) => erreurs.push('[PAGEERROR] ' + e.message.slice(0, 200)))
page.on('console', (m) => { if (m.type() === 'error') erreurs.push('[CONSOLE] ' + m.text().slice(0, 160)) })
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(2500)
const allerA = async (lbl) => { await page.evaluate((l) => { const b=[...document.querySelectorAll('.rail-item')].find(e=>e.textContent.trim().endsWith(l)); b?.click() }, lbl); await page.waitForTimeout(2000) }
const montees = () => page.evaluate(() => {
  const res = []
  for (const s of document.querySelectorAll('main div')) {
    const c = getComputedStyle(s); if (c.overflowY !== 'auto' && c.overflow !== 'auto') continue
    const inner = s.firstElementChild
    if (!inner || inner.getBoundingClientRect().height < 200 || !s.clientHeight) continue
    res.push([...inner.children].filter(e => getComputedStyle(e).position === 'absolute').length)
  }
  return res
})

await allerA('Réglages')
await page.locator('button', { hasText: /Importer le catalogue/i }).first().click()
for (let i = 0; i < 100; i++) { await page.waitForTimeout(2000); if (/entrées importées/.test(await page.evaluate(() => document.body.innerText))) break }
console.log('import ok')

// Guide + EPG
await allerA('Guide')
const bg = page.locator('button', { hasText: /^Charger le guide$/ }).first()
if (await bg.count()) { await bg.click(); for (let i=0;i<90;i++){ await page.waitForTimeout(2000); const t=await page.evaluate(()=>document.querySelector('main').innerText); if(/avec guide/.test(t) && !/n'est pas encore en base/.test(t)) break } }
await page.waitForTimeout(3000)
console.log('GUIDE:', (await page.evaluate(()=>document.querySelector('main').innerText.replace(/\s+/g,' ').slice(0,130))), '| lignes:', JSON.stringify(await montees()))
await page.screenshot({ path: 'captures/v2-apres-guide.png' })

// Direct avec categorie
await allerA('Direct')
await page.evaluate(() => { const b=[...document.querySelectorAll('main button')].filter(e=>/\d/.test(e.textContent)); b[3]?.click() })
await page.waitForTimeout(2500)
console.log('DIRECT lignes:', JSON.stringify(await montees()))
await page.screenshot({ path: 'captures/v2-apres-direct.png' })

// Lancer une lecture puis revenir : point bleu + retour au lecteur
await page.evaluate(() => { const r=[...document.querySelectorAll('main button')].filter(e=>e.offsetWidth>400); r[2]?.click() })
await page.waitForTimeout(6000)
await page.screenshot({ path: 'captures/v2-apres-lecture.png' })
await allerA('Films')
await page.waitForTimeout(2500)
const etatLecture = await page.evaluate(() => ({
  point: document.querySelectorAll('.rail-point').length,
  pointSur: [...document.querySelectorAll('.rail-item')].filter(e=>e.querySelector('.rail-point')).map(e=>e.textContent.trim()),
  reprise: document.querySelector('.entete-reprise')?.getAttribute('title'),
  flux: document.querySelector('.entete-flux')?.textContent.trim(),
  fluxEtat: document.querySelector('.entete-flux')?.dataset.etat,
  fluxTitre: document.querySelector('.entete-flux')?.getAttribute('title'),
  lecteurCache: getComputedStyle(document.querySelector('.couche-lecteur')).visibility,
}))
console.log('EN LECTURE:', JSON.stringify(etatLecture, null, 1))
await page.screenshot({ path: 'captures/v2-apres-pointbleu.png' })

// Panneau Lecteur (debit mesure)
await page.click('.entete-bouton-icone'); await page.waitForTimeout(3500)
const pan = await page.evaluate(() => {
  const p = document.querySelector('.panneau'); if (!p) return '(absent)'
  const r = p.getBoundingClientRect()
  return { box: `${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.x)},${Math.round(r.y)}`, txt: p.innerText }
})
console.log('PANNEAU:', pan.box); console.log(pan.txt)
await page.screenshot({ path: 'captures/v2-apres-panneau.png' })
await page.keyboard.press('Escape'); await page.waitForTimeout(600)

// Barre compacte + infobulle
await page.click('.rail-menu'); await page.waitForTimeout(800)
const compact = await page.evaluate(() => {
  const n = document.querySelector('.rail'); const r = n.getBoundingClientRect()
  const it = [...document.querySelectorAll('.rail-item')].map(e=>{const b=e.getBoundingClientRect();const c=getComputedStyle(e);return `${Math.round(b.width)}x${Math.round(b.height)}@${Math.round(b.x)},${Math.round(b.y)} dir:${c.flexDirection} g:${c.gap} tip:"${e.dataset.infobulle||''}"`})
  return { largeur: r.width, items: it }
})
console.log('COMPACTE:', compact.largeur, 'px'); compact.items.forEach(i=>console.log('  ',i))
await page.hover('.rail-item:nth-of-type(3)'); await page.waitForTimeout(900)
await page.screenshot({ path: 'captures/v2-apres-compacte.png' })
// Persistance de l'etat
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500)
console.log('apres rechargement, largeur barre:', await page.evaluate(()=>document.querySelector('.rail').getBoundingClientRect().width))
await page.click('.rail-menu'); await page.waitForTimeout(600)

console.log('spans en repli:', await page.evaluate(() => [...new Set([...document.querySelectorAll('span.icone')].map(e=>e.textContent.trim()).filter(Boolean))]))
console.log('erreurs:', erreurs.length ? erreurs.slice(0,6) : 'aucune')
await nav.close()
