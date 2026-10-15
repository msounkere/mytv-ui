import { chromium } from 'playwright'
const nav = await chromium.launch()
const page = await nav.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://127.0.0.1:8777/Lecteur%20IPTV.dc.html', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(4000)

// Aller sur Direct puis lancer une chaîne.
await page.evaluate(() => {
  const n = [...document.querySelectorAll('nav [role=button]')].find(e => /Direct/.test(e.textContent))
  n?.click()
})
await page.waitForTimeout(1500)
await page.evaluate(() => {
  const m = document.querySelector('main')
  const r = [...m.querySelectorAll('[role=button]')].filter(e => e.getBoundingClientRect().width > 300 && e.getBoundingClientRect().height > 30 && e.getBoundingClientRect().height < 80)
  r[2]?.click()
})
await page.waitForTimeout(2500)
console.log('écran:', await page.evaluate(() => document.querySelector('[data-screen-label]')?.dataset.screenLabel))

const g = (sel, label) => page.evaluate(([sel, label]) => {
  const el = typeof sel === 'string' ? document.querySelector(sel) : null
  if (!el) return { [label]: null }
  const c = getComputedStyle(el), r = el.getBoundingClientRect()
  return { [label]: { w: +r.width.toFixed(1), h: +r.height.toFixed(1), fs: c.fontSize, fw: c.fontWeight, pad: c.padding, gap: c.gap, br: c.borderRadius, bg: c.backgroundColor, color: c.color, bd: c.border, z: c.zIndex, left: c.left, top: c.top, bottom: c.bottom, right: c.right, blur: c.backdropFilter } }
}, [sel, label])

const mesurer = async (titre) => {
  const m = await page.evaluate(() => {
    const G = (el) => { if (!el) return null; const c = getComputedStyle(el), r = el.getBoundingClientRect()
      return { w: +r.width.toFixed(1), h: +r.height.toFixed(1), x: +r.x.toFixed(1), y: +r.y.toFixed(1), fs: c.fontSize, fw: c.fontWeight, pad: c.padding, gap: c.gap, br: c.borderRadius, bg: c.backgroundColor, color: c.color, bd: c.borderTopWidth + ' ' + c.borderTopColor, z: c.zIndex, blur: c.backdropFilter, cols: c.gridTemplateColumns } }
    const out = {}
    const root = document.querySelector('[data-screen-label="Lecteur"]')
    if (root) { out.lecteur = G(root); out.lecteurCols = getComputedStyle(root).gridTemplateColumns }
    const video = root?.querySelector('div > div')
    out.cadre = G(root?.firstElementChild?.firstElementChild)
    const q = (s) => document.querySelector(s)
    out.osd = G([...document.querySelectorAll('div')].find(d => /^\s*\d+/.test(d.textContent) && getComputedStyle(d).position === 'absolute' && d.style.top === '76px'))
    out.barreHaut = G([...document.querySelectorAll('div')].find(d => d.style.top === '0px' && d.style.zIndex === '2' && d.style.left === '0px'))
    out.barreBas = G([...document.querySelectorAll('div')].find(d => d.style.bottom === '0px' && d.style.zIndex === '2' && d.style.left === '0px'))
    const bb = [...document.querySelectorAll('div')].find(d => d.style.bottom === '0px' && d.style.zIndex === '2' && d.style.left === '0px')
    if (bb) { out.ctlRangee = G(bb.lastElementChild); out.ctlBtn0 = G(bb.lastElementChild.firstElementChild)
      out.ctlBtns = [...bb.lastElementChild.children].map(e => { const r = e.getBoundingClientRect(); return `${e.getAttribute('aria-label') || e.tagName}:${Math.round(r.width)}x${Math.round(r.height)}` })
      out.badgeDirect = G(bb.querySelector('span[style*="c50f1f"]')) }
    out.mg = G(q('[aria-label="Mini-guide"]'))
    const mg = q('[aria-label="Mini-guide"]')
    if (mg) { out.mgEntete = G(mg.firstElementChild); out.mgLigne = G(mg.lastElementChild.firstElementChild); out.mgLignes = mg.lastElementChild.children.length }
    out.info = G(q('[aria-label="Informations sur la chaîne"]'))
    const inf = q('[aria-label="Informations sur la chaîne"]')
    if (inf) { out.infoBloc = G(inf.children[1]) }
    out.mini = G(q('[aria-label="Mini-lecteur"]'))
    out.toast = G(q('[role=status]'))
    const aside = root?.children[1]
    out.aside = G(aside)
    if (aside) { out.asideLigne = G(aside.querySelector('[role=button][style*="border-left"]') || aside.querySelector('[role=button]')) }
    return out
  })
  console.log('\n### ' + titre)
  for (const [k, v] of Object.entries(m)) console.log(k, JSON.stringify(v))
}

await mesurer('lecteur direct — repos')

// G : mini-guide
await page.keyboard.press('g'); await page.waitForTimeout(600)
await mesurer('mini-guide')
await page.screenshot({ path: 'captures/maq-miniguide.png' })
await page.keyboard.press('g'); await page.waitForTimeout(400)

// I : panneau d'informations
await page.keyboard.press('i'); await page.waitForTimeout(600)
await mesurer('panneau infos')
await page.screenshot({ path: 'captures/maq-infos.png' })
await page.keyboard.press('i'); await page.waitForTimeout(400)

// OSD : zapper
await page.keyboard.press('ArrowDown'); await page.waitForTimeout(900)
await mesurer('bandeau de chaîne (OSD)')
await page.screenshot({ path: 'captures/maq-osd.png' })

// Masquage auto : attendre 3,2 s sans bouger
await page.waitForTimeout(4200)
console.log('\nopacité contrôles après 4,2 s :', await page.evaluate(() => {
  const bb = [...document.querySelectorAll('div')].find(d => d.style.bottom === '0px' && d.style.zIndex === '2' && d.style.left === '0px')
  return bb ? { op: getComputedStyle(bb).opacity, pe: getComputedStyle(bb).pointerEvents, curseur: getComputedStyle(bb.parentElement).cursor } : null
}))
await page.screenshot({ path: 'captures/maq-masque.png' })

// Mini-lecteur : quitter le lecteur
await page.evaluate(() => { const n = [...document.querySelectorAll('nav [role=button]')].find(e => /Accueil/.test(e.textContent)); n?.click() })
await page.waitForTimeout(1200)
await mesurer('mini-lecteur')
await page.screenshot({ path: 'captures/maq-mini.png' })

await nav.close()
