import { chromium } from 'playwright'
const ctx = await chromium.launchPersistentContext('/tmp/claude-0/-root/af0bfe04-324f-47cd-9f6b-faadeffb4ea5/scratchpad/profil', { viewport: { width: 1440, height: 900 } })
const page = ctx.pages()[0] ?? await ctx.newPage()
page.on('pageerror', e => console.log('[ERR]', e.message.slice(0, 200)))
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle', timeout: 60000 })
await page.getByRole('button', { name: /^Accueil$/ }).first().click().catch(() => {})
await page.waitForTimeout(9000)

// 1. Navigation manuelle du bloc « À la une » : aucun défilement automatique.
const t0 = await page.locator('section[aria-label="À la une"] h1').innerText()
await page.waitForTimeout(6000)
const t1 = await page.locator('section[aria-label="À la une"] h1').innerText()
console.log('auto-défilement sur 6 s :', t0 === t1 ? 'AUCUN (conforme)' : 'DÉTECTÉ (' + t0 + ' -> ' + t1 + ')')
await page.getByRole('button', { name: 'Contenu suivant' }).click()
await page.waitForTimeout(2500)
console.log('surtitre après flèche :', await page.locator('section[aria-label="À la une"] span').first().innerText())
await page.screenshot({ path: 'captures/v2-hero-2.png' })

// 2. Menu « … » d'une carte de reprise.
await page.getByRole('button', { name: /Plus d’options pour/ }).first().click()
await page.waitForTimeout(600)
const items = await page.locator('[role=menuitem]').allInnerTexts()
console.log('menu contextuel :', JSON.stringify(items))
await page.screenshot({ path: 'captures/v2-menu.png' })
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
console.log('menu après Échap :', await page.locator('[role=menu]').count())

// 3. Survol d'une affiche : actions rapides.
const aff = page.locator('section[aria-label="Films récemment ajoutés"] [role=button][aria-label]').first()
await aff.hover()
await page.waitForTimeout(600)
const ombre = await aff.evaluate(e => ({ tr: getComputedStyle(e).transform, br: getComputedStyle(e).borderRadius, trs: getComputedStyle(e).transitionDuration }))
console.log('affiche au survol :', JSON.stringify(ombre))
await page.screenshot({ path: 'captures/v2-survol.png' })

// 4. Défilement d'une rangée par la flèche.
const piste = page.locator('section[aria-label="Films récemment ajoutés"] >> nth=0').locator('div').nth(1)
const avant = await page.locator('section[aria-label="Films récemment ajoutés"]').evaluate(s => s.children[1].scrollLeft)
await page.locator('section[aria-label="Films récemment ajoutés"] [aria-label="Faire défiler vers la droite"]').click()
await page.waitForTimeout(1200)
const apres = await page.locator('section[aria-label="Films récemment ajoutés"]').evaluate(s => s.children[1].scrollLeft)
console.log('défilement rangée :', avant, '->', apres)
await ctx.close()
