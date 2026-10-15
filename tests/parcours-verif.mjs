import { chromium } from 'playwright'
const PROFIL = '/tmp/claude-0/-root/af0bfe04-324f-47cd-9f6b-faadeffb4ea5/scratchpad/profil-mytv'
const nav = await chromium.launchPersistentContext(PROFIL, { viewport: { width: 1440, height: 900 } })
const page = nav.pages()[0] ?? await nav.newPage()
const journal = []
let etape = 'demarrage'
page.on('pageerror', (e) => journal.push(`[PAGEERROR pendant « ${etape} »] ${e.message.slice(0, 160)}`))
page.on('console', (m) => { if (m.type() === 'error') journal.push(`[err] ${m.text().slice(0, 200)}`) })

etape = 'chargement initial (Accueil)'
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
const dejaImporte = await page.evaluate(async () => {
  const db = await new Promise((res) => { const r = indexedDB.open('mytv'); r.onsuccess = () => res(r.result); r.onerror = () => res(null) })
  if (!db || !db.objectStoreNames.contains('catalogue')) return 0
  return await new Promise((res) => { const q = db.transaction('catalogue').objectStore('catalogue').count(); q.onsuccess = () => res(q.result); q.onerror = () => res(0) })
})
if (dejaImporte < 100000) {
  await page.locator('.rail-item', { hasText: 'Réglages' }).first().click()
  await page.getByRole('button', { name: /Importer le catalogue/ }).first().click()
  await page.waitForFunction(() => /entrées importées/.test(document.body.innerText), null, { timeout: 240000 })
  console.log('import: effectue')
} else console.log('import: deja en base —', dejaImporte, 'entrees')

await page.evaluate(async () => {
  const db = await new Promise((res) => { const r = indexedDB.open('mytv'); r.onsuccess = () => res(r.result) })
  const st = db.transaction('categories', 'readwrite').objectStore('categories')
  const tout = await new Promise((res) => { const q = st.getAll(); q.onsuccess = () => res(q.result) })
  for (const c of tout) if (c.masquee) st.put({ ...c, masquee: 0 })
})
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

const sonde = () => page.evaluate(() => {
  // L'aside du Parcours est celui qui porte les onglets segmentés.
  const aside = [...document.querySelectorAll('aside')].find((a) => /Direct/.test(a.innerText) && /catégories/.test(a.innerText))
  const sec = [...document.querySelectorAll('section')].find((s) => s.querySelector('h1'))
  const hauteurs = (racine) => [...racine.querySelectorAll('div')].map((d) => d.style.height).filter((h) => /px$/.test(h))
  const rangees = sec ? [...sec.querySelectorAll('div')].filter((d) => /^repeat\(/.test(d.style.gridTemplateColumns || '')) : []
  const aff = sec?.querySelector('button[title] > div')
  return {
    titre: sec?.querySelector('h1')?.textContent ?? '(pas de h1)',
    compte: sec?.querySelector('h1')?.nextElementSibling?.textContent ?? '',
    compteurCat: aside?.children[1]?.innerText.replace(/\n/g, ' ') ?? '(absent)',
    largeurAside: aside ? Math.round(aside.getBoundingClientRect().width) : 0,
    catsDOM: aside ? aside.querySelectorAll('button[title]').length : 0,
    catsTotalPx: aside ? hauteurs(aside)[0] : '',
    pasCat: aside ? (() => { const b = [...aside.querySelectorAll('button[title]')].slice(0, 3).map((x) => x.getBoundingClientRect().top); return b.map((t, i) => i ? Math.round(t - b[i-1]) : null).slice(1) })() : [],
    hauteurLigneCat: aside ? Math.round(aside.querySelector('button[title]')?.getBoundingClientRect().height ?? 0) : 0,
    itemsDOM: sec ? sec.querySelectorAll('button[title]').length : 0,
    listeTotalPx: sec ? hauteurs(sec).find((h) => parseFloat(h) > 100) : '',
    rangeesDOM: rangees.length,
    gabarit: rangees[0]?.style.gridTemplateColumns ?? '(liste)',
    ecartRangee: rangees[0]?.style.gap ?? '',
    affiche: aff ? `${Math.round(aff.getBoundingClientRect().width)}x${Math.round(aff.getBoundingClientRect().height)}` : '',
    barreH: sec ? Math.round(sec.children[0].getBoundingClientRect().height) : 0,
  }
})

for (const [nom, label] of [['direct', 'Direct'], ['films', 'Films'], ['series', 'Séries']]) {
  etape = label
  await page.locator('.rail-item', { hasText: label }).first().click()
  await page.waitForTimeout(2500)
  console.log(`\n=== ${nom} ===`)
  console.log(JSON.stringify(await sonde(), null, 1))
  await page.screenshot({ path: `captures/apres-parcours-${nom}.png` })
}

// Preuve de virtualisation : 9 177 films, on va au milieu de la grille.
await page.locator('.rail-item', { hasText: 'Films' }).first().click()
await page.waitForTimeout(2500)
const avantDefil = await sonde()
const defil = await page.evaluate(() => {
  const d = [...document.querySelectorAll('div')].find((x) => getComputedStyle(x).overflow === 'auto' && x.scrollHeight > 20000)
  if (!d) return null
  const r = d.getBoundingClientRect()
  d.scrollTop = Math.round(d.scrollHeight / 2)
  return { scrollHeight: d.scrollHeight, clientHeight: Math.round(d.clientHeight), clientWidth: d.clientWidth, offsetWidth: d.offsetWidth, boxWidth: Math.round(r.width), scrollTop: d.scrollTop }
})
await page.waitForTimeout(1800)
const apresDefil = await sonde()
console.log('\n--- grille Films : avant / apres defilement au milieu ---')
console.log('scroller:', JSON.stringify(defil))
console.log('avant :', avantDefil.rangeesDOM, 'rangees,', avantDefil.itemsDOM, 'affiches montees — total', avantDefil.listeTotalPx)
console.log('apres :', apresDefil.rangeesDOM, 'rangees,', apresDefil.itemsDOM, 'affiches montees — total', apresDefil.listeTotalPx)
console.log('rangees totales attendues:', Math.ceil(9177 / 7))
await page.screenshot({ path: 'captures/apres-parcours-films-defile.png' })

// Masquage reversible.
await page.locator('.rail-item', { hasText: 'Direct' }).first().click()
await page.waitForTimeout(2000)
const avantMasque = await sonde()
await page.getByRole('button', { name: 'Masquer la catégorie' }).first().click()
await page.waitForTimeout(1500)
const pendant = await sonde()
await page.getByRole('button', { name: /Afficher l(a|es) .*masquée/ }).first().click()
await page.waitForTimeout(1200)
const visible = await sonde()
console.log('\n--- masquage ---')
console.log('avant   :', avantMasque.compteurCat, '| titre', avantMasque.titre)
console.log('masquee :', pendant.compteurCat, '| titre', pendant.titre)
console.log('montrees:', visible.compteurCat)
await page.screenshot({ path: 'captures/apres-parcours-masquage.png' })

console.log('\njournal:', journal.slice(0, 12).join('\n') || 'aucune erreur')
await nav.close()
