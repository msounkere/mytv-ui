import { chromium } from 'playwright'
const nav = await chromium.launch()
const page = await nav.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://127.0.0.1:8777/Lecteur%20IPTV.dc.html', { waitUntil: 'networkidle', timeout: 90000 })
await page.waitForTimeout(6000)
const m = await page.evaluate(() => {
  const g = (el, k) => { if (!el) return [k, null]; const c = getComputedStyle(el); const r = el.getBoundingClientRect()
    return [k, { w:+r.width.toFixed(1), h:+r.height.toFixed(1), fs:c.fontSize, lh:c.lineHeight, fw:c.fontWeight,
      ls:c.letterSpacing, tt:c.textTransform, col:c.color, bg:c.backgroundColor, bd:c.border, br:c.borderRadius,
      pad:c.padding, gap:c.gap, ai:c.alignItems, jc:c.justifyContent, fd:c.flexDirection, ar:c.aspectRatio,
      sh:c.boxShadow.slice(0,90), of:c.overflow, pos:c.position, ins:[c.top,c.right,c.bottom,c.left].join('/'), tr:c.transition.slice(0,80) }] }
  const out = []
  const sc = [...document.querySelectorAll('*')].find(e => e.scrollHeight > e.clientHeight + 40 && e.clientHeight > 300)
  out.push(g(sc,'scroller'))
  const col = sc.firstElementChild
  out.push(g(col,'colonne'))
  const secs = [...col.children]
  out.push(['nbSections', secs.length])
  // HERO
  const hero = secs[0]
  out.push(g(hero,'hero.section'))
  out.push(g(hero.children[0],'hero.media'))
  out.push(g(hero.children[0].querySelector('div'),'hero.plaqueTitre'))
  const enc = hero.children[1]
  out.push(g(enc,'hero.encart'))
  out.push(g(enc.children[0],'hero.surtitre'))
  out.push(g(enc.children[1],'hero.h1'))
  out.push(g(enc.children[2],'hero.metaRow'))
  out.push(g(enc.children[2].children[0],'hero.meta'))
  out.push(g(enc.children[2].children[1],'hero.classif'))
  out.push(g(enc.children[3],'hero.resume'))
  const btns = enc.children[4]
  out.push(g(btns,'hero.btnRow'))
  out.push(g(btns.children[0],'hero.btnPrim'))
  out.push(g(btns.children[1],'hero.btnSec'))
  out.push(g(btns.children[2],'hero.btnFav'))
  const nvg = hero.children[2]
  out.push(g(nvg,'hero.nav'))
  out.push(g(nvg.children[0],'hero.chevron'))
  out.push(g(nvg.children[1],'hero.pastilleActive'))
  out.push(g(nvg.children[2],'hero.pastille'))
  // RANGEE generique (section 1 = continuer)
  const r1 = secs[1]
  out.push(g(r1,'r1.section'))
  out.push(g(r1.children[0],'r1.entete'))
  out.push(g(r1.children[0].children[0],'r1.h2'))
  out.push(g(r1.children[0].children[1],'r1.compteur'))
  out.push(g(r1.children[0].children[3],'r1.chevron'))
  out.push(g(r1.children[1],'r1.piste'))
  const cr = r1.children[1].children[0]
  out.push(g(cr,'reprise.carte'))
  out.push(g(cr.children[0],'reprise.vignette'))
  out.push(g(cr.children[1],'reprise.texte'))
  ;[...cr.children[1].children].forEach((e,i)=>out.push(g(e,'reprise.texte'+i)))
  ;[...cr.children[0].children].forEach((e,i)=>out.push(g(e,'reprise.vign'+i)))
  // chaines favorites
  const r2 = secs[2]
  out.push(g(r2.children[0].children[2],'r2.toutVoir'))
  const cc = r2.children[1].children[0]
  out.push(g(cc,'chaine.carte'))
  ;[...cc.children].forEach((e,i)=>out.push(g(e,'chaine.c'+i)))
  out.push(g(cc.children[0].children[0],'chaine.logo'))
  out.push(g(cc.children[0].children[1],'chaine.noms'))
  out.push(g(cc.children[0].children[2],'chaine.badgeDirect'))
  // en direct maintenant
  const r3 = secs[3]
  const cd = r3.children[1].children[0]
  out.push(g(cd,'direct.carte'))
  ;[...cd.children].forEach((e,i)=>out.push(g(e,'direct.c'+i)))
  // films recents = affiches
  const r4 = secs[4]
  out.push(g(r4.children[1],'r4.piste'))
  const ca = r4.children[1].children[0]
  out.push(g(ca,'affiche.carte'))
  ;[...ca.children].forEach((e,i)=>out.push(g(e,'affiche.c'+i)))
  out.push(g(ca.children[0].querySelector('div'),'affiche.titreInterne'))
  const titres = [...col.querySelectorAll('h2')].map(h=>h.textContent.trim())
  out.push(['titresRangees', titres])
  return out
})
for (const [k, v] of m) console.log(k.padEnd(22), JSON.stringify(v))
await nav.close()
