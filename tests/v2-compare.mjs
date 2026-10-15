import { chromium } from 'playwright'
const releve = async (page, cible) => page.evaluate((cible) => {
  const g = (el, k) => { if (!el) return [k, 'ABSENT']; const c = getComputedStyle(el); const r = el.getBoundingClientRect()
    return [k, `w=${r.width.toFixed(0)} h=${r.height.toFixed(0)} fs=${c.fontSize} lh=${c.lineHeight} fw=${c.fontWeight} gap=${c.gap} pad=${c.padding} br=${c.borderRadius} bg=${c.backgroundColor}`] }
  const sc = [...document.querySelectorAll('*')].find(e => e.scrollHeight > e.clientHeight + 40 && e.clientHeight > 300)
  const col = sc.firstElementChild
  const secs = [...col.children].filter(e => e.tagName === 'SECTION')
  const o = []
  o.push(g(col, 'colonne'))
  const hero = secs.find(s => (s.getAttribute('aria-label') || '') === 'À la une')
  o.push(g(hero, 'hero'))
  if (hero) {
    const enc = [...hero.children].find(d => /À la une ·/.test(d.textContent || ''))
    o.push(g(enc, 'hero.encart'))
    o.push(g(enc?.children[0], 'hero.surtitre'))
    o.push(g(enc?.querySelector('h1'), 'hero.h1'))
    o.push(g(enc?.children[2], 'hero.meta'))
    o.push(g(enc?.querySelector('p'), 'hero.resume'))
    const br = enc?.children[4]
    o.push(g(br?.children[0], 'hero.btnPrim'))
    o.push(g(br?.children[1], 'hero.btnSec'))
    const nav = [...hero.children].at(-1)
    o.push(g(nav, 'hero.nav'))
  }
  const nom = (s) => (s.getAttribute('aria-label') || '').slice(0, 24)
  for (const s of secs) {
    const t = nom(s)
    if (t === 'À la une') continue
    const ent = s.children[0], piste = s.children[1]
    o.push(g(s.querySelector('h2'), `[${t}] h2`))
    o.push(g(ent?.children[1], `[${t}] compteur`))
    o.push(g([...ent.children].at(-1), `[${t}] chevron`))
    o.push(g(piste, `[${t}] piste`))
    o.push(g(piste?.children[0], `[${t}] carte`))
    const inner = piste?.children[0]?.firstElementChild
    o.push(g(inner?.firstElementChild, `[${t}] media`))
  }
  o.push(['titres', secs.map(nom).join(' | ')])
  return o
}, cible)

const nav = await chromium.launch()
const pm = await nav.newPage({ viewport: { width: 1440, height: 900 } })
await pm.goto('http://127.0.0.1:8777/Lecteur%20IPTV.dc.html', { waitUntil: 'networkidle', timeout: 90000 })
await pm.waitForTimeout(6000)
const maq = Object.fromEntries(await releve(pm))
await nav.close()

const ctx = await chromium.launchPersistentContext('/tmp/claude-0/-root/af0bfe04-324f-47cd-9f6b-faadeffb4ea5/scratchpad/profil', { viewport: { width: 1440, height: 900 } })
const pa = ctx.pages()[0] ?? await ctx.newPage()
await pa.goto('http://localhost:5173/app/', { waitUntil: 'networkidle', timeout: 60000 })
await pa.getByRole('button', { name: /^Accueil$/ }).first().click().catch(() => {})
await pa.waitForTimeout(9000)
const app = Object.fromEntries(await releve(pa))
await ctx.close()

const normalise = (k) => k.replace(/^\[[^\]]*\]/, (m) => '[' + m.slice(1, -1).split(' ')[0] + ']')
console.log('--- MAQUETTE ---'); for (const [k, v] of Object.entries(maq)) console.log(k.padEnd(34), v)
console.log('\n--- APPLICATION ---'); for (const [k, v] of Object.entries(app)) console.log(k.padEnd(34), v)
