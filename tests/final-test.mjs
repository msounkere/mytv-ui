import { chromium } from 'playwright'
const nav = await chromium.launch()
const page = await nav.newPage({ viewport: { width: 1440, height: 900 } })
const journal = []
page.on('pageerror', (e) => journal.push(`[ERREUR] ${e.message}`))

await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Réglages' }).click()
await page.getByRole('button', { name: 'Importer le catalogue' }).click()
await page.waitForFunction(() => /entrées importées/.test(document.body.innerText), null, { timeout: 120000 })
await page.getByRole('button', { name: 'Parcours' }).click()
await page.waitForTimeout(1200)

await page.getByPlaceholder('Filtrer les catégories').fill('FR')
await page.waitForTimeout(800)
await page.locator('aside button[title]').first().click()
await page.waitForTimeout(1500)
await page.screenshot({ path: 'ecran-parcours.png' })
console.log('capture parcours: ok')

// Virtualisation : combien de lignes montees pour combien d entrees ?
const stats = await page.evaluate(() => ({
  montees: document.querySelectorAll('section button[title]').length,
  total: document.body.innerText.match(/(\d+) entrées en base/)?.[1],
}))
console.log('lignes montees dans le DOM:', stats.montees)

// Ouvrir une chaine -> lecteur
const nom = await page.locator('section button[title]').nth(1).getAttribute('title')
await page.locator('section button[title]').nth(1).click()
await page.waitForTimeout(4000)
const lecteur = await page.evaluate(() => {
  const v = document.querySelector('video')
  const t = document.body.innerText
  return {
    videoPresente: !!v,
    source: v?.currentSrc?.slice(0, 90) ?? v?.src?.slice(0, 90) ?? '(aucune)',
    etatReseau: v?.networkState,
    pret: v?.readyState,
    zapping: document.querySelectorAll('aside button[title]').length,
    erreurVisible: t.includes('Réessayer') ? t.split('\n').filter(l => l.trim()).slice(-8).join(' | ') : null,
    titreAffiche: t.split('\n').find(l => l.includes('–')) ?? null,
  }
})
console.log('chaine ouverte:', JSON.stringify(nom))
console.log('lecteur:', JSON.stringify(lecteur, null, 1))
await page.screenshot({ path: 'ecran-lecture.png' })
console.log('\njournal:', journal.length ? journal.join('\n') : 'aucune erreur')
await nav.close()
