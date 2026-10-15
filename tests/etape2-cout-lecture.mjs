// Combien coute UNE lecture des tables que plusieurs ecrans partagent ? C'est
// ce chiffre, multiplie par le nombre de lecteurs, que le cache economise a la
// premiere visite.
import { chromium } from 'playwright'
import { couperLesFlux, connecter } from './garde-flux.mjs'

const ctx = await chromium.launchPersistentContext(process.env.PROFIL, { viewport: { width: 1440, height: 900 } })
const page = ctx.pages()[0] ?? (await ctx.newPage())
await couperLesFlux(page)
await page.goto('http://localhost:5173/app/', { waitUntil: 'load' })
await page.waitForSelector('nav[aria-label="Navigation principale"]', { timeout: 30000 })
await connecter(page)
await page.waitForTimeout(3000)

console.log(await page.evaluate(async () => {
  const { dbEpg } = await import('/app/src/lib/epg.ts')
  const { db } = await import('/app/src/lib/db.ts')
  const mesurer = async (nom, f) => {
    const essais = []
    for (let i = 0; i < 5; i++) { const t = performance.now(); const r = await f(); essais.push(performance.now() - t); var n = r.length }
    return `${nom} : ${n} lignes en ${Math.round(Math.min(...essais))}–${Math.round(Math.max(...essais))} ms`
  }
  return [
    await mesurer('epg.chaines (jointure XMLTV)', () => dbEpg.chaines.toArray()),
    await mesurer('categories live', () => db.categories.where('type').equals('live').toArray()),
    await mesurer('categories vod', () => db.categories.where('type').equals('vod').toArray()),
    await mesurer('catalogue vod (entree de l index)', () => db.catalogue.where('type').equals('vod').toArray()),
    await mesurer('catalogue series (entree de l index)', () => db.catalogue.where('type').equals('series').toArray()),
    // Le chargeur COMPLET de l'index : c'est exactement ce que chaque bascule
    // Films <-> Series relancait avant l'etape 2.
    await (async () => {
      const f = await import('/app/src/lib/facettes.ts')
      const essais = []
      for (let i = 0; i < 3; i++) {
        const t = performance.now()
        const [entrees, cats] = await Promise.all([
          db.catalogue.where('type').equals('vod').toArray(),
          db.categories.where('type').equals('vod').toArray(),
        ])
        const idx = f.construireIndex(entrees, cats)
        f.preparerTriTitre(idx)
        essais.push(performance.now() - t)
      }
      return `chargeur complet de l index Films : ${Math.round(Math.min(...essais))}–${Math.round(Math.max(...essais))} ms`
    })(),
  ].join('\n  ')
}))
await ctx.close()
