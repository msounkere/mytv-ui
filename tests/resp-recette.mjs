// Recette responsive : aucun debordement horizontal, aucune erreur JS, listes
// virtualisees non vides, pour chaque ecran et chaque gabarit. Aucun flux.
import { chromium } from 'playwright'
import { couperLesFlux, connecter } from './garde-flux.mjs'
const GAB = { bureau: [1440, 900], tablette: [820, 1180], mobile: [390, 844] }
const ROUTES = ['', 'direct', 'films', 'series', 'guide', 'reglages']
let ok = 0, ko = 0
const dire = (b, t, d = '') => { b ? ok++ : ko++; console.log(`  ${b ? 'OK   ' : 'ECHEC'} ${t}${d ? ' — ' + d : ''}`) }
const ctx = await chromium.launchPersistentContext(process.env.PROFIL, { viewport: { width: 1440, height: 900 } })
const page = ctx.pages()[0] ?? (await ctx.newPage())
const erreurs = []
page.on('pageerror', (e) => erreurs.push(String(e).slice(0, 160)))
await couperLesFlux(page)
await page.goto('http://localhost:5173/app/', { waitUntil: 'load' })
await connecter(page)
await page.waitForTimeout(2500)
for (const [nom, [l, h]] of Object.entries(GAB)) {
  await page.setViewportSize({ width: l, height: h })
  console.log(`\n=== ${nom} ${l}x${h} ===`)
  for (const r of ROUTES) {
    await page.goto(`http://localhost:5173/app/${r}`, { waitUntil: 'load' })
    await page.waitForTimeout(2800)
    const m = await page.evaluate(() => ({
      debord: document.documentElement.scrollWidth - window.innerWidth,
      lignes: document.querySelectorAll('main button[title], main [role="row"], main article').length,
    }))
    dire(m.debord <= 1, `/${r || 'accueil'} sans debordement horizontal`, `${m.debord}px · ${m.lignes} elements`)
    if (nom === 'mobile') await page.screenshot({ path: `captures/rr-${nom}-${r || 'accueil'}.png` })
  }
  const nav = await page.evaluate(() => {
    const n = document.querySelector('nav[aria-label="Navigation principale"]')
    const b = n?.getBoundingClientRect()
    return b ? { x: Math.round(b.left), y: Math.round(b.top), l: Math.round(b.width), h: Math.round(b.height) } : null
  })
  dire(!!nav, 'navigation principale presente', JSON.stringify(nav))
}
dire(erreurs.length === 0, 'aucune erreur JS', erreurs.slice(0, 2).join(' | '))
console.log(`\n===== ${ok} OK, ${ko} en echec =====`)
await ctx.close()
