// US-45 CA1 (B1, D1) : « Arrêter le flux », « Fermer la lecture », « Retour » du panneau
// d'erreur et Échap DETACHENT la video, enregistrent la position de sortie dans `reprises`
// (et l'envoient tout de suite au serveur), demontent la couche du lecteur, sans « Stale read ».
// Trois moteurs. Base : /opt/mytv-work/audit/D/zombie.mjs et B/01-fiche-film-lecteur.mjs.
//   npm run build && NODE_OPTIONS=--tls-max-v1.2 node tests/e2e/us45-arret.mjs
import { ouvrirSession, lancer, moteursDemandes, creerVerificateur, attendre, pause } from './us45-banc.mjs'

for (const moteur of moteursDemandes()) {
  const v = creerVerificateur(`US-45 CA1 arret (${moteur})`)
  const navigateur = await lancer(moteur)
  const s = await ouvrirSession({ navigateur, moteur, gabarit: moteur === 'webkit' ? 'mobile' : 'bureau' })
  const { page, serveur, idb, video, videosAvecSource, etatCouche, reveil, chemin, requetes, commandes } = s
  try {
    const putsHistorique = (cle) => requetes((r) => r.chemin === `/api/v1/profil/historique/${cle}` && r.methode === 'PUT')
    const apresArret = async (nom, cle) => {
      await pause(700)
      v.ok(await videosAvecSource() === 0, `CA1 ${nom} : aucune <video> avec source dans le document`)
      v.ok(s.erreurs.length === 0, `CA1 ${nom} : pageerror = 0 (${s.erreurs.join(' | ') || 'aucune'})`)
      const r = await attendre(async () => { const x = await idb('reprises', cle); return x && x.position > 0.5 && x.position < x.duree ? x : false }, { delai: 5000 }).catch(() => idb('reprises', cle))
      v.ok(r && r.position > 0.5 && r.position < r.duree, `CA1 ${nom} : position de sortie dans reprises (${JSON.stringify(r)})`)
      v.ok(await attendre(() => putsHistorique(cle.replace(/^vod:/, '')).length >= 1, { delai: 4000 }).catch(() => false), `CA1 ${nom} : PUT /profil/historique immediat (keepalive)`)
      v.ok(!(await etatCouche()).presente, `CA1 ${nom} : la couche du lecteur est demontee`)
    }
    /** « Arrêter le flux » : dans la barre (bureau) ou dans le menu « ⋯ » (telephone, tablette : CA6). */
    const arreterParLesCommandes = async () => {
      await reveil()
      const croix = commandes().getByRole('button', { name: 'Arrêter le flux' })
      if (await croix.count()) return croix.click()
      await commandes().getByRole('button', { name: 'Plus d’options' }).click()
      await page.locator('[data-role="menu-lecteur"]').getByRole('menuitem', { name: 'Arrêter le flux' }).click()
    }
    const semer = async (cle) => {
      await s.ouvrirLecture(cle)
      await page.waitForFunction(() => (document.querySelector('video')?.readyState ?? 0) >= 2, null, { timeout: 20_000 })
      await page.evaluate(() => { const vi = document.querySelector('video'); vi.currentTime = 1.5; return vi.play().catch(() => {}) })
      await pause(600)
      v.ok((await video())?.t >= 1, `lecture en cours a t=${(await video())?.t?.toFixed(1)} s`)
    }

    // --- 1. Retour (mini-lecteur), Revenir, puis la croix « Arrêter le flux » ------------------
    console.log(`[${moteur}] 1. croix apres un aller-retour par le mini-lecteur`)
    await semer('vod:iptva:5001')
    await reveil()
    await commandes().getByRole('button', { name: 'Retour' }).click()
    await pause(500)
    v.ok((await etatCouche()).presente && !(await etatCouche()).visible, 'Retour : la lecture continue, couche masquee (mini-lecteur)')
    await page.locator('[data-role="mini-lecteur"]').getByRole('button', { name: 'Revenir au lecteur' }).first().click()
    await attendre(async () => /^\/lecture\//.test(await chemin()), { quoi: 'retour au lecteur' })
    await arreterParLesCommandes()
    await apresArret('croix', 'vod:iptva:5001')
    // La couche n'est peinte sur aucun ecran suivant (D1).
    for (const [nom, cible] of [['Ma liste', '/a-voir'], ['Réglages', '/reglages'], ['Direct', '/direct']]) {
      await page.goto(`${serveur.origine}${cible}`)
      await pause(500)
      v.ok(!(await etatCouche()).presente, `CA1 ecran ${nom} : aucune couche du lecteur`)
    }
    v.ok(s.erreurs.length === 0, `CA1 aucune erreur de page apres les ecrans suivants (${s.erreurs.join(' | ') || 'aucune'})`)

    // --- 2. « Fermer la lecture » du mini-lecteur, depuis un autre ecran ------------------------------
    console.log(`[${moteur}] 2. fermer depuis le mini-lecteur`)
    await semer('vod:iptva:5002')
    await reveil()
    await commandes().getByRole('button', { name: 'Retour' }).click()
    await pause(400)
    await page.locator('[data-role="mini-lecteur"]').getByRole('button', { name: 'Fermer la lecture' }).click()
    await apresArret('mini-fermer', 'vod:iptva:5002')
    v.ok((await page.locator('[data-role="mini-lecteur"]').count()) === 0, 'CA1 mini-fermer : plus de mini-lecteur')

    // --- 3. « Retour » du panneau d'erreur (415 injecte) ---------------------------------------------
    console.log(`[${moteur}] 3. retour du panneau d'erreur`)
    await page.route('**/api/v1/vod/iptva:5003*', (route) => route.fulfill({ status: 415, headers: { 'X-Mytv-Erreur': 'format_non_lisible' }, body: '' }))
    await page.goto(`${serveur.origine}/lecture/vod:iptva:5003`)
    const alerte = page.locator('[role="alert"]')
    await alerte.waitFor({ timeout: 20_000 })
    await alerte.getByRole('button', { name: 'Retour' }).click()
    await pause(700)
    v.ok(await videosAvecSource() === 0, 'CA1 erreur-retour : aucune <video> avec source')
    v.ok(!(await etatCouche()).presente, 'CA1 erreur-retour : couche demontee')
    v.ok(s.erreurs.length === 0, `CA1 erreur-retour : pageerror = 0 (${s.erreurs.join(' | ') || 'aucune'})`)
    await page.unroute('**/api/v1/vod/iptva:5003*')

    // --- 4. Échap : quitte l'ecran (ecran precedent), la lecture continue dans le mini-lecteur ;
    //        « Fermer la lecture » detache alors sans naviguer (arbitrage lot 10 : Echap = Retour).
    console.log(`[${moteur}] 4. echap puis fermer`)
    await semer('vod:iptva:5004')
    await page.locator('[tabindex="-1"]').first().focus()
    await page.keyboard.press('Escape')
    await attendre(async () => !/^\/lecture/.test(await chemin()), { quoi: 'Echap quitte l ecran' })
    v.ok((await page.locator('[data-role="mini-lecteur"]').count()) === 1 && (await etatCouche()).presente, 'CA2 Echap : ecran precedent, la lecture continue dans le mini-lecteur')
    const ou = await chemin()
    await page.locator('[data-role="mini-lecteur"]').getByRole('button', { name: 'Fermer la lecture' }).click()
    await apresArret('echap-fermer', 'vod:iptva:5004')
    v.ok((await chemin()) === ou, `CA2 « Fermer la lecture » ne navigue pas (${ou})`)

    // --- 5. Pause : la position part tout de suite ----------------------------------------------------
    console.log(`[${moteur}] 5. pause`)
    await semer('vod:iptva:5005')
    const avant = putsHistorique('iptva:5005').length
    await page.evaluate(() => document.querySelector('video').pause())
    v.ok(await attendre(() => putsHistorique('iptva:5005').length > avant, { delai: 4000 }).catch(() => false), 'CA1 pause : PUT /profil/historique immediat')
    await arreterParLesCommandes()
    await pause(500)

    v.ok(s.violations.length === 0, 'aucune requete hors 127.0.0.1')
  } catch (e) {
    v.ok(false, `exception : ${e.stack}`)
  } finally {
    await s.fermer()
    await navigateur.close()
    v.termine()
  }
}
