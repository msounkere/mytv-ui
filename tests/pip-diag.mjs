import { chromium } from 'playwright'
const nav = await chromium.connectOverCDP('http://192.168.50.159:9223')
const ctx = nav.contexts()[0]
console.log('=== pages vues par le debogage ===')
for (const p of ctx.pages()) console.log('  ', (p.url()||'').slice(0,70))
const page = ctx.pages().find(p => p.url().includes('mytv.msocasa.com'))
if (!page) { console.log('aucun onglet application'); await nav.close(); process.exit(0) }

const d = await page.evaluate(() => {
  const w = window.documentPictureInPicture?.window
  const v = document.querySelector('video')
  const res = {
    pipOuvert: !!w,
    videoDansPagePrincipale: !!v,
    videoDansPip: null, dimsPip: null, styleCorps: null, nbFeuilles: null,
  }
  if (w) {
    const vp = w.document.querySelector('video')
    res.videoDansPip = !!vp
    if (vp) {
      const r = vp.getBoundingClientRect()
      res.dimsPip = { l: Math.round(r.width), h: Math.round(r.height),
                      paused: vp.paused, rs: vp.readyState,
                      vw: vp.videoWidth, vh: vp.videoHeight }
    }
    res.styleCorps = { bg: w.getComputedStyle(w.document.body).background.slice(0,40),
                       h: w.innerHeight, l: w.innerWidth }
    res.nbFeuilles = w.document.styleSheets.length
    res.htmlCorps = w.document.body.innerHTML.slice(0, 200)
  }
  return res
})
console.log('\n=== etat du PiP ===')
console.log(JSON.stringify(d, null, 1))
await nav.close()
