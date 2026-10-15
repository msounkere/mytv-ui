import { chromium } from 'playwright'
const nav = await chromium.launch()
const page = await nav.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Réglages' }).click()
await page.getByRole('button', { name: 'Importer le catalogue' }).click()
await page.waitForFunction(() => /entrées importées/.test(document.body.innerText), null, { timeout: 120000 })
await page.getByRole('button', { name: 'Parcours' }).click()
await page.waitForTimeout(2500)

const m = await page.evaluate(() => {
  const cible = document.querySelector('[data-diag]')          // div interieur
  const chaine = []
  let el = cible
  while (el && el !== document.documentElement) {
    const cs = getComputedStyle(el)
    chaine.push({
      tag: el.tagName.toLowerCase() + (el.id ? '#' + el.id : ''),
      hRect: Math.round(el.getBoundingClientRect().height),
      clientH: el.clientHeight,
      display: cs.display,
      rows: cs.gridTemplateRows !== 'none' ? cs.gridTemplateRows : undefined,
      height: cs.height,
      minH: cs.minHeight,
      overflow: cs.overflow,
    })
    el = el.parentElement
  }
  return chaine
})
console.log('--- chaine de hauteurs, de l interieur vers la racine ---')
m.forEach((x, i) => console.log(` ${i}`, JSON.stringify(x)))
await nav.close()
