import { chromium } from 'playwright'
const nav = await chromium.launch()
const page = await nav.newPage({ viewport: { width: 1440, height: 900 } })
const erreurs = []
page.on('pageerror', (e) => erreurs.push('[PAGEERROR] ' + e.message.slice(0, 200)))
page.on('console', (m) => { if (m.type() === 'error') erreurs.push('[CONSOLE] ' + m.text().slice(0, 160)) })
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(3500)
await page.screenshot({ path: 'captures/v2-01-accueil.png' })

const mes = await page.evaluate(() => {
  const g = (s, ...p) => { const e = document.querySelector(s); if (!e) return '(absent) ' + s
    const r = e.getBoundingClientRect(); const c = getComputedStyle(e); const o = {}
    for (const k of p) o[k] = c[k]
    return { box: `${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.x)},${Math.round(r.y)}`, ...o } }
  const items = [...document.querySelectorAll('.rail-item')].map(e => { const r = e.getBoundingClientRect(); const c = getComputedStyle(e)
    return `${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.x)},${Math.round(r.y)} dir:${c.flexDirection} g:${c.gap} p:${c.padding} bg:${c.backgroundColor} c:${c.color} "${e.textContent.trim().slice(0,20)}"` })
  return {
    coque: g('.coque', 'gridTemplateColumns', 'fontSize', 'lineHeight'),
    rail: g('.rail', 'width', 'padding', 'gap', 'backgroundColor', 'borderRightWidth'),
    entete_h: g('.entete', 'height', 'padding', 'gap', 'backgroundColor'),
    titre: g('.entete-titre', 'fontSize', 'fontWeight', 'minWidth'),
    flux: g('.entete-flux', 'height', 'borderRadius', 'padding', 'color', 'fontSize'),
    tune: g('.entete-bouton-icone', 'width', 'height', 'borderRadius'),
    profilBtn: g('.entete-bouton-profil', 'width', 'height', 'borderRadius'),
    avatar: g('.entete-bouton-profil .avatar', 'width', 'height', 'backgroundColor'),
    marque: g('.rail-marque-nom', 'fontSize', 'fontWeight'),
    svgIcone: g('.rail-item .icone', 'width', 'height'),
    items,
    nbIcones: document.querySelectorAll('svg.icone').length,
    nbRepli: document.querySelectorAll('.icone--repli').length,
  }
})
console.log(JSON.stringify(mes, null, 1))
console.log('erreurs:', erreurs.length ? erreurs : 'aucune')
await nav.close()
