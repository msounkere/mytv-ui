import { chromium } from 'playwright'
// Les affiches s'affichent-elles vraiment par la route relayee ? On compte les
// reponses et on regarde l'ecran. AUCUN FLUX.
const nav = await chromium.launchPersistentContext('/tmp/claude-0/-root/af0bfe04-324f-47cd-9f6b-faadeffb4ea5/scratchpad/profil-recette', { viewport: { width: 1400, height: 900 } })
const page = nav.pages()[0] ?? (await nav.newPage())
for (const motif of [
  /^https?:\/\/[^/]+\/(live|movie|series)\//,
  /^https?:\/\/[^/]+\/flux\/(live|movie|series|seg|hls)\//,
])
  await page.route(motif, (r) => r.abort())
const images = { relayees: 0, echecs: 0, directes: 0 }
const erreurs = []
page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 140)) })
page.on('response', (r) => {
  const u = r.url()
  if (u.includes('/flux/relais/resource/')) { if (r.status() === 200) images.relayees++; else images.echecs++ }
  else if (/mytv\.msocasa\.com.*\/resource\//.test(u) || /:8901\/resource\//.test(u)) images.directes++
})
try {
  await page.goto('http://localhost:5173/app/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  if (await page.locator('button[type=submit]').count()) {
    await page.locator('label:has-text("Identifiant") input').fill(process.env.MYTV_ID)
    await page.locator('label:has-text("Mot de passe") input').fill(process.env.MYTV_MDP)
    await page.locator('button[type=submit]').click()
  }
  await page.waitForSelector('.coque', { timeout: 40000 })
  await page.waitForTimeout(6000)
  const rendu = await page.evaluate(() =>
    [...document.querySelectorAll('img')].reduce(
      (a, i) => ({
        total: a.total + 1,
        chargees: a.chargees + (i.naturalWidth > 0 ? 1 : 0),
        relayees: a.relayees + (i.currentSrc.includes('/flux/relais/resource/') ? 1 : 0),
      }),
      { total: 0, chargees: 0, relayees: 0 },
    ),
  )
  console.log('reponses :', JSON.stringify(images))
  console.log('balises img :', JSON.stringify(rendu))
  console.log('erreurs console :', erreurs.length, erreurs.slice(0, 3).join(' | '))
  await page.screenshot({ path: '/opt/mytv-ui/captures/relais-accueil.png' })
  await page.locator('button.rail-item', { has: page.locator('.rail-libelle', { hasText: /^Films$/ }) }).first().click()
  await page.waitForTimeout(5000)
  await page.screenshot({ path: '/opt/mytv-ui/captures/relais-films.png' })
  console.log('reponses apres Films :', JSON.stringify(images))
} finally { await nav.close() }
