// Mesure et capture du lecteur par gabarit. Aucun flux : couperLesFlux refuse la source.
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
await page.evaluate(() => { const b = [...document.querySelectorAll('button,a')].find((e) => /^\s*Direct\s*$/.test(e.textContent) && e.offsetParent); b?.click() })
await page.waitForTimeout(2500)
if (!(await page.locator('video').count())) await page.locator('button', { hasText: 'Aucun programme disponible' }).nth(2).click({ timeout: 8000 }).catch((e) => console.log('clic ligne', e.message.slice(0, 80)))
await page.waitForSelector('video', { timeout: 15000 }).catch(() => console.log('PAS DE LECTEUR'))
await page.waitForTimeout(2000)
await page.screenshot({ path: `captures/resp-app-${nom}.png` })
console.log(await page.evaluate(() => {
  const v = document.querySelector('video')
  const cadre = v.parentElement.getBoundingClientRect()
  const ctl = [...document.querySelectorAll('[data-role=commandes] button')].filter((b) => b.offsetParent)
  const pe = ctl.map((b) => b.getBoundingClientRect())
  return JSON.stringify({
    cadre: [Math.round(cadre.width), Math.round(cadre.height)],
    ligne: (() => { const row = document.querySelector('[data-role=commandes] > div:last-child')?.lastElementChild; return row && [Math.round(row.getBoundingClientRect().width), [...row.children].map((k) => Math.round(k.getBoundingClientRect().width)).join(',')] })(),
    boutons: ctl.length, plusPetit: Math.min(...pe.map((r) => Math.min(r.width, r.height))),
    droite: Math.round(Math.max(...pe.map((r) => r.right))), scrollW: document.documentElement.scrollWidth,
    libelles: ctl.map((b) => b.getAttribute('aria-label')).join('|'), slider: !!document.querySelector('input[aria-label=Volume]'),
  })
}))
console.log(await page.evaluate(() => {
  const z = [...document.querySelectorAll('aside div')].find((d) => getComputedStyle(d).overflowY === 'auto')
  return JSON.stringify({ lignes: z ? z.querySelectorAll('button[title]').length : -1, h: z?.clientHeight })
}))
await ctx.close()
