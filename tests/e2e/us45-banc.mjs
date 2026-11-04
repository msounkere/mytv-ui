// Banc des parcours US-45 (lot 10, ui-6) : application COMPLETE (`dist`) contre
// le faux serveur `serveur-factice.mjs`, navigateur verrouille sur 127.0.0.1,
// trois moteurs (chromium, firefox, webkit). Base reprise des scripts d'audit
// B/commun.mjs, D/zombie.mjs et C/commun.mjs, adaptes en verifications.
//   NAVIGATEURS=chromium,firefox,webkit  (defaut : les trois)
//   GABARIT=bureau|mobile|paysage        (defaut : bureau ; `scenario` peut l'imposer)
import { chromium, firefox, webkit } from 'playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { demarrerServeurFactice, COMPTE, MOT_DE_PASSE } from './serveur-factice.mjs'

export const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist')
export const TAILLE = { chaines: 20, films: 30, series: 6, variantes: 3 }
export const MOTEURS = { chromium, firefox, webkit }

export const VIEWPORTS = {
  bureau: { viewport: { width: 1360, height: 860 } },
  mobile: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
  paysage: { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true },
  tablette: { viewport: { width: 768, height: 1024 }, hasTouch: true, isMobile: true },
}

export const pause = (ms) => new Promise((r) => setTimeout(r, ms))

export async function attendre(condition, { delai = 15_000, pas = 100, quoi = 'condition' } = {}) {
  const debut = Date.now()
  for (;;) {
    const v = await condition()
    if (v) return v
    if (Date.now() - debut > delai) throw new Error(`delai depasse : ${quoi}`)
    await pause(pas)
  }
}

export function moteursDemandes() {
  return (process.env.NAVIGATEURS ?? 'chromium,firefox,webkit').split(',').map((s) => s.trim()).filter(Boolean)
}

export async function lancer(nom) {
  if (nom === 'firefox') return firefox.launch({ firefoxUserPrefs: { 'media.autoplay.default': 0, 'media.autoplay.blocking_policy': 0 } })
  if (nom === 'webkit') return webkit.launch()
  return chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
}

export function creerVerificateur(nom) {
  const echecs = []
  let n = 0
  return {
    ok(condition, message) {
      n += 1
      if (condition) console.log(`  ok   ${message}`)
      else {
        echecs.push(message)
        console.log(`  ECHEC ${message}`)
      }
    },
    info(message) {
      console.log(`  ..   ${message}`)
    },
    echecs,
    termine() {
      console.log(`${nom} : ${n - echecs.length}/${n} verifications`)
      if (echecs.length) process.exitCode = 1
    },
  }
}

/**
 * Ouvre une session complete : faux serveur, contexte, connexion, profil « Salon »,
 * import du catalogue. `moteur` : nom ('chromium'|'firefox'|'webkit') ; `gabarit` :
 * cle de VIEWPORTS ; `scripts` : init scripts (doublures d'API).
 */
