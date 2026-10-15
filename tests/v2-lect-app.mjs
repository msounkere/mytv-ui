import { chromium } from 'playwright'

// Recette du lecteur V2. Chromium sans décodeur H.264 n'affichera aucune image :
// on injecte alors les événements média réels que le navigateur émettrait avec
// un décodeur, ce qui exerce exactement le chemin de production.

const etiquette = process.argv[2] ?? 'avant'
const nav = await chromium.launch()
const page = await nav.newPage({ viewport: { width: 1440, height: 900 } })
page.on('pageerror', (e) => console.log('ERREUR PAGE:', e.message))

await page.addInitScript(() => {
  window.__G = (el) => {
    if (!el) return null
    const c = getComputedStyle(el), r = el.getBoundingClientRect()
    return {
      w: +r.width.toFixed(1), h: +r.height.toFixed(1), x: +r.x.toFixed(1), y: +r.y.toFixed(1),
      fs: c.fontSize, fw: c.fontWeight, pad: c.padding, gap: c.gap, br: c.borderRadius,
      bg: c.backgroundColor, bd: c.borderTopWidth + ' ' + c.borderTopColor, z: c.zIndex,
      blur: c.backdropFilter, op: c.opacity, cols: c.gridTemplateColumns,
      sh: c.boxShadow === 'none' ? 'none' : c.boxShadow.slice(0, 40),
    }
  }
})

