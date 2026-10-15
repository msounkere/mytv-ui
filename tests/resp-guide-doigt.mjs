// Glissement au doigt du guide : un vrai geste tactile (CDP), pas une souris.
import { chromium } from 'playwright'
import { couperLesFlux, connecter } from './garde-flux.mjs'
const [,, l = '820', h = '1180'] = process.argv
const ctx = await chromium.launchPersistentContext(process.env.PROFIL, { viewport: { width: +l, height: +h }, hasTouch: true })
const page = ctx.pages()[0] ?? (await ctx.newPage())
await page.setViewportSize({ width: +l, height: +h })
await couperLesFlux(page)
await page.goto('http://localhost:5173/app/', { waitUntil: 'load' })
await connecter(page)
await page.waitForTimeout(2000)
await page.evaluate(() => [...document.querySelectorAll('button,a')].find((e) => /^\s*Guide\s*$/.test(e.textContent) && e.offsetParent)?.click())
await page.waitForTimeout(3000)
const premiere = () => page.evaluate(() => document.querySelector('span.num.tertiaire')?.textContent)
const jour = () => page.evaluate(() => [...document.querySelectorAll('span.num.tertiaire')].slice(0, 3).map((e) => e.textContent).join(' '))
await page.screenshot({ path: 'captures/resp-app-doigt.png' })
console.log('avant', await jour())
const cdp = await ctx.newCDPSession(page)
const x0 = +l - 60, y = 400
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] })
for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 - i * 20, y }] })
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
await page.waitForTimeout(800)
console.log('apres glissement gauche 160 px', await jour())
// Défilement vertical : doit toujours marcher.
const top = () => page.evaluate(() => [...document.querySelectorAll('div')].filter((d) => d.offsetParent && d.querySelector('button[title$="— ouvrir"]')).find((d) => getComputedStyle(d).overflowY === 'auto' && d.scrollHeight > d.clientHeight + 100)?.scrollTop)
console.log('scrollTop avant', await top())
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 500, y: 800 }] })
for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 500, y: 800 - i * 40 }] })
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
await page.waitForTimeout(800)
console.log('scrollTop apres balayage vertical', await top())
await ctx.close()
