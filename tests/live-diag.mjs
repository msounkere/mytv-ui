import { chromium } from 'playwright'

// On se branche sur le Chrome de l'utilisateur : lui seul possede les codecs
// H.264 et reproduit donc la coupure. On observe sans rien corriger.
const nav = await chromium.connectOverCDP('http://192.168.50.159:9223')
const ctx = nav.contexts()[0]
const page = await ctx.newPage()

const journal = []
const marque = (t) => `${((Date.now() - debut) / 1000).toFixed(1)}s`
let debut = Date.now()

page.on('console', (m) => {
  const t = m.text()
  if (/hls|error|warn|fail|stall|buffer|level|frag/i.test(t)) journal.push(`[${marque()}][${m.type()}] ${t.slice(0, 180)}`)
})
page.on('pageerror', (e) => journal.push(`[${marque()}][PAGEERROR] ${e.message.slice(0, 180)}`))
page.on('requestfailed', (r) => journal.push(`[${marque()}][ECHEC] ${r.url().slice(-60)} — ${r.failure()?.errorText}`))
page.on('response', (r) => {
  const u = r.url()
  if (r.status() >= 400 && /\.m3u8|\.ts|player_api|\/flux\//.test(u))
    journal.push(`[${marque()}][HTTP ${r.status()}] ${u.slice(-70)}`)
})

await page.goto('https://mytv.msocasa.com/app/', { waitUntil: 'networkidle', timeout: 60000 })
console.log('page ouverte :', await page.title())

// Instrumentation de hls.js : on capture TOUS ses evenements d'erreur, y
// compris les non fatals que l'interface ignore aujourd'hui.
await page.addInitScript(() => {
  window.__diag = []
})
const config = await page.evaluate(() => {
  const l = localStorage.getItem('mytv.config')
  return l ? JSON.parse(l) : null
})
console.log('config presente :', !!config, config ? `(${config.username})` : '')
console.log('\n>>> Ouvre une chaine dans ce Chrome. J observe 180 s. <<<\n')

await page.waitForTimeout(180000)
console.log('=== journal ===')
console.log(journal.length ? journal.slice(-60).join('\n') : '  (rien capte)')
await page.close()
await nav.close()
