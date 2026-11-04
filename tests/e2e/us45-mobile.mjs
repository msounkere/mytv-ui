// US-45 CA6 (D2, D3, B5, D19, B UX9, D8) : lecteur telephone et tablette -- barre de commandes qui
// tient dans la largeur (essentielles + « ⋯ »), carte d'erreur AU-DESSUS des commandes (390×844 et
// 844×390), tap = commandes + bouton central, double-tap lateral = ±10 s, paysage = toute la hauteur.
// Trois moteurs. Base : audits D/balayage.mjs (mesures), B/04-erreurs-diffusion.mjs.
//   npm run build && NODE_OPTIONS=--tls-max-v1.2 node tests/e2e/us45-mobile.mjs
import { ouvrirSession, lancer, moteursDemandes, creerVerificateur, attendre, pause } from './us45-banc.mjs'

for (const moteur of moteursDemandes()) {
  for (const gabarit of ['mobile', 'paysage']) {
    const v = creerVerificateur(`US-45 CA6 lecteur ${gabarit} (${moteur})`)
    const navigateur = await lancer(moteur)
    const s = await ouvrirSession({ navigateur, moteur, gabarit })
    const { page, serveur, video, commandes, videosAvecSource } = s
    const vw = gabarit === 'mobile' ? 390 : 844
    const boites = async () => commandes().getByRole('button').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => { const r = e.getBoundingClientRect(); return { nom: e.getAttribute('aria-label'), x: r.left, d: r.right, h: r.height, w: r.width } }))
    const tap = async (x, y) => { if (moteur === 'firefox') await page.mouse.click(x, y); else await page.touchscreen.tap(x, y) }
    try {
      // --- 1. Barre compacte qui tient dans la largeur ------------------------------------------------
      console.log(`[${moteur}/${gabarit}] 1. barre compacte`)
      await s.ouvrirLecture('vod:iptva:5001')
      await page.waitForFunction(() => (document.querySelector('video')?.readyState ?? 0) >= 2, null, { timeout: 20_000 })
      await pause(500)
      const b = await boites()
      const noms = b.map((x) => x.nom)
      v.ok(b.every((x) => x.d <= vw + 1 && x.x >= -1), `CA6 toutes les commandes dans ${vw} px (${JSON.stringify(b.map((x) => `${x.nom}@${Math.round(x.d)}`))})`)
      for (const n of ['Reculer de 10 secondes', 'Avancer de 10 secondes', 'Plein écran', 'Plus d’options'])
        v.ok(noms.includes(n), `CA6 essentielle presente : ${n}`)
      v.ok(noms.some((n) => /Couper le son|Rétablir le son/.test(n)), 'CA6 essentielle presente : muet')
      v.ok(!noms.includes('Arrêter le flux') && !noms.includes('Diffuser vers un téléviseur'), 'CA6 Arrêter et Diffuser ont rejoint le menu « ⋯ »')
      v.ok(b.every((x) => x.h >= 44 && x.w >= 44), 'CA6 cibles >= 44 px')
      v.ok((await page.locator('[data-role="lecture-centrale"]').count()) === 1, 'CA6 gros bouton central lecture/pause')
      // Menu ⋯ : Diffuser, Qualité, Infos, Ma liste, Arrêter.
      await commandes().getByRole('button', { name: 'Plus d’options' }).click()
      const menu = page.locator('[data-role="menu-lecteur"]')
      await menu.waitFor()
      const entrees = await menu.getByRole('menuitem').allInnerTexts()
      v.ok(['Diffuser vers un téléviseur', 'Qualité', 'Informations', 'Ma liste', 'Arrêter le flux'].every((n) => entrees.some((e) => e.startsWith(n))), `CA6 menu « ⋯ » : ${JSON.stringify(entrees.map((e) => e.split('\n')[0]))}`)
      const boiteMenu = await menu.boundingBox()
      const boiteVideo = await page.locator('video').boundingBox()
      v.ok(boiteMenu && boiteVideo && boiteMenu.y >= boiteVideo.y - 1 && boiteMenu.y + boiteMenu.height <= boiteVideo.y + boiteVideo.height + 1, 'CA6 le menu reste dans la zone video')
      await page.keyboard.press('Escape')
      await attendre(async () => (await menu.count()) === 0, { quoi: 'Echap ferme le menu' })
      v.ok(/^\/lecture/.test(await s.chemin()), 'CA8 Echap ferme le menu sans quitter')

      // --- 2. Tap sur la video = commandes affichees / masquees ; double-tap lateral = ±10 s --------------
      console.log(`[${moteur}/${gabarit}] 2. gestes`)
      const opacite = () => commandes().evaluate((e) => getComputedStyle(e).opacity)
      // Le media factice dure 6 s : en boucle, pour que la fin de lecture ne vienne pas poser son calque.
      await page.evaluate(() => { const vi = document.querySelector('video'); vi.loop = true; vi.currentTime = 0; return vi.play() })
      await pause(3800)
      v.ok((await opacite()) === '0', 'commandes masquees apres 3,2 s de lecture')
      // A mi-hauteur (entre la barre du haut et celle du bas), decale du bouton central.
      const centre = { x: boiteVideo.x + boiteVideo.width * 0.3, y: boiteVideo.y + boiteVideo.height * 0.5 }
      await tap(centre.x, centre.y)
      v.ok(await attendre(async () => (await opacite()) === '1', { delai: 3000 }).catch(() => false), 'CA6 un tap montre les commandes')
      await pause(400)
      await tap(centre.x, centre.y)
      v.ok(await attendre(async () => (await opacite()) === '0', { delai: 3000 }).catch(() => false), 'CA6 un second tap les masque')
      // Sans boucle : +10 s sur un media de 6 s doit buter sur la fin, pas repartir de zero.
      await page.evaluate(() => { const vi = document.querySelector('video'); vi.loop = false; vi.currentTime = 1 })
      await pause(300)
      const tAvant = (await video()).t
      const droite = { x: boiteVideo.x + boiteVideo.width * 0.85, y: boiteVideo.y + boiteVideo.height * 0.5 }
      await tap(droite.x, droite.y)
      await pause(120)
      await tap(droite.x, droite.y)
      await pause(600)
      const tApres = (await video()).t
      v.ok(tApres >= Math.min(tAvant + 8, (await video()).d - 0.5), `CA6 double-tap a droite = +10 s (${tAvant.toFixed(1)} -> ${tApres.toFixed(1)} s)`)
      // Paysage : la video occupe la hauteur disponible.
      if (gabarit === 'paysage') {
        const mesure = await page.evaluate(() => {
          const z = document.querySelector('video').getBoundingClientRect()
          const m = document.querySelector('main').getBoundingClientRect()
          return { video: z.height, main: m.height }
        })
        v.ok(mesure.video >= mesure.main * 0.8, `CA6 paysage : la video prend la hauteur disponible (${Math.round(mesure.video)} / ${Math.round(mesure.main)} px)`)
      }

      // --- 3. Carte d'erreur au-dessus des commandes : « Réessayer » et « Retour » atteignables ------------
      console.log(`[${moteur}/${gabarit}] 3. erreur`)
      await page.route('**/api/v1/vod/iptva:5002*', (route) => route.fulfill({ status: 415, headers: { 'X-Mytv-Erreur': 'format_non_lisible' }, body: '' }))
      await page.goto(`${serveur.origine}/lecture/vod:iptva:5002`)
      const alerte = page.locator('[role="alert"]')
      await alerte.waitFor({ timeout: 20_000 })
      const boutonsAlerte = await alerte.getByRole('button').allInnerTexts()
      v.ok(boutonsAlerte[0] === 'Réessayer', `CA6 « Réessayer » en premier (${JSON.stringify(boutonsAlerte)})`)
      const dessus = await alerte.getByRole('button', { name: 'Retour' }).evaluate((b) => { b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return e === b || b.contains(e) })
      v.ok(dessus, 'CA6 le bouton « Retour » de la carte est au-dessus de tout (atteignable)')
      v.ok((await alerte.locator('[data-role="erreur-detail"] code').isVisible()) === false, 'CA9 le detail technique est replie')
      await alerte.getByRole('button', { name: 'Retour' }).click()
      await attendre(async () => !/^\/lecture/.test(await s.chemin()), { quoi: 'retour' })
      v.ok(await attendre(async () => (await videosAvecSource()) === 0, { delai: 3000 }).catch(() => false), 'CA1 « Retour » de l erreur detache le flux')
      await page.unroute('**/api/v1/vod/iptva:5002*')

      v.ok(s.erreurs.length === 0, `aucune erreur de page (${s.erreurs.join(' | ') || 'aucune'})`)
      v.ok(!s.plante(), 'la page n a pas plante')
    } catch (e) {
      v.ok(false, `exception : ${e.stack}`)
    } finally {
      await s.fermer()
      await navigateur.close()
      v.termine()
    }
  }
}
