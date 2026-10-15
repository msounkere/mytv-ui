import { chromium } from 'playwright'
const DIR = '/tmp/claude-0/-root/af0bfe04-324f-47cd-9f6b-faadeffb4ea5/scratchpad/profil'
const nom = process.argv[2] ?? 'app'
const ctx = await chromium.launchPersistentContext(DIR, { viewport: { width: 1440, height: 900 } })
const page = ctx.pages()[0] ?? await ctx.newPage()
page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message.slice(0, 250)))
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200)) })
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle', timeout: 60000 })
await page.getByRole('button', { name: /^Accueil$/ }).first().click().catch(() => {})
await page.waitForTimeout(9000)
await page.screenshot({ path: `captures/${nom}-0.png` })
const sc = await page.evaluate(() => {
  const e = [...document.querySelectorAll('*')].find(e => e.scrollHeight > e.clientHeight + 40 && e.clientHeight > 300)
  return e ? [e.scrollHeight, e.clientHeight] : null
})
console.log('scroll', sc)
if (sc) for (let i = 1; i <= 3 && i * 800 < sc[0]; i++) {
  await page.evaluate((i) => { [...document.querySelectorAll('*')].find(e => e.scrollHeight > e.clientHeight + 40 && e.clientHeight > 300).scrollTop = i * 800 }, i)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `captures/${nom}-${i}.png` })
}
console.log((await page.evaluate(() => document.body.innerText)).slice(0, 2500))
await ctx.close()
