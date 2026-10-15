import { chromium } from 'playwright'
const PROFIL = '/tmp/claude-0/-root/af0bfe04-324f-47cd-9f6b-faadeffb4ea5/scratchpad/profil-mytv'
const nav = await chromium.launchPersistentContext(PROFIL, { viewport: { width: 1440, height: 900 } })
const page = nav.pages()[0] ?? await nav.newPage()
page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message.slice(0, 220)))
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)

// Horloge d'animation : on observe les tâches longues du fil principal
// pendant toute la séquence d'ouverture + filtrage.
await page.evaluate(() => {
  window.__trames = []
  window.__obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__trames.push(+e.duration.toFixed(0)) })
  window.__obs.observe({ entryTypes: ['longtask'] })
})

const t0 = Date.now()
await page.locator('.rail-item', { hasText: 'Films' }).first().click()
await page.waitForFunction(() => /films$/.test([...document.querySelectorAll("h1")].pop()?.nextElementSibling?.textContent || ""), null, { timeout: 30000 })
console.log('ouverture de Films :', Date.now() - t0, 'ms')
console.log('tâches longues au chargement :', JSON.stringify(await page.evaluate(() => window.__trames)))

await page.evaluate(() => { window.__trames.length = 0 })
// Squelette : on le surprend juste après le clic.
await page.getByRole('button', { name: /^Langue/ }).first().click()
await page.waitForTimeout(300)
const [avantClic] = await Promise.all([
  page.evaluate(() => new Promise((r) => setTimeout(() => r(!!document.querySelector('[aria-busy="true"]')), 120))),
  page.getByRole('option', { name: 'Français', exact: true }).first().click(),
])
console.log('squelette visible à t+120 ms :', avantClic)
await page.screenshot({ path: 'captures/v2-squelette.png' })
await page.waitForTimeout(500)
console.log('squelette encore là à t+620 ms :', await page.evaluate(() => !!document.querySelector('[aria-busy="true"]')))
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
console.log('tâches longues pendant le filtrage :', JSON.stringify(await page.evaluate(() => window.__trames)),
  '| tri alphabétique préparé hors interaction :',
  JSON.stringify(await page.evaluate(() => performance.getEntriesByName('mytv:tri-titre').map(m => +m.duration.toFixed(1)))))

// Cinq changements de filtre d'affilée, chacun chronométré séparément.
for (const [bouton, option] of [['Genre', 'Drame'], ['Genre', 'Comédie'], ['Pays', 'France'], ['Année', '2020 – 2024'], ['Service', 'Netflix']]) {
  await page.evaluate(() => { window.__trames.length = 0 })
  await page.getByRole('button', { name: new RegExp('^' + bouton) }).first().click()
  await page.waitForTimeout(250)
  await page.getByRole('option', { name: option, exact: true }).first().click()
  await page.waitForTimeout(600)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  const d = await page.evaluate(() => ({
    longues: window.__trames.slice(),
    filtrage: +performance.getEntriesByName('mytv:filtrage').slice(-1)[0].duration.toFixed(2),
    compte: [...document.querySelectorAll('h1')].pop()?.nextElementSibling?.textContent,
  }))
  console.log(`  ${bouton}=${option} → ${d.compte} | filtrage ${d.filtrage} ms | tâches longues ${JSON.stringify(d.longues)}`)
}
await page.getByRole('button', { name: 'Tout effacer' }).first().click()
await page.waitForTimeout(700)

// Mémoire de défilement par mode d'affichage : on descend dans Films, on passe
// aux Séries, on revient.
const grillePrete = () => page.waitForFunction(
  () => [...document.querySelectorAll('div')].some(d => getComputedStyle(d).overflowY === 'auto' && d.querySelector('button[title]')),
  null, { timeout: 30000 })
const scroll = async (y) => { await grillePrete(); return page.evaluate((y) => {
  const sc = [...document.querySelectorAll('div')].find(d => getComputedStyle(d).overflowY === 'auto' && d.querySelector('button[title]'))
  if (y !== null) sc.scrollTop = y
  return Math.round(sc.scrollTop)
}, y) }
await scroll(5000)
await page.waitForTimeout(400)
console.log('Films défilé à :', await scroll(null))
await page.locator('.rail-item', { hasText: 'Séries' }).first().click()
await page.waitForTimeout(1200)
await scroll(1800)
await page.waitForTimeout(400)
console.log('Séries défilé à :', await scroll(null))
await page.locator('.rail-item', { hasText: 'Films' }).first().click()
await page.waitForTimeout(1200)
console.log('retour Films, position retrouvée :', await scroll(null))
await page.locator('.rail-item', { hasText: 'Séries' }).first().click()
await page.waitForTimeout(1200)
console.log('retour Séries, position retrouvée :', await scroll(null))

// Un changement de filtre doit, lui, tout remonter en haut.
await page.locator('.rail-item', { hasText: 'Films' }).first().click()
await page.waitForTimeout(2000)
await page.getByRole('button', { name: 'Nouveautés' }).first().click()
await page.waitForTimeout(800)
console.log('après changement de filtre, position :', await scroll(null))

// Largeurs : la grille doit changer de nombre de colonnes sans se vider.
for (const w of [1920, 1100, 820]) {
  await page.setViewportSize({ width: w, height: 900 })
  await page.waitForTimeout(900)
  const r = await page.evaluate(() => {
    const rangees = [...document.querySelectorAll('div')].filter(d => /^repeat\(/.test(d.style.gridTemplateColumns || ''))
    return { cols: rangees[0]?.style.gridTemplateColumns, nRangees: rangees.length, nAffiches: document.querySelectorAll('button[title]').length }
  })
  console.log(`largeur ${w} :`, JSON.stringify(r))
  await page.screenshot({ path: `captures/v2-films-${w}.png` })
}
await nav.close()
