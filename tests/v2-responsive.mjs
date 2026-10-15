import { chromium } from 'playwright'
const ctx = await chromium.launchPersistentContext('/tmp/claude-0/-root/af0bfe04-324f-47cd-9f6b-faadeffb4ea5/scratchpad/profil', { viewport: { width: 1440, height: 900 } })
const page = ctx.pages()[0] ?? await ctx.newPage()
page.on('pageerror', e => console.log('[ERR]', e.message.slice(0, 160)))
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle', timeout: 60000 })
await page.getByRole('button', { name: /^Accueil$/ }).first().click().catch(() => {})
await page.waitForTimeout(9000)
for (const [l, h, nom] of [[1000, 800, 'tablette'], [390, 800, 'mobile']]) {
  await page.setViewportSize({ width: l, height: h })
  await page.waitForTimeout(1500)
  const m = await page.evaluate(() => {
    const s = document.querySelector('section[aria-label="Films récemment ajoutés"]')
    const col = s.parentElement
    return { pad: getComputedStyle(col).padding, gapSec: getComputedStyle(col).gap,
      carte: s.children[1].children[0].getBoundingClientRect().width.toFixed(0), gap: getComputedStyle(s.children[1]).gap,
      debordeX: document.documentElement.scrollWidth > document.documentElement.clientWidth }
  })
  console.log(nom, l + 'px', JSON.stringify(m))
  await page.screenshot({ path: `captures/v2-${nom}.png` })
}
await ctx.close()