export async function ouvrirSession({ navigateur, moteur, gabarit = 'bureau', scripts = [], taille = TAILLE }) {
  const serveur = await demarrerServeurFactice({ dist: DIST, taille })
  const g = VIEWPORTS[gabarit]
  // Firefox refuse `isMobile` ; le tactile seul y suffit.
  const options = { ...g, locale: 'fr-FR', timezoneId: 'Europe/Paris', ...(moteur === 'firefox' ? { isMobile: undefined } : {}) }
  if (moteur === 'firefox') delete options.isMobile
  const ctx = await navigateur.newContext(options)
  const violations = []
  await ctx.route('**/*', (route) => {
    const u = new URL(route.request().url())
    if (u.hostname === '127.0.0.1' || u.protocol === 'data:' || u.protocol === 'blob:') return route.continue()
    violations.push(route.request().url())
    return route.abort()
  })
  ctx.setDefaultTimeout(30_000)
  const page = await ctx.newPage()
  const erreurs = []
  // « ResizeObserver loop » (WebKit, D17) vient des grilles de la coque (perimetre ui-8, US-47 CA6) : hors sujet ici.
  // « due to access control checks » : WebKit remonte en erreur de page les requetes `fetch` que la navigation
  // suivante (page.goto) interrompt -- un artefact du banc, pas une erreur de l'interface.
  page.on('pageerror', (e) => { if (!/ResizeObserver loop|due to access control checks/.test(e.message)) erreurs.push(e.message) })
  let plante = false
  page.on('crash', () => { plante = true })
  await page.addInitScript(() => { window.__session = 0; window.addEventListener('mytv:session-expiree', () => (window.__session += 1)) })
  // Firefox sans carte son (headless) leve une MediaError 3 des que le son
  // demarre : on lit muet (voir banc.mjs).
  if (moteur === 'firefox')
    await page.addInitScript(() => {
      const lire = HTMLMediaElement.prototype.play
      HTMLMediaElement.prototype.play = function () { this.muted = true; return lire.call(this) }
    })
  for (const s of scripts) await page.addInitScript(s)

  const idb = (table, cle) => page.evaluate(([t, c]) => new Promise((ok, ko) => {
    const r = indexedDB.open('mytv')
    r.onerror = () => ko(r.error)
    r.onsuccess = () => {
      const d = r.result
      if (!d.objectStoreNames.contains(t)) { d.close(); return ok(undefined) }
      const st = d.transaction(t).objectStore(t)
      const q = c === undefined ? st.getAll() : st.get(c)
      q.onsuccess = () => { d.close(); ok(q.result) }
      q.onerror = () => { d.close(); ko(q.error) }
    }
  }), [table, cle])
  const idbPut = (table, obj) => page.evaluate(([t, o]) => new Promise((ok, ko) => {
    const r = indexedDB.open('mytv')
    r.onerror = () => ko(r.error)
    r.onsuccess = () => {
      const d = r.result
      const tx = d.transaction(t, 'readwrite')
      tx.objectStore(t).put(o)
      tx.oncomplete = () => { d.close(); ok(true) }
      tx.onerror = () => { d.close(); ko(tx.error) }
    }
  }), [table, obj])

  await page.goto(`${serveur.origine}/`)
  await page.getByLabel('Identifiant').fill(COMPTE)
  await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await page.getByPlaceholder('Nom du profil').fill('Salon')
  await page.getByRole('button', { name: 'Créer et utiliser' }).click()
  await attendre(async () => (await idb('reglages', 'catalogue.version'))?.valeur === serveur.etat.version, { delai: 40_000, quoi: 'import du catalogue' })
  const profil = serveur.etat.profils[0].id

  const video = () => page.evaluate(() => {
    const v = document.querySelector('video')
    return v ? { t: v.currentTime, d: v.duration, paused: v.paused, muted: v.muted, src: v.getAttribute('src'), currentSrc: v.currentSrc, ended: v.ended, ready: v.readyState } : null
  })
  /** Videos encore attachees a une source, dans tout le document. */
  const videosAvecSource = () => page.evaluate(() => Array.from(document.querySelectorAll('video')).filter((v) => v.getAttribute('src') || v.currentSrc).length)
  const etatCouche = () => page.evaluate(() => {
    const c = document.querySelector('.couche-lecteur')
    if (!c) return { presente: false }
    const cs = getComputedStyle(c)
    return { presente: true, visible: cs.visibility === 'visible' && cs.opacity !== '0', video: !!c.querySelector('video') }
  })
  const reveil = async () => {
    const w = g.viewport.width
    if (g.hasTouch) await page.touchscreen.tap(w / 2, 60)
    else await page.mouse.move(w / 2, 100)
    await pause(200)
  }

  return {
    serveur, ctx, page, profil, erreurs, violations, idb, idbPut, video, videosAvecSource, etatCouche, reveil,
    plante: () => plante,
    chemin: () => page.evaluate(() => location.pathname + location.search),
    requetes: (f) => serveur.etat.requetes.filter(f),
    evenements: (type) => serveur.etat.evenements.filter((e) => e.type === type),
    commandes: () => page.locator('[data-role="commandes"]'),
    rail: (nom) => page.locator('nav.rail').getByRole('button', { name: nom, exact: true }),
    async ouvrirLecture(cle) {
      await page.goto(`${serveur.origine}/lecture/${cle}`)
      await page.locator('[data-role="commandes"]').waitFor({ state: 'attached' })
      await page.waitForFunction(() => (document.querySelector('video')?.readyState ?? 0) >= 1, null, { timeout: 20_000 })
    },
    async fermer() {
      await ctx.close().catch(() => {})
      await serveur.fermer().catch(() => {})
    },
  }
}
