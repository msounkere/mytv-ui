import { chromium } from 'playwright'
const nav = await chromium.launch()
const page = await nav.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://127.0.0.1:8777/Lecteur%20IPTV.dc.html', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(2500)
await page.getByRole('button', { name: /^Direct$/ }).first().click()
await page.waitForTimeout(1500)
const g = (sel) => page.evaluate((s) => {
  const e = document.querySelector(s); if (!e) return null
  const c = getComputedStyle(e), r = e.getBoundingClientRect()
  return { t: (e.innerText||'').replace(/\n/g,'|').slice(0,50), box: `${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.x)},${Math.round(r.y)}`,
    h: c.height, pad: c.padding, gap: c.gap, br: c.borderRadius, bd: c.border, bg: c.backgroundColor, col: c.color, fs: c.fontSize, lh: c.lineHeight, fw: c.fontWeight }
}, sel)
console.log('aside      :', JSON.stringify(await g('aside')))
console.log('champ rech :', JSON.stringify(await g('aside input')))
const panel = await page.evaluate(() => {
  const a = document.querySelector('aside')
  const haut = a.firstElementChild, liste = a.children[1]
  const gg = (e) => { const c = getComputedStyle(e), r = e.getBoundingClientRect()
    return { t:(e.innerText||'').replace(/\n/g,'|').slice(0,40), box:`${Math.round(r.width)}x${Math.round(r.height)}`, h:c.height, pad:c.padding, gap:c.gap, br:c.borderRadius, bg:c.backgroundColor, col:c.color, fs:c.fontSize, lh:c.lineHeight, fw:c.fontWeight, ls:c.letterSpacing, tt:c.textTransform } }
  return { haut: gg(haut), listePad: getComputedStyle(liste).padding,
    lignes: [...liste.children].slice(0,10).map(gg) }
})
console.log('panneau    :', JSON.stringify(panel, null, 1))
const barre = await page.evaluate(() => {
  const h1 = document.querySelector('[data-screen-label="Direct"] h1')
  const tb = h1.closest('div').parentElement
  const gg = (e) => { const c = getComputedStyle(e), r = e.getBoundingClientRect()
    return { t:(e.innerText||'').replace(/\n/g,'|').slice(0,40), box:`${Math.round(r.width)}x${Math.round(r.height)}`, h:c.height, pad:c.padding, gap:c.gap, br:c.borderRadius, bd:c.border, bg:c.backgroundColor, fs:c.fontSize, fw:c.fontWeight } }
  return { barre: gg(tb), elements: [...tb.children].map(gg), h1: gg(h1) }
})
console.log('barre      :', JSON.stringify(barre, null, 1))

// Mode Cartes
await page.getByRole('radio', { name: 'Cartes' }).first().click()
await page.waitForTimeout(1200)
await page.screenshot({ path: 'captures/maq-direct-cartes.png' })
const cartes = await page.evaluate(() => {
  const rangees = [...document.querySelectorAll('div')].filter(d => /^repeat\(/.test(d.style.gridTemplateColumns||''))
  const r0 = rangees[0], c0 = r0?.children[0]
  const gg = (e) => { if(!e) return null; const c = getComputedStyle(e), r = e.getBoundingClientRect()
    return { t:(e.innerText||'').replace(/\n/g,'|').slice(0,60), box:`${Math.round(r.width)}x${Math.round(r.height)}`, pad:c.padding, gap:c.gap, br:c.borderRadius, bd:c.border, bg:c.backgroundColor, fs:c.fontSize, fw:c.fontWeight, ar:c.aspectRatio } }
  const tops = rangees.slice(0,3).map(x => parseFloat(x.style.top))
  return { cols: r0?.style.gridTemplateColumns, gap: getComputedStyle(r0).gap, nCartes: r0?.children.length,
    pas: tops[1]-tops[0], carte: gg(c0), vignette: gg(c0?.firstElementChild), pied: gg(c0?.children[1]),
    logo: gg(c0?.firstElementChild?.children[2]), direct: gg(c0?.firstElementChild?.lastElementChild),
    nRangeesDOM: rangees.length }
})
console.log('cartes     :', JSON.stringify(cartes, null, 1))
await nav.close()
