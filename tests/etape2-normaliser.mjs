// Remise du profil de mesure dans l'etat ou il etait au releve « avant » :
// les recettes y ont laisse deux favoris, une epingle et deux categories
// masquees, et chacun de ces trois ajoute des noeuds a peindre. Sans cela, la
// comparaison avant/apres mesurerait aussi le contenu du profil.
import { chromium } from 'playwright'
import { couperLesFlux, connecter } from './garde-flux.mjs'

const CIBLE = Number(process.env.FAVORIS ?? 26)
const ctx = await chromium.launchPersistentContext(process.env.PROFIL, {
  viewport: { width: 1440, height: 900 },
})
const page = ctx.pages()[0] ?? (await ctx.newPage())
await couperLesFlux(page)
await page.goto('http://localhost:5173/app/', { waitUntil: 'load' })
await page.waitForSelector('nav[aria-label="Navigation principale"]', { timeout: 30000 })
await connecter(page)
await page.waitForTimeout(3000)

console.log(await page.evaluate(async (cible) => {
  const { db } = await import('/app/src/lib/db.ts')
  const avant = {
    favoris: await db.favoris.count(),
    epingles: (await db.reglages.get('epingles.live'))?.valeur ?? [],
    masquees: await db.categories.where('[type+masquee]').equals(['live', 1]).count(),
  }
  // Les plus recemment ajoutes d'abord : ce sont ceux que les recettes ont pose.
  const trop = (await db.favoris.orderBy('ajouteLe').reverse().toArray()).slice(0, Math.max(0, avant.favoris - cible))
  for (const f of trop) await db.favoris.delete(f.cle)
  await db.reglages.delete('epingles.live')
  for (const c of await db.categories.where('[type+masquee]').equals(['live', 1]).toArray())
    await db.categories.update(c.cle, { masquee: 0 })
  // Le journal de synchronisation est vide : ces retraits sont une remise en
  // etat du banc de mesure, ils n'ont rien a dire a l'autre machine.
  await db.journal.clear()
  return {
    avant,
    apres: {
      favoris: await db.favoris.count(),
      epingles: (await db.reglages.get('epingles.live'))?.valeur ?? [],
      masquees: await db.categories.where('[type+masquee]').equals(['live', 1]).count(),
    },
  }
}, CIBLE))
await ctx.close()
