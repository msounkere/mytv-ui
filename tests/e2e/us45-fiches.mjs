// US-45 CA3 (fiche film : Regarder / Reprendre · 42 min + Recommencer / Regarder a nouveau, barre,
// chip, « vu » ; serie : Lire S01E01 / Reprendre S01E03 · 23 min / Episode suivant) et CA4 (fiche serie :
// menu « ⋯ » par ligne et par saison, Ma liste a partir d'ici / Ne plus partir d'ici, un seul bouton
// Ma liste, sonde UNE fois par fiche, 390 px). Base : audits B/02-serie-enchainement.mjs, C/01-fiches.mjs.
//   npm run build && NODE_OPTIONS=--tls-max-v1.2 node tests/e2e/us45-fiches.mjs [bureau|mobile]
import { ouvrirSession, lancer, creerVerificateur, attendre, pause } from './us45-banc.mjs'

const gabarits = process.argv[2] ? [process.argv[2]] : ['bureau', 'mobile']
const navigateur = await lancer('chromium')
for (const gabarit of gabarits) {
  const v = creerVerificateur(`US-45 CA3/CA4 fiches (${gabarit})`)
  const s = await ouvrirSession({ navigateur, moteur: 'chromium', gabarit })
  const { page, serveur, profil, idb, idbPut, chemin, requetes } = s
  const fiche = page.locator('[data-role="fiche-film"]')
  const texte = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ').trim()
  /** Active une entree du menu « ⋯ » au clavier (Entree) : vaut pour le menu actuel et celui d'ui-7. */
  const activer = async (nom) => {
    const menu = page.locator('[role="menu"]')
    await menu.waitFor()
    const item = menu.getByRole('menuitem', { name: nom })
    await item.focus()
    await page.keyboard.press('Enter')
    await attendre(async () => (await menu.count()) === 0, { quoi: 'menu ferme' })
  }
  const toast = () => page.locator('[data-role="toast"]')
  /** Sort du lecteur par Echap (qui ferme d'abord un calque ouvert : decompte, fin). */
  const sortir = async () => {
    for (let i = 0; i < 4 && /^\/lecture/.test(await chemin()); i++) {
      await page.locator('[tabindex="-1"]').first().focus().catch(() => {})
      await page.keyboard.press('Escape')
      await pause(400)
    }
    await attendre(async () => !/^\/lecture/.test(await chemin()), { quoi: 'sortie du lecteur' })
  }
  const ouvrirFiche = async (chemin_) => {
    await page.goto(`${serveur.origine}${chemin_}`)
    await page.locator('[data-role="actions-fiche"]').first().waitFor()
    await pause(400)
  }
  try {
    const t = Date.now()
    // Reprises semees : film 5001 entame (42 min sur 1 h 40), film 5002 vu (92 %), film 5003 sous la minute,
    // serie 1 : S01E01 vu, S01E02 entame (23 min restantes).
    await idbPut('reprises', { cle: 'vod:iptva:5001', position: 3480, duree: 6000, vuLe: t - 1000 })
    await idbPut('reprises', { cle: 'vod:iptva:5002', position: 5520, duree: 6000, vuLe: t - 2000 })
    await idbPut('reprises', { cle: 'vod:iptva:5003', position: 45, duree: 6000, vuLe: t - 3000 })
    await idbPut('reprises', { cle: 'series:iptva:500111.mkv', position: 2400, duree: 2400, vuLe: t - 4000, serie: 'series:iptva:s5001' })
    await idbPut('reprises', { cle: 'series:iptva:500112.mkv', position: 1020, duree: 2400, vuLe: t - 3500, serie: 'series:iptva:s5001' })
    await serveur.appel('a-voir', { profil, elements: [{ contenu: 'vod:iptva:5005' }] })
    await serveur.appel('preparation', { contenu: 'vod:iptva:5005', reglage: { etat: 'en_cours', octets: 420, total: 1000, debit_kbps: 2100 } })
    await serveur.appel('disponibilite', { id: 'iptva:5004', reponse: { etat: 'lent', debit_kbps: 2700, requis_kbps: 4400 } })
    await serveur.appel('disponibilite', { id: 'iptva:500211.mkv', reponse: { etat: 'lent', debit_kbps: 1500, requis_kbps: 4400 } })

    // ============================================================ FICHE FILM (CA3)
    console.log(`[${gabarit}] fiche film`)
    await ouvrirFiche('/film/vod:iptva:5000')
    const boutons = async () => (await fiche.locator('[data-role="actions-fiche"]').getByRole('button').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim())
    v.ok((await boutons())[0] === 'Regarder', `CA3 film jamais ouvert : « Regarder » (${JSON.stringify(await boutons())})`)
    v.ok((await fiche.getByRole('button', { name: /favoris/i }).count()) === 0, 'CA3 plus d etoile favori sur la fiche film (favoris = chaines)')
    v.ok((await fiche.locator('[data-role="progression"]').count()) === 0, 'CA3 aucune barre sans position')

    await ouvrirFiche('/film/vod:iptva:5001')
    v.ok(/^Reprendre · 42 min$/.test((await boutons())[0] ?? ''), `CA3 film entame : « Reprendre · 42 min » (${(await boutons())[0]})`)
    v.ok((await boutons()).includes('Recommencer'), 'CA3 ... et « Recommencer » en secondaire')
    v.ok((await fiche.locator('[data-role="reprise-fiche"] [data-role="progression"]').count()) === 1, 'CA3 barre de progression sous le titre')
    v.ok(/reste 42 min/.test(await texte(fiche.locator('[data-role="reprise-fiche"]'))), 'CA3 « reste 42 min »')
    // Recommencer : la position repart de zero AVANT l'ouverture, puis le lecteur s'ouvre.
    await fiche.getByRole('button', { name: 'Recommencer' }).click()
    await attendre(async () => (await chemin()) === '/lecture/vod:iptva:5001', { quoi: 'lecteur' })
    v.ok((await idb('reprises', 'vod:iptva:5001'))?.position === 0, 'CA3 « Recommencer » remet la position a zero et ouvre le lecteur')
    v.ok((await page.locator('[data-role="reprise"]').count()) === 0, 'CA3 plus jamais de dialogue « Reprendre ? » dans le lecteur')
    await pause(500)
    await sortir()

    await ouvrirFiche('/film/vod:iptva:5002')
    v.ok((await boutons())[0] === 'Regarder à nouveau', `CA3 film vu : « Regarder à nouveau » (${(await boutons())[0]})`)
    v.ok(/✓ Vu le/.test(await texte(fiche.locator('[data-role="chip-vu"]'))), `CA3 chip « ${await texte(fiche.locator('[data-role="chip-vu"]'))} »`)
    // Menu ⋯ : Marquer comme non vu, avec « Annuler ».
    await fiche.locator('[data-role="menu-fiche"]').click()
    const entrees = await page.locator('[role="menu"] [role="menuitem"]').allInnerTexts()
    v.ok(entrees.includes('Marquer comme non vu') && entrees.includes('Recommencer'), `CA3 menu ⋯ : ${JSON.stringify(entrees)}`)
    await activer('Marquer comme non vu')
    await attendre(async () => (await idb('reprises', 'vod:iptva:5002')) === undefined, { quoi: 'reprise effacee' })
    v.ok(true, 'CA3 « Marquer comme non vu » = reprise effacee')
    await attendre(async () => (await boutons())[0] === 'Regarder', { quoi: 'bouton Regarder' })
    v.ok(await attendre(async () => (await toast().count()) === 1 && /non vu/.test(await toast().innerText()), { delai: 3000 }).catch(() => false), 'CA3 toast « marqué comme non vu · Annuler »')
    await toast().getByRole('button', { name: 'Annuler' }).click()
    await attendre(async () => (await idb('reprises', 'vod:iptva:5002'))?.position === 5520, { quoi: 'annulation' })
    v.ok(true, 'CA3 « Annuler » restaure la position')
    await attendre(async () => (await boutons())[0] === 'Regarder à nouveau', { quoi: 'bouton restaure' })

    await ouvrirFiche('/film/vod:iptva:5003')
    v.ok((await boutons())[0] === 'Regarder' && (await fiche.locator('[data-role="progression"]').count()) === 0, 'CA3 sous 60 s : « Regarder », pas de barre')
    // Marquer comme vu un film jamais ouvert : la duree vient des details.
    await ouvrirFiche('/film/vod:iptva:5006')
    await fiche.locator('[data-role="menu-fiche"]').click()
    await activer('Marquer comme vu')
    await attendre(async () => { const r = await idb('reprises', 'vod:iptva:5006'); return r && r.duree > 0 && r.position === r.duree }, { quoi: 'marque vu' })
    v.ok(true, 'CA3 « Marquer comme vu » = position a la duree')
    await attendre(async () => (await fiche.locator('[data-role="chip-vu"]').count()) === 1, { quoi: 'chip vu' })

    // Chip de preparation et sonde.
    await ouvrirFiche('/film/vod:iptva:5005')
    await attendre(async () => (await fiche.locator('[data-role="chip-preparation"]').count()) === 1, { quoi: 'chip' })
    v.ok(/En préparation · 42 %/.test(await texte(fiche.locator('[data-role="chip-preparation"]'))), `CA3 chip d etat : « ${await texte(fiche.locator('[data-role="chip-preparation"]'))} »`)
    v.ok((await fiche.locator('[data-role="disponibilite"]').count()) === 0, 'CA3 dans Ma liste : pas de ligne de sonde')
    v.ok((await fiche.locator('[data-role="a-voir"]').count()) === 1, 'CA3 un seul bouton Ma liste')
    await ouvrirFiche('/film/vod:iptva:5004')
    await fiche.locator('[data-role="disponibilite"]').waitFor()
    v.ok((await fiche.locator('[data-role="disponibilite"] [data-role="a-voir"]').count()) === 0 && (await fiche.locator('[data-role="a-voir"]').count()) === 1, 'CA3 hors liste, sonde lente : la ligne de sonde, et UN seul bouton Ma liste (dans les actions)')

    // ============================================================ FICHE SERIE (CA3/CA4)
    console.log(`[${gabarit}] fiche serie`)
    const episodes = page.locator('[data-role="episode"]')
    const principale = page.locator('[data-role="action-principale"]')
    await page.goto(`${serveur.origine}/serie/series:iptva:s5002`)
    await episodes.first().waitFor()
    await principale.waitFor()
    v.ok((await texte(principale)) === 'Lire S01E01', `CA3 serie jamais ouverte : « ${await texte(principale)} »`)
    v.ok(!/iptva:s5002/.test(await page.locator('[data-role="fiche-serie"]').innerText()), 'CA9 aucun identifiant interne dans l en-tete')
    const sondes = (id) => requetes((r) => r.chemin === `/api/v1/vod/${id}/disponibilite`).length
    await attendre(() => sondes('iptva:500211.mkv') === 1, { quoi: 'sonde S01E01' })
    await page.getByRole('tab', { name: /Saison 2/ }).click()
    await pause(1200)
    v.ok(sondes('iptva:500211.mkv') === 1 && sondes('iptva:500221.mkv') === 0, 'CA4 la sonde part UNE fois par fiche, pas par onglet de saison')
    await page.getByRole('tab', { name: /Saison 1/ }).click()
    v.ok(await attendre(async () => (await episodes.count()) === 3 && (await episodes.first().locator('[data-role="menu-fiche"]').count()) === 1, { delai: 3000 }).catch(() => false), 'CA4 un menu « ⋯ » sur chaque ligne d episode')
    v.ok((await page.locator('header [data-role="a-voir"]').count()) === 1, 'CA4 un seul bouton Ma liste dans l en-tete')
    // Menu de la ligne E03 : Ma liste a partir d'ici.
    await episodes.nth(2).locator('[data-role="menu-fiche"]').click()
    const entreesLigne = await page.locator('[role="menu"] [role="menuitem"]').allInnerTexts()
    v.ok(entreesLigne.join('|') === 'Lire|Marquer comme vu|Ma liste à partir d’ici', `CA4 menu de ligne : ${JSON.stringify(entreesLigne)}`)
    await activer('Ma liste à partir d’ici')
    await attendre(() => s.serveur.etat.aVoir.get(profil)?.find((e) => e.contenu === 'serie:iptva:s5002')?.depuis?.episode === 3, { quoi: 'depuis S01E03 au serveur' })
    v.ok(true, 'CA4 « Ma liste a partir d ici » : la serie entre dans la liste des S01E03')
    await attendre(async () => /dès S01E03/.test(await texte(page.locator('header [data-role="a-voir"]'))), { quoi: 'en-tete « des S01E03 »' })
    v.ok(true, `CA4 en-tete : « ${await texte(page.locator('header [data-role="a-voir"]'))} »`)
    v.ok(await attendre(async () => (await episodes.nth(2).locator('[data-role="point-de-depart"]').count()) === 1, { delai: 3000 }).catch(() => false), 'CA4 la ligne E03 dit « Point de depart »')
    await episodes.nth(2).locator('[data-role="menu-fiche"]').click()
    v.ok((await page.locator('[role="menu"] [role="menuitem"]').allInnerTexts()).includes('Ne plus partir d’ici'), 'CA4 son menu propose « Ne plus partir d ici » (jamais un retrait de la serie)')
    await activer('Ne plus partir d’ici')
    await attendre(() => { const e = s.serveur.etat.aVoir.get(profil)?.find((x) => x.contenu === 'serie:iptva:s5002'); return e && !e.depuis }, { quoi: 'depuis retire' })
    v.ok(s.serveur.etat.aVoir.get(profil)?.some((x) => x.contenu === 'serie:iptva:s5002'), 'CA4 la serie reste dans Ma liste')
    // Menu de la saison : marquer vue, puis l'action principale passe a la saison suivante.
    await page.locator('[data-role="menu-fiche"][aria-label^="Options de la saison"]').click()
    await activer('Marquer la saison comme vue')
    await attendre(async () => (await texte(principale)) === 'Épisode suivant S02E01', { quoi: 'saison vue' })
    v.ok(true, 'CA4 « Marquer la saison comme vue » : 3 lignes ✓ Vu, action « Épisode suivant S02E01 »')
    v.ok((await episodes.locator('[data-role="etat-episode"][data-etat="vu"]').count()) === 3, 'CA4 chaque ligne dit « ✓ Vu »')
    v.ok(await attendre(async () => (await toast().count()) === 1, { delai: 3000 }).catch(() => false), 'CA4 toast avec « Annuler »')
    await toast().getByRole('button', { name: 'Annuler' }).click()
    await attendre(async () => (await texte(principale)) === 'Lire S01E01', { quoi: 'annulation' })
    v.ok(true, 'CA4 « Annuler » rend la saison non vue')

    // Serie 1 : S01E01 vu, S01E02 entame -> Reprendre S01E02 · 23 min, barre, lignes.
    await page.goto(`${serveur.origine}/serie/series:iptva:s5001`)
    await episodes.first().waitFor()
    await principale.waitFor()
    await attendre(async () => /^Reprendre S01E02/.test(await texte(principale)), { quoi: 'reprendre' })
    v.ok((await texte(principale)) === 'Reprendre S01E02 · 23 min', `CA3 serie entamee : « ${await texte(principale)} »`)
    v.ok((await page.locator('header [data-role="reprise-fiche"] [data-role="progression"]').count()) === 1, 'CA3 barre de progression sous le titre')
    v.ok(/✓ Vu/.test(await texte(episodes.nth(0))), 'CA4 ligne E01 : ✓ Vu')
    v.ok((await episodes.nth(1).locator('[data-role="progression"]').count()) === 1 && /23 min/.test(await texte(episodes.nth(1))), 'CA4 ligne E02 : barre + « 23 min »')
    await principale.click()
    await attendre(async () => (await chemin()) === '/lecture/series:iptva:500112.mkv', { quoi: 'reprise de S01E02' })
    v.ok(true, 'CA3 l action principale lance l episode a lire')
    await pause(500)
    await sortir()
    // Menus « vu » : la saison remise a zero, puis E01 vu -> « Épisode suivant S01E02 », puis non vu -> « Lire S01E01 ».
    await page.goto(`${serveur.origine}/serie/series:iptva:s5001`)
    await episodes.first().waitFor()
    await page.locator('[data-role="menu-fiche"][aria-label^="Options de la saison"]').click()
    await activer('Marquer la saison comme non vue')
    await attendre(async () => (await texte(principale)) === 'Lire S01E01', { quoi: 'saison non vue' })
    await episodes.nth(0).locator('[data-role="menu-fiche"]').click()
    await activer('Marquer comme vu')
    await attendre(async () => (await texte(principale)) === 'Épisode suivant S01E02', { quoi: 'suivant' })
    v.ok(true, 'CA4 « Marquer comme vu » sur E01 : action « Épisode suivant S01E02 »')
    const r11 = await idb('reprises', 'series:iptva:500111.mkv')
    v.ok(r11 && r11.position === r11.duree && r11.serie === 'series:iptva:s5001', `CA4 reprise a la duree, serie associee (${JSON.stringify(r11)})`)
    await episodes.nth(0).locator('[data-role="menu-fiche"]').click()
    await activer('Marquer comme non vu')
    await attendre(async () => (await idb('reprises', 'series:iptva:500111.mkv')) === undefined, { quoi: 'non vu' })
    v.ok(true, 'CA4 « Marquer comme non vu » = reprise effacee')

    // Gabarit : tout tient dans la largeur (D6, C15).
    const mesures = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth
      const h = document.querySelector('[data-role="entete-serie"]')
      const l = document.querySelector('[data-role="episode"]')
      const f = document.querySelector('[data-role="fiche-serie"]')
      return { vw, entete: h?.getBoundingClientRect().right, ligne: l?.getBoundingClientRect().right, deborde: f ? f.scrollWidth > f.clientWidth : null }
    })
    v.ok(mesures.entete <= mesures.vw + 1 && mesures.ligne <= mesures.vw + 1 && mesures.deborde === false, `CA4 en-tete et lignes dans la fenetre (${JSON.stringify(mesures)})`)
    if (gabarit === 'mobile') {
      const boite = await episodes.first().locator('[data-role="menu-fiche"]').boundingBox()
      v.ok(boite && boite.width >= 44 && boite.height >= 44, `CA4 bouton « ⋯ » 44 px au tactile (${boite?.width}×${boite?.height})`)
      const duree = await episodes.first().evaluate((el) => Array.from(el.querySelectorAll('span')).some((s) => /40:00/.test(s.textContent) && s.getBoundingClientRect().right <= document.documentElement.clientWidth))
      v.ok(duree, 'CA4 la duree de l episode reste visible a 390 px')
    }

    v.ok(s.erreurs.length === 0, `aucune erreur de page (${s.erreurs.join(' | ') || 'aucune'})`)
    v.ok(s.violations.length === 0, 'aucune requete hors 127.0.0.1')
  } catch (e) {
    v.ok(false, `exception : ${e.stack}`)
  } finally {
    await s.fermer()
    v.termine()
  }
}
await navigateur.close()
