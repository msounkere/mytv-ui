// US-28 : synopsis, genre, duree, casting, realisateur, bande-annonce, image de fond
// dans « A la une », la fiche film, la fiche serie (et ses episodes), contre le faux
// serveur (serveur-factice.mjs). Aucun vrai fournisseur : les « details » sont des
// reponses fabriquees de GET /films/{id} et /series/{id}.
//
// REGLES : aucune requete hors 127.0.0.1. Usage : npm run build && node tests/e2e/us28.mjs [scenario ...]
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { demarrerServeurFactice, COMPTE, MOT_DE_PASSE } from './serveur-factice.mjs'

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist')
const violations = []

async function contexte(navigateur, largeur = 1360) {
  const ctx = await navigateur.newContext({ viewport: { width: largeur, height: 860 }, locale: 'fr-FR' })
  await ctx.route('**/*', (route) => {
    const u = new URL(route.request().url())
    if (u.hostname === '127.0.0.1' || u.protocol === 'data:' || u.protocol === 'blob:') return route.continue()
    violations.push(route.request().url())
    return route.abort()
  })
  ctx.setDefaultTimeout(30_000)
  return ctx
}

async function attendre(condition, { delai = 15_000, pas = 100, quoi = 'condition' } = {}) {
  const debut = Date.now()
  for (;;) {
    const v = await condition()
    if (v) return v
    if (Date.now() - debut > delai) throw new Error(`delai depasse : ${quoi}`)
    await new Promise((r) => setTimeout(r, pas))
  }
}

const lireVersionImport = (page) =>
  page.evaluate(() => new Promise((ok) => {
    const r = indexedDB.open('mytv')
    r.onerror = () => ok(undefined)
    r.onsuccess = () => {
      const d = r.result
      if (!d.objectStoreNames.contains('reglages')) { d.close(); return ok(undefined) }
      const q = d.transaction('reglages').objectStore('reglages').get('catalogue.version')
      q.onsuccess = () => { d.close(); ok(q.result?.valeur) }
      q.onerror = () => { d.close(); ok(undefined) }
    }
  }))

async function scenario(navigateur, options, corps) {
  const serveur = await demarrerServeurFactice({ dist: DIST, ...options })
  const ctx = await contexte(navigateur, options.largeur)
  try {
    const page = await ctx.newPage()
    const erreurs = []
    page.on('pageerror', (e) => erreurs.push(e.message))
    await page.goto(`${serveur.origine}/`)
    await page.getByLabel('Identifiant').fill(COMPTE)
    await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE)
    await page.getByRole('button', { name: 'Se connecter' }).click()
    await page.getByPlaceholder('Nom du profil').fill('Salon')
    await page.getByRole('button', { name: 'Créer et utiliser' }).click()
    // Premier import termine, puis rechargement : « A la une » peut sinon rester vide si elle
    // a lu le catalogue en cours d'import (course connue de l'Accueil, sans rapport avec les details).
    await attendre(async () => (await lireVersionImport(page)) === serveur.etat.version, { quoi: 'import du catalogue' })
    await page.reload()
    await corps({ serveur, page, ctx })
    assert.deepEqual(erreurs, [], `erreurs de page : ${erreurs.join(' | ')}`)
  } finally {
    await ctx.close()
    await serveur.fermer()
  }
}

/** Requetes de details (fiche), pas les saisons ni les listes. */
const appelsDetails = (serveur) => serveur.etat.requetes.filter((r) => /^\/api\/v1\/(films|series)\/[^/]+$/.test(r.chemin))
const uneLaUne = (page) => page.locator('section[aria-label="À la une"]')
const resume = (page) => page.locator('[data-role="resume"]')

