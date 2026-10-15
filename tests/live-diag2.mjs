import { chromium } from 'playwright'
const nav = await chromium.connectOverCDP('http://192.168.50.159:9223')
const ctx = nav.contexts()[0]
// On reprend l'onglet deja ouvert sur l'application plutot que d'en creer un.
const pages = ctx.pages()
const page = pages.find((p) => p.url().includes('mytv.msocasa.com')) ?? (await ctx.newPage())
if (!page.url().includes('mytv.msocasa.com'))
  await page.goto('https://mytv.msocasa.com/app/', { waitUntil: 'domcontentloaded' })
console.log('onglet suivi :', page.url())

const debut = Date.now()
const t = () => `${((Date.now() - debut) / 1000).toFixed(1)}s`
const erreurs = []
page.on('response', (r) => {
  if (r.status() >= 400) erreurs.push(`[${t()}] HTTP ${r.status()} ${r.url().replace(/\/[^/]{20,}\//, '/•••/').slice(0, 110)}`)
})
page.on('requestfailed', (r) => erreurs.push(`[${t()}] ECHEC ${r.url().slice(0, 100)} — ${r.failure()?.errorText}`))

console.log('>>> lance ou laisse tourner une chaine. 150 s d observation. <<<\n')
await page.waitForTimeout(150000)
console.log('=== reponses en erreur ===')
console.log(erreurs.length ? erreurs.slice(0, 40).join('\n') : '  aucune')
await nav.close()
