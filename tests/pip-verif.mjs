import { chromium } from 'playwright'
const nav = await chromium.connectOverCDP('http://192.168.50.159:9223')
const page = nav.contexts()[0].pages().find(p => p.url().includes('mytv.msocasa.com'))
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(2000)
// Relancer une lecture apres le rechargement
await page.getByRole('button', { name: /^Direct$/ }).first().click()
await page.waitForTimeout(2500)
await page.evaluate(() => { const b=[...document.querySelectorAll('button[title]')].find(x=>/FHD|HD/i.test(x.title)); b?.click() })
await page.waitForTimeout(6000)
console.log('lecture :', await page.evaluate(() => { const v=document.querySelector('video'); return v?`${!v.paused} ${v.videoWidth}x${v.videoHeight}`:'aucune' }))
await page.mouse.move(600, 500); await page.waitForTimeout(500); await page.mouse.move(620, 520); await page.waitForTimeout(800)
await page.locator('button[title="Image dans l\'image"]').first().click({ timeout: 8000 })
await page.waitForTimeout(3000)
console.log('=== PiP apres correction ===')
console.log(JSON.stringify(await page.evaluate(() => {
  const w = window.documentPictureInPicture?.window
  if (!w) return { ouvert: false }
  const v = w.document.querySelector('video'); const r = v?.getBoundingClientRect()
  return { ouvert: true, fenetre: `${w.innerWidth}x${w.innerHeight}`,
           video: v ? `${Math.round(r.width)}x${Math.round(r.height)} paused=${v.paused} rs=${v.readyState}` : 'absente' }
}), null, 1))
await nav.close()
