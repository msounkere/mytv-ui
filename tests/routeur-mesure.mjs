// Coût d'un retour sur un écran, avant et après la préservation.
//
// POURQUOI la premiere visite sert de « avant » : c'est exactement ce que
// coutait CHAQUE visite quand l'ecran etait monte dans un <Show> -- construire
// l'ecran de zero. La deuxieme visite est le « apres ». Meme session, meme
// cache, meme machine : la comparaison ne depend d'aucune autre variable.
import { chromium } from 'playwright'
import { couperLesFlux } from './garde-flux.mjs'

const ctx = await chromium.launchPersistentContext(process.env.PROFIL, {
  viewport: { width: 1440, height: 900 },
  args: ['--js-flags=--expose-gc'],
})
const page = ctx.pages()[0] ?? (await ctx.newPage())
await couperLesFlux(page)
// Le tas rapporte par `performance.memory` est arrondi au Mo et depend du
// ramasse-miettes : on passe par CDP pour le declencher avant chaque releve.
const cdp = await ctx.newCDPSession(page)
async function tasMo() {
  await cdp.send('HeapProfiler.collectGarbage')
  await page.waitForTimeout(600)
  const { usedSize } = await cdp.send('Runtime.getHeapUsage')
  const { documents, nodes, jsEventListeners } = await cdp.send('Memory.getDOMCounters')
  return { tas: +(usedSize / 1048576).toFixed(1), documents, nodes, ecouteurs: jsEventListeners }
}
// On demarre sur les Reglages, qui ne montent aucun des ecrans preserves :
// sinon l'Accueil, ecran d'arrivee, serait deja construit et sa « premiere
// visite » ne mesurerait rien.
await page.goto('http://localhost:5173/app/reglages', { waitUntil: 'load' })
await page.waitForSelector('nav[aria-label="Navigation principale"]', { timeout: 30000 })
await page.waitForTimeout(4000)

const armer = () => page.evaluate(() => {
  const main = document.querySelector('main')
  globalThis.__ajouts = 0
  globalThis.__obs?.disconnect()
  globalThis.__obs = new MutationObserver((lots) => {
    for (const l of lots) {
      for (const n of l.addedNodes) {
        globalThis.__ajouts += 1 + (n.nodeType === 1 ? n.querySelectorAll('*').length : 0)
      }
    }
  })
  globalThis.__obs.observe(main, { childList: true, subtree: true })
})

const releve = () => page.evaluate(() => ({
  ajouts: globalThis.__ajouts,
  total: document.querySelectorAll('main *').length,
  tas: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576),
}))

async function aller(nom) {
  await armer()
  let reqs = 0
  const compter = () => reqs++
  page.on('request', compter)
  const t = Date.now()
  await page.getByRole('button', { name: new RegExp(`^${nom}$`) }).first().click()
  // On attend la STABILISATION du DOM, pas un delai fixe : le Guide se monte
  // paresseusement et un releve a 2,5 s lui attribuait deux noeuds au lieu de
  // quatre cents, le reste tombant sur l'ecran suivant.
  let vu = -1
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(800)
    const n = await page.evaluate(() => globalThis.__ajouts)
    if (n === vu && Date.now() - t > 2500) break
    vu = n
  }
  page.off('request', compter)
  const r = await releve()
  return { nom, ms: Date.now() - t, reqs, ...r }
}

const ligne = (r) =>
  `  ${r.nom.padEnd(8)} ${String(r.ms).padStart(5)} ms · ${String(r.reqs).padStart(3)} requetes · ` +
  `${String(r.ajouts).padStart(5)} noeuds crees · ${String(r.total).padStart(5)} dans main · ${r.tas} Mo`

const ORDRE = ['Accueil', 'Direct', 'Films', 'Séries', 'Guide']
const depart = await tasMo()
console.log('=== PREMIERE visite (= ce que coutait chaque visite avant) ===')
const avant = {}
let unSeul = null
for (const e of ORDRE) {
  avant[e] = await aller(e)
  console.log(ligne(avant[e]))
  // Releve apres le premier ecran : c'est l'etat que l'ancienne coque gardait
  // en permanence, un seul ecran monte a la fois.
  if (unSeul === null) unSeul = await tasMo()
}

// Un retour se mesure depuis un ecran NEUTRE : passer par l'Accueil entre deux
// releves evite de confondre « revenir sur Films » et « basculer de Series a
// Films », qui n'ont pas le meme cout (voir la derniere ligne).
console.log('\n=== RETOUR sur un ecran deja visite, depuis l\'Accueil (= apres) ===')
const apres = {}
for (const e of ['Direct', 'Films', 'Séries', 'Guide']) {
  await aller(e)
  await aller('Accueil')
  apres[e] = await aller(e)
  console.log(ligne(apres[e]))
}
await aller('Guide')
apres.Accueil = await aller('Accueil')
console.log(ligne(apres.Accueil))

console.log('\n=== bilan ===')
for (const e of ORDRE) {
  const a = avant[e], b = apres[e]
  console.log(`  ${e.padEnd(8)} requetes ${a.reqs} -> ${b.reqs} · noeuds crees ${a.ajouts} -> ${b.ajouts} · ${a.ms} ms -> ${b.ms} ms`)
}
await aller('Films')
const bascule = await aller('Séries')
console.log(`  residu connu : basculer Films -> Series reconstruit ${bascule.ajouts} noeuds (${bascule.reqs} requetes) :`)
console.log('                 la ressource d\'index est clefee sur le type, c\'est l\'etape 2.')
await aller('Accueil')
const fin = await tasMo()
console.log('\n=== cout memoire de la preservation ===')
console.log(`  coque nue (Reglages) : ${depart.tas} Mo de tas · ${depart.nodes} noeuds DOM · ${depart.ecouteurs} ecouteurs`)
console.log(`  Accueil seul monte   : ${unSeul.tas} Mo · ${unSeul.nodes} noeuds · ${unSeul.ecouteurs} ecouteurs  (l'ancien etat permanent)`)
console.log(`  les 5 ecrans montes  : ${fin.tas} Mo · ${fin.nodes} noeuds · ${fin.ecouteurs} ecouteurs`)
console.log(`  PRIX DE LA PRESERVATION : +${(fin.tas - unSeul.tas).toFixed(1)} Mo de tas · +${fin.nodes - unSeul.nodes} noeuds DOM · +${fin.ecouteurs - unSeul.ecouteurs} ecouteurs`)
await ctx.close()
