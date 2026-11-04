// Banc commun des parcours US-47 (lot 10, ui-8) : derive du harnais du relecteur A
// (/opt/mytv-work/audit/A/commun.mjs). Faux serveur + navigateur verrouille sur
// 127.0.0.1 ; l'EPG, absent de serveur-factice.mjs, est servi par interception au
// format de serveur-fictif.mjs ; le direct (playlist + segments) peut l'etre aussi.
// Aucun vrai fournisseur, aucun vrai flux. Moteur : NAVIGATEUR=chromium|firefox|webkit.
import { chromium, firefox, webkit } from 'playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { demarrerServeurFactice, COMPTE, MOT_DE_PASSE } from './serveur-factice.mjs'
import { creerVerificateur, jusqua, attendre } from './banc.mjs'

export { COMPTE, MOT_DE_PASSE, creerVerificateur, jusqua, attendre }
export const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist')
export const MOTEURS = { chromium, firefox, webkit }
export const NAVIGATEUR = process.env.NAVIGATEUR ?? 'chromium'

export const GABARITS = {
  bureau: { width: 1360, height: 860, tactile: false },
  tablette: { width: 768, height: 1024, tactile: true },
  telephone: { width: 390, height: 844, tactile: true },
  paysage: { width: 844, height: 390, tactile: true },
  etroit: { width: 320, height: 568, tactile: true },
}

/** Grille EPG factice : un programme par demi-heure. */
function grille(ids, de, a) {
  const out = {}
  const titres = ['Journal', 'Film du soir', 'Série policière', 'Documentaire nature', 'Magazine', 'Sport en direct', 'Dessins animés', 'Météo']
  for (const id of ids) {
    const liste = []
    const n = Number(id.replace(/\D/g, '')) || 0
    for (let t = Math.floor(de / 1_800_000) * 1_800_000; t < a; t += 1_800_000) {
      if (t + 1_800_000 <= de) continue
      const k = (Math.floor(t / 1_800_000) + n) % titres.length
      liste.push({ debut: new Date(t).toISOString(), fin: new Date(t + 1_800_000).toISOString(), titre: `${titres[k]} ${id.slice(-3)}`, description: `Description du programme ${titres[k]} sur ${id}.` })
    }
    out[id] = liste
  }
  return out
}

/**
 * @param {{ taille?: object, gabarit?: keyof typeof GABARITS, sansEpg?: boolean, epgStatut?: number,
 *           moteur?: string, zoom?: number, scripts?: Array<() => void> }} o
 */
export async function demarrer({ taille = { chaines: 40, films: 60, series: 12, variantes: 3 }, gabarit = 'bureau', sansEpg = false, moteur = NAVIGATEUR, zoom, scripts = [] } = {}) {
  const serveur = await demarrerServeurFactice({ dist: DIST, taille })
  const navigateur = await MOTEURS[moteur].launch()
  const g = GABARITS[gabarit]
  const externes = []
  const options = {
    viewport: { width: g.width, height: g.height },
    hasTouch: g.tactile,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
  }
  // Firefox refuse `isMobile` ; les autres moteurs emulent le telephone avec.
  if (moteur !== 'firefox' && g.tactile) options.isMobile = true
  const ctx = await navigateur.newContext(options)
  /** Statut impose aux appels du guide (`null` : grille factice servie). */
  const etatEpg = { statut: null }
  const epgAppels = []
  await ctx.route('**/*', (route) => {
    const u = new URL(route.request().url())
    if (u.protocol === 'data:' || u.protocol === 'blob:') return route.continue()
    if (u.hostname !== '127.0.0.1') { externes.push(route.request().url()); return route.abort() }
    if (!sansEpg && u.pathname === '/api/v1/epg/grille') {
      epgAppels.push(u.search)
      if (etatEpg.statut) return route.fulfill({ status: etatEpg.statut, contentType: 'application/json', body: '{"code":"erreur_test"}' })
      const ids = (u.searchParams.get('chaines') ?? '').split(',').filter(Boolean)
      const de = Date.parse(u.searchParams.get('de') ?? '')
      const a = Date.parse(u.searchParams.get('a') ?? '')
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ chaines: grille(ids, de, a) }) })
    }
    const m = /^\/api\/v1\/epg\/chaines\/([^/]+)\/maintenant$/.exec(u.pathname)
    if (!sansEpg && m) {
      if (etatEpg.statut) return route.fulfill({ status: etatEpg.statut, contentType: 'application/json', body: '{"code":"erreur_test"}' })
      const t = Math.floor(Date.now() / 1_800_000) * 1_800_000
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        courant: { debut: new Date(t).toISOString(), fin: new Date(t + 1_800_000).toISOString(), titre: `Journal ${m[1]}` },
        suivant: { debut: new Date(t + 1_800_000).toISOString(), fin: new Date(t + 3_600_000).toISOString(), titre: `Film ${m[1]}` },
      }) })
    }
    return route.continue()
  })
  ctx.setDefaultTimeout(15_000)
  if (zoom) await ctx.addInitScript((z) => { document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.zoom = String(z) }) }, zoom)
  for (const s of scripts) await ctx.addInitScript(s)
  const page = await ctx.newPage()
  const erreurs = []
  const console_ = []
  page.on('pageerror', (e) => erreurs.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console_.push(`${m.type()}: ${m.text().slice(0, 300)}`) })
  const dialogues = []
  page.on('dialog', async (d) => { dialogues.push(`${d.type()}: ${d.message()}`); await d.accept() })
  const fermer = async () => {
    await navigateur.close().catch(() => {})
    await serveur.fermer().catch(() => {})
  }
  return { serveur, navigateur, ctx, page, erreurs, console: console_, dialogues, externes, epgAppels, etatEpg, fermer, gabarit, moteur }
}

