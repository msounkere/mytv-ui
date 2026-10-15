import { chromium } from 'playwright'
const nav = await chromium.connectOverCDP('http://192.168.50.159:9223')
const page = nav.contexts()[0].pages().find(p => p.url().includes('mytv.msocasa.com'))
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2000)
await page.getByRole('button', { name: /^Direct$/ }).first().click(); await page.waitForTimeout(2500)
await page.evaluate(() => { const b=[...document.querySelectorAll('button[title]')].find(x=>/FHD|HD/i.test(x.title)); b?.click() })
await page.waitForTimeout(7000)
const avant = await page.evaluate(() => { const v=document.querySelector('video'); const r=v?.getBoundingClientRect(); return v?`${Math.round(r.width)}x${Math.round(r.height)} paused=${v.paused}`:'aucune' })
console.log('1. avant PiP, dans la page :', avant)
await page.mouse.move(600,500); await page.waitForTimeout(500); await page.mouse.move(620,520); await page.waitForTimeout(800)
await page.locator('button[title="Image dans l\'image"]').first().click({ timeout: 8000 })
await page.waitForTimeout(3000)
console.log('2. dans le PiP :', await page.evaluate(() => {
  const w=window.documentPictureInPicture?.window; if(!w) return 'non ouvert'
  const v=w.document.querySelector('video'); const r=v?.getBoundingClientRect()
  return v?`${Math.round(r.width)}x${Math.round(r.height)} paused=${v.paused}`:'absente'
}))
// Fermeture par le code, comme le ferait le bouton de la fenetre
await page.evaluate(() => window.documentPictureInPicture?.window?.close())
await page.waitForTimeout(3000)
console.log('3. apres fermeture, dans la page :', await page.evaluate(() => {
  const v=document.querySelector('video'); if(!v) return 'VIDEO PERDUE'
  const r=v.getBoundingClientRect()
  return `${Math.round(r.width)}x${Math.round(r.height)} paused=${v.paused} connecte=${v.isConnected}`
}))
await nav.close()
