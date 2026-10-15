import { chromium } from 'playwright'
const nav = await chromium.launch()
const page = await nav.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Réglages' }).click()
await page.getByRole('button', { name: 'Importer le catalogue' }).click()
await page.waitForFunction(() => /entrées importées/.test(document.body.innerText), null, { timeout: 120000 })
await page.getByRole('button', { name: 'Parcours' }).click()
await page.waitForTimeout(1500)

const m = await page.evaluate(() => {
  const aside = document.querySelector('aside')
  const r = (el) => el ? { h: Math.round(el.getBoundingClientRect().height), w: Math.round(el.getBoundingClientRect().width), sh: el.scrollHeight, cls: el.className || '(sans classe)' } : null
  const enfants = aside ? [...aside.children].map(r) : []
  // Le conteneur de defilement de la liste = dernier enfant de l aside
  const scroller = aside?.lastElementChild
  return {
    aside: r(aside),
    enfantsAside: enfants,
    scroller: r(scroller),
    scrollerStyle: scroller ? { overflow: getComputedStyle(scroller).overflow, height: getComputedStyle(scroller).height, display: getComputedStyle(scroller).display } : null,
    interieurScroller: scroller ? [...scroller.children].map(r) : [],
    grilleParent: aside?.parentElement ? getComputedStyle(aside.parentElement).gridTemplateColumns : null,
    asideStyle: aside ? { display: getComputedStyle(aside).display, rows: getComputedStyle(aside).gridTemplateRows, minHeight: getComputedStyle(aside).minHeight } : null,
  }
})
console.log(JSON.stringify(m, null, 1))
await nav.close()
