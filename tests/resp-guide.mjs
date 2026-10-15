// Capture et mesures du guide par gabarit. Aucun flux.
import { chromium } from 'playwright'
import { couperLesFlux, connecter } from './garde-flux.mjs'
const [,, l = '1440', h = '900', nom = 'x', toucher = ''] = process.argv
const ctx = await chromium.launchPersistentContext(process.env.PROFIL, { viewport: { width: +l, height: +h }, hasTouch: !!toucher })
const page = ctx.pages()[0] ?? (await ctx.newPage())
await page.setViewportSize({ width: +l, height: +h })
await couperLesFlux(page)
page.on('pageerror', (e) => console.log('ERREUR PAGE', e.message))
await page.goto('http://localhost:5173/app/', { waitUntil: 'load' })
await connecter(page)
await page.waitForTimeout(1500)
await page.evaluate(() => { const b = [...document.querySelectorAll('button,a')].find((e) => /^\s*Guide\s*$/.test(e.textContent) && e.offsetParent); b?.click() })
await page.waitForTimeout(3500)
await page.screenshot({ path: `captures/resp-app-${nom}.png` })
console.log(await page.evaluate(() => {
  const r = (el) => el && { w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) }
  const ligne = [...document.querySelectorAll('button[title$="— ouvrir"]')].filter((b) => b.offsetParent)
  const prog = [...document.querySelectorAll('button[title*=" – "]')].filter((b) => b.offsetParent)
  return JSON.stringify({ lignes: ligne.length, colonne: r(ligne[0]), prog: prog.length, scrollW: document.documentElement.scrollWidth })
}))
await ctx.close()
