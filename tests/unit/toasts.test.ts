import test from 'node:test'
import assert from 'node:assert/strict'
import { DUREE_TOAST, DUREE_TOAST_ANNULABLE, TEXTES_TOAST, creerFileToasts, type Toast } from '../../src/lib/toasts'

// Lot 10, US-46 CA4 : file de toasts, un seul a la fois, 4 s (6 s avec « Annuler »).

/** Horloge simulee : on avance a la main. */
function horloge() {
  let t = 0
  const programmes: Array<{ a: number; f: () => void; id: number }> = []
  let n = 0
  return {
    minuteur: {
      poser: (f: () => void, ms: number) => { const id = ++n; programmes.push({ a: t + ms, f, id }); return id },
      lever: (h: unknown) => { const i = programmes.findIndex((p) => p.id === h); if (i >= 0) programmes.splice(i, 1) },
    },
    avancer(ms: number) {
      t += ms
      for (const p of [...programmes].sort((a, b) => a.a - b.a)) if (p.a <= t) { programmes.splice(programmes.indexOf(p), 1); p.f() }
    },
  }
}

test('CA4 un seul toast a la fois, 4 s puis le suivant', () => {
  const h = horloge()
  const vus: Array<string | undefined> = []
  const f = creerFileToasts((t?: Toast) => vus.push(t?.message), h.minuteur)
  f.emettre({ message: 'un' })
  f.emettre({ message: 'deux' })
  assert.equal(f.courant()?.message, 'un')
  assert.equal(f.courant()?.dureeMs, DUREE_TOAST)
  h.avancer(3999)
  assert.equal(f.courant()?.message, 'un')
  h.avancer(1)
  assert.equal(f.courant()?.message, 'deux')
  h.avancer(DUREE_TOAST)
  assert.equal(f.courant(), undefined)
  assert.deepEqual(vus, ['un', 'deux', undefined])
})

test('CA4 « Annuler » : 6 s, l action est executee une fois et le toast se ferme', async () => {
  const h = horloge()
  let defaits = 0
  const f = creerFileToasts(() => {}, h.minuteur)
  f.emettre({ message: 'Retiré de Ma liste', action: () => { defaits += 1 } })
  assert.equal(f.courant()?.dureeMs, DUREE_TOAST_ANNULABLE)
  assert.equal(f.courant()?.libelleAction ?? 'Annuler', 'Annuler')
  await f.agir()
  assert.equal(defaits, 1)
  assert.equal(f.courant(), undefined)
  await f.agir()
  assert.equal(defaits, 1, 'plus rien a defaire une fois ferme')
})

test('CA4 le minuteur se suspend au survol et repart apres', () => {
  const h = horloge()
  const f = creerFileToasts(() => {}, h.minuteur)
  f.emettre({ message: 'a' })
  f.suspendre()
  h.avancer(10_000)
  assert.equal(f.courant()?.message, 'a', 'suspendu : il reste')
  f.reprendre()
  h.avancer(DUREE_TOAST)
  assert.equal(f.courant(), undefined)
})

test('CA4 fermer un toast en file ne touche pas le courant ; vider efface tout', () => {
  const h = horloge()
  const f = creerFileToasts(() => {}, h.minuteur)
  const a = f.emettre({ message: 'a' })
  const b = f.emettre({ message: 'b' })
  f.emettre({ message: 'c' })
  f.fermer(b)
  assert.equal(f.courant()?.id, a)
  f.fermer()
  assert.equal(f.courant()?.message, 'c')
  f.vider()
  assert.equal(f.courant(), undefined)
})

test('CA4 textes des gestes (rapport C §5.4)', () => {
  assert.equal(TEXTES_TOAST.retraitMaListe('Film Test 3'), 'Film Test 3 · retiré de Ma liste')
  assert.equal(TEXTES_TOAST.vuRetireMaListe('Film Test 3'), '✓ Vu · Film Test 3 retiré de Ma liste')
  assert.equal(TEXTES_TOAST.episodeVu('S01E02', 'S01E03'), '✓ S01E02 marqué vu · Reprendre passe à S01E03')
  assert.equal(TEXTES_TOAST.retireDeReprendre('Série Test 2'), 'Série Test 2 · retiré de Reprendre')
  assert.equal(TEXTES_TOAST.echecPreparation('Film Test 6'), 'Échec de préparation : Film Test 6')
})
