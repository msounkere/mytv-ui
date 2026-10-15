// Capture de la fiche série par gabarit. Aucun flux : seule l'API get_series_info est appelée.
import { chromium } from 'playwright'
import { couperLesFlux, connecter } from './garde-flux.mjs'
const [,, l = '1440', h = '900', nom = 'x'] = process.argv
const ctx = await chromium.launchPersistentContext(process.env.PROFIL, { viewport: { width: +l, height: +h } })
const page = ctx.pages()[0] ?? (await ctx.newPage())
await page.setViewportSize({ width: +l, height: +h })
await couperLesFlux(page)
page.on('pageerror', (e) => console.log('ERREUR PAGE', e.message))
await page.goto('http://localhost:5173/app/', { waitUntil: 'load' })
await connecter(page)
await page.waitForTimeout(1500)
await page.evaluate(() => { const b = [...document.querySelectorAll('button,a')].find((e) => /^\s*Séries\s*$/.test(e.textContent) && e.offsetParent); b?.click() })
await page.waitForTimeout(3500)
await page.screenshot({ path: `captures/resp-app-${nom}-liste.png` })
await page.locator('main button').filter({ hasText: 'Nouveau' }).nth(2).click()
await page.waitForTimeout(5000)
await page.screenshot({ path: `captures/resp-app-${nom}.png` })
console.log(await page.evaluate(() => JSON.stringify({ h1: document.querySelector('main h1')?.textContent, scrollW: document.documentElement.scrollWidth, tabs: document.querySelectorAll('[role=tab]').length })))
await ctx.close()
