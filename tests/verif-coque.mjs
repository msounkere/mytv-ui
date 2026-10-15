import { chromium } from 'playwright'
const ctx = await chromium.launchPersistentContext('/tmp/claude-0/-root/af0bfe04-324f-47cd-9f6b-faadeffb4ea5/scratchpad/profil-chrome', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const page = ctx.pages()[0] ?? await ctx.newPage()
const journal = []
page.on('pageerror', (e) => journal.push(`[ERREUR] ${e.message.slice(0, 200)}`))
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle' })
await page.waitForTimeout(5000)
await page.screenshot({ path: 'captures/app-accueil-apres.png' })
await page.screenshot({ path: 'captures/cmp-app-rail.png', clip: { x: 0, y: 0, width: 74, height: 380 }, scale: 'css' })
await page.screenshot({ path: 'captures/cmp-app-hdr.png', clip: { x: 1000, y: 0, width: 440, height: 52 } })

// Piege connu : sans hauteur reelle, @tanstack/solid-virtual ne monte rien.
await page.locator('nav .rail-item').nth(1).click()
await page.waitForTimeout(2500)
const parcours = await page.evaluate(() => ({
  categories: document.querySelectorAll('aside button[title]').length,
  lignes: document.querySelectorAll('main section button[title]').length,
}))
await page.screenshot({ path: 'captures/app-parcours-apres.png' })
await page.locator('nav .rail-item').nth(4).click()
await page.waitForTimeout(4000)
const guide = await page.evaluate(() => ({
  texte: document.body.innerText.split('\n').filter(l => l.trim()).slice(0, 4).join(' | '),
  blocs: document.querySelectorAll('main [role=button], main button').length,
}))
await page.screenshot({ path: 'captures/app-guide-apres.png' })
await page.locator('nav .rail-item').nth(2).click()
await page.waitForTimeout(2500)
const films = await page.evaluate(() => document.querySelectorAll('main button[title]').length)
console.log(JSON.stringify({ parcours, guide, films }, null, 1))
console.log('journal:', journal.length ? journal.join('\n') : 'aucune erreur')
await ctx.close()
