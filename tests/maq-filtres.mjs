import { chromium } from 'playwright'
const nav = await chromium.launch()
const page = await nav.newPage({ viewport: { width: 1440, height: 900 } })
page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message.slice(0, 200)))
await page.goto('http://127.0.0.1:8777/Lecteur%20IPTV.dc.html', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(2500)
await page.getByRole('button', { name: /^Films$/ }).first().click()
await page.waitForTimeout(1500)
await page.screenshot({ path: 'captures/maq-films.png' })

const dump = await page.evaluate(() => {
  const txt = (e) => (e.innerText || '').replace(/\n/g, '|').trim().slice(0, 40)
  const g = (e) => { const c = getComputedStyle(e), r = e.getBoundingClientRect()
    return { t: txt(e), box: `${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.x)},${Math.round(r.y)}`,
      h: c.height, pad: c.padding, gap: c.gap, br: c.borderRadius, bd: c.border, bg: c.backgroundColor,
      col: c.color, fs: c.fontSize, lh: c.lineHeight, fw: c.fontWeight } }
  const head = document.querySelector('[data-screen-label]')
  const out = { head: head ? g(head) : null }
  if (!head) return out
  const barre = head.firstElementChild
  out.barre = g(barre)
  const l1 = barre.children[0]
  out.l1 = g(l1)
  out.titre = [...l1.children].map(g)
  const l2 = barre.children[1]
  out.l2 = g(l2)
  out.boutons = [...l2.children].map(g)
  const zone = head.children[1]
  out.zone = g(zone)
  const inner = zone.firstElementChild
  out.inner = inner ? { t: inner.tagName, h: inner.style.height, nRangees: inner.children.length } : null
  if (inner && inner.children[0]) {
    const r0 = inner.children[0]
    out.rangee0 = g(r0)
    out.rangeeCols = getComputedStyle(r0).gridTemplateColumns
    out.nCartes = r0.children.length
    const c0 = r0.children[0]
    if (c0) { out.carte = g(c0); out.affiche = g(c0.firstElementChild)
      out.legende = [...c0.children].slice(1).map(g) }
    const tops = [...inner.children].slice(0,4).map(e => parseFloat(getComputedStyle(e).top))
    out.pasRangee = tops.map((t,i)=> i? t-tops[i-1]:0).slice(1)
  }
  return out
})
console.log(JSON.stringify(dump, null, 1))

// Ouvre le popup « Genre »
const btnGenre = page.locator('[role="button"][aria-haspopup="listbox"]').filter({ hasText: 'Genre' }).first()
await btnGenre.click()
await page.waitForTimeout(600)
await page.screenshot({ path: 'captures/maq-films-popup.png' })
const pop = await page.evaluate(() => {
  const el = document.querySelector('[role="listbox"]')
  if (!el) return null
  const c = getComputedStyle(el), r = el.getBoundingClientRect()
  const it = el.querySelector('[role="option"]')
  const ci = it ? getComputedStyle(it) : null
  return { box: `${Math.round(r.width)}x${Math.round(r.height)}`, w: c.width, maxH: c.maxHeight, pad: c.padding,
    br: c.borderRadius, bg: c.backgroundColor, bd: c.border, sh: c.boxShadow,
    titre: el.firstElementChild.innerText.replace(/\n/g,'|'),
    titreCss: (()=>{const t=el.firstElementChild.firstElementChild,k=getComputedStyle(t);return {fs:k.fontSize,fw:k.fontWeight,ls:k.letterSpacing,tt:k.textTransform,col:k.color}})(),
    nOpts: el.querySelectorAll('[role="option"]').length,
    opts: [...el.querySelectorAll('[role="option"]')].slice(0,30).map(o=>o.innerText.replace(/\n/g,' ').trim()),
    optCss: ci ? { h: ci.height, pad: ci.padding, gap: ci.gap, br: ci.borderRadius, fs: ci.fontSize } : null }
})
console.log('POPUP GENRE:', JSON.stringify(pop, null, 1))

// Sélectionne un genre pour voir pastille + bouton actif
if (pop) { await page.locator('[role="option"]').first().click(); await page.waitForTimeout(500) }
await page.keyboard.press('Escape')
await page.waitForTimeout(700)
await page.screenshot({ path: 'captures/maq-films-actif.png' })
const actif = await page.evaluate(() => {
  const head = document.querySelector('[data-screen-label]')
  const barre = head.firstElementChild
  const g = (e) => { const c = getComputedStyle(e), r = e.getBoundingClientRect()
    return { t: (e.innerText||'').replace(/\n/g,'|').trim().slice(0,40), box:`${Math.round(r.width)}x${Math.round(r.height)}`,
      h: c.height, pad: c.padding, gap: c.gap, br: c.borderRadius, bd: c.border, bg: c.backgroundColor, col: c.color, fs: c.fontSize, fw: c.fontWeight } }
  return { nLignes: barre.children.length, l2: [...barre.children[1].children].map(g),
    l3: barre.children[2] ? [...barre.children[2].children].map(g) : null }
})
console.log('ACTIF:', JSON.stringify(actif, null, 1))
await nav.close()
