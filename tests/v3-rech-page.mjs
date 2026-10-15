import { chromium } from 'playwright'
const nav = await chromium.launch()
const page = await nav.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://127.0.0.1:8777/Lecteur%20IPTV.dc.html', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(2500)
await page.keyboard.press('/')
await page.waitForTimeout(300)
await page.keyboard.type('fra', { delay: 50 })
await page.waitForTimeout(600)
await page.locator('[role="listbox"] [role="option"]').last().click()
await page.waitForTimeout(1200)
await page.screenshot({ path: 'captures/maq-rech-page.png' })
const d = await page.evaluate(() => {
  const s = document.querySelector('[data-screen-label="Résultats de recherche"]')
  if (!s) return { absent: document.querySelector('[data-screen-label]')?.dataset.screenLabel }
  const cs = (e, n) => { if (!e) return null; const k = getComputedStyle(e), b = e.getBoundingClientRect()
    return { n, t: (e.innerText||'').replace(/\n/g,'|').slice(0,70), box: `${Math.round(b.width)}x${Math.round(b.height)}`,
      h: k.height, pad: k.padding, gap: k.gap, br: k.borderRadius, bd: k.border, bb: k.borderBottom,
      fs: k.fontSize, lh: k.lineHeight, fw: k.fontWeight, col: k.color, bg: k.backgroundColor, mw: k.maxWidth, gtc: k.gridTemplateColumns } }
  const wrap = s.firstElementChild
  const tabs = s.querySelector('[role="tablist"]')
  const langs = tabs?.nextElementSibling
  return { ecran: cs(s,'ecran'), wrap: cs(wrap,'wrap'),
    titre: cs(wrap.children[0].children[0],'h1'), total: cs(wrap.children[0].children[1],'total'),
    tablist: cs(tabs,'tablist'), onglets: [...(tabs?.children||[])].map((e,i)=>cs(e,'tab'+i)),
    langsRow: cs(langs,'langs'), langs: [...(langs?.children||[])].map((e,i)=>cs(e,'lang'+i)),
    sections: [...s.querySelectorAll('section')].map((e,i)=>cs(e,'sec'+i)),
    h2: cs(s.querySelector('section h2'),'h2'),
    listeChaines: cs(s.querySelector('section > div[style*="border-radius"]'),'liste'),
    ligne0: cs(s.querySelector('section [role="button"][title]'),'ligne'),
    grille: cs([...s.querySelectorAll('section > div')].find(e=>getComputedStyle(e).display==='grid'),'grille') }
})
console.log(JSON.stringify(d, null, 1))
// état vide
await page.evaluate(() => { const i = document.querySelector('input[placeholder*="echerch" i]'); i.focus() })
await page.keyboard.press('/')
await page.waitForTimeout(200)
await page.keyboard.type('zzzqqq', { delay: 40 })
await page.waitForTimeout(700)
await page.screenshot({ path: 'captures/maq-rech-vide-panneau.png' })
const none = await page.evaluate(() => {
  const p = document.querySelector('[role="listbox"][aria-label="Suggestions de recherche"]')
  return p ? p.innerText.split('\n').filter(Boolean) : null })
console.log('AUCUN RESULTAT (panneau):', JSON.stringify(none))
await nav.close()
