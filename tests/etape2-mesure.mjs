// Mesure de l'etape 2 : ce que coute une premiere visite, ce que coute une
// bascule Films <-> Series, ce que coute une recherche.
//
// POURQUOI les noeuds sont comptes par MutationObserver et non par
// querySelectorAll : la question n'est pas « combien y en a-t-il » mais
// « combien ont ete RECONSTRUITS ». Un total identique peut cacher un ecran
// entierement rebati.
//
// Le meme script sert avant et apres : seul le code de l'application change.
import { chromium } from 'playwright'
import { couperLesFlux, connecter } from './garde-flux.mjs'

const ETIQUETTE = process.argv[2] ?? 'releve'
const ctx = await chromium.launchPersistentContext(process.env.PROFIL, {
  viewport: { width: 1440, height: 900 },
})
const page = ctx.pages()[0] ?? (await ctx.newPage())
await couperLesFlux(page)

// On arrive par les Reglages : aucun des ecrans preserves n'y est monte, donc
// la « premiere visite » de chacun mesure vraiment sa construction.
await page.goto('http://localhost:5173/app/reglages', { waitUntil: 'load' })
await page.waitForSelector('nav[aria-label="Navigation principale"]', { timeout: 30000 })
await connecter(page)
await page.waitForTimeout(3500)

const armer = () => page.evaluate(() => {
  const main = document.querySelector('main')
  globalThis.__ajouts = 0
  globalThis.__obs?.disconnect()
  globalThis.__obs = new MutationObserver((lots) => {
    for (const l of lots)
      for (const n of l.addedNodes)
        globalThis.__ajouts += 1 + (n.nodeType === 1 ? n.querySelectorAll('*').length : 0)
  })
  globalThis.__obs.observe(main, { childList: true, subtree: true })
})

const releve = () => page.evaluate(() => ({
  ajouts: globalThis.__ajouts,
  total: document.querySelectorAll('main *').length,
}))

// On attend la STABILISATION du DOM : un releve a delai fixe attribue a l'ecran
// suivant ce que celui-ci finit de construire.
async function aller(nom) {
  await armer()
  let reqs = 0
  const compter = () => reqs++
  page.on('request', compter)
  const t = Date.now()
  await page.getByRole('button', { name: new RegExp(`^${nom}$`) }).first().click()
  // Deux releves identiques de suite, et jamais avant 3,5 s : le Guide est
  // charge paresseusement, et un seul palier le creditait de deux noeuds (son
  // texte d'attente) au lieu de sa grille entiere.
  let vu = -1
  let stable = 0
  for (let i = 0; i < 24; i++) {
    await page.waitForTimeout(700)
    const n = await page.evaluate(() => globalThis.__ajouts)
    stable = n === vu ? stable + 1 : 0
    if (stable >= 2 && Date.now() - t > 3500) break
    vu = n
  }
  page.off('request', compter)
  return { nom, ms: Date.now() - t, reqs, ...(await releve()) }
}

const ligne = (r) =>
  `  ${r.nom.padEnd(8)} ${String(r.ms).padStart(5)} ms · ${String(r.reqs).padStart(3)} requetes · ` +
  `${String(r.ajouts).padStart(5)} noeuds crees · ${String(r.total).padStart(5)} dans main`

console.log(`===== ${ETIQUETTE} =====`)
console.log('\n=== premiere visite de chaque ecran ===')
for (const e of ['Accueil', 'Direct', 'Films', 'Séries', 'Guide']) console.log(ligne(await aller(e)))

console.log('\n=== bascule Films <-> Series (ecrans deja visites) ===')
const bascules = []
for (const e of ['Films', 'Séries', 'Films', 'Séries', 'Films', 'Séries']) {
  const r = await aller(e)
  bascules.push(r)
  console.log(ligne(r))
}
const stables = bascules.slice(2)
const moy = (f) => Math.round(stables.reduce((n, r) => n + f(r), 0) / stables.length)
console.log(`  MOYENNE sur les 4 dernieres : ${moy((r) => r.ajouts)} noeuds · ${moy((r) => r.reqs)} requetes · ${moy((r) => r.ms)} ms`)

console.log('\n=== retour sur un ecran, depuis l\'Accueil ===')
for (const e of ['Direct', 'Guide']) {
  await aller('Accueil')
  console.log(ligne(await aller(e)))
}

