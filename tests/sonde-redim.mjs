import { chromium } from 'playwright'
const PROFIL = '/tmp/claude-0/-root/af0bfe04-324f-47cd-9f6b-faadeffb4ea5/scratchpad/profil-mytv'
const nav = await chromium.launchPersistentContext(PROFIL, { viewport: { width: 1440, height: 900 } })
const page = nav.pages()[0] ?? await nav.newPage()
const j = []
page.on('pageerror', (e) => j.push(e.message.slice(0, 90)))
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle' })
await page.locator('.rail-item', { hasText: 'Films' }).first().click()
await page.waitForTimeout(2500)
const sonde = () => page.evaluate(() => {
  const sec = [...document.querySelectorAll('section')].find((s) => s.querySelector('h1'))
  const r = [...sec.querySelectorAll('div')].filter((d) => /^repeat\(/.test(d.style.gridTemplateColumns || ''))
  const sc = [...sec.querySelectorAll('div')].find((d) => getComputedStyle(d).overflow === 'auto')
  const aff = r[0]?.firstElementChild?.firstElementChild
  return { largeurScroller: sc ? sc.clientWidth : 0, gabarit: r[0]?.style.gridTemplateColumns ?? '(rien)',
    rangeesDOM: r.length, affichesDOM: sec.querySelectorAll('button[title]').length,
    affiche: aff ? `${Math.round(aff.getBoundingClientRect().width)}x${Math.round(aff.getBoundingClientRect().height)}` : '',
    totalPx: [...sec.querySelectorAll('div')].map((d) => d.style.height).find((h) => parseFloat(h) > 1000) }
})
for (const w of [1440, 1100, 1920, 820]) {
  await page.setViewportSize({ width: w, height: 900 })
  await page.waitForTimeout(1600)
  console.log(`viewport ${w} →`, JSON.stringify(await sonde()))
  await page.screenshot({ path: `captures/apres-parcours-films-${w}.png` })
}
console.log('erreurs:', j.join(' | ') || 'aucune')
await nav.close()
