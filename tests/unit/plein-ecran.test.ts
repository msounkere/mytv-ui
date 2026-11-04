import test from 'node:test'
import assert from 'node:assert/strict'
import { choisirApiPleinEcran } from '../../src/screens/lecture/plein-ecran'

// US-45 CA7 (D4, B8) : le choix de l'API de plein ecran -- standard, WebKit iPhone, ou rien.
const f = () => undefined

test('CA7 Chromium / Firefox : requestFullscreen et fullscreenEnabled -> standard', () => {
  assert.equal(choisirApiPleinEcran({ requestFullscreen: f, fullscreenEnabled: true, webkitEnterFullscreen: f }), 'standard')
  assert.equal(choisirApiPleinEcran({ requestFullscreen: f, fullscreenEnabled: undefined }), 'standard')
})

test('CA7 WebKit iPhone : pas de requestFullscreen, webkitEnterFullscreen sur la video -> webkit', () => {
  assert.equal(choisirApiPleinEcran({ requestFullscreen: undefined, fullscreenEnabled: false, webkitEnterFullscreen: f }), 'webkit')
})

test('CA7 requestFullscreen present mais fullscreenEnabled faux (iframe, WebKit) : la video WebKit prime', () => {
  assert.equal(choisirApiPleinEcran({ requestFullscreen: f, fullscreenEnabled: false, webkitEnterFullscreen: f }), 'webkit')
})

test('CA7 aucune API : aucune (le bouton le dit, il ne fait pas semblant)', () => {
  assert.equal(choisirApiPleinEcran({ fullscreenEnabled: false }), 'aucune')
  assert.equal(choisirApiPleinEcran({}), 'aucune')
})
