// US-47 CA4 : session expiree annoncee et retour a l'ecran d'origine, focus initial,
// hors ligne (bandeau persistant, gestes annonces, ouverture sur le catalogue local,
// ecran a la demande indisponible), IndexedDB bloquee (phrase humaine).
// Derive de /opt/mytv-work/audit/A/01-connexion.mjs et D/parcours.mjs (hors-ligne, idbPanne).
//   NODE_OPTIONS=--tls-max-v1.2 npm run build && node tests/e2e/us47-session.mjs
import { demarrer, ouvrirSession, seConnecter, creerVerificateur, jusqua, attendre, texte, chemin, actif, COMPTE, MOT_DE_PASSE } from './us47-commun.mjs'

const v = creerVerificateur('US-47 CA4 session et hors ligne')
const TAILLE = { chaines: 20, films: 20, series: 4 }

// --- 1. Focus initial et session expiree -------------------------------------------
console.log('1. focus initial, mot de passe refuse, session expiree')
{
  const b = await demarrer({ gabarit: 'bureau', taille: TAILLE })
  const { page, serveur } = b
  try {
    await page.goto(`${serveur.origine}/`)
    v.ok(await jusqua(async () => (await actif(page)).includes('Identifiant') || (await page.evaluate(() => document.activeElement?.getAttribute('autocomplete'))) === 'username', 3000), `CA4 focus initial sur l'identifiant (${await actif(page)})`)
    await page.getByLabel('Identifiant').fill(COMPTE)
    await page.getByLabel('Mot de passe').fill('faux')
    await page.getByRole('button', { name: 'Se connecter' }).click()
    v.ok(await jusqua(async () => (await page.locator('[data-role="connexion-erreur"]').count()) > 0, 5000), 'refus affiche')
    v.ok(await jusqua(() => page.evaluate(() => document.activeElement?.getAttribute('type') === 'password'), 3000), 'CA4 focus sur le mot de passe apres refus')
    await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE)
    await page.getByRole('button', { name: 'Se connecter' }).click()
    const dialogue = page.getByRole('dialog', { name: 'Choisir un profil' })
    await dialogue.waitFor()
    v.ok(await jusqua(() => page.evaluate(() => document.activeElement?.tagName === 'INPUT' && document.activeElement.placeholder === 'Nom du profil'), 3000), `CA4 « Qui regarde ? » : focus sur le champ du premier profil (${await actif(page)})`)
    await page.getByPlaceholder('Nom du profil').fill('Salon')
    await page.getByRole('button', { name: 'Créer et utiliser' }).click()
    await jusqua(async () => (await page.locator('nav.rail').count()) > 0, 10_000)
    // Un second profil : au prochain choix, le focus va sur le premier profil.
    await page.goto(`${serveur.origine}/reglages`)
    await page.getByLabel('Nom du nouveau profil').fill('Chambre')
    await page.getByLabel('Nom du nouveau profil').press('Enter')
    await jusqua(() => serveur.etat.profils.length >= 2, 5000)

    // Session expiree pendant un geste : connexion avec message, URL conservee.
    await page.getByRole('radiogroup', { name: 'Qualité' }).waitFor()
    await serveur.appel('expirer-sessions')
    // Un geste qui parle au service : le 401 ramene a la connexion.
    await page.getByLabel('Nom du nouveau profil').fill('Cuisine')
    await page.getByLabel('Nom du nouveau profil').press('Enter')
    const info = page.locator('[data-role="connexion-info"]')
    v.ok(await jusqua(async () => (await info.count()) > 0, 10_000), 'CA4 ecran de connexion apres expiration')
    v.ok(/Votre session a expiré, reconnectez-vous/.test(await texte(info)), `CA4 message « Votre session a expiré, reconnectez-vous » (${(await texte(info)).slice(0, 60)})`)
    v.ok((await chemin(page)) === '/reglages', `CA4 l'URL d'origine est conservee (${await chemin(page)})`)
    v.ok(await jusqua(async () => (await actif(page)).includes('Identifiant') || (await page.evaluate(() => document.activeElement?.getAttribute('autocomplete'))) === 'username', 3000), 'CA4 focus sur l identifiant')
    await page.getByLabel('Identifiant').fill(COMPTE)
    await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE)
    await page.getByRole('button', { name: 'Se connecter' }).click()
    await page.getByRole('dialog', { name: 'Choisir un profil' }).waitFor()
    v.ok(await jusqua(() => page.evaluate(() => document.activeElement?.getAttribute('data-role') === 'profil'), 3000), 'CA4 deux profils : focus sur le premier profil')
    await page.getByRole('button', { name: 'Salon' }).click()
    v.ok(await jusqua(async () => (await page.getByRole('radiogroup', { name: 'Qualité' }).count()) > 0, 10_000), `CA4 retour a l'ecran d'origine (Reglages) apres reconnexion (${await chemin(page)})`)
    v.ok((await page.locator('[data-role="connexion-info"]').count()) === 0, 'le message ne reste pas')
  } finally {
    await b.fermer()
  }
}

