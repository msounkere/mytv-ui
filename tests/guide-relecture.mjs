// Verification courte : rechargement de page sur une base deja chargee.
import { chromium } from 'playwright'
const ctx = await chromium.launchPersistentContext('/tmp/claude-0/-root/af0bfe04-324f-47cd-9f6b-faadeffb4ea5/scratchpad/profil', { viewport: { width: 1440, height: 900 } })
const page = ctx.pages()[0] ?? (await ctx.newPage())
page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message))
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Guide' }).click()
await page.waitForTimeout(5000)
console.log(JSON.stringify(await page.evaluate(() => {
  const main = document.querySelector('main')
  const sc = [...main.querySelectorAll('div')].find((e) => ['auto','scroll'].includes(getComputedStyle(e).overflowY))
  const lignes = [...main.querySelectorAll('button')].filter((b) => b.title?.includes('ouvrir'))
  const cases = [...main.querySelectorAll('button')].filter((b) => /^\d\d:\d\d – \d\d:\d\d ·/.test(b.title ?? ''))
  const enCours = cases.filter((b) => getComputedStyle(b).zIndex === '1')
  return { entete: main.innerText.split('\n').find((l) => l.includes('affichée')),
    scrollerH: Math.round(sc.getBoundingClientRect().height), scrollHeight: sc.scrollHeight,
    lignesChaines: lignes.length, casesProgrammes: cases.length,
    programmesEnCours: enCours.length, exemple: enCours[0]?.title?.split('\n')[0] }
}), null, 1))
await page.screenshot({ path: 'guide-apres-f5.png' })
await ctx.close()
