import { chromium } from 'playwright'
const nav = await chromium.connectOverCDP('http://192.168.50.159:9223')
const page = nav.contexts()[0].pages().find(p => p.url().includes('mytv.msocasa.com'))
if (!page) { console.log('aucun onglet'); await nav.close(); process.exit(0) }

const t0 = Date.now()
const t = () => `${((Date.now()-t0)/1000).toFixed(1)}s`
const trace = []
page.on('request', r => {
  const u = r.url()
  if (/\/flux\/(live|sonde)|\/live\/|\.m3u8/.test(u))
    trace.push(`[${t()}] -> ${u.replace(/\/[^/]{12,}\//,'/•••/').slice(-85)}`)
})
page.on('response', r => {
  const u = r.url()
  if (/\/flux\/(live|sonde)|\/live\/|\.m3u8/.test(u)) trace.push(`[${t()}] <- ${r.status()} ${u.slice(-60)}`)
})

// France 24 : la chaine qui echoue chez l'utilisateur.
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button[title]')].find(x => /FRANCE *24/i.test(x.title))
  b?.click()
})
await page.waitForTimeout(25000)
console.log('=== requetes de flux ===')
console.log(trace.length ? trace.join('\n') : '  aucune')
console.log('\n=== etat ===', JSON.stringify(await page.evaluate(() => {
  const v = document.querySelector('video'); const txt = document.body.innerText
  return { video: !!v, paused: v?.paused, err: v?.error?.code ?? null,
           src: (v?.src||'').slice(-45),
           messageErreur: /FORMAT NON LISIBLE/.test(txt), 
           detail: (txt.match(/Pipeline\w*::\w+|fragParsingError/) ?? [''])[0] }
}), null, 1))
await nav.close()