const SCENARIOS = {
  // CA5 : A la une montre synopsis, genre, duree, casting, realisateur, bande-annonce ;
  // la demande ne part que pour le contenu AFFICHE, apres un court delai.
  async aLaUne(navigateur) {
    await scenario(navigateur, {}, async ({ serveur, page }) => {
      await serveur.appel('details', { id: '*', reglage: { latence: 700 } })
      const bandeau = uneLaUne(page)
      await bandeau.waitFor()
      // Etat de chargement : un squelette, pas un blanc.
      await bandeau.locator('[data-role="resume"][data-etat="chargement"]').waitFor()
      await bandeau.locator('[data-role="resume"][data-etat="pret"]').waitFor()
      const texte = await bandeau.innerText()
      assert.match(texte, /Synopsis de /, 'synopsis')
      assert.match(texte, /Drame, Thriller/, 'genre')
      assert.match(texte, /1 h 40/, 'duree')
      assert.match(texte, /2019/, 'annee de sortie')
      assert.match(texte, /De Denis Lefevre · Avec Alice Martin, Bruno Durand/, 'realisateur et casting')
      const lien = bandeau.locator('a[data-role="bande-annonce"]')
      assert.equal(await lien.getAttribute('href'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
      assert.equal(await lien.getAttribute('target'), '_blank')
      assert.match((await lien.getAttribute('rel')) ?? '', /noopener/)
      // Une seule demande : le contenu affiche, pas les cinq de la rangee ni les listes.
      assert.equal(appelsDetails(serveur).length, 1, `${appelsDetails(serveur).length} appels pour un encart`)
    })
  },

  // CA5 : pas de rafale — cliquer vite sur les pastilles ne demande que la derniere vignette ;
  // revenir sur une vignette deja vue ne redemande rien ; changer d'ecran non plus.
  async pasDeRafale(navigateur) {
    await scenario(navigateur, {}, async ({ serveur, page }) => {
      const bandeau = uneLaUne(page)
      await bandeau.waitFor()
      await bandeau.locator('[data-role="resume"][data-etat="pret"]').waitFor()
      assert.equal(appelsDetails(serveur).length, 1)
      const suivant = bandeau.getByRole('button', { name: 'Contenu suivant' })
      for (let i = 0; i < 3; i++) await suivant.click({ delay: 0 })
      await attendre(() => appelsDetails(serveur).length >= 2, { quoi: 'demande de la vignette atteinte' })
      await page.waitForTimeout(900)
      // 3 clics en rafale => UNE demande de plus (la vignette ou l'on s'arrete), pas trois.
      assert.equal(appelsDetails(serveur).length, 2, `${appelsDetails(serveur).length} appels apres 3 clics rapides`)
      // Retour sur la premiere vignette : deja en cache.
      for (let i = 0; i < 2; i++) await bandeau.getByRole('button', { name: 'Contenu précédent' }).click()
      await page.waitForTimeout(900)
      assert.ok(appelsDetails(serveur).length <= 3, `${appelsDetails(serveur).length} appels apres retour`)
      const avant = appelsDetails(serveur).length
      // Parcourir les listes ne declenche AUCUN appel de details.
      await page.getByRole('button', { name: 'Films' }).first().click()
      await page.waitForTimeout(1200)
      await page.getByRole('button', { name: 'Séries' }).first().click()
      await page.waitForTimeout(1200)
      assert.equal(appelsDetails(serveur).length, avant, 'une liste a demande des details')
    })
  },

  // CA5 : le service ne repond pas -> message clair + « Reessayer », l'encart reste utilisable ;
  // contenu sans fiche -> « Pas de resume disponible ».
  async indisponibleEtAbsent(navigateur) {
    await scenario(navigateur, {}, async ({ serveur, page }) => {
      await serveur.appel('details', { id: '*', reglage: { statut: 502 } })
      const bandeau = uneLaUne(page)
      await bandeau.waitFor()
      const r = bandeau.locator('[data-role="resume"][data-etat="indisponible"]')
      await r.waitFor()
      assert.match(await r.innerText(), /momentanément indisponible/)
      // L'encart reste utilisable : titre, boutons, pastilles.
      assert.ok(await bandeau.getByRole('button', { name: 'Regarder' }).isVisible())
      await serveur.appel('details-effacer')
      await r.getByRole('button', { name: 'Réessayer' }).click()
      await bandeau.locator('[data-role="resume"][data-etat="pret"]').waitFor()

      // Absent : le fournisseur n'a pas de fiche.
      await serveur.appel('details', { id: '*', reglage: { statutDetails: 'absent' } })
      await bandeau.getByRole('button', { name: 'Contenu suivant' }).click()
      await bandeau.locator('[data-role="resume"][data-etat="absent"]').waitFor()
      assert.match(await bandeau.innerText(), /Pas de résumé disponible/)
    })
  },

  // CA5 : fiche film — demandee a l'ouverture, une seule fois ; chargement, details, retour.
  async ficheFilm(navigateur) {
    await scenario(navigateur, {}, async ({ serveur, page }) => {
      await uneLaUne(page).waitFor()
      await serveur.appel('vider-requetes')
      await serveur.appel('details', { id: 'iptva:5003', reglage: { latence: 600 } })
      await page.goto(`${serveur.origine}/film/vod:iptva:5003`)
      const fiche = page.locator('[data-role="fiche-film"]')
      await fiche.waitFor()
      await fiche.locator('[data-role="resume"][data-etat="chargement"]').waitFor()
      await fiche.locator('[data-role="resume"][data-etat="pret"]').waitFor()
      const t = await fiche.innerText()
      assert.match(t, /Film Test 3/, 'titre')
      assert.match(t, /Synopsis de Film Test 3/, 'synopsis')
      assert.match(t, /Drame, Thriller/, 'genre')
      assert.match(t, /1 h 40/, 'duree')
      assert.match(t, /Réalisateur\s+Denis Lefevre/, 'realisateur')
      assert.match(t, /Avec\s+Alice Martin, Bruno Durand/, 'casting')
      assert.match(t, /Pays\s+France/)
      assert.equal(await fiche.locator('a[data-role="bande-annonce"]').getAttribute('href'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
      assert.equal(appelsDetails(serveur).filter((r) => r.chemin.endsWith('iptva:5003')).length, 1)
      // Regarder ouvre le lecteur.
      await fiche.getByRole('button', { name: 'Regarder' }).click()
      await page.waitForURL(/\/lecture\/vod:iptva:5003/)
    })
  },

  // CA5 : fiche film sans details (fournisseur muet) : la fiche s'affiche quand meme, avec ce que le
  // catalogue sait, et propose de reessayer.
  async ficheFilmDegradee(navigateur) {
    await scenario(navigateur, {}, async ({ serveur, page }) => {
      await uneLaUne(page).waitFor()
      await serveur.appel('details', { id: 'iptva:5004', reglage: { statut: 502 } })
      await page.goto(`${serveur.origine}/film/vod:iptva:5004`)
      const fiche = page.locator('[data-role="fiche-film"]')
      await fiche.waitFor()
      await fiche.locator('[data-role="resume"][data-etat="indisponible"]').waitFor()
      assert.match(await fiche.innerText(), /Film Test 4/)
      assert.ok(await fiche.getByRole('button', { name: 'Regarder' }).isVisible(), 'le film reste lisible')
      assert.equal(await fiche.locator('a[data-role="bande-annonce"]').count(), 0)
      await serveur.appel('details-effacer')
      await fiche.getByRole('button', { name: 'Réessayer' }).click()
      await fiche.locator('[data-role="resume"][data-etat="pret"]').waitFor()
      // Fiche inconnue du fournisseur : « absent », sans erreur.
      await serveur.appel('details', { id: 'iptva:5005', reglage: { statutDetails: 'absent' } })
      await page.goto(`${serveur.origine}/film/vod:iptva:5005`)
      await page.locator('[data-role="resume"][data-etat="absent"]').waitFor()
    })
  },

  // CA5 : fiche serie — details de la serie ET synopsis/date/vignette des episodes ; les details
  // arrivent a part des saisons (un echec des details ne cache pas les episodes).
  async ficheSerie(navigateur) {
    await scenario(navigateur, {}, async ({ serveur, page }) => {
      await uneLaUne(page).waitFor()
      await serveur.appel('vider-requetes')
      await serveur.appel('details', { id: 'iptva:s5002', reglage: { latence: 800 } })
      await page.goto(`${serveur.origine}/serie/series:iptva:s5002`)
      // Les episodes sont la avant les details.
      await page.getByText('Épisode 1').first().waitFor()
      await page.locator('[data-role="resume"][data-etat="chargement"]').waitFor()
      await page.locator('[data-role="resume"][data-etat="pret"]').waitFor()
      const t = await page.locator('main').innerText()
      assert.match(t, /Synopsis de Série Test 2/, 'synopsis de la serie')
      assert.match(t, /Drame, Thriller/, 'genre')
      assert.match(t, /Réalisateur\s+Denis Lefevre/)
      assert.match(t, /Avec\s+Alice Martin, Bruno Durand/)
      assert.match(t, /40 min par épisode/, 'duree moyenne')
      assert.equal(await page.locator('a[data-role="bande-annonce"]').getAttribute('href'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
      // Episodes : synopsis quand il existe, rien quand il n'existe pas (E03).
      const resumes = page.locator('[data-role="episode-resume"]')
      assert.match(await resumes.first().innerText(), /Résumé de l'épisode 1 de la saison 1/)
      assert.equal(await resumes.count(), 2, 'deux episodes sur trois ont un resume (saison 1)')
      // Une demande de details + une demande de saisons, pas plus.
      assert.equal(appelsDetails(serveur).length, 1)
      assert.equal(serveur.etat.requetes.filter((r) => r.chemin.endsWith('/saisons')).length, 1)
    })
  },

  async ficheSerieDetailsEnPanne(navigateur) {
    await scenario(navigateur, {}, async ({ serveur, page }) => {
      await uneLaUne(page).waitFor()
      await serveur.appel('details', { id: 'iptva:s5001', reglage: { statut: 502 } })
      await page.goto(`${serveur.origine}/serie/series:iptva:s5001`)
      await page.getByText('Épisode 1').first().waitFor()
      const r = page.locator('[data-role="resume"][data-etat="indisponible"]')
      await r.waitFor()
      assert.ok((await page.getByText('Épisode 2').count()) > 0, 'les episodes restent visibles')
      await serveur.appel('details-effacer')
      await r.getByRole('button', { name: 'Réessayer' }).click()
      await page.locator('[data-role="resume"][data-etat="pret"]').waitFor()
    })
  },

  // Mobile : l'encart et la fiche tiennent dans 390 px sans debordement horizontal.
  async mobile(navigateur) {
    await scenario(navigateur, { largeur: 390 }, async ({ serveur, page }) => {
      await uneLaUne(page).waitFor()
      await uneLaUne(page).locator('[data-role="resume"][data-etat="pret"]').waitFor()
      const deborde = () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
      assert.equal(await deborde(), false, 'debordement horizontal sur l\'accueil')
      await page.goto(`${serveur.origine}/film/vod:iptva:5003`)
      await page.locator('[data-role="resume"][data-etat="pret"]').waitFor()
      assert.equal(await deborde(), false, 'debordement horizontal sur la fiche film')
    })
  },
}

const demandes = process.argv.slice(2)
const noms = demandes.length ? demandes : Object.keys(SCENARIOS)
const navigateur = await chromium.launch()
let echecs = 0
try {
  for (const nom of noms) {
    const f = SCENARIOS[nom]
    if (!f) { console.log(`KO   scenario inconnu : ${nom}`); echecs++; continue }
    const t0 = Date.now()
    try {
      await f(navigateur)
      console.log(`OK   ${nom} (${Date.now() - t0} ms)`)
    } catch (e) {
      echecs++
      console.log(`KO   ${nom} : ${e.message}`)
    }
  }
} finally {
  await navigateur.close()
}
if (violations.length) { echecs++; console.log('KO   requetes hors 127.0.0.1 :', [...new Set(violations)].join(', ')) }
process.exit(echecs ? 1 : 0)
