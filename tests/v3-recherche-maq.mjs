import { chromium } from 'playwright'
const nav = await chromium.launch()
const page = await nav.newPage({ viewport: { width: 1440, height: 900 } })
page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message.slice(0, 200)))
await page.goto('http://127.0.0.1:8777/Lecteur%20IPTV.dc.html', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(2500)

const g = (sel, label) => page.evaluate(([sel, label]) => {
  const e = document.querySelector(sel); if (!e) return { label, null: true }
  const c = getComputedStyle(e), r = e.getBoundingClientRect()
  return { label, box: `${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.x)},${Math.round(r.y)}`,
    pad: c.padding, gap: c.gap, br: c.borderRadius, bd: c.border, bg: c.backgroundColor, sh: c.boxShadow,
    col: c.color, fs: c.fontSize, lh: c.lineHeight, fw: c.fontWeight, maxH: c.maxHeight, z: c.zIndex }
}, [sel, label])

// 1. Champ de l'en-tête au repos
console.log('CHAMP', JSON.stringify(await g('header input, [aria-label="Recherche universelle"], input[placeholder*="echerch" i]', 'champ')))

// 2. Touche / puis panneau vide (récentes + suggestions)
await page.keyboard.press('/')
await page.waitForTimeout(400)
await page.screenshot({ path: 'captures/maq-rech-vide.png' })
const vide = await page.evaluate(() => {
  const p = document.querySelector('[role="listbox"][aria-label="Suggestions de recherche"]')
  if (!p) return null
  const c = getComputedStyle(p), r = p.getBoundingClientRect()
  const inp = document.querySelector('input[placeholder*="echerch" i]')
  const ir = inp ? inp.getBoundingClientRect() : null
  const ttl = p.querySelector('div')
  const opt = p.querySelector('[role="option"]')
  const cs = (e) => { if (!e) return null; const k = getComputedStyle(e), b = e.getBoundingClientRect()
    return { t: (e.innerText||'').replace(/\n/g,'|').slice(0,40), box: `${Math.round(b.width)}x${Math.round(b.height)}`,
      h: k.height, pad: k.padding, gap: k.gap, br: k.borderRadius, fs: k.fontSize, fw: k.fontWeight,
      ls: k.letterSpacing, tt: k.textTransform, col: k.color, bg: k.backgroundColor, bd: k.border } }
  return { panneau: { box: `${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.x)},${Math.round(r.y)}`,
      pad: c.padding, br: c.borderRadius, bg: c.backgroundColor, bd: c.border, sh: c.boxShadow, maxH: c.maxHeight, z: c.zIndex, of: c.overflow },
    champ: ir ? `${Math.round(ir.width)}x${Math.round(ir.height)}@${Math.round(ir.x)},${Math.round(ir.y)} bottom=${Math.round(ir.bottom)}` : null,
    ecartSousChamp: ir ? Math.round(r.top - ir.bottom) : null,
    decalageGauche: ir ? Math.round(r.left - ir.left) : null,
    entete: cs(ttl), option: cs(opt),
    texte: p.innerText.split('\n').filter(Boolean).slice(0, 30) }
})
console.log('PANNEAU VIDE', JSON.stringify(vide, null, 1))

// 3. Frappe -> résultats groupés
await page.keyboard.type('fra', { delay: 60 })
await page.waitForTimeout(600)
await page.screenshot({ path: 'captures/maq-rech-resultats.png' })
const res = await page.evaluate(() => {
  const p = document.querySelector('[role="listbox"][aria-label="Suggestions de recherche"]')
  if (!p) return null
  const c = getComputedStyle(p), r = p.getBoundingClientRect()
  const kids = [...p.children]
  const cs = (e) => { const k = getComputedStyle(e), b = e.getBoundingClientRect()
    return { t: (e.innerText||'').replace(/\n/g,'|').slice(0,60), box: `${Math.round(b.width)}x${Math.round(b.height)}`,
      h: k.height, pad: k.padding, gap: k.gap, br: k.borderRadius, fs: k.fontSize, fw: k.fontWeight, col: k.color, bg: k.backgroundColor, disp: k.display } }
  const opts = [...p.querySelectorAll('[role="option"]')]
  const o0 = opts[0]
  const vign = o0 ? o0.firstElementChild : null
  const titre = o0 ? o0.children[1]?.firstElementChild : null
  const sous = o0 ? o0.children[1]?.children[1] : null
  const tag = o0 ? o0.children[2] : null
  return { panneauBox: `${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.x)},${Math.round(r.y)}`, maxH: c.maxHeight,
    nEnfants: kids.length, nOptions: opts.length,
    enfants: kids.map(cs),
    option0: o0 ? cs(o0) : null, vignette: vign ? cs(vign) : null, titre: titre ? cs(titre) : null,
    sousTitre: sous ? cs(sous) : null, tag: tag ? cs(tag) : null,
    texte: p.innerText.split('\n').filter(Boolean) }
})
console.log('RESULTATS', JSON.stringify(res, null, 1))

// 4. Navigation clavier : surlignage
await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown')
await page.waitForTimeout(250)
await page.screenshot({ path: 'captures/maq-rech-clavier.png' })
const sel = await page.evaluate(() => [...document.querySelectorAll('[role="listbox"] [role="option"]')]
  .map((e, i) => ({ i, bg: getComputedStyle(e).backgroundColor, t: (e.innerText||'').replace(/\n/g,'|').slice(0,30) }))
  .filter(x => x.bg !== 'rgba(0, 0, 0, 0)'))
console.log('SELECTION CLAVIER', JSON.stringify(sel))

// 5. Entrée -> page de résultats
await page.keyboard.press('Escape')
await page.waitForTimeout(200)
await nav.close()