// --- 2. Hors ligne : bandeau, gestes, ecran a la demande --------------------------
console.log('2. hors ligne en session')
{
  const b = await demarrer({ gabarit: 'bureau', taille: TAILLE })
  const { page, serveur, ctx } = b
  try {
    await ouvrirSession(b)
    // La fiche film est chargee a la demande : la visiter AVANT la coupure, sans
    // recharger le document (le faux serveur ne pose pas d'en-tete de cache ; hors
    // ligne, l'ecran jamais visite est celui du Guide, verifie plus bas).
    await page.getByText('À la une').first().waitFor()
    await page.getByRole('button', { name: 'Voir les détails' }).first().click()
    await page.locator('[data-role="fiche-film"]').waitFor()
    await page.locator('nav.rail').getByRole('button', { name: 'Accueil', exact: true }).click()
    await page.getByText('À la une').first().waitFor()
    // Attendre la fin de la synchronisation initiale pour couper proprement.
    await attendre(1500)
    await ctx.setOffline(true)
    const bandeau = page.locator('[data-role="hors-ligne"]')
    v.ok(await jusqua(async () => (await bandeau.count()) > 0, 8000), 'CA4 bandeau « Hors ligne » affiche')
    v.ok(/^Hors ligne/.test((await texte(bandeau)).trim()), `CA4 texte du bandeau (${await texte(bandeau)})`)
    // Il reste sur tous les ecrans.
    await page.locator('nav.rail').getByRole('button', { name: 'Films', exact: true }).click()
    await attendre(400)
    v.ok((await bandeau.count()) > 0 && (await chemin(page)) === '/films', 'CA4 bandeau toujours la sur Films')
    // Un geste hors ligne : « Ma liste » depuis une fiche film, atteinte par navigation
    // INTERNE (hors ligne, un `goto` ne peut plus charger le document).
    await page.locator('nav.rail').getByRole('button', { name: 'Accueil', exact: true }).click()
    await page.getByRole('button', { name: 'Voir les détails' }).first().click()
    v.ok(await jusqua(async () => /^\/film\//.test(await chemin(page)), 8000), `fiche film ouverte hors ligne (${await chemin(page)})`)
    const boutonListe = page.locator('[data-role="fiche-film"] [data-role="a-voir"], [data-role="fiche-film"] [data-role="ma-liste"]').first()
    if (await boutonListe.count()) {
      await boutonListe.click()
      v.ok(await jusqua(async () => /sera envoyé au retour du réseau|seront envoyés au retour du réseau/.test(await texte(bandeau)), 8000), `CA4 geste hors ligne annonce « sera envoyé au retour du réseau » (${await texte(bandeau)})`)
    } else v.ok(false, 'bouton Ma liste de la fiche introuvable hors ligne')
    // Ecran a la demande jamais visite : message, pas l'ecran blanc du portail.
    await page.locator('nav.rail').getByRole('button', { name: 'Guide', exact: true }).click()
    const indisponible = page.locator('[data-role="ecran-indisponible"]')
    v.ok(await jusqua(async () => (await indisponible.count()) > 0, 8000), 'CA4 « Ecran indisponible hors ligne » pour un ecran jamais visite')
    v.ok(/Écran indisponible hors ligne/.test(await texte(indisponible)), `CA4 texte (${(await texte(indisponible)).slice(0, 50)})`)
    v.ok((await page.getByText("L'interface n'a pas pu démarrer").count()) === 0, 'CA4 jamais l ecran blanc du portail')
    await ctx.setOffline(false)
    await indisponible.getByRole('button', { name: 'Réessayer' }).click()
    v.ok(await jusqua(async () => (await page.locator('[data-role="stats-guide"]').count()) > 0, 15_000), 'CA4 Reessayer charge le guide une fois le reseau revenu')
    v.ok(await jusqua(async () => (await bandeau.count()) === 0, 15_000), 'le bandeau disparait au retour du reseau')
    // Les gestes faits hors ligne sont partis.
    v.ok(await jusqua(() => (serveur.etat.aVoir.get(serveur.etat.profils[0].id) ?? []).length === 1, 15_000), 'CA4 le geste hors ligne est envoye au retour du reseau')
    v.ok(b.erreurs.length === 0, `aucune erreur de page (${b.erreurs.join(' | ').slice(0, 200)})`)
  } finally {
    await b.fermer()
  }
}

// --- 3. Ouverture hors ligne sur le catalogue local -------------------------------
console.log('3. ouverture de l application hors ligne')
{
  const b = await demarrer({ gabarit: 'bureau', taille: TAILLE })
  const { page, serveur, ctx } = b
  try {
    await ouvrirSession(b)
    await attendre(1000)
    // Seule l'API est coupee : l'interface (dist) reste servie, comme un service arrete.
    await ctx.route(/\/api\/v1\//, (route) => route.abort('connectionrefused'))
    await page.goto(`${serveur.origine}/direct`)
    v.ok(await jusqua(async () => (await page.locator('[data-role="ligne-chaine"]').count()) > 0, 20_000), 'CA4 hors ligne au chargement : Direct s ouvre sur le catalogue local')
    v.ok((await page.getByText('Service injoignable').count()) === 0, 'CA4 plus de « Service injoignable » bloquant')
    v.ok(await jusqua(async () => (await page.locator('[data-role="hors-ligne"]').count()) > 0, 8000), 'CA4 bandeau « Hors ligne » present')
    v.ok((await page.locator('[data-role="erreur-import"]').count()) === 0, 'l import coupe n accuse pas le catalogue')
    v.ok(b.erreurs.length === 0, `aucune erreur de page (${b.erreurs.join(' | ').slice(0, 200)})`)
  } finally {
    await b.fermer()
  }
}

// --- 4. IndexedDB bloquee -----------------------------------------------------------
console.log('4. IndexedDB indisponible (navigation privee)')
{
  const b = await demarrer({ gabarit: 'telephone', taille: TAILLE, scripts: [() => {
    const ouvrir = () => { throw new DOMException('A mutation operation was attempted on a database that did not allow mutations.', 'InvalidStateError') }
    try { Object.defineProperty(window, 'indexedDB', { get: () => ({ open: ouvrir, deleteDatabase: ouvrir, databases: () => Promise.reject(new Error('x')) }) }) } catch {}
  }] })
  const { page } = b
  try {
    await seConnecter(b)
    const bandeau = page.locator('[data-role="erreur-import"]')
    v.ok(await jusqua(async () => (await bandeau.count()) > 0, 15_000), 'bandeau d import en erreur')
    const t = await texte(bandeau)
    v.ok(/bloque le stockage local/.test(t), `CA4 phrase humaine (${t.slice(0, 80)})`)
    v.ok(!/DatabaseClosedError|InvalidStateError/.test(t), 'CA4 aucune exception brute a l ecran')
    v.ok((await page.getByText("L'interface n'a pas pu démarrer").count()) === 0, 'l interface reste debout')
    console.log(`  ..   erreurs de page avec IndexedDB bloquee : ${b.erreurs.length} (${b.erreurs.map((e) => e.slice(0, 60)).join(' | ')})`)
  } finally {
    await b.fermer()
  }
}
v.termine()
