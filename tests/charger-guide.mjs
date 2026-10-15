import { chromium } from 'playwright'
import { couperLesFlux, connecter } from './garde-flux.mjs'
const ctx = await chromium.launchPersistentContext(process.env.PROFIL, { viewport: { width: 1440, height: 900 } })
const page = ctx.pages()[0] ?? (await ctx.newPage())
await couperLesFlux(page)
await page.goto('http://localhost:5173/app/guide', { waitUntil: 'load' })
await connecter(page)
await page.waitForTimeout(3000)
const boutons = await page.evaluate(() =>
  [...document.querySelectorAll('main button')].map(b => (b.innerText||'').trim()).filter(Boolean))
console.log('boutons du Guide :', JSON.stringify(boutons.slice(0, 8)))
const cible = boutons.find(b => /guide|chargement/i.test(b))
if (cible) {
  await page.getByRole('button', { name: cible }).first().click()
  console.log('clic sur :', cible)
  await page.waitForFunction(async () => {
    try {
      const db = await new Promise((r,j)=>{const q=indexedDB.open('mytv-epg');q.onsuccess=()=>r(q.result);q.onerror=()=>j()})
      if (![...db.objectStoreNames].includes('chaines')) return false
      return await new Promise(r=>{const q=db.transaction('chaines').objectStore('chaines').count();q.onsuccess=()=>r(q.result>0)})
    } catch { return false }
  }, null, { timeout: 480000, polling: 3000 })
  console.log('guide complet')
}
console.log(await page.evaluate(() => (document.querySelector('main')?.innerText ?? '').split('\n').find(l=>/chaîne\(s\)/.test(l))))
await ctx.close()
