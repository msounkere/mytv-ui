// Le favori pose depuis Films doit apparaitre sur l'Accueil sans remontage.
import { chromium } from 'playwright'
import { couperLesFlux, connecter } from './garde-flux.mjs'
const ctx = await chromium.launchPersistentContext(process.env.PROFIL, { viewport: { width: 1440, height: 900 } })
const page = ctx.pages()[0] ?? (await ctx.newPage())
await couperLesFlux(page)
await page.goto('http://localhost:5173/app/films', { waitUntil: 'load' })
await connecter(page)
await page.waitForTimeout(3000)

const pose = await page.evaluate(async () => {
  const p = await import('/app/src/lib/preferences.ts')
  const { db } = await import('/app/src/lib/db.ts')
  const f = await db.catalogue.where('type').equals('vod').first()
  const deja = await p.estFavori(f.cle)
  if (deja) await p.basculerFavori(f.cle)
  await p.basculerFavori(f.cle)
  return { cle: f.cle, nom: f.nom }
})
console.log('favori pose :', pose.nom.slice(0, 40))
await page.waitForTimeout(2000)
await page.getByRole('button', { name: /^Accueil$/ }).first().click()
await page.waitForTimeout(4000)
const vu = await page.evaluate((n) => {
  const t = document.querySelector('main')?.innerText ?? ''
  return { present: t.includes(n.slice(0, 18)),
           rangees: [...document.querySelectorAll('main h2')].map(h => h.innerText.trim()) }
}, pose.nom)
console.log('present sur l Accueil :', vu.present)
console.log('rangees :', JSON.stringify(vu.rangees))
await ctx.close()
