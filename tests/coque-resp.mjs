// Captures de la coque à un gabarit donné. Aucun flux : couperLesFlux bloque tout.
// usage : node tests/coque-resp.mjs <prefixe> <largeur> <hauteur>
import { chromium } from 'playwright'
import { connecter, couperLesFlux } from './garde-flux.mjs'
const [,, pre = 'coque', l = '1440', h = '900'] = process.argv
const ctx = await chromium.launchPersistentContext('/tmp/claude-0/-root/af0bfe04-324f-47cd-9f6b-faadeffb4ea5/scratchpad/profil-chrome-resp', { viewport: { width: +l, height: +h }, deviceScaleFactor: 1 })
const page = ctx.pages()[0] ?? await ctx.newPage()
const bloques = await couperLesFlux(page)
page.on('pageerror', (e) => console.log('[ERREUR]', e.message.slice(0, 200)))
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle' })
await connecter(page)
await page.evaluate(() => localStorage.setItem('mytv.barre-deployee', '1'))
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(4000)
const vue = async (n) => { await page.waitForTimeout(1800); await page.screenshot({ path: `captures/${pre}-${n}.png` }) }
await vue('accueil')
const nav = page.locator('nav[aria-label="Navigation principale"] .rail-item')
await nav.nth(1).click(); await vue('direct')
await nav.nth(4).click(); await vue('guide')
await page.locator('.entete-bouton-icone').click(); await vue('panneau-lecteur')
await page.keyboard.press('Escape')
await (+l < 700 ? page.locator('.rail-item').last() : page.locator('.entete-bouton-profil')).click(); await vue('menu-profil')
await page.keyboard.press('Escape')
console.log('flux bloqués :', bloques.length)
await ctx.close()
