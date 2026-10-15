import { chromium } from 'playwright'
const nav = await chromium.launch()
const page = await nav.newPage({ viewport: { width: 1440, height: 900 } })
const erreurs = []
page.on('pageerror', (e) => erreurs.push(`[PAGEERROR] ${e.message.slice(0,150)}`))
page.on('console', (m) => { if (m.type()==='error') erreurs.push(`[console] ${m.text().slice(0,150)}`) })

await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /Réglages/ }).click()
await page.getByRole('button', { name: 'Importer le catalogue' }).click()
await page.waitForFunction(() => /entrées importées/.test(document.body.innerText), null, { timeout: 120000 })
console.log('1. import catalogue : ok')

const ecrans = ['Accueil', 'Direct', 'Films', 'Séries', 'Guide']
for (const e of ecrans) {
  await page.getByRole('button', { name: new RegExp(`^${e}$`) }).first().click()
  await page.waitForTimeout(2500)
  const n = await page.evaluate(() => document.querySelectorAll('main button, aside button').length)
  const titre = await page.evaluate(() => document.querySelector('h1')?.innerText ?? '?')
  console.log(`2. ${e.padEnd(8)} → titre « ${titre} », ${n} éléments interactifs`)
}

// Parcours -> ouvrir une chaine -> lecteur
await page.getByRole('button', { name: /^Direct$/ }).first().click()
await page.waitForTimeout(2000)
const chaines = await page.evaluate(() => document.querySelectorAll('button[title]').length)
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button[title]')].find(x => /HD|UHD|TF1|FR/i.test(x.title))
  b?.click()
})
await page.waitForTimeout(4000)
const lect = await page.evaluate(() => ({
  video: !!document.querySelector('video'),
  zapping: document.querySelectorAll('aside button[title], aside button').length,
  texte: document.querySelector('main')?.innerText?.slice(0,120).replace(/\n/g,' | '),
}))
console.log(`3. Direct → ${chaines} entrées, clic → video=${lect.video}, zapping=${lect.zapping}`)
console.log(`   « ${lect.texte} »`)
await page.screenshot({ path: 'captures/integration.png' })
console.log('\nerreurs:', erreurs.length ? erreurs.slice(0,5).join('\n') : 'aucune')
await nav.close()
