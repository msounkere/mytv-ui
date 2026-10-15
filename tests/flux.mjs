import { chromium } from 'playwright'
const nav = await chromium.launch({ args: ['--host-resolver-rules=MAP mytv.msocasa.com 192.168.50.6'], ignoreHTTPSErrors: true })
const page = await nav.newPage({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true })
// Compter les requêtes de segments : chacune est une consommation du flux.
let segments = 0, manifestes = 0
page.on('request', r => { const u = r.url(); if (/\.ts(\?|$)/.test(u)) segments++; if (/\.m3u8/.test(u)) manifestes++ })
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /Réglages/ }).click()
await page.getByRole('button', { name: 'Importer le catalogue' }).click()
await page.waitForFunction(() => /entrées importées/.test(document.body.innerText), null, { timeout: 150000 })
await page.getByRole('button', { name: /^Direct$/ }).first().click()
await page.waitForTimeout(2000)
await page.evaluate(() => { const b=[...document.querySelectorAll('button[title]')].find(x=>/HD|UHD|FR/i.test(x.title)); b?.click() })
await page.waitForTimeout(6000)
const etat1 = await page.evaluate(() => ({ videos: document.querySelectorAll('video').length, srcs: [...document.querySelectorAll('video')].map(v => (v.src||v.currentSrc||'').slice(-28)) }))
console.log('1. en lecture        :', JSON.stringify(etat1))
console.log('   requêtes          : manifestes=' + manifestes + ' segments=' + segments)

// Zapper : le flux précédent doit être relâché, pas doublé
await page.keyboard.press('ArrowDown')
await page.waitForTimeout(6000)
const etat2 = await page.evaluate(() => ({ videos: document.querySelectorAll('video').length, srcs: [...document.querySelectorAll('video')].map(v => (v.src||v.currentSrc||'').slice(-28)) }))
console.log('2. après un zap      :', JSON.stringify(etat2))

// Naviguer ailleurs : le mini-lecteur persiste — combien de <video> alors ?
await page.getByRole('button', { name: /^Films$/ }).first().click()
await page.waitForTimeout(5000)
const etat3 = await page.evaluate(() => ({ videos: document.querySelectorAll('video').length, srcs: [...document.querySelectorAll('video')].map(v => (v.src||v.currentSrc||'').slice(-28)) }))
console.log('3. après navigation  :', JSON.stringify(etat3))
console.log('   total segments    :', segments)
await nav.close()
