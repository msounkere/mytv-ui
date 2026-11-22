// Lot 11 : Reglages > Box IPTV (administrateur) : choisir les langues et pays envoyes aux box.
//   NODE_OPTIONS=--tls-max-v1.2 node tests/e2e/box-iptv.mjs
import { demarrer, ouvrirSession, creerVerificateur, jusqua, texte } from './us47-commun.mjs'

const v = creerVerificateur('Box IPTV')

// Non administrateur : la section n'existe pas.
{
  const b = await demarrer()
  try {
    await ouvrirSession(b)
    await b.page.goto(`${b.serveur.origine}/reglages`)
    await b.page.getByRole('heading', { name: 'Catalogue' }).waitFor()
    v.ok((await b.page.locator('[data-role="box-iptv"]').count()) === 0, 'pas de section Box IPTV pour un compte ordinaire')
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
    const section = page.locator('[data-role="box-iptv"]')
    v.ok(await jusqua(async () => (await section.locator('[data-role="box-prefixes"] label').count()) === 4, 10_000), 'les quatre prefixes du catalogue sont listes')
    // La page defile (le bas, Box IPTV puis Catalogue, etait hors d'atteinte : retour du 22/11).
    await page.mouse.move(700, 450)
    await page.mouse.wheel(0, 4000)
    v.ok(await jusqua(async () => (await page.getByRole('heading', { name: 'Catalogue' }).boundingBox())?.y < 900, 5000), 'la molette fait defiler la page jusqu’au bas')
    v.ok(/recevra tout/.test(await texte(section.locator('[data-role="box-resume"]'))), 'au depart : tout le catalogue')
    v.ok(await section.getByRole('button', { name: 'Enregistrer' }).isDisabled(), 'Enregistrer inactif tant que rien ne change')
    await section.getByLabel('FR France').check()
    await section.getByLabel('EN Anglais').check()
    v.ok(/recevra EN, FR — 4\s?100 chaînes, 39\s?000 films/.test(await texte(section.locator('[data-role="box-resume"]'))), `resume du choix (${await texte(section.locator('[data-role="box-resume"]'))})`)
    await section.getByPlaceholder('Chercher un code ou un pays').fill('alle')
    v.ok((await section.locator('[data-role="box-prefixes"] label').count()) === 1, 'la recherche trouve « Allemagne »')
    await section.getByPlaceholder('Chercher un code ou un pays').fill('')
    await section.getByRole('button', { name: 'Enregistrer' }).click()
    v.ok(await jusqua(() => serveur.etat.xtream?.prefixes?.join(',') === 'EN,FR', 5000), 'le choix est envoye au serveur (EN, FR)')
    v.ok(await jusqua(async () => /Box IPTV : EN, FR seulement/.test(await page.locator('[data-role="toast"]').innerText().catch(() => '')), 5000), 'un toast confirme')
    await page.reload()
    v.ok(await jusqua(async () => (await section.getByLabel('FR France').isChecked().catch(() => false)), 10_000), 'apres rechargement, FR reste coche')
    await section.getByRole('button', { name: 'Tout décocher' }).click()
    v.ok(/recevra tout/.test(await texte(section.locator('[data-role="box-resume"]'))), '« Tout décocher » revient a tout le catalogue')
  } finally {
    await b.fermer()
  }
}
v.termine()
