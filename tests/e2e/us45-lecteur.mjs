// US-45 CA8 (B3, B7, A2, B13, D7) et CA9 (B UX10, B UX17, B UX19, A UX17/UX20) : la qualite reprend au
// point atteint ; un seul reglage « Qualité » (Auto / Éco) ; l'image dans l'image refusee = message discret ;
// Echap ferme d'abord tout calque ; colonne « Pistes » seulement avec un choix ; aucun identifiant interne
// visible ; panneau Infos d'un episode (titre, numero, resume).
// Base : audits B/01-fiche-film-lecteur.mjs, B/02-serie-enchainement.mjs, D/balayage.mjs.
//   npm run build && NODE_OPTIONS=--tls-max-v1.2 node tests/e2e/us45-lecteur.mjs
import { ouvrirSession, lancer, creerVerificateur, attendre, pause } from './us45-banc.mjs'

const v = creerVerificateur('US-45 CA8/CA9 lecteur')
const navigateur = await lancer('chromium')
const s = await ouvrirSession({ navigateur, moteur: 'chromium', scripts: [() => { Object.defineProperty(window, 'documentPictureInPicture', { value: undefined, configurable: true }) }] })
const { page, serveur, video, commandes, requetes, chemin } = s
const texte = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ').trim()
try {
  // --- 1. Qualite Auto/Eco : reprise au point atteint (CA8, B3) ----------------------------------------
  console.log('1. qualite')
  await s.ouvrirLecture('vod:iptva:5000')
  await page.waitForFunction(() => (document.querySelector('video')?.readyState ?? 0) >= 2, null, { timeout: 20_000 })
  // Le media factice dure 6 s : en boucle, pour que la fin de lecture ne pose pas son calque pendant les etapes 1 a 3.
  await page.evaluate(() => { const vi = document.querySelector('video'); vi.loop = true; vi.currentTime = 3.5; return vi.play().catch(() => {}) })
  await pause(900)
  const tAvant = (await video()).t
  await page.mouse.move(600, 100)
  await commandes().getByRole('button', { name: /^Qualité/ }).click()
  await attendre(() => requetes((r) => r.chemin === '/api/v1/vod/iptva:5000' && /qualite=eco/.test(r.requete)).length >= 1, { quoi: 'reouverture eco' })
  await attendre(async () => (await video())?.ready >= 1 && /qualite=eco/.test((await video()).currentSrc ?? ''), { quoi: 'media eco' })
  await pause(700)
  const tApres = (await video()).t
  v.ok(tApres >= tAvant - 2.5, `CA8 Éco rouvre au point atteint (${tAvant.toFixed(1)} -> ${tApres.toFixed(1)} s)`)
  await page.mouse.move(600, 100)
  await commandes().getByRole('button', { name: /^Qualité/ }).click()
  await attendre(async () => !/qualite=eco/.test((await video())?.currentSrc ?? ''), { quoi: 'retour auto' })
  await page.evaluate(() => { document.querySelector('video').loop = true })

  // --- 2. PiP refuse : message discret, pas d'erreur, pas de reouverture (CA8, B7) ------------------------
  console.log('2. pip')
  await attendre(async () => (await video())?.ready >= 1)
  const nGet = requetes((r) => r.chemin === '/api/v1/vod/iptva:5000' && r.methode === 'GET').length
  await page.mouse.move(600, 100)
  await commandes().getByRole('button', { name: "Image dans l'image" }).click()
  await pause(1200)
  v.ok((await page.locator('[role="alert"]').count()) === 0, 'CA8 PiP refuse : aucune carte d erreur')
  v.ok(/Image dans l’image indisponible/.test(await page.locator('[data-role="notification"]').innerText().catch(() => '')), 'CA8 ... un message discret')
  v.ok(requetes((r) => r.chemin === '/api/v1/vod/iptva:5000' && r.methode === 'GET').length === nGet, 'CA8 ... et aucune reouverture du flux')

  // --- 3. Echap ferme d'abord les calques (CA8, B13/D7) ---------------------------------------------------
  console.log('3. echap')
  await page.locator('[tabindex="-1"]').first().focus()
  await page.keyboard.press('i')
  await page.locator('[role="dialog"][aria-label^="Informations"]').waitFor()
  await page.keyboard.press('Escape')
  await pause(300)
  v.ok((await page.locator('[role="dialog"][aria-label^="Informations"]').count()) === 0 && /^\/lecture/.test(await chemin()), 'CA8 Echap ferme Infos sans quitter')
  await page.keyboard.press('c')
  await page.locator('[role="dialog"][aria-label="Diffuser sur un écran"]').waitFor()
  await page.keyboard.press('Escape')
  await pause(300)
  v.ok((await page.locator('[role="dialog"][aria-label="Diffuser sur un écran"]').count()) === 0 && /^\/lecture/.test(await chemin()), 'CA8 Echap ferme Diffuser sans quitter')
  // Variantes (direct) : Echap ferme le panneau, pas le lecteur (D7).
  await page.goto(`${serveur.origine}/lecture/live:iptva:100000`)
  await page.locator('[data-role="commandes"]').waitFor({ state: 'attached' })
  await pause(1500)
  await page.locator('[tabindex="-1"]').first().focus()
  await page.keyboard.press('v')
  await page.locator('[data-role="variantes"]').waitFor()
  await page.keyboard.press('Escape')
  await pause(300)
  v.ok((await page.locator('[data-role="variantes"]').count()) === 0 && /^\/lecture/.test(await chemin()), 'CA8 Echap ferme Variantes sans quitter (D7)')
  v.ok(!/iptva:|manifestLoadError|127\.0\.0\.1/.test(await page.locator('.couche-lecteur').evaluate((e) => Array.from(e.querySelectorAll('*')).filter((x) => x.children.length === 0 && (x.checkVisibility ? x.checkVisibility({ contentVisibilityAuto: true }) : x.offsetParent !== null)).map((x) => x.textContent).join(' '))), 'CA9 aucun identifiant interne visible dans le lecteur (direct en erreur compris)')
  const detail = page.locator('[data-role="erreur-detail"]')
  v.ok((await detail.count()) === 1 && !(await detail.locator('code').isVisible()), 'CA9 le diagnostic brut est replie derriere « Détails techniques »')

  // --- 4. Panneau « Lecteur » : un seul reglage Qualité, Auto / Éco, lu par le lecteur (CA8, A2) ----------
  console.log('4. panneau lecteur')
  await page.getByRole('button', { name: /Lecteur : qualité/ }).click()
  const panneau = page.locator('[role="dialog"][aria-label^="Lecteur"]')
  await panneau.waitFor()
  const options = await panneau.getByRole('menuitemradio').allInnerTexts()
  v.ok(options.length === 2 && /Auto/.test(options[0]) && /Éco/.test(options[1]), `CA8 panneau : Auto / Éco seulement (${JSON.stringify(options.map((o) => o.split('\n')[0]))})`)
  await panneau.getByRole('menuitemradio', { name: /Éco/ }).click()
  await attendre(async () => (await page.evaluate(() => localStorage.getItem('mytv.qualite'))) === 'eco', { quoi: 'qualite memorisee' })
  v.ok(true, 'CA8 le choix du panneau est celui du lecteur (mytv.qualite = eco)')
  await page.getByRole('button', { name: /Lecteur : qualité/ }).click()
  await panneau.waitFor()
  await panneau.getByRole('menuitemradio', { name: /Auto/ }).click()

  // --- 5. Colonne « Pistes » seulement avec un choix ; infos d'un episode (CA9) ---------------------------
  console.log('5. pistes et infos episode')
  await page.goto(`${serveur.origine}/lecture/vod:iptva:5003`)
  await page.locator('[data-role="commandes"]').waitFor({ state: 'attached' })
  await page.waitForFunction(() => (document.querySelector('video')?.readyState ?? 0) >= 1, null, { timeout: 20_000 })
  await pause(500)
  v.ok((await page.locator('.couche-lecteur aside').count()) === 0, 'CA9 MP3/MP4 sans piste : pas de colonne « Pistes » (ni de messages techniques permanents)')
  await page.goto(`${serveur.origine}/serie/series:iptva:s5003`)
  await page.locator('[data-role="episode"]').first().getByRole('button').first().click()
  await attendre(async () => (await chemin()) === '/lecture/series:iptva:500311.mkv', { quoi: 'episode' })
  await pause(800)
  await page.locator('[tabindex="-1"]').first().focus()
  await page.keyboard.press('i')
  const infos = page.locator('[role="dialog"][aria-label="Informations sur l’épisode"]')
  await infos.waitFor()
  const t = await texte(infos.locator('[data-role="infos-episode"]'))
  v.ok(/S01E01/.test(t) && /Épisode 1/.test(t) && /Résumé de l'épisode 1/.test(t), `CA9 infos d un episode : numero, titre, resume (« ${t.slice(0, 80)} »)`)
  v.ok((await infos.getByRole('button', { name: /favori/i }).count()) === 0, 'CA9 plus de favori sur un film ou un episode')

  v.ok(s.erreurs.length === 0, `aucune erreur de page (${s.erreurs.join(' | ') || 'aucune'})`)
  v.ok(s.violations.length === 0, 'aucune requete hors 127.0.0.1')
} catch (e) {
  v.ok(false, `exception : ${e.stack}`)
} finally {
  await s.fermer()
  await navigateur.close()
  v.termine()
}
