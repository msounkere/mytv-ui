// Lot 11 : Reglages > Box IPTV (administrateur) : choisir les langues et pays envoyes aux box.
//   NODE_OPTIONS=--tls-max-v1.2 node tests/e2e/box-iptv.mjs
import { demarrer, ouvrirSession, creerVerificateur, jusqua, texte } from './us47-commun.mjs'

const v = creerVerificateur('Box IPTV')

// Non administrateur : la section n'existe pas.
{
  const b = await demarrer()
  try {
    await ouvrirSession(b)
    await b.page.goto(`${b.serveur.origine}/reglages?onglet=box`)
    await b.page.getByRole('tablist', { name: 'Sections des réglages' }).waitFor()
    v.ok((await b.page.getByRole('tab', { name: 'Box IPTV' }).count()) === 0, 'pas d’onglet Box IPTV pour un compte ordinaire')
    v.ok((await b.page.locator('[data-role="box-iptv"]').count()) === 0, 'et ?onglet=box ne l’ouvre pas : retour a Compte')
    v.ok((await b.page.getByRole('tab', { name: 'Compte' }).getAttribute('aria-selected')) === 'true', 'onglet Compte choisi')
    // Onglets : clic, adresse, clavier ; et le panneau Catalogue defile dans une fenetre basse.
    await b.page.getByRole('tab', { name: 'Catalogue' }).click()
    v.ok(await jusqua(() => b.page.evaluate(() => location.search === '?onglet=catalogue'), 3000), 'l’onglet choisi est dans l’adresse')
    await b.page.keyboard.press('ArrowLeft')
    v.ok(await jusqua(async () => (await b.page.getByRole('tab', { name: 'Lecture' }).getAttribute('aria-selected')) === 'true', 3000), '← passe a l’onglet precedent')
    await b.page.getByRole('radiogroup', { name: 'Qualité' }).waitFor()
    await b.page.setViewportSize({ width: 1000, height: 380 })
    await b.page.getByRole('tab', { name: 'Catalogue' }).click()
    await b.page.mouse.move(500, 300)
    await b.page.mouse.wheel(0, 3000)
    v.ok(await jusqua(async () => (await b.page.getByRole('button', { name: /Vérifier|Mettre à jour|Réimporter/ }).first().boundingBox())?.y < 380, 5000), 'la page defile dans une fenetre basse')
  } finally {
    await b.fermer()
  }
}

// Administrateur : liste des prefixes, choix, enregistrement.
{
  const b = await demarrer()
  const { page, serveur } = b
  try {
    await serveur.appel('admin', { actif: true })
    await ouvrirSession(b)
    await page.goto(`${serveur.origine}/reglages`)
    await page.getByRole('tab', { name: 'Box IPTV' }).click()
    v.ok(await jusqua(() => page.evaluate(() => location.search === '?onglet=box'), 3000), 'onglet Box IPTV ouvert (?onglet=box)')
    const section = page.locator('[data-role="box-iptv"]')
    v.ok(await jusqua(async () => (await section.locator('[data-role="box-prefixes"] label').count()) === 4, 10_000), 'les quatre prefixes du catalogue sont listes')
    v.ok(/recevra tout/.test(await texte(section.locator('[data-role="box-resume"]'))), 'au depart : tout le catalogue')
    v.ok((await section.getByRole('button', { name: 'Enregistrer' }).count()) === 0, 'pas de bouton Enregistrer : enregistrement automatique')
    // Deux cases cochees d'affilee : UNE ecriture, apres le dernier clic.
    const ecrituresAvant = serveur.etat.xtream?.revision ?? 0
    await section.getByLabel('FR France').check()
    await section.getByLabel('EN Anglais').check()
    v.ok(/recevra EN, FR — 4\s?100 chaînes, 39\s?000 films/.test(await texte(section.locator('[data-role="box-resume"]'))), `resume du choix (${await texte(section.locator('[data-role="box-resume"]'))})`)
    v.ok(await jusqua(() => serveur.etat.xtream?.prefixes?.join(',') === 'EN,FR', 5000), 'le choix est enregistre tout seul (EN, FR)')
    v.ok(serveur.etat.xtream.revision === ecrituresAvant + 1, `une seule ecriture pour deux clics (${serveur.etat.xtream.revision - ecrituresAvant})`)
    v.ok(await jusqua(async () => /Enregistré — actualisez le portail/.test(await texte(section.locator('[data-role="box-statut"]'))), 5000), 'le statut confirme l’enregistrement')
    await section.getByPlaceholder('Chercher un code ou un pays').fill('alle')
    v.ok((await section.locator('[data-role="box-prefixes"] label').count()) === 1, 'la recherche trouve « Allemagne »')
    await section.getByPlaceholder('Chercher un code ou un pays').fill('')
    await page.reload()
    v.ok(await jusqua(async () => (await section.getByLabel('FR France').isChecked().catch(() => false)), 10_000), 'apres rechargement, FR reste coche')
    // Profil dont la box montre les listes (Ma liste, En cours, Mes chaines) : enregistre des le choix.
    const choix = section.locator('[data-role="box-profil"]')
    v.ok((await choix.inputValue()) === '', 'au depart : aucune liste (profil de la box)')
    const options = await choix.locator('option').allInnerTexts()
    v.ok(options.length === serveur.etat.profils.length + 1, `profils proposes (${options.join(' | ')})`)
    const cible = serveur.etat.profils[0]
    await choix.selectOption(cible.id)
    v.ok(await jusqua(() => serveur.etat.xtream?.profil_listes === cible.id && serveur.etat.xtream.prefixes.join(',') === 'EN,FR', 5000), 'profil enregistre, prefixes gardes')
    await page.reload()
    v.ok(await jusqua(async () => (await choix.inputValue().catch(() => '')) === cible.id, 10_000), 'apres rechargement, le profil reste choisi')
    await section.getByRole('button', { name: 'Tout décocher' }).click()
    v.ok(/recevra tout/.test(await texte(section.locator('[data-role="box-resume"]'))), '« Tout décocher » revient a tout le catalogue')
    v.ok(await jusqua(() => serveur.etat.xtream?.prefixes?.length === 0 && serveur.etat.xtream.profil_listes === cible.id, 5000), '« Tout décocher » est enregistre, profil garde')
  } finally {
    await b.fermer()
  }
}
v.termine()
