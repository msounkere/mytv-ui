import { chromium } from 'playwright'

const PROFIL = '/tmp/claude-0/-root/af0bfe04-324f-47cd-9f6b-faadeffb4ea5/scratchpad/profil-chrome'
const ctx = await chromium.launchPersistentContext(PROFIL, { viewport: { width: 1440, height: 900 } })
const page = ctx.pages()[0] ?? await ctx.newPage()
const journal = []
page.on('pageerror', (e) => journal.push(`[ERREUR] ${e.message.slice(0, 200)}`))

await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

const compte = async () => page.evaluate(() => new Promise((ok) => {
  const r = indexedDB.open('mytv')
  r.onsuccess = () => { const d = r.result
    if (!d.objectStoreNames.contains('catalogue')) return ok(0)
    const q = d.transaction('catalogue').objectStore('catalogue').count(); q.onsuccess = () => ok(q.result) }
  r.onerror = () => ok(0)
}))

if (await compte() < 1000) {
  console.log('catalogue vide — import…')
  await page.getByRole('button', { name: 'Réglages' }).click()
  await page.getByRole('button', { name: 'Importer le catalogue' }).click()
  await page.waitForFunction(() => /entrées importées/.test(document.body.innerText), null, { timeout: 180000 })
}
console.log('entrées en base:', await compte())

// Semer favoris / historique / reprises : l'Accueil ne montre que ça.
const seme = await page.evaluate(() => new Promise((ok) => {
  const r = indexedDB.open('mytv')
  r.onsuccess = () => {
    const d = r.result
    const lire = (type, n) => new Promise((res) => {
      const idx = d.transaction('catalogue').objectStore('catalogue').index('type')
      const out = []; const c = idx.openCursor(IDBKeyRange.only(type))
      c.onsuccess = (e) => { const cur = e.target.result
        if (!cur || out.length >= n) return res(out)
        out.push(cur.value); cur.continue() }
    })
    Promise.all([lire('live', 12), lire('vod', 6), lire('series', 4)]).then(([ch, mv, se]) => {
      const tx = d.transaction(['favoris', 'historique', 'reprises'], 'readwrite')
      const now = Date.now()
      ch.forEach((e, i) => tx.objectStore('favoris').put({ cle: e.cle, ajouteLe: now - i * 1000 }))
      ;[...mv, ...se].slice(0, 8).forEach((e, i) => tx.objectStore('favoris').put({ cle: e.cle, ajouteLe: now - 20000 - i * 1000 }))
      ;[...mv.slice(0, 2), ...se.slice(0, 1)].forEach((e, i) => tx.objectStore('reprises')
        .put({ cle: e.cle, position: 1200 + i * 600, duree: 5400, vuLe: now - i * 3600_000 }))
      const hist = [ch[0], mv[0], se[0], ch[1], ch[2], mv[1]]
      const ecarts = [12 * 60e3, 3 * 3600e3, 20 * 3600e3, 26 * 3600e3, 2 * 86400e3, 3 * 86400e3]
      hist.forEach((e, i) => tx.objectStore('historique').put({ cle: e.cle, ouvertLe: now - ecarts[i] }))
      tx.oncomplete = () => ok({ ch: ch.length, mv: mv.length, se: se.length })
    })
  }
}))
console.log('semé:', JSON.stringify(seme))

await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(6000)
await page.screenshot({ path: 'captures/app-accueil-apres.png' })

const mes = await page.evaluate(() => {
  const g = (el, n) => { if (!el) return null; const c = getComputedStyle(el); const r = el.getBoundingClientRect()
    return { n, w: +r.width.toFixed(1), h: +r.height.toFixed(1), fs: c.fontSize, lh: c.lineHeight,
      fw: c.fontWeight, color: c.color, bg: c.backgroundColor, pad: c.padding, gap: c.gap, br: c.borderRadius } }
  const nv = document.querySelector('nav'); const hd = document.querySelector('header')
  const o = { nav: g(nv, 'nav'), header: g(hd, 'header'),
    rootCols: getComputedStyle(document.querySelector('#root > div')).gridTemplateColumns }
  o.navItem = g(nv.querySelector('.rail-item'), 'railItem')
  const ico = nv.querySelector('.icone')
  o.icone = { ff: getComputedStyle(ico).fontFamily, fs: getComputedStyle(ico).fontSize,
    w: +ico.getBoundingClientRect().width.toFixed(1), h: +ico.getBoundingClientRect().height.toFixed(1), txt: ico.textContent }
  o.crumb = g(hd.querySelector('h1'), 'crumb')
  o.badgeFlux = g([...hd.querySelectorAll('div')].find(d => /Flux|Limite/.test(d.textContent) && d.children.length === 1), 'flux')
  o.badgeTexte = [...hd.querySelectorAll('div')].find(d => /Flux|Limite/.test(d.textContent))?.textContent
  o.selecteur = g(hd.querySelector('.entete-bouton'), 'selecteur')
  o.selecteurTexte = hd.querySelector('.entete-bouton')?.textContent
  const main = document.querySelector('main')
  o.contenu = g(main.querySelector('.accueil-contenu'), 'contenu')
  o.hero = g(main.querySelector('input'), 'hero')
  o.catalogue = main.querySelector('p.num')?.textContent
  const h2 = [...main.querySelectorAll('h2')]
  o.h2 = g(h2[0], 'h2'); o.h2s = h2.map(x => x.textContent)
  const rep = main.querySelector('.reprise')
  o.reprise = g(rep, 'reprise'); o.repriseMedia = g(rep?.querySelector('.reprise-media'), 'media')
  const grilleRep = rep?.parentElement
  o.grilleReprise = grilleRep ? { ...g(grilleRep, 'grille'), cols: getComputedStyle(grilleRep).gridTemplateColumns } : null
  const col = main.querySelector('.accueil-colonnes')
  o.colonnes = { ...g(col, 'colonnes'), cols: getComputedStyle(col).gridTemplateColumns }
  const cc = main.querySelector('.carte-chaine')
  o.carteChaine = g(cc, 'carteChaine'); o.carteTexte = cc?.textContent
  const gf = cc?.parentElement
  o.grilleFav = gf ? { ...g(gf, 'grilleFav'), cols: getComputedStyle(gf).gridTemplateColumns } : null
  const lr = main.querySelector('.ligne-recente')
  o.ligneRecente = g(lr, 'ligneRecente'); o.recentTexte = lr?.textContent
  return o
})
console.log(JSON.stringify(mes, null, 1))
console.log('\njournal:', journal.length ? journal.join('\n') : 'aucune erreur')
await ctx.close()
