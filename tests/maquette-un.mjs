import { chromium } from 'playwright'
const [,, ecran = '', l = '820', h = '1180', nom = 'test'] = process.argv
const nav = await chromium.launch()
const page = await nav.newPage({ viewport: { width: +l, height: +h } })
// Polices externes : inutiles et elles retardent le rendu.
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort())
// Chromium ne passe pas le TLS d'unpkg depuis cette machine : React est servi
// depuis une copie locale, versions identiques.
const CDN = '/tmp/claude-0/-root/af0bfe04-324f-47cd-9f6b-faadeffb4ea5/scratchpad/cdn'
await page.route('https://unpkg.com/react@18.3.1/**', (r) => r.fulfill({ path: `${CDN}/react.js`, contentType: 'application/javascript' }))
await page.route('https://unpkg.com/react-dom@18.3.1/**', (r) => r.fulfill({ path: `${CDN}/react-dom.js`, contentType: 'application/javascript' }))
await page.goto(`http://127.0.0.1:8777/Lecteur%20IPTV.dc.html${ecran ? '?ecran=' + ecran : ''}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForFunction(() => document.body.innerText.trim().length > 40, null, { timeout: 40000 }).catch(() => console.log('rendu tardif'))
await page.waitForTimeout(2500)
await page.screenshot({ path: `captures/resp-${nom}.png` })
console.log('ok', nom, (await page.evaluate(() => document.body.innerText.length)), 'car.')
await nav.close()
