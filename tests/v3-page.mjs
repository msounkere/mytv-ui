import { chromium } from 'playwright'
const DIR = '/tmp/claude-0/-root/af0bfe04-324f-47cd-9f6b-faadeffb4ea5/scratchpad/profil-rech'
const ctx = await chromium.launchPersistentContext(DIR, { viewport: { width: 1440, height: 900 } })
const page = ctx.pages()[0] ?? await ctx.newPage()
page.on('pageerror', (e) => console.log('[ERR]', e.message.slice(0, 300)))
page.on('console', (m) => { if (m.type() === 'error') console.log('[c-err]', m.text().slice(0, 200)) })
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(1200)
await page.getByRole('button', { name: /Direct/ }).first().click()
await page.waitForTimeout(1000)
await page.evaluate(async () => {
  const web = await import('/app/node_modules/.vite/deps/solid-js_web.js?v=77c0403e')
  const { default: Panneau } = await import('/app/src/components/PanneauSuggestions.tsx')
  window.__longues = []
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__longues.push(Math.round(e.duration)) }).observe({ entryTypes: ['longtask'] })
  const hote = document.createElement('div'); document.body.appendChild(hote)
  web.render(() => web.createComponent(Panneau, {
    surOuvrir: () => {},
    surVoirTout: () => document.querySelector('.entete-recherche form, form.entete-recherche').requestSubmit(),
  }), hote)
})
const champ = page.locator('.entete-recherche input')

// E'. Classement : debuts de mot avant occurrences internes
await champ.click(); await page.waitForTimeout(100)
await page.waitForFunction(() => performance.getEntriesByName('rech:indexation').length > 0, { timeout: 60000 })
for (const q of ['bad', 'matrix']) {
  await champ.fill(''); await page.waitForTimeout(220); await champ.type(q); await page.waitForTimeout(700)
  const o = await page.evaluate(() => [...document.querySelectorAll('[role="listbox"] [role="option"]')]
    .filter((e) => !/^Voir les/.test(e.innerText))
    .map((e) => e.getAttribute('title')))
  console.log(`CLASSEMENT « ${q} »`, JSON.stringify(o))
}

// Page de resultats via « Voir tout »
await champ.fill(''); await page.waitForTimeout(220); await champ.type('france'); await page.waitForTimeout(700)
await page.locator('[role="listbox"] [role="option"]').last().click()
await page.waitForTimeout(1400)
await page.screenshot({ path: 'captures/v3-page-resultats.png' })
const d = await page.evaluate(() => {
  const cs = (e, n) => { if (!e) return null; const k = getComputedStyle(e), b = e.getBoundingClientRect()
    return { n, t: (e.innerText||'').replace(/\n/g,'|').slice(0,60), box: `${Math.round(b.width)}x${Math.round(b.height)}`,
      h: k.height, pad: k.padding, gap: k.gap, br: k.borderRadius, bd: k.border, bb: k.borderBottom,
      fs: k.fontSize, lh: k.lineHeight, fw: k.fontWeight, col: k.color, bg: k.backgroundColor, mw: k.maxWidth, gtc: k.gridTemplateColumns } }
  const h1 = document.querySelector('main h1')
  const wrap = h1?.parentElement?.parentElement
  const tabs = document.querySelector('main [role="tablist"]')
  const langs = document.querySelector('main [role="group"][aria-label="Filtrer par langue"]')
  return { h1: cs(h1, 'h1'), sous: cs(h1?.nextElementSibling, 'sous'), wrap: cs(wrap, 'wrap'),
    tablist: cs(tabs, 'tablist'), onglets: [...(tabs?.children ?? [])].map((e, i) => cs(e, 't' + i)),
    langs: [...(langs?.children ?? [])].map((e, i) => cs(e, 'l' + i)),
    h2: cs(document.querySelector('main section h2'), 'h2'),
    liste: cs(document.querySelector('main section > div[style*="border-radius: 8px"]'), 'liste'),
    ligne: cs(document.querySelector('main section button[title]'), 'ligne'),
    grille: cs([...document.querySelectorAll('main section > div')].find((e) => getComputedStyle(e).display === 'grid'), 'grille'),
    msPage: performance.getEntriesByName('rech:page').map((e) => +e.duration.toFixed(1)),
    longues: window.__longues }
})
console.log('PAGE', JSON.stringify(d, null, 1))

// Filtre par langue
const avant = await page.evaluate(() => document.querySelector('main [role="tablist"]').innerText.replace(/\n/g, ' '))
await page.locator('main [role="group"][aria-label="Filtrer par langue"] button').nth(2).click()
await page.waitForTimeout(900)
const apres = await page.evaluate(() => ({ tabs: document.querySelector('main [role="tablist"]').innerText.replace(/\n/g, ' '),
  langue: [...document.querySelectorAll('main [role="group"] button')].find((b) => b.getAttribute('aria-pressed') === 'true')?.innerText }))
console.log('LANGUE avant:', avant, '| apres:', JSON.stringify(apres))
await page.screenshot({ path: 'captures/v3-page-langue.png' })

// Onglet Films + tri par note
await page.locator('main [role="group"][aria-label="Filtrer par langue"] button').first().click()
await page.waitForTimeout(600)
await page.locator('main [role="tab"]').nth(2).click()
await page.waitForTimeout(900)
await page.screenshot({ path: 'captures/v3-page-films.png' })
const films = await page.evaluate(() => ({ sections: [...document.querySelectorAll('main section h2')].map((h) => h.innerText),
  nCartes: document.querySelectorAll('main section > div > *').length }))
console.log('ONGLET FILMS', JSON.stringify(films))
const tTri = Date.now()
await page.getByRole('radio', { name: 'Mieux notés' }).click()
await page.waitForTimeout(1200)
const tri = await page.evaluate(() => ({ ms: performance.getEntriesByName('rech:page').slice(-1)[0]?.duration.toFixed(1),
  titres: [...document.querySelectorAll('main section')].slice(0, 1).flatMap((s) => [...s.querySelectorAll('div')].slice(0, 0)),
  notes: document.querySelector('main section')?.innerText.split('\n').slice(0, 14) }))
console.log('TRI NOTE', Date.now() - tTri, 'ms — ', JSON.stringify(tri))
await page.screenshot({ path: 'captures/v3-page-tri.png' })
console.log('LONGUES finales', JSON.stringify(await page.evaluate(() => window.__longues)))
await ctx.close()
