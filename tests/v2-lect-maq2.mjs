import { chromium } from 'playwright'
const nav = await chromium.launch()
const page = await nav.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://127.0.0.1:8777/Lecteur%20IPTV.dc.html', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(4000)

const G = `(el) => { if (!el) return null; const c = getComputedStyle(el), r = el.getBoundingClientRect()
  return { w:+r.width.toFixed(1), h:+r.height.toFixed(1), x:+r.x.toFixed(1), y:+r.y.toFixed(1), fs:c.fontSize, lh:c.lineHeight, fw:c.fontWeight, pad:c.padding, gap:c.gap, br:c.borderRadius, bg:c.backgroundColor, color:c.color, bd:c.borderTopWidth+' '+c.borderTopColor, z:c.zIndex, blur:c.backdropFilter, cols:c.gridTemplateColumns, sh:c.boxShadow.slice(0,60) } }`

const dump = async (titre, fn) => {
  const m = await page.evaluate(new Function('G', 'return (' + fn + ')(eval(G))')(G) ? fn : fn, G).catch(() => null)
  console.log('\n### ' + titre); console.log(JSON.stringify(m, null, 1))
}

const mes = (fn) => page.evaluate(([src, gsrc]) => {
  const G = eval('(' + gsrc + ')')
  return eval('(' + src + ')')(G)
}, [fn.toString(), G])

await page.evaluate(() => { const n = [...document.querySelectorAll('nav [role=button]')].find(e => /Direct/.test(e.textContent)); n?.click() })
await page.waitForTimeout(1500)
await page.evaluate(() => {
  const m = document.querySelector('main')
  const r = [...m.querySelectorAll('[role=button]')].filter(e => { const b = e.getBoundingClientRect(); return b.width > 300 && b.height > 30 && b.height < 80 })
  r[2]?.click()
})
await page.waitForTimeout(2500)

// --- mini-guide --------------------------------------------------------
await page.keyboard.press('g'); await page.waitForTimeout(700)
console.log('\n### mini-guide'); console.log(JSON.stringify(await mes((G) => {
  const d = document.querySelector('div[role=dialog][aria-label="Mini-guide"]')
  if (!d) return null
  const corps = d.lastElementChild
  return { dialog: G(d), entete: G(d.firstElementChild), corps: G(corps), ligne: G(corps.firstElementChild), nbLignes: corps.children.length,
    logo: G(corps.firstElementChild.children[1]), bloc: G(corps.firstElementChild.children[2]), txt: corps.firstElementChild.textContent.slice(0, 90) }
}), null, 1))
await page.screenshot({ path: 'captures/maq-miniguide.png' })
await page.keyboard.press('g'); await page.waitForTimeout(400)

// --- panneau d'informations -------------------------------------------
await page.keyboard.press('i'); await page.waitForTimeout(700)
console.log('\n### panneau infos'); console.log(JSON.stringify(await mes((G) => {
  const d = document.querySelector('div[role=dialog][aria-label="Informations sur la chaîne"]')
  if (!d) return null
  return { dialog: G(d), entete: G(d.children[0]), logo: G(d.children[0].children[0]), bloc: G(d.children[1]),
    surtitre: G(d.children[1].children[0]), titre: G(d.children[1].children[1]), desc: G(d.children[1].lastElementChild),
    pied: G(d.lastElementChild), btn: G(d.lastElementChild.firstElementChild), txt: d.textContent.slice(0, 160) }
}), null, 1))
await page.screenshot({ path: 'captures/maq-infos.png' })
await page.keyboard.press('i'); await page.waitForTimeout(400)

// --- bandeau de zapping (OSD) -----------------------------------------
await page.keyboard.press('ArrowDown'); await page.waitForTimeout(800)
console.log('\n### bandeau OSD'); console.log(JSON.stringify(await mes((G) => {
  const d = [...document.querySelectorAll('div')].find(e => e.style.top === '76px' && e.style.zIndex === '4')
  if (!d) return null
  return { bandeau: G(d), num: G(d.children[0]), logo: G(d.children[1]), bloc: G(d.children[2]),
    titre: G(d.children[2].children[0]), sous: G(d.children[2].children[1]), txt: d.textContent.slice(0, 90) }
}), null, 1))
await page.screenshot({ path: 'captures/maq-osd.png' })

// --- notification ------------------------------------------------------
await page.keyboard.press('f'); await page.waitForTimeout(500) // plein écran, non ; on force un toast par favori
await page.evaluate(() => { document.exitFullscreen?.() })
await page.waitForTimeout(300)
const btnFav = await page.evaluate(() => { const b = [...document.querySelectorAll('[role=button]')].find(e => /favoris/i.test(e.getAttribute('aria-label') || '')); b?.click(); return !!b })
await page.waitForTimeout(600)
console.log('\n### notification (toast), favori=' + btnFav); console.log(JSON.stringify(await mes((G) => {
  const t = document.querySelector('[role=status]')
  return t ? { toast: G(t), icone: G(t.firstElementChild), txt: t.textContent } : null
}), null, 1))
await page.screenshot({ path: 'captures/maq-toast.png' })

// --- mini-lecteur ------------------------------------------------------
await page.evaluate(() => { const n = [...document.querySelectorAll('nav [role=button]')].find(e => /Accueil/.test(e.textContent)); n?.click() })
await page.waitForTimeout(1200)
console.log('\n### mini-lecteur'); console.log(JSON.stringify(await mes((G) => {
  const d = document.querySelector('[aria-label="Mini-lecteur"]')
  if (!d) return null
  const [vid, barre] = [d.children[0], d.children[2]]
  return { mini: G(d), vignette: G(vid), jauge: G(d.children[1]), barre: G(barre),
    logo: G(barre.firstElementChild.firstElementChild), txt: G(barre.firstElementChild.children[1]),
    btn: G(barre.children[1]), boutons: [...barre.children].slice(1).map(e => (e.getAttribute('aria-label') || '') + ':' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height)),
    toastB: (() => { const t = document.querySelector('[role=status]'); return t ? getComputedStyle(t).bottom : null })() }
}), null, 1))
await page.screenshot({ path: 'captures/maq-mini.png' })

// --- compte à rebours épisode suivant + reprise (VOD) ------------------
await page.evaluate(() => { const n = [...document.querySelectorAll('nav [role=button]')].find(e => /Séries/.test(e.textContent)); n?.click() })
await page.waitForTimeout(1500)
await page.evaluate(() => { const c = document.querySelector('main [role=button]'); c?.click() })
await page.waitForTimeout(1500)
await page.screenshot({ path: 'captures/maq-serie.png' })
console.log('\nécran série:', await page.evaluate(() => document.querySelector('[data-screen-label]')?.dataset.screenLabel))

await nav.close()
