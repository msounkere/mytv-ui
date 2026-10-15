import { chromium } from 'playwright'
const nav = await chromium.connectOverCDP('http://192.168.50.159:9223')
const ctx = nav.contexts()[0]
const page = ctx.pages().find(p => p.url().includes('mytv.msocasa.com'))
if (!page) { console.log('aucun onglet'); await nav.close(); process.exit(0) }

// Une lecture doit tourner : le PiP sans video n'a rien a montrer.
let v = await page.evaluate(() => !!document.querySelector('video'))
if (!v) {
  await page.getByRole('button', { name: /^Direct$/ }).first().click()
  await page.waitForTimeout(2500)
  await page.evaluate(() => { const b=[...document.querySelectorAll('button[title]')].find(x=>/FHD|HD/i.test(x.title)); b?.click() })
  await page.waitForTimeout(6000)
}
console.log('lecture en cours :', await page.evaluate(() => {
  const v=document.querySelector('video'); return v ? `${!v.paused} rs=${v.readyState} ${v.videoWidth}x${v.videoHeight}` : 'aucune'
}))

// Document PiP exige un geste reel : le clic Playwright en est un.
// Les commandes se masquent apres 3,2 s : on bouge la souris pour les reveiller.
await page.mouse.move(600, 500)
await page.waitForTimeout(600)
await page.mouse.move(620, 520)
await page.waitForTimeout(900)
const b = page.locator('button[title="Image dans l\'image"]').first()
console.log('bouton visible :', await b.isVisible().catch(() => false))
await b.click({ timeout: 8000 }).catch(e => console.log('clic PiP impossible :', e.message.slice(0,90)))
await page.waitForTimeout(3500)

const d = await page.evaluate(() => {
  const w = window.documentPictureInPicture?.window
  if (!w) return { pipOuvert: false }
  const vp = w.document.querySelector('video')
  const r = vp?.getBoundingClientRect()
  return {
    pipOuvert: true,
    fenetre: { l: w.innerWidth, h: w.innerHeight },
    feuilles: w.document.styleSheets.length,
    videoPresente: !!vp,
    video: vp ? { l: Math.round(r.width), h: Math.round(r.height), paused: vp.paused,
                  rs: vp.readyState, dims: `${vp.videoWidth}x${vp.videoHeight}`,
                  style: vp.getAttribute('style')?.slice(0,80) } : null,
    corpsDebut: w.document.body.innerHTML.slice(0, 180),
    enfantsCorps: w.document.body.children.length,
  }
})
console.log('\n=== etat du PiP ===')
console.log(JSON.stringify(d, null, 1))
await nav.close()
