import { chromium } from 'playwright'
const PROFIL = '/tmp/claude-0/-root/af0bfe04-324f-47cd-9f6b-faadeffb4ea5/scratchpad/profil'
const ctx = await chromium.launchPersistentContext(PROFIL, { viewport: { width: 1440, height: 900 } })
const page = ctx.pages()[0] ?? (await ctx.newPage())
page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message))

const mesurer = () => page.evaluate(() => {
  const main = document.querySelector('main')
  const scrollers = [...main.querySelectorAll('div')].filter((e) => ['auto','scroll'].includes(getComputedStyle(e).overflowY))
  const sc = scrollers[0]
  const lignes = [...main.querySelectorAll('button')].filter((b) => b.title?.includes('ouvrir'))
  const cases = [...main.querySelectorAll('button')].filter((b) => /^\d\d:\d\d – \d\d:\d\d ·/.test(b.title ?? ''))
  // Programme en cours = case surlignee par le liseré accentué
  const enCours = cases.filter((b) => getComputedStyle(b).boxShadow !== 'none')
  return {
    entete: main.innerText.split('\n').find((l) => l.includes('affichée') || l.includes('interrompu')) ?? main.innerText.slice(0,120),
    scrollerH: sc ? Math.round(sc.getBoundingClientRect().height) : null,
    scrollHeight: sc ? sc.scrollHeight : null,
    lignesChaines: lignes.length,
    casesProgrammes: cases.length,
    programmesEnCours: enCours.length,
    exempleEnCours: enCours[0]?.title?.slice(0, 70) ?? null,
    exempleLigne: lignes[0]?.title ?? null,
  }
})

await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Réglages' }).click()
await page.getByRole('button', { name: 'Importer le catalogue' }).click()
await page.waitForFunction(() => /entrées importées/.test(document.body.innerText), null, { timeout: 300000 })
await page.getByRole('button', { name: 'Guide' }).click()
await page.waitForTimeout(1200)

console.log('=== A) base vide ==='); console.log(JSON.stringify(await mesurer()))

// --- Interruption volontaire : F5 au milieu de l import (le piege du test3) ---
await page.getByRole('button', { name: 'Charger le guide' }).first().click()
await page.waitForFunction(() => /\d[\d  ]* programmes/.test(document.querySelector('main')?.innerText ?? ''), null, { timeout: 420000 })
await page.reload({ waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Guide' }).click()
await page.waitForTimeout(4000)
console.log('=== B) import interrompu par F5 ==='); console.log(JSON.stringify(await mesurer()))
await page.screenshot({ path: 'guide-interrompu.png' })

// --- Import complet ---
await page.getByRole('button', { name: /Reprendre le chargement|Charger le guide/ }).first().click()
await page.getByRole('button', { name: 'Recharger le guide' }).waitFor({ timeout: 600000 })
await page.waitForTimeout(2500)
console.log('=== C) import complet ==='); console.log(JSON.stringify(await mesurer()))

// --- F5 : le critere de reussite ---
await page.reload({ waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Guide' }).click()
await page.waitForTimeout(5000)
console.log('=== D) APRES RECHARGEMENT ==='); console.log(JSON.stringify(await mesurer(), null, 1))
await page.screenshot({ path: 'guide-apres-f5.png' })
await ctx.close()
