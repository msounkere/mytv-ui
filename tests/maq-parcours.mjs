import { chromium } from 'playwright'
const nav = await chromium.launch()
const page = await nav.newPage({ viewport: { width: 1440, height: 900 } })
page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message.slice(0, 200)))
await page.goto('http://127.0.0.1:8777/Lecteur%20IPTV.dc.html', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(2500)

const cs = (sel, props) => page.evaluate(([s, p]) => {
  const el = document.querySelector(s)
  if (!el) return null
  const c = getComputedStyle(el), r = el.getBoundingClientRect()
  const o = { _box: `${Math.round(r.width)}x${Math.round(r.height)} @${Math.round(r.x)},${Math.round(r.y)}` }
  for (const k of p) o[k] = c.getPropertyValue(k)
  return o
}, [sel, props])

async function ecran(nom, label) {
  await page.getByRole('button', { name: new RegExp(label) }).first().click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `captures/maq-${nom}.png` })
  console.log(`\n======== ${nom} ========`)

  // Structure globale du parcours
  const g = await page.evaluate(() => {
    const aside = document.querySelector('aside')
    const sec = aside?.parentElement?.querySelector('section')
    const grille = aside?.parentElement
    const r = (e) => e ? `${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}` : 'n/a'
    return {
      grilleCols: grille ? getComputedStyle(grille).gridTemplateColumns : 'n/a',
      aside: r(aside), asideBorder: aside ? getComputedStyle(aside).borderRightWidth + ' ' + getComputedStyle(aside).borderRightColor : '',
      section: r(sec),
    }
  })
  console.log('layout:', JSON.stringify(g))

  // Onglets segmentés + ligne compteur + lignes de catégorie
  const cats = await page.evaluate(() => {
    const aside = document.querySelector('aside')
    if (!aside) return null
    const seg = aside.firstElementChild
    const segItems = [...seg.children].map((e) => { const c = getComputedStyle(e), r = e.getBoundingClientRect()
      return `${e.innerText.trim()} h=${Math.round(r.height)} fs=${c.fontSize} fw=${c.fontWeight} bg=${c.backgroundColor} col=${c.color} br=${c.borderRadius}` })
    const compteur = aside.children[1]
    const cc = getComputedStyle(compteur)
    const scroller = aside.children[2]
    const inner = scroller.firstElementChild
    const lignes = [...inner.children]
    const ech = lignes.slice(0, 6).map((e) => { const c = getComputedStyle(e), r = e.getBoundingClientRect()
      return `"${e.innerText.replace(/\n/g, '|').slice(0, 34)}" h=${Math.round(r.height)} top=${c.top} pad=${c.padding} gap=${c.gap} bg=${c.backgroundColor} op=${c.opacity} br=${c.borderRadius} L/R=${c.left}/${c.right}` })
    // pas entre lignes consecutives
    const tops = lignes.slice(0, 5).map((e) => parseFloat(getComputedStyle(e).top))
    return { segPad: getComputedStyle(seg).padding, segGap: getComputedStyle(seg).gap, segItems,
      compteurTxt: compteur.innerText.replace(/\n/g, ' | '), compteurPad: cc.padding, compteurFs: cc.fontSize, compteurLh: cc.lineHeight, compteurCol: cc.color,
      scrollerH: Math.round(scroller.getBoundingClientRect().height), totalH: inner.style.height,
      nLignesDOM: lignes.length, pas: tops.map((t, i) => i ? t - tops[i-1] : 0).slice(1), ech }
  })
  console.log('aside:', JSON.stringify(cats, null, 1))

  // Zone droite : barre d'outils + contenu
  const droite = await page.evaluate(() => {
    const sec = document.querySelector('aside')?.parentElement?.querySelector('section')
    if (!sec) return null
    const tb = sec.children[0], c = getComputedStyle(tb)
    const h1 = tb.querySelector('h1'), hc = h1 ? getComputedStyle(h1) : null
    return { tbH: Math.round(tb.getBoundingClientRect().height), tbPad: c.padding, tbGap: c.gap, tbTxt: tb.innerText.replace(/\n/g, ' | ').slice(0, 90),
      h1: hc ? `fs=${hc.fontSize} lh=${hc.lineHeight} fw=${hc.fontWeight} ff=${hc.fontFamily.slice(0,40)}` : 'n/a',
      nEnfantsSection: sec.children.length }
  })
  console.log('droite:', JSON.stringify(droite, null, 1))
  return
}

