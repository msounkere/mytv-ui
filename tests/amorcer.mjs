// Prepare un profil de recette : connexion, import du catalogue et du guide.
// Aucun flux n'est ouvert — seules l'API et le XMLTV sont appeles.
import { chromium } from 'playwright'
import { couperLesFlux, connecter } from './garde-flux.mjs'

const ctx = await chromium.launchPersistentContext(process.env.PROFIL, {
  viewport: { width: 1440, height: 900 },
})
const page = ctx.pages()[0] ?? (await ctx.newPage())
await couperLesFlux(page)
await page.goto('http://localhost:5173/app/', { waitUntil: 'load' })
await connecter(page)
await page.waitForTimeout(2000)

const compte = async () =>
  page.evaluate(async () => {
    const db = await new Promise((r) => { const q = indexedDB.open('mytv'); q.onsuccess = () => r(q.result) })
    return new Promise((r) => { const q = db.transaction('catalogue').objectStore('catalogue').count(); q.onsuccess = () => r(q.result) })
  })

if ((await compte()) === 0) {
  await page.getByRole('button', { name: /Réglages/ }).first().click()
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: 'Importer le catalogue' }).click()
  await page.waitForFunction(() => /entrées importées/.test(document.body.innerText), null, { timeout: 300000 })
  console.log('catalogue importe :', await compte())
} else console.log('catalogue deja present :', await compte())

await page.getByRole('button', { name: /^Guide$/ }).first().click()
await page.waitForTimeout(2500)
const bouton = page.getByRole('button', { name: /charger le guide/i }).first()
if (await bouton.isVisible().catch(() => false)) {
  await bouton.click()
  // Le texte de progression contient deja « programmes » : on attend la BASE,
  // c'est-a-dire la table des chaines, ecrite seulement a la toute fin.
  await page.waitForFunction(async () => {
    try {
      const db = await new Promise((r, j) => { const q = indexedDB.open('mytv-epg'); q.onsuccess = () => r(q.result); q.onerror = () => j() })
      if (![...db.objectStoreNames].includes('chaines')) return false
      return await new Promise((r) => { const q = db.transaction('chaines').objectStore('chaines').count(); q.onsuccess = () => r(q.result > 0) })
    } catch { return false }
  }, null, { timeout: 480000, polling: 3000 })
  console.log('guide charge')
}
await ctx.close()
