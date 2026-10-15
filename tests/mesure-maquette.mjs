import { chromium } from 'playwright'
const nav = await chromium.launch()
const page = await nav.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://127.0.0.1:8777/Lecteur%20IPTV.dc.html', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(4000)
const m = await page.evaluate(() => {
  const g = (el) => { if (!el) return null; const c = getComputedStyle(el); const r = el.getBoundingClientRect()
    return { w: +r.width.toFixed(1), h: +r.height.toFixed(1), fs: c.fontSize, lh: c.lineHeight, fw: c.fontWeight,
      ff: c.fontFamily.slice(0, 40), color: c.color, bg: c.backgroundColor, pad: c.padding, gap: c.gap, br: c.borderRadius } }
  const nv = document.querySelector('nav')
  const hdr = document.querySelector('header')
  const items = [...nv.querySelectorAll('[role=button]')]
  const out = { root: g(document.querySelector('[data-theme]')), nav: g(nv), header: g(hdr) }
  out.rootCols = getComputedStyle(document.querySelector('[data-theme]')).gridTemplateColumns
  out.navItem0 = g(items[0]); out.navItem1 = g(items[1])
  out.navIcon = g(items[1].querySelector('span[data-icon]'))
  out.navLabel = g(items[1].querySelector('span:not([data-icon])'))
  out.logo = g(nv.querySelector('div > div'))
  out.crumb = g(hdr.firstElementChild)
  const hd = [...hdr.querySelectorAll('div')]
  out.stream = g(hd.find(d => d.textContent.includes('Flux 0/1') && d.children.length === 1))
  out.qualite = g(hd.find(d => d.textContent.includes('Distant') && d.getAttribute('role') === 'button'))
  const main = document.querySelector('main')
  out.homeInner = g(main.querySelector('div > div'))
  out.heroInput = g(main.querySelector('input'))
  out.heroIcon = g(main.querySelector('span[data-icon=search]'))
  const h2s = [...main.querySelectorAll('h2')]
  out.h2 = g(h2s[0]); out.h2text = h2s.map(h => h.textContent)
  out.catalogLine = g([...main.querySelectorAll('div')].find(d => /chaînes · /.test(d.textContent) && d.children.length === 0))
  out.catalogText = [...main.querySelectorAll('div')].find(d => /chaînes · /.test(d.textContent) && d.children.length === 0)?.textContent
  // grille reprendre
  const sec = h2s[0].parentElement
  const grille = sec.querySelector('div')
  out.resumeGrid = { ...g(grille), cols: getComputedStyle(grille).gridTemplateColumns }
  const carte = grille.firstElementChild
  out.resumeCard = g(carte)
  out.resumeVign = g(carte.firstElementChild)
  out.resumeTitre = g(carte.querySelector('span'))
  out.resumeMeta = g(carte.lastElementChild)
  // deux colonnes
  const deux = h2s[1].closest('section').parentElement
  out.deuxCols = { ...g(deux), cols: getComputedStyle(deux).gridTemplateColumns }
  const favG = h2s[1].closest('section').querySelectorAll(':scope > div')[1]
  out.favGrid = { ...g(favG), cols: getComputedStyle(favG).gridTemplateColumns }
  out.favCard = g(favG.firstElementChild)
  out.favLogo = g(favG.firstElementChild.firstElementChild)
  const rec = h2s.find(h => h.textContent === 'Récents').closest('section')
  out.recSec = g(rec)
  out.recRow = g(rec.querySelector('[role=button]'))
  return out
})
console.log(JSON.stringify(m, null, 1))
await page.screenshot({ path: 'captures/maquette-accueil.png', fullPage: false })
await nav.close()