await ecran('10-direct', 'Direct')
// detail des lignes de chaines
console.log('\n-- lignes direct --', JSON.stringify(await page.evaluate(() => {
  const sec = document.querySelector('aside').parentElement.querySelector('section')
  const entete = sec.children[1], ec = getComputedStyle(entete)
  const scroller = sec.children[2], inner = scroller.firstElementChild
  const rows = [...inner.children]
  const r0 = rows[0], c0 = getComputedStyle(r0)
  const tops = rows.slice(0, 5).map((e) => parseFloat(getComputedStyle(e).top))
  return { enteteH: Math.round(entete.getBoundingClientRect().height), enteteCols: ec.gridTemplateColumns, enteteFs: ec.fontSize, enteteLh: ec.lineHeight, enteteCol: ec.color, enteteTxt: entete.innerText.replace(/\n/g,' | '), enttePad: ec.padding,
    scrollerH: Math.round(scroller.getBoundingClientRect().height), totalH: inner.style.height, nRowsDOM: rows.length,
    rowH: Math.round(r0.getBoundingClientRect().height), rowCols: c0.gridTemplateColumns, rowGap: c0.gap, rowPad: c0.padding, rowBorder: c0.borderBottomWidth + ' ' + c0.borderBottomColor,
    pas: tops.map((t,i)=>i?t-tops[i-1]:0).slice(1), txt: r0.innerText.replace(/\n/g,' | ').slice(0,80) }
}), null, 1))

await ecran('20-films', 'Films')
const mesureGrille = async (nom) => console.log(`\n-- grille ${nom} --`, JSON.stringify(await page.evaluate(() => {
  const sec = document.querySelector('aside').parentElement.querySelector('section')
  const scroller = sec.children[1], inner = scroller.firstElementChild
  const rangees = [...inner.children]
  const r0 = rangees[0], c0 = getComputedStyle(r0)
  const tops = rangees.slice(0, 5).map((e) => parseFloat(getComputedStyle(e).top))
  const p0 = r0.firstElementChild, pc = getComputedStyle(p0)
  const aff = p0.firstElementChild, ac = getComputedStyle(aff)
  const titre = aff.querySelector('span'), tc = getComputedStyle(titre)
  const meta = p0.children[1], mc = getComputedStyle(meta)
  return { scrollerW: Math.round(scroller.getBoundingClientRect().width), scrollerH: Math.round(scroller.getBoundingClientRect().height),
    totalH: inner.style.height, nRangeesDOM: rangees.length, nAffichesParRangee: r0.children.length,
    rangeeCols: c0.gridTemplateColumns, rangeeGap: c0.gap, rangeeLeft: c0.left, rangeeRight: c0.right, pasRangee: tops.map((t,i)=>i?t-tops[i-1]:0).slice(1),
    carteGap: pc.gap, carteDir: pc.flexDirection,
    afficheBox: Math.round(aff.getBoundingClientRect().width) + 'x' + Math.round(aff.getBoundingClientRect().height),
    afficheBr: ac.borderRadius, affichePad: ac.padding, afficheShadow: ac.boxShadow.slice(0, 70), afficheBg: ac.backgroundColor,
    titreFs: tc.fontSize, titreLh: tc.lineHeight, titreFw: tc.fontWeight, titreFf: tc.fontFamily.slice(0, 40), titreMaxH: tc.maxHeight,
    metaFs: mc.fontSize, metaLh: mc.lineHeight, metaCol: mc.color, metaGap: mc.gap, metaTxt: meta.innerText.replace(/\n/g,' | ') }
}), null, 1))
await mesureGrille('films')

await ecran('30-series', 'Séries')
await mesureGrille('series')

await nav.close()
