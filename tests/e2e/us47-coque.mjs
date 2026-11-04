// US-47 CA5 (coque et Reglages) et CA7 (navigation) : panneau Lecteur sans qualite
// fantome, « Lecture en cours · Titre » a la place de « 0/1 », focus dans les panneaux
// et rendu a l'ancre, noms de profils uniques, dialogue de suppression, categories
// masquees (toast + Reglages), fleches dans une rangee / entre rangees / entre
// onglets, focus initial d'une fiche, retour = ecran precedent (fermer la lecture
// reste sur place). Derive de /opt/mytv-work/audit/A/{01-connexion,02b-accueil-suite,07-reglages}.mjs.
//   NODE_OPTIONS=--tls-max-v1.2 npm run build && node tests/e2e/us47-coque.mjs
import { demarrer, ouvrirSession, creerVerificateur, jusqua, attendre, texte, chemin, actif } from './us47-commun.mjs'

const v = creerVerificateur('US-47 CA5/CA7 coque et navigation')
const TAILLE = { chaines: 30, films: 40, series: 8, variantes: 2 }

console.log('--- coque : en-tete, panneaux, focus')
{
  const b = await demarrer({ gabarit: 'bureau', taille: TAILLE })
  const { page, serveur } = b
  try {
    await ouvrirSession(b)
    v.ok((await page.locator('.entete-flux').count()) === 0, 'CA5 plus de compteur « 0/1 »')
    v.ok((await page.locator('[data-role="lecture-en-cours"]').count()) === 0, 'CA5 rien tant que rien ne joue')
    // Panneau Lecteur : qualite Auto / Eco reelle, focus dedans puis rendu au bouton.
    const boutonLecteur = page.getByRole('button', { name: 'Lecteur : qualité et informations techniques' })
    await boutonLecteur.click()
    const panneau = page.getByRole('dialog', { name: 'Lecteur : qualité et informations techniques' })
    await panneau.waitFor()
    const qualites = await panneau.getByRole('radio').evaluateAll((l) => l.map((e) => e.textContent.trim().split(/\s{2,}|\n/)[0]))
    v.ok(qualites.length === 2 && /^Auto/.test(qualites[0]) && /^Éco/.test(qualites[1]), `CA5 panneau Lecteur : Auto / Éco seulement (${qualites.join(' | ')})`)
    v.ok((await panneau.getByText(/1080p|720p|480p \(/).count()) === 0, 'CA5 plus de 1080p / 720p / 480p fantomes')
    v.ok(await jusqua(() => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')), 2000), `CA7 le focus entre dans le panneau Lecteur (${await actif(page)})`)
    await panneau.locator('[data-role="panneau-qualite-eco"]').click()
    v.ok(await jusqua(() => page.evaluate(() => localStorage.getItem('mytv.qualite') === 'eco'), 3000), 'CA5 le choix du panneau est memorise (mytv.qualite = eco)')
    v.ok(await jusqua(async () => (await panneau.count()) === 0, 2000), 'le panneau se ferme au choix')
    v.ok(await jusqua(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Lecteur : qualité et informations techniques'), 2000), `CA7 focus rendu au bouton de l'en-tete (${await actif(page)})`)
    await page.goto(`${serveur.origine}/reglages`)
    await page.getByRole('radiogroup', { name: 'Qualité' }).waitFor()
    v.ok((await page.locator('[data-role="qualite-eco"]').getAttribute('aria-checked')) === 'true', 'CA5 Reglages > Lecture montre le meme reglage (Éco)')
    // Menu profil : focus, Echap, retour a l'ancre.
    const boutonProfil = page.locator('header').getByRole('button', { name: /^Profil : / })
    await boutonProfil.click()
    const menu = page.getByRole('menu', { name: 'Profil' })
    await menu.waitFor()
    v.ok(await jusqua(() => page.evaluate(() => !!document.activeElement?.closest('[role="menu"]')), 2000), 'CA7 le focus entre dans le menu du profil')
    await page.keyboard.press('ArrowDown')
    v.ok(await page.evaluate(() => !!document.activeElement?.closest('[role="menu"]')), 'fleche bas reste dans le menu')
    await page.keyboard.press('Escape')
    v.ok(await jusqua(async () => (await menu.count()) === 0, 2000), 'Echap ferme le menu')
    v.ok(await jusqua(() => page.evaluate(() => (document.activeElement?.getAttribute('aria-label') ?? '').startsWith('Profil : ')), 2000), `CA7 focus rendu a l'avatar (${await actif(page)})`)
    // Champ de recherche : focus visible.
    await page.keyboard.press('/')
    const contour = await page.getByLabel('Recherche universelle').evaluate((el) => getComputedStyle(el).outlineStyle + ' ' + getComputedStyle(el).outlineWidth)
    v.ok(/solid 2px/.test(contour), `CA5 :focus-visible du champ de recherche (${contour})`)
  } finally {
    await b.fermer()
  }
}

console.log('--- Reglages : profils uniques, dialogue, categories masquees')
{
  const b = await demarrer({ gabarit: 'bureau', taille: TAILLE })
  const { page, serveur } = b
  try {
    await ouvrirSession(b)
    await page.goto(`${serveur.origine}/reglages`)
    // Le doublon ne peut etre refuse qu'une fois la liste des profils recue (vu en CI : saisie avant).
    await page.locator('[data-testid="liste-profils"]').getByText('Salon', { exact: false }).first().waitFor()
    const champ = page.getByLabel('Nom du nouveau profil')
    await champ.fill('salon ')
    await champ.press('Enter')
    const erreur = page.locator('[data-role="erreur-profil"]')
    v.ok(await jusqua(async () => (await erreur.count()) > 0, 3000), 'CA5 doublon refuse')
    v.ok(/porte déjà ce nom/.test(await texte(erreur)), `CA5 message (${await texte(erreur)})`)
    v.ok(serveur.etat.profils.length === 1, 'CA5 aucun second « Salon » cree sur le serveur')
    await champ.fill('Chambre')
    await champ.press('Enter')
    v.ok(await jusqua(() => serveur.etat.profils.length === 2, 5000), 'un nom libre est accepte')
    // Dialogue de suppression de l'application.
    const supprimer = page.getByRole('button', { name: 'Supprimer le profil Chambre' })
    await supprimer.waitFor()
    await supprimer.click()
    const dialogue = page.getByRole('dialog', { name: /Supprimer le profil « Chambre »/ })
    v.ok(await jusqua(async () => (await dialogue.count()) > 0, 3000), 'CA5 dialogue de l application (pas confirm())')
    v.ok(b.dialogues.length === 0, `CA5 aucun confirm() natif (${b.dialogues.join(' | ')})`)
    v.ok(await jusqua(() => page.evaluate(() => document.activeElement?.textContent?.trim() === 'Annuler'), 2000), 'CA7 focus sur Annuler')
    await page.keyboard.press('Escape')
    v.ok(await jusqua(async () => (await dialogue.count()) === 0, 2000), 'Echap annule')
    v.ok(serveur.etat.profils.length === 2, 'rien n est supprime a l annulation')
    v.ok(await jusqua(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Supprimer le profil Chambre'), 2000), 'CA7 focus rendu au bouton Supprimer')
    await supprimer.click()
    await dialogue.getByRole('button', { name: 'Supprimer' }).click()
    v.ok(await jusqua(() => serveur.etat.profils.length === 1, 5000), 'CA5 confirmation : profil supprime')
    // Categories masquees : toast « Masquée · Annuler », liste dans Reglages, Reafficher.
    await page.goto(`${serveur.origine}/direct`)
    await jusqua(async () => (await page.locator('[data-role="ligne-chaine"]').count()) > 0, 15_000)
    const titre = page.locator('[data-role="titre-direct"]')
    const titreAvant = await texte(titre)
    await page.getByRole('button', { name: 'Masquer la catégorie' }).click()
    const toast = page.locator('[data-role="toast"]')
    v.ok(await jusqua(async () => (await toast.count()) > 0, 3000), 'CA5 toast apres masquage')
    v.ok(/masquée/.test(await texte(toast)) && (await toast.getByRole('button', { name: 'Annuler' }).count()) === 1, `CA5 « Masquée · Annuler » (${(await texte(toast)).slice(0, 60)})`)
    v.ok((await texte(titre)) === titreAvant, 'CA5 masquer ne change pas de categorie')
    v.ok((await page.getByRole('button', { name: 'Réafficher la catégorie' }).count()) === 1, 'le bouton devient « Réafficher »')
    await toast.getByRole('button', { name: 'Annuler' }).click()
    v.ok(await jusqua(async () => (await page.getByRole('button', { name: 'Masquer la catégorie' }).count()) === 1, 5000), 'CA5 Annuler reaffiche la categorie')
    await page.getByRole('button', { name: 'Masquer la catégorie' }).click()
    await jusqua(async () => (await page.getByRole('button', { name: 'Réafficher la catégorie' }).count()) === 1, 5000)
    await page.goto(`${serveur.origine}/reglages`)
    const masquees = page.locator('[data-role="categories-masquees"]')
    v.ok(await jusqua(async () => (await masquees.getByRole('button', { name: /^Réafficher / }).count()) === 1, 8000), `CA5 la categorie masquee est listee dans Reglages (${(await texte(masquees)).replace(/\s+/g, ' ').slice(0, 60)})`)
    await masquees.getByRole('button', { name: /^Réafficher / }).click()
    v.ok(await jusqua(async () => (await masquees.getByRole('button', { name: /^Réafficher / }).count()) === 0, 5000), 'CA5 Reafficher depuis Reglages')
  } finally {
    await b.fermer()
  }
}

console.log('--- navigation : fleches, focus de fiche, retour')
{
  const b = await demarrer({ gabarit: 'bureau', taille: TAILLE })
  const { page, serveur } = b
  try {
    await ouvrirSession(b)
    await page.goto(`${serveur.origine}/`)
    const rangee = page.locator('main section[aria-label="Films récemment ajoutés"]')
    await rangee.waitFor()
    const cartes = rangee.locator('[role="button"][title], button[title]')
    await jusqua(async () => (await cartes.count()) > 2, 10_000)
    await cartes.first().focus()
    const avant = await page.evaluate(() => document.activeElement?.getAttribute('title'))
    const xAvant = await page.evaluate(() => document.activeElement?.getBoundingClientRect().left)
    await page.keyboard.press('ArrowRight')
    await attendre(150)
    const apres = await page.evaluate(() => ({ t: document.activeElement?.getAttribute('title'), x: document.activeElement?.getBoundingClientRect().left, dans: !!document.activeElement?.closest('section[aria-label="Films récemment ajoutés"]') }))
    v.ok(apres.dans && apres.t !== avant && apres.x > xAvant, `CA7 → passe a la carte suivante de la rangee (${avant} -> ${apres.t})`)
    await page.keyboard.press('ArrowLeft')
    await attendre(150)
    v.ok((await page.evaluate(() => document.activeElement?.getAttribute('title'))) === avant, 'CA7 ← revient')
    await page.keyboard.press('ArrowDown')
    await attendre(150)
    const section = await page.evaluate(() => document.activeElement?.closest('section')?.getAttribute('aria-label') ?? null)
    v.ok(section !== null && section !== 'Films récemment ajoutés', `CA7 ↓ passe a la rangee suivante (${section})`)
    await page.keyboard.press('ArrowUp')
    await attendre(150)
    v.ok((await page.evaluate(() => document.activeElement?.closest('section')?.getAttribute('aria-label'))) === 'Films récemment ajoutés', 'CA7 ↑ remonte')
    // Onglets de resultats.
    await page.goto(`${serveur.origine}/recherche?q=film`)
    const onglets = page.getByRole('tab')
    await jusqua(async () => (await onglets.count()) >= 3, 10_000)
    // La recherche rend ses resultats par vagues : les onglets peuvent etre remontes juste apres
    // le focus (focus perdu sur body en CI). On refait le geste jusqu'a ce qu'il tienne.
    const ongletSuivantChoisi = () => page.evaluate(() => document.activeElement?.getAttribute('role') === 'tab' && document.activeElement.getAttribute('aria-selected') === 'true' && !document.activeElement.textContent.startsWith('Tout'))
    await jusqua(async () => {
      if (await ongletSuivantChoisi()) return true
      await onglets.first().focus()
      await page.keyboard.press('ArrowRight')
      await attendre(150)
      return ongletSuivantChoisi()
    }, 5000)
    v.ok(await ongletSuivantChoisi(), `CA7 → choisit l'onglet suivant (${await actif(page)})`)
    // Fiche : focus initial sur l'action principale.
    await page.goto(`${serveur.origine}/`)
    await page.getByRole('button', { name: 'Voir les détails' }).first().click()
    v.ok(await jusqua(async () => /^\/film\//.test(await chemin(page)), 5000), 'fiche film ouverte')
    v.ok(await jusqua(() => page.evaluate(() => /^(Regarder|Reprendre|Recommencer|Regarder à nouveau)/.test((document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent || '').trim())), 4000), `CA7 focus initial sur l'action principale (${await actif(page)})`)
    // Retour = ecran precedent, et fermer la lecture reste sur place (A bug 8).
    const fiche = await chemin(page)
    await page.locator('[data-role="fiche-film"]').getByRole('button', { name: /^Regarder/ }).click()
    v.ok(await jusqua(async () => /^\/lecture\//.test(await chemin(page)), 8000), 'lecture ouverte')
    await attendre(1200)
    await page.mouse.move(600, 400)
    await page.locator('[data-role="commandes"]').getByRole('button', { name: 'Retour' }).click()
    v.ok(await jusqua(async () => (await chemin(page)) === fiche, 8000), `CA7 Retour du lecteur = la fiche d'ou l'on vient (${await chemin(page)})`)
    v.ok(await jusqua(async () => (await page.locator('[data-role="lecture-en-cours"]').count()) > 0, 5000), 'CA5 « Lecture en cours · Titre » dans l en-tete')
    v.ok(/^Lecture en cours · /.test(await texte(page.locator('[data-role="lecture-en-cours"]'))), `CA5 libelle (${await texte(page.locator('[data-role="lecture-en-cours"]'))})`)
    const mini = page.locator('[data-role="mini-lecteur"]')
    await mini.getByRole('button', { name: 'Fermer la lecture' }).click()
    v.ok(await jusqua(async () => (await mini.count()) === 0, 5000), 'mini-lecteur ferme')
    v.ok((await chemin(page)) === fiche, `CA7 « Fermer la lecture » ne change pas d'ecran (${await chemin(page)})`)
    // La video detachee (src vide, pas de « Stale read ») est US-45 CA1 (ui-6) :
    // ici on verifie seulement que la coque ne navigue pas et demonte le mini-lecteur.
    // Fiche serie : Retour = ecran precedent (accueil), pas Direct.
    await page.goto(`${serveur.origine}/`)
    await page.getByText('À la une').first().waitFor()
    await page.locator('main section[aria-label="Séries récemment ajoutées"] [role="button"][title]:not([data-role="menu-carte"])').first().click({ position: { x: 12, y: 60 } })
    v.ok(await jusqua(async () => /^\/serie\//.test(await chemin(page)), 8000), `fiche serie ouverte (${await chemin(page)})`)
    await page.keyboard.press('Escape')
    v.ok(await jusqua(async () => (await chemin(page)) === '/', 5000), `CA7 Echap sur la fiche serie = ecran precedent (${await chemin(page)})`)
    // Lien direct sans historique : Retour = repli (accueil), jamais un autre site.
    await page.goto(`${serveur.origine}/film/vod:iptva:5002`)
    await page.locator('[data-role="fiche-film"]').getByRole('button', { name: '← Retour' }).click()
    v.ok(await jusqua(async () => (await chemin(page)) === '/', 5000), `CA7 Retour sans pile = accueil (${await chemin(page)})`)
    // « Stale read from <Show> » a l'arret de la lecture est le bug D1/B1, corrige par ui-6 (US-45 CA1).
    const erreurs = b.erreurs.filter((e) => !/Stale read/.test(e))
    v.ok(erreurs.length === 0, `aucune erreur de page hors lecteur (${erreurs.join(' | ').slice(0, 200)})`)
    v.ok(b.externes.length === 0, 'aucune requete hors 127.0.0.1')
  } finally {
    await b.fermer()
  }
}
console.log('--- telephone : focus des panneaux Categories et Filtres')
{
  const b = await demarrer({ gabarit: 'telephone', taille: TAILLE })
  const { page, serveur } = b
  try {
    await ouvrirSession(b)
    await page.goto(`${serveur.origine}/direct`)
    const ouvrir = page.locator('[data-role="ouvrir-categories"]')
    await ouvrir.waitFor()
    await ouvrir.click()
    const panneau = page.locator('[role="dialog"][aria-label="Catégories"]')
    v.ok(await jusqua(async () => (await panneau.getAttribute('aria-hidden')) === 'false', 3000), 'panneau Categories ouvert')
    v.ok(await jusqua(() => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"][aria-label="Catégories"]')), 2000), `CA7 le focus entre dans le panneau Categories (${await actif(page)})`)
    await page.keyboard.press('Escape')
    v.ok(await jusqua(async () => (await panneau.getAttribute('aria-hidden')) === 'true', 3000), 'Echap ferme le panneau')
    v.ok(await jusqua(() => page.evaluate(() => document.activeElement?.getAttribute('data-role') === 'ouvrir-categories'), 2000), `CA7 focus rendu au bouton Categories (${await actif(page)})`)
    await page.goto(`${serveur.origine}/films`)
    const filtres = page.getByRole('button', { name: /^Filtres/ })
    await filtres.waitFor()
    await filtres.click()
    const feuille = page.getByRole('dialog', { name: 'Filtres' })
    await feuille.waitFor()
    v.ok(await jusqua(() => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"][aria-label="Filtres"]')), 2000), `CA7 le focus entre dans la feuille Filtres (${await actif(page)})`)
    await page.keyboard.press('Escape')
    v.ok(await jusqua(async () => (await feuille.count()) === 0, 3000), 'Echap ferme la feuille')
    v.ok(await jusqua(() => page.evaluate(() => /^Filtres/.test(document.activeElement?.textContent?.trim() ?? '')), 2000), `CA7 focus rendu au bouton Filtres (${await actif(page)})`)
  } finally {
    await b.fermer()
  }
}
v.termine()
