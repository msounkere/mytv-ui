// US-45 CA7 (D4, B8, B14, B UX8) : plein ecran operant partout -- `video.webkitEnterFullscreen()` sur
// WebKit sans `requestFullscreen` ; F = plein ecran, M = muet, I = infos ; Espace sur un bouton focalise
// ACTIVE le bouton. Trois moteurs.
//   npm run build && NODE_OPTIONS=--tls-max-v1.2 node tests/e2e/us45-plein-ecran.mjs
import { ouvrirSession, lancer, moteursDemandes, creerVerificateur, attendre, pause } from './us45-banc.mjs'

/** Doublure WebKit iPhone : pas d'API standard, seulement `webkitEnterFullscreen` sur la video (compteur). */
function doublureWebkit() {
  window.__wk = { entrees: 0, sorties: 0 }
  delete HTMLElement.prototype.requestFullscreen
  delete Element.prototype.requestFullscreen
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => false })
  Object.defineProperty(HTMLVideoElement.prototype, 'webkitEnterFullscreen', { configurable: true, value: function () { window.__wk.entrees += 1; this.__fs = true } })
  Object.defineProperty(HTMLVideoElement.prototype, 'webkitExitFullscreen', { configurable: true, value: function () { window.__wk.sorties += 1; this.__fs = false } })
  Object.defineProperty(HTMLVideoElement.prototype, 'webkitDisplayingFullscreen', { configurable: true, get() { return !!this.__fs } })
}

for (const moteur of moteursDemandes()) {
  const v = creerVerificateur(`US-45 CA7 plein ecran (${moteur})`)
  const navigateur = await lancer(moteur)
  // WebKit headless n'a aucune API de plein ecran : on joue la doublure iPhone sur tous les moteurs en second passage.
  for (const variante of moteur === 'webkit' ? ['webkit-iphone'] : ['standard', 'webkit-iphone']) {
    const s = await ouvrirSession({ navigateur, moteur, gabarit: variante === 'webkit-iphone' ? 'mobile' : 'bureau', scripts: variante === 'webkit-iphone' ? [doublureWebkit] : [] })
    const { page, video, commandes, reveil } = s
    try {
      console.log(`[${moteur}] ${variante}`)
      await s.ouvrirLecture('vod:iptva:5001')
      await page.waitForFunction(() => (document.querySelector('video')?.readyState ?? 0) >= 1, null, { timeout: 20_000 })
      await pause(400)
      await reveil()
      await commandes().getByRole('button', { name: 'Plein écran' }).click()
      await pause(500)
      if (variante === 'webkit-iphone') {
        v.ok((await page.evaluate(() => window.__wk.entrees)) === 1, 'CA7 sans requestFullscreen : video.webkitEnterFullscreen() est appele')
        await reveil()
        await commandes().getByRole('button', { name: 'Plein écran' }).click()
        await pause(300)
        v.ok((await page.evaluate(() => window.__wk.sorties)) === 1, 'CA7 second appui : webkitExitFullscreen()')
      } else {
        const fs = await page.evaluate(() => document.fullscreenElement?.tagName ?? null)
        v.ok(fs !== null, `CA7 plein ecran standard (fullscreenElement=${fs})`)
        // (Echap ici est la touche du lecteur, pas la sortie du plein ecran du navigateur.)
        await page.evaluate(() => document.exitFullscreen())
        await pause(400)
      }
      // Touches : F plein ecran, M muet, I infos.
      await page.locator('[tabindex="-1"]').first().focus()
      const avantF = variante === 'webkit-iphone' ? await page.evaluate(() => window.__wk.entrees) : (await page.evaluate(() => !!document.fullscreenElement))
      await page.keyboard.press('f')
      await pause(500)
      const apresF = variante === 'webkit-iphone' ? await page.evaluate(() => window.__wk.entrees) : (await page.evaluate(() => !!document.fullscreenElement))
      v.ok(apresF !== avantF, `CA7 F = plein ecran (${avantF} -> ${apresF})`)
      if (variante !== 'webkit-iphone') { await page.evaluate(() => document.fullscreenElement && document.exitFullscreen()); await pause(300) }
      else { await page.keyboard.press('f'); await pause(200) }
      v.ok((await page.getByRole('button', { name: /favori/i }).count()) === 0, 'CA7 plus de favori dans le lecteur VOD (F ne bascule plus un favori)')
      await page.keyboard.press('m')
      await pause(200)
      v.ok((await video()).muted === true, 'CA7 M = muet')
      await page.keyboard.press('m')
      await page.keyboard.press('i')
      const infos = page.locator('[role="dialog"][aria-label^="Informations"]')
      await infos.waitFor()
      v.ok(true, 'CA7 I = infos')
      await page.keyboard.press('Escape')
      await attendre(async () => (await infos.count()) === 0, { quoi: 'infos fermees' })
      // Espace sur un bouton focalise : active le bouton (ici « Couper le son »), ne met pas en pause.
      await reveil()
      const muet = commandes().getByRole('button', { name: /Couper le son|Rétablir le son/ })
      await muet.focus()
      const pausedAvant = (await video()).paused
      await page.keyboard.press(' ')
      await pause(300)
      v.ok((await video()).muted === true && (await video()).paused === pausedAvant, 'CA7 Espace sur un bouton focalise ACTIVE le bouton, ne bascule pas la pause')
      await page.keyboard.press(' ')
      v.ok(s.erreurs.length === 0, `aucune erreur de page (${s.erreurs.join(' | ') || 'aucune'})`)
    } catch (e) {
      v.ok(false, `exception : ${e.stack}`)
    } finally {
      await s.fermer()
    }
  }
  await navigateur.close()
  v.termine()
}
