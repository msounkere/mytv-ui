import { chromium } from 'playwright'
const DIR = '/tmp/claude-0/-root/af0bfe04-324f-47cd-9f6b-faadeffb4ea5/scratchpad/profil-rech'
const ctx = await chromium.launchPersistentContext(DIR, { viewport: { width: 1440, height: 900 } })
const page = ctx.pages()[0] ?? await ctx.newPage()
page.on('pageerror', (e) => console.log('[ERR]', e.message.slice(0, 300)))
page.on('console', (m) => { if (m.type() === 'error') console.log('[c-err]', m.text().slice(0, 200)) })
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(1500)

// L'en-tete ne montre son champ que hors Accueil : on passe par Direct.
await page.getByRole('button', { name: /Direct/ }).first().click()
await page.waitForTimeout(1200)
console.log('champ present :', await page.locator('.entete-recherche input').count())

// Montage autonome du panneau, exactement comme le fera App.tsx.
const monte = await page.evaluate(async () => {
  const V = '?v=77c0403e'
  const web = await import('/app/node_modules/.vite/deps/solid-js_web.js' + V)
  const { default: Panneau } = await import('/app/src/components/PanneauSuggestions.tsx')
  window.__ouvert = []
  window.__voirTout = []
  const hote = document.createElement('div')
  document.body.appendChild(hote)
  web.render(() => web.createComponent(Panneau, {
    surOuvrir: (e) => window.__ouvert.push(e.nom),
    surVoirTout: (q) => {
      window.__voirTout.push(q)
      const champ = document.querySelector('.entete-recherche input')
      champ.value = q
      champ.dispatchEvent(new Event('input', { bubbles: true }))
      champ.form.requestSubmit()
    },
  }), hote)
  // Observateur de taches longues : preuve que la frappe n'est pas bloquee.
  window.__longues = []
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__longues.push(Math.round(e.duration)) })
    .observe({ entryTypes: ['longtask'] })
  return true
})
console.log('panneau monte :', monte)

// 1) Touche / -> panneau ouvert (recentes vides au premier passage)
await page.keyboard.press('/')
await page.waitForTimeout(500)
await page.screenshot({ path: 'captures/v3-panneau-vide.png' })
const vide = await page.evaluate(() => {
  const p = document.querySelector('[role="listbox"][aria-label="Suggestions de recherche"]')
  if (!p) return null
  const c = getComputedStyle(p), r = p.getBoundingClientRect()
  const ch = document.querySelector('.entete-recherche input').getBoundingClientRect()
  return { box: `${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.x)},${Math.round(r.y)}`,
    champ: `${Math.round(ch.width)}x${Math.round(ch.height)}@${Math.round(ch.x)},${Math.round(ch.y)}`,
    ecart: Math.round(r.top - ch.bottom), dx: Math.round(r.left - ch.left),
    pad: c.padding, br: c.borderRadius, bg: c.backgroundColor, bd: c.border, sh: c.boxShadow, maxH: c.maxHeight, z: c.zIndex,
    txt: p.innerText.split('\n').filter(Boolean).slice(0, 12) }
})
console.log('PANNEAU VIDE', JSON.stringify(vide, null, 1))

// 2) Frappe reelle : latence de chaque touche + anti-rebond
await page.evaluate(() => { window.__lat = []; const c = document.querySelector('.entete-recherche input')
  c.addEventListener('keydown', () => { window.__t = performance.now() })
  c.addEventListener('input', () => { window.__lat.push(+(performance.now() - window.__t).toFixed(2)) }) })
const t0 = Date.now()
await page.locator('.entete-recherche input').type('france', { delay: 90 })
const tFrappe = Date.now() - t0
await page.waitForTimeout(900)
await page.screenshot({ path: 'captures/v3-panneau-resultats.png' })
const res = await page.evaluate(() => {
  const p = document.querySelector('[role="listbox"][aria-label="Suggestions de recherche"]')
  const opts = [...p.querySelectorAll('[role="option"]')]
  const mes = performance.getEntriesByName('rech:panneau').map((e) => +e.duration.toFixed(1))
  const idx = performance.getEntriesByName('rech:indexation').map((e) => Math.round(e.duration))
  return { nOptions: opts.length, latences: window.__lat, taches: window.__longues,
    mesuresPanneau: mes, indexation: idx,
    txt: p.innerText.split('\n').filter(Boolean),
    quotas: [...p.querySelectorAll('[role="option"]')].length }
})
console.log('FRAPPE', tFrappe, 'ms —', JSON.stringify(res, null, 1))
await ctx.close()