export async function seConnecter(b, { profil = 'Salon', creer = true } = {}) {
  const { page, serveur } = b
  await page.goto(`${serveur.origine}/`)
  await page.getByLabel('Identifiant').fill(COMPTE)
  await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  if (creer) {
    await page.getByPlaceholder('Nom du profil').fill(profil)
    await page.getByRole('button', { name: 'Créer et utiliser' }).click()
  }
}

export const lireIdb = (page, table, cle) =>
  page.evaluate(([t, c]) => new Promise((ok, ko) => {
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

export const compterIdb = (page, table) =>
  page.evaluate((t) => new Promise((ok, ko) => {
    const r = indexedDB.open('mytv')
    r.onerror = () => ko(r.error)
    r.onsuccess = () => {
      const base = r.result
      if (!base.objectStoreNames.contains(t)) { base.close(); return ok(0) }
      const q = base.transaction(t).objectStore(t).count()
      q.onsuccess = () => { base.close(); ok(q.result) }
      q.onerror = () => { base.close(); ko(q.error) }
    }
  }), table)

export async function attendreCatalogue(b, delai = 40_000) {
  const c = b.serveur.etat.catalogue
  const total = c.live.length + c.vod.length + c.series.length
  return jusqua(async () => (await compterIdb(b.page, 'catalogue')) === total, delai, 300)
}

/** Connexion + catalogue importe : le point de depart de presque tous les parcours. */
export async function ouvrirSession(b, o) {
  await seConnecter(b, o)
  if (!(await attendreCatalogue(b))) throw new Error('catalogue non importe')
}

export const texte = async (loc) => (await loc.first().innerText().catch(() => '')) || ''
export const chemin = (page) => page.evaluate(() => location.pathname + location.search)

export const actif = (page) => page.evaluate(() => {
  const e = document.activeElement
  if (!e || e === document.body) return 'body'
  return `${e.tagName.toLowerCase()} « ${(e.getAttribute('aria-label') || e.textContent || e.value || '').trim().slice(0, 50)} »`
})

/** Rectangle d'un element, arrondi. */
export const rect = (loc) => loc.first().evaluate((el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } })

/** Elements interactifs visibles plus petits que `mini` px dans la fenetre (audit D). */
export const ciblesPetites = (page, mini = 44, racine = 'body') => page.evaluate(([m, sel]) => {
  const vw = innerWidth, vh = innerHeight
  const visible = (el) => {
    try { if (!el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) return false } catch { /* ancien moteur */ }
    const r = el.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) return false
    for (let a = el; a; a = a.parentElement) {
      if (a.getAttribute('aria-hidden') === 'true') return false
      const cs = getComputedStyle(a)
      if (cs.opacity === '0' || cs.visibility === 'hidden') return false
    }
    return true
  }
  const out = []
  for (const el of document.querySelector(sel)?.querySelectorAll('button, a[href], input:not([type=range]), select, [role="button"], [role="tab"], [role="radio"], [role="menuitem"]') ?? []) {
    if (!visible(el)) continue
    const r = el.getBoundingClientRect()
    if (r.top > vh || r.bottom < 0 || r.left > vw || r.right < 0) continue
    if (r.width < m - 0.5 || r.height < m - 0.5) out.push(`${el.tagName.toLowerCase()}:${(el.getAttribute('aria-label') || el.textContent || el.placeholder || '').trim().slice(0, 30)} ${Math.round(r.width)}x${Math.round(r.height)}`)
  }
  return out
}, [mini, racine])

/** Debordement horizontal du document ou d'un element. */
export const deborde = (page, sel = 'html') => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.scrollWidth > e.clientWidth + 1 : false }, sel)

/**
 * Sert le direct par interception (playlist HLS + segments TS factices de
 * media.mjs), comme l'audit A : le faux serveur n'a pas de HLS, et sans flux le
 * lecteur n'affiche que son erreur. Aucun vrai flux.
 */
export async function servirDirect(b) {
  const { segmentTs } = await import('./media.mjs')
  const playlist = (chaine) => ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-TARGETDURATION:2', '#EXT-X-MEDIA-SEQUENCE:0',
    ...Array.from({ length: 6 }, (_, i) => `#EXTINF:2.000,\n/api/v1/live/${chaine}/seg/jeton${i}`), '#EXT-X-ENDLIST'].join('\n') + '\n'
  const demandes = []
  await b.ctx.route(/\/api\/v1\/live\//, (route) => {
    const u = new URL(route.request().url())
    demandes.push(u.pathname)
    let m = /^\/api\/v1\/live\/([^/]+)\.m3u8$/.exec(u.pathname)
    if (m) return route.fulfill({ status: 200, contentType: 'application/vnd.apple.mpegurl', body: playlist(m[1]) })
    m = /^\/api\/v1\/live\/([^/]+)\/seg\/jeton(\d+)$/.exec(u.pathname)
    if (m) return route.fulfill({ status: 200, contentType: 'video/mp2t', body: segmentTs(Number(m[2]), 2) })
    if (/\/fin$/.test(u.pathname)) return route.fulfill({ status: 204 })
    return route.continue()
  })
  return demandes
}
