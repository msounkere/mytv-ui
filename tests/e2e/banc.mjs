// Banc commun des parcours : faux serveur + page d'essai + navigateur verrouille
// sur 127.0.0.1. Toute requete vers un autre hote est BLOQUEE et comptee ; un
// parcours qui en provoque une echoue. Les navigateurs sont toujours fermes.
import { chromium, firefox } from 'playwright'
import { build } from 'vite'
import { fileURLToPath } from 'node:url'
import { demarrerServeur } from './serveur-fictif.mjs'

const ici = fileURLToPath(new URL('.', import.meta.url))
export const DIST_HARNAIS = ici + '.dist-harnais'

/** Construit la page d'essai (une seconde environ). */
export async function construireHarnais() {
  await build({ configFile: ici + 'vite.harnais.config.ts', logLevel: 'error' })
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
    termine() {
      console.log(`${nom} : ${n - echecs.length}/${n} verifications`)
      if (echecs.length) process.exitCode = 1
    },
  }
}

export const attendre = (ms) => new Promise((r) => setTimeout(r, ms))

/** Attend qu'une condition devienne vraie (ou renvoie faux apres le delai). */
export async function jusqua(condition, delaiMs = 10_000, pasMs = 100) {
  const fin = Date.now() + delaiMs
  while (Date.now() < fin) {
    if (await condition()) return true
    await attendre(pasMs)
  }
  return false
}

/**
 * @param {{ ecran: 'lecture'|'guide', timezoneId?: string, locale?: string, limites?: object,
 *           scripts?: Array<() => void> }} opts  `scripts` : poses avant le chargement de la page
 *           (doublures d'API du navigateur, compteurs).
 */
export async function ouvrirBanc(opts) {
  const serveur = await demarrerServeur({ dossier: DIST_HARNAIS, limites: opts.limites })
  // NAVIGATEUR=firefox rejoue le meme parcours sur Firefox : le spectateur s'en
  // sert, et le decodage (MSE, autoplay) y differe de Chromium.
  const navigateur =
    process.env.NAVIGATEUR === 'firefox'
      ? await firefox.launch({ firefoxUserPrefs: { 'media.autoplay.default': 0, 'media.autoplay.blocking_policy': 0 } })
      : await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
  const contexte = await navigateur.newContext({
    viewport: { width: 1440, height: 900 },
    timezoneId: opts.timezoneId ?? 'Europe/Paris',
    locale: opts.locale ?? 'fr-FR',
  })
  /** Requetes refusees parce qu'elles sortaient de 127.0.0.1. */
  const externes = []
  await contexte.route('**/*', (route) => {
    const u = new URL(route.request().url())
    if (u.protocol === 'data:' || u.protocol === 'blob:' || u.hostname === '127.0.0.1') return route.continue()
    externes.push(route.request().url())
    return route.abort()
  })
  const page = await contexte.newPage()
  const erreursPage = []
  page.on('pageerror', (e) => erreursPage.push(e.message))
  // Compteurs poses AVANT le chargement de la page.
  await page.addInitScript(() => {
    window.__session = 0
    window.addEventListener('mytv:session-expiree', () => (window.__session += 1))
  })
  // Firefox sans carte son (headless) leve OnMediaSinkAudioError (MediaError 3)
  // des que le son demarre, et le lecteur y voit un format illisible. Aucune
  // preference (cubeb nul, decodeur blank) ne l'evite : on lit muet. Le son
  // n'est verifie par aucun parcours.
  if (process.env.NAVIGATEUR === 'firefox')
    await page.addInitScript(() => {
      const lire = HTMLMediaElement.prototype.play
      HTMLMediaElement.prototype.play = function () { this.muted = true; return lire.call(this) }
    })
  for (const s of opts.scripts ?? []) await page.addInitScript(s)
  await page.goto(`${serveur.origine}/index.html?ecran=${opts.ecran}`)
  await page.waitForFunction(() => !!window.harnais)

  return {
    page, serveur, externes, erreursPage,
    /** Requetes de l'API recues par le faux serveur, filtrables. */
    api: (filtre = () => true) => serveur.journal().filter((r) => r.chemin.startsWith('/api/v1/') && filtre(r)),
    async fermer() {
      try {
        await contexte.close()
      } finally {
        await navigateur.close()
        await serveur.fermer()
      }
    },
  }
}

/** Entree de catalogue factice, a la forme que lit le lecteur. */
export function chaine(numero, extra = {}) {
  return {
    cle: `live:${numero}`, type: 'live', id: numero, nom: `Chaine ${numero}`,
    recherche: `chaine ${numero}`, categorie: 'c1',
    idServeur: `iptva:${numero}`, lecture: `/api/v1/live/${numero}.m3u8`, epgId: `e${numero}`,
    ...extra,
  }
}

export function film(numero, extra = {}) {
  return {
    cle: `vod:${numero}`, type: 'vod', id: numero, nom: `Film ${numero}`,
    recherche: `film ${numero}`, categorie: 'v1', extension: 'mkv',
    idServeur: `iptva:${numero}`, lecture: `/api/v1/vod/iptva:${numero}`,
    ...extra,
  }
}
