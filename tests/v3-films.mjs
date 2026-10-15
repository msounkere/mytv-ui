import { chromium } from 'playwright'
const PROFIL = '/tmp/claude-0/-root/af0bfe04-324f-47cd-9f6b-faadeffb4ea5/scratchpad/profil-mytv'
const nav = await chromium.launchPersistentContext(PROFIL, { viewport: { width: 1440, height: 900 } })
const page = nav.pages()[0] ?? await nav.newPage()
const journal = []
page.on('pageerror', (e) => journal.push('[PAGEERROR] ' + e.message.slice(0, 220)))
page.on('console', (m) => { if (m.type() === 'error') journal.push('[err] ' + m.text().slice(0, 200)) })
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await page.evaluate(() => { window.__tl = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__tl.push(+e.duration.toFixed(0)) }).observe({ entryTypes: ['longtask'] }) })
await page.locator('.rail-item', { hasText: 'Films' }).first().click()
await page.waitForFunction(() => /films$/.test([...document.querySelectorAll('h1')].pop()?.nextElementSibling?.textContent || ''), null, { timeout: 40000 })
await page.waitForTimeout(1500)
await page.screenshot({ path: 'captures/v3-films.png' })

const sonde = () => page.evaluate(() => {
  const h1 = [...document.querySelectorAll('h1')].pop()
  const zone = [...document.querySelectorAll('div')].find(d => getComputedStyle(d).overflowY === 'auto' && d.querySelector('button[title]'))
  const rangees = [...document.querySelectorAll('div')].filter(d => /^repeat\(/.test(d.style.gridTemplateColumns||''))
  const cartes = zone ? [...zone.querySelectorAll('button[title]')] : []
  return { compte: h1?.nextElementSibling?.textContent, rangeesDOM: rangees.length, affichesDOM: cartes.length,
    hauteurTotale: zone?.firstElementChild?.style.height,
    tete: cartes.slice(0, 3).map(b => b.innerText.replace(/\n/g, ' · ').replace('play_arrow · ', '').slice(0, 78)) }
})
console.log('DÉFAUT (Date d’ajout) :', JSON.stringify(await sonde(), null, 1))

for (const tri of ['Titre (A–Z)', 'Année', 'Popularité']) {
  await page.getByRole('radio', { name: tri }).click()
  await page.waitForTimeout(900)
  const d = await sonde()
  const ms = await page.evaluate(() => +performance.getEntriesByName('mytv:filtrage').slice(-1)[0].duration.toFixed(2))
  console.log(`TRI ${tri} → ${ms} ms |`, JSON.stringify(d.tete))
}
await page.getByRole('radio', { name: "Date d'ajout" }).click().catch(() => page.getByRole('radio', { name: /ajout/ }).click())
await page.waitForTimeout(800)

// Bascule Nouveautés, maintenant fondée sur une fenêtre de 30 jours
await page.evaluate(() => { window.__tl.length = 0 })
await page.getByRole('button', { name: 'Nouveautés' }).first().click()
await page.waitForTimeout(900)
console.log('NOUVEAUTÉS :', JSON.stringify(await sonde(), null, 1))
await page.screenshot({ path: 'captures/v3-films-nouveautes.png' })
console.log('  filtrage :', await page.evaluate(() => +performance.getEntriesByName('mytv:filtrage').slice(-1)[0].duration.toFixed(2)), 'ms | tâches longues', JSON.stringify(await page.evaluate(() => window.__tl)))

await page.getByRole('button', { name: 'Tout effacer' }).first().click()
await page.waitForTimeout(800)
await page.locator('.rail-item', { hasText: 'Séries' }).first().click()
await page.waitForFunction(() => /séries$/.test([...document.querySelectorAll('h1')].pop()?.nextElementSibling?.textContent || ''), null, { timeout: 40000 })
await page.waitForTimeout(1500)
await page.screenshot({ path: 'captures/v3-series.png' })
console.log('SÉRIES :', JSON.stringify(await sonde(), null, 1))
await page.locator('.rail-item', { hasText: 'Accueil' }).first().click()
await page.waitForTimeout(2500)
await page.screenshot({ path: 'captures/v3-accueil.png' })
console.log('\nJOURNAL:', journal.length ? journal.join('\n') : 'aucune erreur')
await nav.close()
