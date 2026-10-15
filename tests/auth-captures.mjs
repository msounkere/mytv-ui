import { chromium } from 'playwright'

// Captures de recette visuelle de la page de connexion et de l'ecran Reglages.
// Aucun flux n'est ouvert.

const S = '/tmp/claude-0/-root/af0bfe04-324f-47cd-9f6b-faadeffb4ea5/scratchpad'
const ESSAI = 'http://127.0.0.1:8098'
const SORTIE = '/opt/mytv-ui/captures'

async function ouvrir(dir, theme) {
  const ctx = await chromium.launchPersistentContext(dir, {
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
  })
  const page = ctx.pages()[0] ?? (await ctx.newPage())
  await page.route('**/{flux/live,flux/movie,flux/series,live,movie,series}/**', (r) =>
    r.abort())
  await page.route('**/flux/{auth,etat}/**', async (route) => {
    try {
      const req = route.request()
      const u = new URL(req.url())
      const entetes = { ...req.headers() }
      delete entetes.host
      const rep = await ctx.request.fetch(ESSAI + u.pathname + u.search, {
        method: req.method(),
        headers: entetes,
        data: req.postData() ?? undefined,
        maxRedirects: 0,
        failOnStatusCode: false,
      })
      const enTetes = {}
      for (const { name, value } of rep.headersArray())
        enTetes[name] = name.toLowerCase() === 'set-cookie'
          ? value.replace(/;\s*Secure/i, '')
          : value
      await route.fulfill({ status: rep.status(), headers: enTetes, body: await rep.body() })
    } catch {
      await route.abort().catch(() => undefined)
    }
  })
  await page.addInitScript((t) => {
    localStorage.setItem('mytv.config', JSON.stringify({ theme: t }))
    document.documentElement.dataset.theme = t
  }, theme)
  await page.goto('http://localhost:5173/app/', { waitUntil: 'domcontentloaded' })
  return { ctx, page }
}

for (const theme of ['dark', 'light']) {
  const { ctx, page } = await ouvrir(`${S}/cap-${theme}`, theme)
  try {
    await page.waitForSelector('form', { timeout: 20000 })
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${SORTIE}/auth-connexion-${theme}.png` })

    await page.locator('label:has-text("Identifiant") input').fill('sounkere')
    await page.locator('label:has-text("Mot de passe") input').fill('mauvais')
    await page.locator('button[type=submit]').click()
    await page.waitForSelector('[role=alert]', { timeout: 20000 })
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${SORTIE}/auth-refus-${theme}.png` })
    console.log(`captures ${theme} : connexion + refus`)
  } finally {
    await ctx.close()
  }
}

// Reglages, session ouverte.
const { ctx, page } = await ouvrir(`${S}/cap-reglages`, 'dark')
try {
  await page.waitForSelector('form', { timeout: 20000 })
  await page.locator('label:has-text("Identifiant") input').fill('sounkere')
  await page.locator('label:has-text("Mot de passe") input').fill(process.env.MDP)
  await page.locator('button[type=submit]').click()
  await page.waitForSelector('.coque', { timeout: 30000 })
  await page.evaluate(async () => {
    const m = await import('/app/src/etat.ts')
    m.poserEcran('reglages')
  })
  await page.waitForSelector('h1:has-text("Réglages")', { timeout: 20000 })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${SORTIE}/auth-reglages.png` })
  console.log('capture reglages')
} finally {
  await ctx.close()
}
