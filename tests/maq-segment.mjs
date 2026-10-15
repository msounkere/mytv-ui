import { chromium } from 'playwright'
const nav = await chromium.launch()
const page = await nav.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://127.0.0.1:8777/Lecteur%20IPTV.dc.html', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(2500)
await page.getByRole('button', { name: /^Direct$/ }).first().click()
await page.waitForTimeout(1500)
await page.screenshot({ path: 'captures/maq-direct.png' })
const r = await page.evaluate(() => {
  const g = (e) => { const c = getComputedStyle(e), r = e.getBoundingClientRect()
    return { t: (e.innerText||'').replace(/\n/g,'|').trim().slice(0,30), box:`${Math.round(r.width)}x${Math.round(r.height)}`,
      h: c.height, pad: c.padding, gap: c.gap, br: c.borderRadius, bd: c.border, bg: c.backgroundColor, col: c.color, fs: c.fontSize, fw: c.fontWeight } }
  const b = [...document.querySelectorAll('[role="button"]')].find(x => /Liste/.test(x.innerText))
  if (!b) return { non: [...document.querySelectorAll('[role="button"]')].map(x=>x.innerText.trim().slice(0,20)).slice(0,40) }
  const grp = b.parentElement
  return { groupe: g(grp), items: [...grp.children].map(g) }
})
console.log(JSON.stringify(r, null, 1))
await nav.close()
