import { chromium } from 'playwright'
const DIR = '/tmp/claude-0/-root/af0bfe04-324f-47cd-9f6b-faadeffb4ea5/scratchpad/profil-rech'
const ctx = await chromium.launchPersistentContext(DIR, { viewport: { width: 1440, height: 900 } })
const page = ctx.pages()[0] ?? await ctx.newPage()
page.on('pageerror', (e) => console.log('[ERR]', e.message.slice(0, 300)))
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(1200)
await page.evaluate(async () => {
  const web = await import('/app/node_modules/.vite/deps/solid-js_web.js?v=77c0403e')
  const { default: Panneau } = await import('/app/src/components/PanneauSuggestions.tsx')
  window.__longues = []
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__longues.push(Math.round(e.duration)) }).observe({ entryTypes: ['longtask'] })
  const hote = document.createElement('div'); document.body.appendChild(hote)
  web.render(() => web.createComponent(Panneau, { surOuvrir: () => {},
    surVoirTout: () => document.querySelector('.entete-recherche form, form.entete-recherche').requestSubmit() }), hote)
})
// La touche « / » depuis chaque ecran portant le champ
for (const [nom, bouton] of [['Direct', /Direct/], ['Films', /^Films$/], ['Guide', /Guide/], ['Réglages', /Réglages/]]) {
  await page.getByRole('button', { name: bouton }).first().click()
  await page.waitForTimeout(700)
  await page.keyboard.press('/')
  await page.waitForTimeout(350)
  const ouvert = await page.evaluate(() => !!document.querySelector('[role="listbox"][aria-label="Suggestions de recherche"]'))
  const focus = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))
  console.log(`« / » sur ${nom} — panneau:${ouvert} focus:${focus}`)
  await page.keyboard.press('Escape'); await page.waitForTimeout(200)
}
// Capture finale : panneau peuplé sur Direct
await page.getByRole('button', { name: /Direct/ }).first().click(); await page.waitForTimeout(700)
await page.keyboard.press('/'); await page.waitForTimeout(250)
await page.locator('.entete-recherche input').type('france', { delay: 70 })
await page.waitForTimeout(900)
await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown')
await page.waitForTimeout(250)
await page.screenshot({ path: 'captures/v3-final-panneau.png' })
// Page de resultats via « voir tout »
await page.locator('[role="listbox"] [role="option"]').last().click()
await page.waitForTimeout(1500)
await page.screenshot({ path: 'captures/v3-final-page.png' })
console.log('ecran resultats :', await page.evaluate(() => document.querySelector('main h1')?.innerText))
console.log('taches longues totales :', JSON.stringify(await page.evaluate(() => window.__longues)))
await ctx.close()