// ── Recherche ──────────────────────────────────────────────────────────────
// Deux chiffres distincts : le temps vu par l'utilisateur (frappe -> premiere
// suggestion affichee) et le temps passe dans le worker, que l'application
// mesure elle-meme.
console.log('\n=== recherche ===')
await aller('Accueil')
async function chercher(mot) {
  await page.evaluate(() => {
    document.querySelector('.entete-recherche input')?.focus()
    const c = document.querySelector('.entete-recherche input')
    if (c) { c.value = ''; c.dispatchEvent(new Event('input', { bubbles: true })) }
  })
  await page.waitForTimeout(300)
  const t = Date.now()
  await page.locator('.entete-recherche input').type(mot, { delay: 30 })
  const frappeFinie = Date.now()
  await page.waitForSelector('[aria-label="Suggestions de recherche"] [role="option"]', { timeout: 20000 })
  const vu = Date.now()
  const mesures = await page.evaluate(() =>
    performance.getEntriesByType('measure')
      .filter((m) => m.name.startsWith('rech:'))
      .map((m) => ({ nom: m.name, ms: Math.round(m.duration) })),
  )
  const dernier = (nom) => {
    const l = mesures.filter((m) => m.nom === nom)
    return l.length ? l[l.length - 1].ms : null
  }
  await page.keyboard.press('Escape')
  return {
    mot,
    frappe: frappeFinie - t,
    affiche: vu - frappeFinie,
    total: vu - t,
    panneau: dernier('rech:panneau'),
    indexation: dernier('rech:indexation'),
  }
}
for (const mot of ['action', 'tf1', 'walking']) {
  const r = await chercher(mot)
  console.log(
    `  « ${r.mot.padEnd(8)} » suggestions affichees ${String(r.affiche).padStart(5)} ms apres la derniere touche` +
    ` · worker ${r.panneau} ms${r.indexation ? ` · indexation ${r.indexation} ms` : ''}`,
  )
}

// Page de resultats complete : l'autre moitie de la recherche.
await page.locator('.entete-recherche input').click()
await page.locator('.entete-recherche input').fill('')
await page.locator('.entete-recherche input').type('action', { delay: 30 })
await page.waitForSelector('[aria-label="Suggestions de recherche"] [role="option"]', { timeout: 20000 })
// « Voir les N resultats » et non Entree : Entree ouvre la suggestion
// selectionnee, ce qui menerait au lecteur.
const tPage = Date.now()
await page.getByText(/^Voir les .* résultats$/).first().click()
await page.waitForFunction(
  () => /résultats? ·/.test(document.querySelector('main')?.innerText ?? ''),
  null, { timeout: 20000 },
).catch(() => console.log('  page de resultats : marqueur non vu'))
console.log(`  page de resultats « action » : ${Date.now() - tPage} ms`)

const filtrages = await page.evaluate(() =>
  performance.getEntriesByName('mytv:filtrage').map((m) => Math.round(m.duration)),
)
if (filtrages.length) console.log(`\n  filtrages mesures par l'application (ms) : ${filtrages.join(', ')}`)

// ── Le cache, interroge directement ────────────────────────────────────────
// C'est la mesure qui PROUVE le partage : « combien de fois cette donnee a-t-elle
// ete chargee », apres cinq ecrans et six bascules. Deux chargements pour une
// cle lue par trois ecrans voudraient dire qu'il n'y a pas de cache.
const cache = await page.evaluate(() =>
  (globalThis.mytvCache?.() ?? null)?.sort((a, b) => a.cle.localeCompare(b.cle)) ?? null,
)
if (cache) {
  console.log(`\n=== cache : ${cache.length} cles ===`)
  for (const q of cache)
    console.log(`  ${q.cle.padEnd(42)} ${q.chargements} chargement(s) · ${q.lecteurs} lecteur(s) · ${q.etat}${q.echecs ? ` · ${q.echecs} echec(s)` : ''}`)
  const double = cache.filter((q) => q.chargements > 1 && !q.cle.includes('connexions'))
  console.log(double.length === 0
    ? '  aucune cle chargee deux fois'
    : `  cles rechargees : ${double.map((q) => `${q.cle}×${q.chargements}`).join(', ')}`)
}

await ctx.close()
