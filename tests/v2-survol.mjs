import { chromium } from 'playwright'
const ctx = await chromium.launchPersistentContext('/tmp/claude-0/-root/af0bfe04-324f-47cd-9f6b-faadeffb4ea5/scratchpad/profil',
  { viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' })
const page = ctx.pages()[0] ?? await ctx.newPage()
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle', timeout: 60000 })
await page.getByRole('button', { name: /^Accueil$/ }).first().click().catch(() => {})
await page.waitForTimeout(9000)
const sel = 'section[aria-label="Films récemment ajoutés"]'
const carte = page.locator(`${sel} > div:nth-child(2) > div:nth-child(1) [role=button]`).first()
const lire = (e) => { const c = getComputedStyle(e); return { tr: c.transform, br: c.borderRadius, dur: c.transitionDuration, ease: c.transitionTimingFunction, sh: c.boxShadow.slice(0, 70), ar: c.aspectRatio } }
console.log('repos  :', JSON.stringify(await carte.evaluate(lire)))
await carte.hover()
await page.waitForTimeout(500)
console.log('survol :', JSON.stringify(await carte.evaluate(lire)))
const actions = await page.locator(`${sel} [aria-label="Lecture rapide"], ${sel} [aria-label="Ajouter aux favoris"], ${sel} [aria-label="Voir les détails"]`).count()
console.log('actions rapides visibles au survol :', actions)
await page.screenshot({ path: 'captures/v2-survol.png', clip: { x: 240, y: 60, width: 760, height: 460 } })
// Reprise : aplat 16:9
const rep = page.locator('section[aria-label="Continuer à regarder"] > div:nth-child(2) > div:nth-child(1) > div > [role=button]').first()
console.log('reprise:', JSON.stringify(await rep.evaluate(lire)))
await ctx.close()