await page.goto('http://localhost:5173/app/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(3000)

const voir = async (titre, fn) => {
  const r = await page.evaluate(fn).catch((e) => ({ erreur: String(e).slice(0, 180) }))
  console.log('\n### ' + titre)
  if (!r) return console.log(' null')
  const inutile = ['normal', 'none', '0px', 'auto', 'rgba(0, 0, 0, 0)', '400', '1']
  for (const [k, v] of Object.entries(r))
    console.log(' ', k, v && typeof v === 'object' && !Array.isArray(v)
      ? Object.entries(v).filter(([, b]) => !inutile.includes(b)).map(([a, b]) => `${a}=${b}`).join(' ')
      : v)
}

const allerA = async (l) => {
  await page.evaluate((x) => {
    const b = [...document.querySelectorAll('nav button, .rail-item')].find((e) => e.textContent.trim().endsWith(x))
    b?.click()
  }, l)
  await page.waitForTimeout(2000)
}

const titreLecteur = () => page.evaluate(() => document.querySelector('main h1')?.textContent)

// Catalogue : 154 060 entrées. Playwright ouvre un profil vierge, donc
// IndexedDB l'est aussi — l'import est refait à chaque exécution.
await allerA('Réglages')
await page.locator('button', { hasText: /Importer le catalogue/i }).first().click()
for (let i = 0; i < 150; i++) {
  await page.waitForTimeout(2000)
  const t = await page.evaluate(() => document.body.innerText)
  if (/importées/i.test(t)) { console.log('import :', t.match(/[\d\s]+entrées importées[^.]*\./)?.[0]?.trim()); break }
}

await allerA('Direct')
await page.waitForTimeout(2500)
await page.evaluate(() => {
  const b = [...document.querySelectorAll('main button')].filter((e) => {
    const r = e.getBoundingClientRect()
    return r.x < 500 && r.y > 150 && r.width > 150
  })
  b[0]?.click()
})
await page.waitForTimeout(2500)
// Les lignes de chaîne ne portent ni <button> ni role : Solid délègue au
// document, un vrai clic souris est donc le seul geste fidèle.
console.log('chaîne :', await page.evaluate(() => document.elementFromPoint(800, 334)?.textContent.trim().slice(0, 40)))
await page.mouse.click(800, 334)
await page.waitForTimeout(7000)

console.log('écran :', await page.evaluate(() => document.querySelector('.entete-titre')?.textContent))
await page.mouse.move(700, 450)
await page.waitForTimeout(400)
await page.screenshot({ path: `captures/lect-${etiquette}.png` })

await voir('structure', () => {
  const G = window.__G
  return {
    racine: G(document.querySelector('main > div')),
    cadre: G(document.querySelector('video')?.parentElement),
    aside: G(document.querySelector('aside')),
  }
})

await voir('commandes', () => {
  const G = window.__G
  const ctl = document.querySelector('[data-role=commandes]')
  if (!ctl) return null
  return {
    enveloppe: G(ctl),
    barreBas: G(ctl.lastElementChild),
    boutons: [...ctl.querySelectorAll('button')].map((b) => {
      const r = b.getBoundingClientRect()
      return (b.getAttribute('aria-label') || '?') + ':' + Math.round(r.width) + 'x' + Math.round(r.height)
    }),
  }
})

console.log('\nlignes de zapping montées :', await page.evaluate(() => document.querySelectorAll('aside button[title]').length))

if (etiquette === 'avant') { await nav.close(); process.exit(0) }

// --- Erreur nommée (pas de décodeur H.264 ici) -------------------------
await voir('erreur / reconnexion', () => {
  const G = window.__G
  const r = document.querySelector('[data-role=reconnexion]')
  const e = document.querySelector('[role=alert]')
  return {
    reconnexion: r && { ...G(r), txt: r.textContent },
    erreur: e && { ...G(e), txt: e.textContent.slice(0, 180) },
  }
})
await page.screenshot({ path: 'captures/lect-apres-erreur.png' })

// --- Masquage automatique ----------------------------------------------
const jouer = () => page.evaluate(() => {
  const v = document.querySelector('video')
  Object.defineProperty(v, 'paused', { get: () => false, configurable: true })
  for (const n of ['loadeddata', 'playing', 'play']) v.dispatchEvent(new Event(n))
})
await jouer()
await page.waitForTimeout(700)
await voir('commandes dès la lecture', () => ({
  ctl: window.__G(document.querySelector('[data-role=commandes]')),
  erreurEffacee: !document.querySelector('[role=alert]'),
}))
await page.waitForTimeout(3300)
await voir('après 4,0 s sans geste', () => ({
  ctl: window.__G(document.querySelector('[data-role=commandes]')),
  curseur: getComputedStyle(document.querySelector('video').parentElement).cursor,
}))
await page.screenshot({ path: 'captures/lect-apres-masque.png' })

await page.mouse.move(600, 400); await page.mouse.move(700, 430)
await page.waitForTimeout(400)
await voir('réveil au mouvement', () => ({ ctl: window.__G(document.querySelector('[data-role=commandes]')) }))

// --- Mini-guide (G) -----------------------------------------------------
await page.keyboard.press('g')
await page.waitForTimeout(1800)
await voir('mini-guide (G)', () => {
  const G = window.__G
  const d = document.querySelector('[role=dialog][aria-label="Mini-guide"]')
  if (!d) return null
  const corps = d.lastElementChild
  return {
    dialog: G(d), entete: G(d.firstElementChild),
    ligne: G(corps.firstElementChild), nbLignes: corps.children.length,
    ctlRetenues: getComputedStyle(document.querySelector('[data-role=commandes]')).opacity,
  }
})
await page.screenshot({ path: 'captures/lect-apres-miniguide.png' })
await page.keyboard.press('Escape')
await page.waitForTimeout(500)
console.log('Échap ferme le mini-guide :', await page.evaluate(() => !document.querySelector('[role=dialog][aria-label="Mini-guide"]')))

// --- Panneau d'informations (I) ----------------------------------------
await page.keyboard.press('i')
await page.waitForTimeout(900)
await voir('panneau informations (I)', () => {
  const G = window.__G
  const d = document.querySelector('[role=dialog][aria-label="Informations sur la chaîne"]')
  if (!d) return null
  return {
    dialog: G(d), bloc: G(d.children[1]), pied: G(d.lastElementChild),
    coupeLaLecture: document.querySelector('video').paused,
  }
})
await page.screenshot({ path: 'captures/lect-apres-infos.png' })
await page.keyboard.press('Escape')
await page.waitForTimeout(500)

// --- Bandeau de changement de chaîne ------------------------------------
const avant = await titreLecteur()
await page.keyboard.press('ArrowDown')
// Sans décodeur H.264 l'erreur de format arrive en quelques centaines de ms et
// masque le bandeau, à juste titre : on rend d'abord la lecture crédible.
await page.waitForTimeout(500)
await jouer()
await page.waitForTimeout(300)
await voir('bandeau après zap (↓)', () => {
  const d = document.querySelector('[data-role=bandeau-chaine]')
  return d && { ...window.__G(d), txt: d.textContent.slice(0, 60) }
})
await page.screenshot({ path: 'captures/lect-apres-bandeau.png' })
console.log('zap :', avant, '→', await titreLecteur())
console.log('notification au zap (aucune attendue) :', await page.evaluate(() => !!document.querySelector('[data-role=notification]')))
await page.waitForTimeout(3000)
console.log('bandeau encore là après 4,0 s :', await page.evaluate(() => !!document.querySelector('[data-role=bandeau-chaine]')))

// --- R : dernière chaîne · PageDown ------------------------------------
await page.keyboard.press('r')
await page.waitForTimeout(1500)
console.log('R ramène à :', await titreLecteur())
await page.keyboard.press('PageDown')
await page.waitForTimeout(1500)
console.log('PageDown mène à :', await titreLecteur())

// --- Mini-lecteur : quitter l'écran sans couper le flux -----------------
await jouer()
await allerA('Accueil')
await page.waitForTimeout(1500)
await voir('mini-lecteur', () => {
  const G = window.__G
  const d = document.querySelector('[data-role=mini-lecteur]')
  if (!d) return null
  return {
    mini: G(d), jauge: G(d.children[1]), barre: G(d.lastElementChild),
    boutons: [...d.querySelectorAll('button')].map((b) => (b.getAttribute('aria-label') || '?') + ':' + Math.round(b.getBoundingClientRect().width)),
    fluxVivant: document.querySelectorAll('video').length === 1 && !document.querySelector('video').paused,
  }
})
await page.screenshot({ path: 'captures/lect-apres-mini.png' })

const revenir = () => page.evaluate(() => document.querySelector('[data-role=mini-lecteur] button[aria-label="Revenir au lecteur"]')?.click())
await revenir()
await page.waitForTimeout(1200)
console.log('retour au lecteur :', await page.evaluate(() => document.querySelector('.entete-titre')?.textContent))
await page.keyboard.press('Escape')
await page.waitForTimeout(1200)
console.log('Échap → écran', await page.evaluate(() => document.querySelector('.entete-titre')?.textContent),
  '· mini-lecteur :', await page.evaluate(() => !!document.querySelector('[data-role=mini-lecteur]')),
  '· vidéo montée :', await page.evaluate(() => document.querySelectorAll('video').length))

// --- Notification « un seul flux » : lancer un film coupe la chaîne -----
await allerA('Films')
await page.waitForTimeout(3500)
for (const [x, y] of [[700, 320], [400, 300], [700, 450]]) {
  const sous = await page.evaluate(([a, b]) => document.elementFromPoint(a, b)?.closest('div,button')?.textContent.trim().slice(0, 36), [x, y])
  await page.mouse.click(x, y)
  await page.waitForTimeout(2000)
  const ecr = await page.evaluate(() => document.querySelector('.entete-titre')?.textContent)
  console.log('clic', x, y, '→', ecr, '|', sous)
  if (ecr === 'Film') break
}
await page.waitForTimeout(1500)
await voir('notification « un seul flux »', () => {
  const d = document.querySelector('[data-role=notification]')
  return d && { ...window.__G(d), txt: d.textContent }
})
await page.screenshot({ path: 'captures/lect-apres-notification.png' })

// --- Reprise proposée au-delà de 60 s -----------------------------------
// On écrit une position dans IndexedDB pour le film ouvert, puis on le
// rouvre : c'est exactement ce que fait une session précédente.
const titreFilm = await titreLecteur()
const cle = await page.evaluate((nom) => new Promise((res) => {
  const o = indexedDB.open('mytv')
  o.onsuccess = () => {
    const db = o.result
    const tx = db.transaction(['catalogue', 'reprises'], 'readwrite')
    const req = tx.objectStore('catalogue').index('nom').getAll(nom)
    req.onsuccess = () => {
      const e = req.result.find((x) => x.type === 'vod') ?? req.result[0]
      if (e) tx.objectStore('reprises').put({ cle: e.cle, position: 420, duree: 5400, vuLe: Date.now() })
      tx.oncomplete = () => res(e?.cle ?? null)
    }
  }
}), titreFilm)
console.log('reprise écrite pour', titreFilm, '→', cle)
// Détour par un autre film : rouvrir la MÊME entrée ne relance rien, la coque
// repose la même référence et l'effet de source ne se redéclenche pas.
await allerA('Films'); await page.waitForTimeout(3000)
await page.mouse.click(900, 320); await page.waitForTimeout(2500)
await allerA('Films'); await page.waitForTimeout(3000)
await page.mouse.click(700, 320)
await page.waitForTimeout(3000)
console.log('film rouvert :', await titreLecteur())
await jouer()
await page.waitForTimeout(400)
await voir('reprise proposée (> 60 s)', () => {
  const d = document.querySelector('[data-role=reprise]')
  return d && { ...window.__G(d), txt: d.textContent }
})
await page.screenshot({ path: 'captures/lect-apres-reprise.png' })

// --- Fermer depuis le mini-lecteur arrête vraiment ----------------------
await allerA('Accueil')
await page.waitForTimeout(1200)
await page.evaluate(() => document.querySelector('[data-role=mini-lecteur] button[aria-label="Fermer la lecture"]')?.click())
await page.waitForTimeout(1200)
console.log('après « Fermer » du mini-lecteur · vidéos montées :',
  await page.evaluate(() => document.querySelectorAll('video').length),
  '· mini-lecteur :', await page.evaluate(() => !!document.querySelector('[data-role=mini-lecteur]')))

await nav.close()
