import { chromium } from 'playwright'
const nav = await chromium.connectOverCDP('http://192.168.50.159:9223')
const ctx = nav.contexts()[0]
const page = ctx.pages().find((p) => p.url().includes('mytv.msocasa.com'))
if (!page) { console.log('aucun onglet sur l application'); await nav.close(); process.exit(0) }

// On ecoute les evenements de l element video : ce sont eux qui disent ce que
// le navigateur subit reellement, independamment de ce que le code en fait.
await page.evaluate(() => {
  window.__ev = []
  const brancher = () => {
    const v = document.querySelector('video')
    if (!v || v.__suivi) return
    v.__suivi = true
    for (const n of ['waiting','stalled','suspend','emptied','error','ended','playing','pause','loadstart','canplay'])
      v.addEventListener(n, () => window.__ev.push({ t: Date.now(), n, rs: v.readyState, ns: v.networkState,
        buf: v.buffered.length ? +(v.buffered.end(v.buffered.length-1) - v.currentTime).toFixed(1) : 0,
        err: v.error ? `${v.error.code}:${v.error.message.slice(0,60)}` : null }))
  }
  brancher(); setInterval(brancher, 1000)
})
console.log('>>> surveillance de 150 s — laisse la chaine tourner <<<\n')
const t0 = Date.now()
await page.waitForTimeout(150000)
const ev = await page.evaluate(() => window.__ev ?? [])
console.log('=== evenements de l element video ===')
if (!ev.length) console.log('  aucun — la video n a pas bouge (ou aucune lecture en cours)')
for (const e of ev.slice(0, 50))
  console.log(`  [${((e.t - t0)/1000).toFixed(1)}s] ${e.n.padEnd(10)} readyState=${e.rs} networkState=${e.ns} avance=${e.buf}s${e.err ? ' · ' + e.err : ''}`)
const etat = await page.evaluate(() => {
  const v = document.querySelector('video')
  const txt = document.body.innerText
  return { video: !!v, paused: v?.paused, rs: v?.readyState, src: (v?.src||'').slice(-40),
           bandeau: /Connexion interrompue/.test(txt), titre: txt.split('\n').find(l=>l.includes('HLS')) ?? '' }
})
console.log('\n=== etat final ===', JSON.stringify(etat))
await nav.close()
