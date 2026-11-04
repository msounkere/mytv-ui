// US-47 CA1 : Entree dans le champ de recherche ouvre la PAGE DE RESULTATS, jamais
// une lecture ; aucune ligne preselectionnee ; ↓ puis Entree = fiche ; re-clic sur
// le champ deja focalise rouvre les suggestions ; compteurs sans « ms ».
// Derive de /opt/mytv-work/audit/A/06-recherche.mjs (bug 3, UX 20, mineur recherche).
//   NODE_OPTIONS=--tls-max-v1.2 npm run build && node tests/e2e/us47-recherche.mjs
import { demarrer, ouvrirSession, creerVerificateur, jusqua, attendre, texte, chemin } from './us47-commun.mjs'

const v = creerVerificateur('US-47 CA1 recherche')

for (const gabarit of ['bureau', 'telephone']) {
  console.log(`--- ${gabarit}`)
  const b = await demarrer({ gabarit })
  const { page, serveur } = b
  try {
    await ouvrirSession(b)
    const champ = page.getByLabel('Recherche universelle')
    const panneau = page.getByRole('listbox', { name: 'Suggestions de recherche' })
    await champ.click()
    await champ.type('film', { delay: 30 })
    v.ok(await jusqua(async () => (await panneau.getByRole('option').count()) > 1, 8000), `[${gabarit}] suggestions affichees`)
    const options = panneau.getByRole('option')
    const retenues = await options.evaluateAll((l) => l.filter((e) => e.getAttribute('aria-selected') === 'true').length)
    v.ok(retenues === 0, `[${gabarit}] CA1 aucune ligne preselectionnee (${retenues})`)
    v.ok(!/\d+ ms/.test(await texte(panneau)), `[${gabarit}] CA1 pied du panneau sans « ms »`)
    v.ok(/Entrée/.test(await texte(panneau)), `[${gabarit}] le pied annonce « Entrée »`)

    // Entree : la page de resultats, et aucune requete de flux.
    const avant = serveur.etat.requetes.length
    await page.keyboard.press('Enter')
    v.ok(await jusqua(async () => (await chemin(page)) === '/recherche?q=film', 8000), `[${gabarit}] CA1 Entree -> page de resultats (${await chemin(page)})`)
    await attendre(600)
    const flux = serveur.etat.requetes.slice(avant).filter((r) => /^\/api\/v1\/(vod|live)\//.test(r.chemin))
    v.ok(flux.length === 0, `[${gabarit}] CA1 aucune requete de flux apres Entree (${flux.length})`)
    v.ok((await page.locator('[data-role="lecture-en-cours"]').count()) === 0, `[${gabarit}] aucune lecture en cours`)
    const ecranVisible = page.locator('.couche-ecran[aria-hidden="false"]')
    const titre = ecranVisible.locator('h1').first()
    v.ok(await jusqua(async () => /Résultats pour « film »/.test(await texte(titre)), 8000), `[${gabarit}] titre de la page de resultats`)
    const compteur = ecranVisible.locator('h1 + span').first()
    v.ok(await jusqua(async () => /^\d+ résultats?$/.test((await texte(compteur)).trim()), 8000), `[${gabarit}] CA1 compteur sans « ms » (${(await texte(compteur)).trim()})`)

    // Echap puis clic sur le champ deja focalise : le panneau rouvre.
    await champ.click()
    await jusqua(async () => (await panneau.count()) > 0, 3000)
    await page.keyboard.press('Escape')
    await attendre(200)
    v.ok((await panneau.count()) === 0, `[${gabarit}] Echap ferme le panneau`)
    await champ.click()
    v.ok(await jusqua(async () => (await panneau.count()) > 0, 3000), `[${gabarit}] CA1 re-clic sur le champ focalise rouvre les suggestions`)

    // ↓ puis Entree : la FICHE de la premiere suggestion, pas une lecture.
    await page.keyboard.press('ArrowDown')
    await attendre(150)
    const indice = await panneau.getByRole('option').evaluateAll((l) => l.findIndex((e) => e.getAttribute('aria-selected') === 'true'))
    v.ok(indice === 0, `[${gabarit}] ↓ retient la premiere ligne (${indice})`)
    const avant2 = serveur.etat.requetes.length
    await page.keyboard.press('Enter')
    v.ok(await jusqua(async () => /^\/(film|serie)\//.test(await chemin(page)), 8000), `[${gabarit}] CA1 Entree sur une ligne retenue -> fiche (${await chemin(page)})`)
    await attendre(500)
    const flux2 = serveur.etat.requetes.slice(avant2).filter((r) => /^\/api\/v1\/(vod|live)\/[^/]+$/.test(r.chemin) && r.methode !== 'HEAD')
    v.ok(flux2.length === 0, `[${gabarit}] aucune lecture lancee (${flux2.map((r) => r.chemin).join(', ')})`)
    v.ok(b.erreurs.length === 0, `[${gabarit}] aucune erreur de page (${b.erreurs.join(' | ').slice(0, 200)})`)
    v.ok(b.externes.length === 0, `[${gabarit}] aucune requete hors 127.0.0.1`)
  } finally {
    await b.fermer()
  }
}
v.termine()
