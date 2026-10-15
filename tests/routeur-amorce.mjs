// Amorcage du profil de test : session, catalogue (154 106 entrees) et guide
// EPG (198 596 programmes) sont importes UNE FOIS dans un profil persistant,
// pour que la recette mesure la navigation et non l'import.
import { chromium } from 'playwright'
import { couperLesFlux, connecter } from './garde-flux.mjs'

const PROFIL = process.env.PROFIL
const ctx = await chromium.launchPersistentContext(PROFIL, { viewport: { width: 1440, height: 900 } })
const page = ctx.pages()[0] ?? (await ctx.newPage())
await couperLesFlux(page)
await page.goto('http://localhost:5173/app/', { waitUntil: 'load' })
await page.waitForTimeout(2500)
await connecter(page)

const compte = () => page.evaluate(async () => {
  const db = await new Promise(r => { const q = indexedDB.open('mytv'); q.onsuccess = () => r(q.result) })
  const un = (t) => new Promise(r => { const q = db.transaction(t).objectStore(t).count(); q.onsuccess = () => r(q.result) })
  return { catalogue: await un('catalogue'), programmes: await un('programmes').catch(() => 0) }
})
console.log('avant :', await compte())

if ((await compte()).catalogue === 0) {
  await page.getByRole('button', { name: /^Réglages$/ }).first().click()
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: 'Importer le catalogue' }).click()
  await page.waitForFunction(() => /entrées importées/.test(document.body.innerText), null, { timeout: 480000 })
  console.log('catalogue importe')
}

if ((await compte()).programmes === 0) {
  await page.getByRole('button', { name: /^Guide$/ }).first().click()
  await page.waitForTimeout(2000)
  const bouton = page.getByRole('button', { name: /Charger le guide|Recharger le guide/ })
  if (await bouton.count()) {
    await bouton.first().click()
    await page.waitForFunction(
      () => !/Démarrage|%/.test(document.body.innerText),
      null, { timeout: 600000 },
    ).catch(() => console.log('guide : attente ecoulee'))
  } else {
    console.log('guide : aucun bouton de chargement')
  }
}
console.log('apres :', await compte())
await ctx.close()
