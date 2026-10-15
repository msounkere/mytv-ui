// Fumee : l'application demarre-t-elle, et chaque ecran porte-t-il encore son
// contenu ? Rien de chiffre ici -- c'est le filet avant la recette.
import { chromium } from 'playwright'
import { couperLesFlux, connecter } from './garde-flux.mjs'

const ctx = await chromium.launchPersistentContext(process.env.PROFIL, {
  viewport: { width: 1440, height: 900 },
})
const page = ctx.pages()[0] ?? (await ctx.newPage())
const erreurs = []
page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 300)) })
page.on('pageerror', (e) => erreurs.push(`pageerror: ${String(e).slice(0, 300)}`))
// Un 404 de logo n'est pas une regression : on nomme la ressource plutot que
// de compter des lignes muettes.
page.on('response', (r) => { if (r.status() >= 400) erreurs.push(`${r.status()} ${new URL(r.url()).pathname.slice(0, 120)}`) })
await couperLesFlux(page)

await page.goto('http://localhost:5173/app/', { waitUntil: 'load' })
await page.waitForSelector('nav[aria-label="Navigation principale"]', { timeout: 30000 })
await connecter(page)
await page.waitForTimeout(4000)

const texte = () => page.evaluate(() => document.querySelector('main')?.innerText ?? '')

async function ecran(nom, attendu) {
  await page.getByRole('button', { name: new RegExp(`^${nom}$`) }).first().click()
  await page.waitForTimeout(4500)
  const t = await texte()
  const ok = attendu.every((a) => new RegExp(a, 'i').test(t))
  console.log(`  ${ok ? 'OK  ' : 'ECHEC'} ${nom.padEnd(8)} ${ok ? '' : `attendu ${JSON.stringify(attendu)} ; vu : ${t.slice(0, 220).replace(/\n/g, ' | ')}`}`)
  return ok
}

console.log('=== ecrans ===')
let tout = true
tout &&= await ecran('Accueil', ['À la une|Continuer à regarder|Films récemment'])
tout &&= await ecran('Direct', ['catégories', 'chaîne'])
tout &&= await ecran('Films', ['films?'])
tout &&= await ecran('Séries', ['séries?'])
tout &&= await ecran('Guide', ['chaîne\\(s\\) affichée'])
tout &&= await ecran('Films', ['films?'])

console.log(`\n=== erreurs console (${erreurs.length}) ===`)
for (const e of erreurs.slice(0, 12)) console.log(`  ${e}`)

console.log(`\n${tout && erreurs.length === 0 ? 'FUMEE OK' : 'FUMEE A REGARDER'}`)
await ctx.close()
