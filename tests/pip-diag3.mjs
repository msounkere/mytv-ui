import { chromium } from 'playwright'
const nav = await chromium.connectOverCDP('http://192.168.50.159:9223')
const page = nav.contexts()[0].pages().find(p => p.url().includes('mytv.msocasa.com'))
const boutons = await page.evaluate(() =>
  [...document.querySelectorAll('button')].map((b,i) => ({
    i, titre: b.title || null, aria: b.getAttribute('aria-label'),
    texte: (b.innerText||'').trim().slice(0,22) || null,
  })).filter(b => b.titre || b.aria))
console.log('=== boutons identifiables ===')
for (const b of boutons.slice(0, 30)) console.log(` ${String(b.i).padStart(3)} titre=${JSON.stringify(b.titre)} aria=${JSON.stringify(b.aria)}`)
await nav.close()
