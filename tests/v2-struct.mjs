import { chromium } from 'playwright'
const nav = await chromium.launch()
const page = await nav.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://127.0.0.1:8777/Lecteur%20IPTV.dc.html', { waitUntil: 'networkidle', timeout: 90000 })
await page.waitForTimeout(6000)
const out = await page.evaluate(() => {
  const main = document.querySelector('main')
  const lignes = []
  const walk = (el, prof) => {
    if (prof > 5) return
    for (const c of el.children) {
      const r = c.getBoundingClientRect()
      const cs = getComputedStyle(c)
      const txt = (c.innerText || '').replace(/\n/g, ' | ').slice(0, 70)
      lignes.push(`${'  '.repeat(prof)}${c.tagName}${c.className ? '.'+c.className : ''} [${cs.display}] w=${r.width.toFixed(0)} h=${r.height.toFixed(0)} gap=${cs.gap} pad=${cs.padding} :: ${txt}`)
      walk(c, prof + 1)
    }
  }
  walk(main, 0)
  return { nb: main.children.length, lignes: lignes.slice(0, 160), scrollH: main.scrollHeight }
})
console.log(out.scrollH)
console.log(out.lignes.join('\n'))
await nav.close()
