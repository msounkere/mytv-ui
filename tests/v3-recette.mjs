import { chromium } from 'playwright'
const DIR = '/tmp/claude-0/-root/af0bfe04-324f-47cd-9f6b-faadeffb4ea5/scratchpad/profil-rech'
const ctx = await chromium.launchPersistentContext(DIR, { viewport: { width: 1440, height: 900 } })
const page = ctx.pages()[0] ?? await ctx.newPage()
page.on('pageerror', (e) => console.log('[ERR]', e.message.slice(0, 300)))
page.on('console', (m) => { if (m.type() === 'error') console.log('[c-err]', m.text().slice(0, 200)) })
await page.addInitScript(() => localStorage.removeItem('mytv.recherches-recentes'))
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(1200)
await page.getByRole('button', { name: /Direct/ }).first().click()
await page.waitForTimeout(1000)

await page.evaluate(async () => {
  const V = '?v=77c0403e'
  const web = await import('/app/node_modules/.vite/deps/solid-js_web.js' + V)
  const { default: Panneau } = await import('/app/src/components/PanneauSuggestions.tsx')
  window.__ouvert = []; window.__longues = []
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__longues.push({ d: Math.round(e.duration), t: Math.round(e.startTime) }) })
    .observe({ entryTypes: ['longtask'] })
  const hote = document.createElement('div'); document.body.appendChild(hote)
  web.render(() => web.createComponent(Panneau, {
    surOuvrir: (e) => window.__ouvert.push(e.nom),
    surVoirTout: (q) => { const c = document.querySelector('.entete-recherche input')
      c.value = q; c.dispatchEvent(new Event('input', { bubbles: true })); c.form.requestSubmit() },
  }), hote)
})
const champ = page.locator('.entete-recherche input')
const txt = () => page.evaluate(() => { const p = document.querySelector('[role="listbox"][aria-label="Suggestions de recherche"]'); return p ? p.innerText.split('\n').filter(Boolean) : null })
const vider = async () => { await champ.fill(''); await page.waitForTimeout(250) }

// Indexation hors fil principal
await champ.click(); await page.waitForTimeout(100)
await page.waitForFunction(() => performance.getEntriesByName('rech:indexation').length > 0, { timeout: 60000 })
const idx = await page.evaluate(() => ({
  ms: Math.round(performance.getEntriesByName('rech:indexation')[0].duration),
  longues: window.__longues }))
console.log('A. INDEXATION', JSON.stringify(idx))

// B. Anti-rebond 180 ms : une seule interrogation pour 6 touches
await page.evaluate(() => performance.clearMeasures('rech:panneau'))
await champ.type('france', { delay: 60 })
await page.waitForTimeout(800)
const rebond = await page.evaluate(() => performance.getEntriesByName('rech:panneau').map((e) => +e.duration.toFixed(1)))
console.log('B. ANTI-REBOND — interrogations pour 6 touches :', rebond.length, 'durees', JSON.stringify(rebond))

// C. Quotas 6 / 5 / 4
const t = await txt()
const q = await page.evaluate(() => {
  const p = document.querySelector('[role="listbox"]')
  const sections = []
  let cour = null
  for (const n of p.children) {
    const s = n.innerText.split('\n')[0]
    if (/^(CHAÎNES|FILMS|SÉRIES)$/.test(s)) { cour = { nom: s, n: 0 }; sections.push(cour) }
    else if (cour && n.getAttribute('role') === 'option' && !/^Voir les/.test(n.innerText)) cour.n++
  }
  return sections })
console.log('C. QUOTAS', JSON.stringify(q), '| pied :', t[t.length - 2], t[t.length - 1])

// D. Insensibilite aux accents
await vider(); await champ.type('pokemon'); await page.waitForTimeout(600)
const sans = await page.evaluate(() => document.querySelector('[role="listbox"]').innerText.match(/Voir les ([\d  ]+) résultats/)?.[1])
await vider(); await champ.type('pokémon'); await page.waitForTimeout(600)
const avec = await page.evaluate(() => document.querySelector('[role="listbox"]').innerText.match(/Voir les ([\d  ]+) résultats/)?.[1])
console.log('D. ACCENTS — pokemon :', sans, '| pokémon :', avec)

// E. Debuts de mot en premier
await vider(); await champ.type('bad'); await page.waitForTimeout(600)
const ordre = await page.evaluate(() => [...document.querySelectorAll('[role="listbox"] [role="option"]')]
  .slice(0, 15).map((e) => e.innerText.split('\n')[1] ?? e.innerText.split('\n')[0]))
console.log('E. ORDRE « bad »', JSON.stringify(ordre))

// F. Navigation clavier + ouverture par Entree
await vider(); await champ.type('france'); await page.waitForTimeout(600)
await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown')
const sel = await page.evaluate(() => [...document.querySelectorAll('[role="listbox"] [role="option"]')]
  .map((e, i) => ({ i, s: e.getAttribute('aria-selected'), bg: getComputedStyle(e).backgroundColor }))
  .filter((x) => x.s === 'true'))
console.log('F. CLAVIER', JSON.stringify(sel))
await page.screenshot({ path: 'captures/v3-panneau-clavier.png' })
await page.keyboard.press('Enter'); await page.waitForTimeout(600)
console.log('F2. ENTREE a ouvert :', JSON.stringify(await page.evaluate(() => window.__ouvert)))

// G. Recherches recentes : 8 maximum, suppression unitaire, persistance
for (const r of ['tf1', 'arte', 'canal', 'm6', 'bein', 'rmc', 'eurosport', 'france 2', 'disney']) {
  await vider(); await champ.type(r); await page.waitForTimeout(400)
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await page.waitForTimeout(350)
  await champ.click(); await page.waitForTimeout(150)
}
await vider(); await page.waitForTimeout(300)
await page.screenshot({ path: 'captures/v3-panneau-recentes.png' })
const rec = await page.evaluate(() => JSON.parse(localStorage.getItem('mytv.recherches-recentes') ?? '[]'))
console.log('G. RECENTES', rec.length, JSON.stringify(rec))
// suppression unitaire par clic reel (mousedown + mouseup)
await page.locator('[role="listbox"] [role="option"]').first().locator('[role="button"]').click()
await page.waitForTimeout(300)
const rec2 = await page.evaluate(() => JSON.parse(localStorage.getItem('mytv.recherches-recentes') ?? '[]'))
console.log('G2. APRES SUPPRESSION', rec2.length, JSON.stringify(rec2))

// H. Etat vide
await vider(); await champ.type('zzzqqqxx'); await page.waitForTimeout(700)
await page.screenshot({ path: 'captures/v3-panneau-aucun.png' })
console.log('H. AUCUN RESULTAT', JSON.stringify(await txt()))

// I. Latence de frappe pendant une requete large
await page.evaluate(() => { window.__lat = []; const c = document.querySelector('.entete-recherche input')
  c.addEventListener('keydown', () => { window.__t = performance.now() })
  c.addEventListener('input', () => window.__lat.push(+(performance.now() - window.__t).toFixed(2))) })
await vider(); await champ.type('a', { delay: 40 }); await page.waitForTimeout(400)
await champ.type('aaaaaaaa'.slice(0, 6), { delay: 40 }); await page.waitForTimeout(900)
const lat = await page.evaluate(() => ({ lat: window.__lat, longues: window.__longues,
  mes: performance.getEntriesByName('rech:panneau').slice(-6).map((e) => +e.duration.toFixed(1)) }))
console.log('I. LATENCE', JSON.stringify(lat))
await ctx.close()
