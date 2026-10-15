import test from 'node:test'
import assert from 'node:assert/strict'
import { creerBail, DELAI_FIN_MS } from '../../src/lib/bail'

// Horloge factice : on avance le temps a la main.
function banc() {
  let t = 0
  let id = 0
  const minuteurs = new Map<number, { echeance: number; f: () => void }>()
  const envois: Array<{ url: string; init?: RequestInit }> = []
  const bail = creerBail({
    fetch: (async (url: string, init?: RequestInit) => {
      envois.push({ url: String(url), init })
      return new Response(null, { status: 204 })
    }) as typeof fetch,
    setTimeout: (f, ms) => {
      id += 1
      minuteurs.set(id, { echeance: t + ms, f })
      return id as unknown as ReturnType<typeof setTimeout>
    },
    clearTimeout: (m) => void minuteurs.delete(m as unknown as number),
  })
  const avancer = (ms: number) => {
    t += ms
    for (const [k, m] of [...minuteurs]) if (m.echeance <= t) (minuteurs.delete(k), m.f())
  }
  return { bail, envois, avancer }
}

test('fermer le lecteur : la fin part apres le delai, en POST keepalive', () => {
  const { bail, envois, avancer } = banc()
  bail.lectureOuverte('845410')
  bail.lectureArretee('845410')
  avancer(DELAI_FIN_MS - 1)
  assert.equal(envois.length, 0)
  avancer(1)
  assert.equal(envois.length, 1)
  assert.equal(envois[0]!.url, '/api/v1/live/845410/fin')
  assert.equal(envois[0]!.init?.method, 'POST')
  assert.equal(envois[0]!.init?.keepalive, true)
})

test("zapper : la nouvelle chaine annule la fin de l'ancienne (sinon 407 residuel)", () => {
  const { bail, envois, avancer } = banc()
  bail.lectureOuverte('1')
  // Zapping : l'ancienne chaine est lachee, la nouvelle s'ouvre aussitot.
  bail.lectureArretee('1')
  bail.annulerFin()
  bail.lectureOuverte('2')
  avancer(10 * DELAI_FIN_MS)
  assert.equal(envois.length, 0)
  assert.equal(bail.courante(), '2')
})

test('dix zappings rapides : aucune fin envoyee', () => {
  const { bail, envois, avancer } = banc()
  let prec: string | undefined
  for (let i = 0; i < 10; i++) {
    if (prec) bail.lectureArretee(prec)
    bail.annulerFin()
    bail.lectureOuverte(String(i))
    prec = String(i)
    avancer(200)
  }
  avancer(10_000 - 0)
  assert.equal(envois.length, 0)
})

test('un film qui remplace un direct annule aussi la fin', () => {
  const { bail, envois, avancer } = banc()
  bail.lectureOuverte('9')
  bail.lectureArretee('9')
  bail.annulerFin()
  bail.lectureOuverte() // film : pas de chaine
  avancer(DELAI_FIN_MS * 5)
  assert.equal(envois.length, 0)
})

test('fermeture de la page : le direct ouvert est rendu tout de suite', () => {
  const { bail, envois } = banc()
  bail.lectureOuverte('845410')
  bail.fermeturePage()
  assert.equal(envois.length, 1)
  assert.equal(envois[0]!.url, '/api/v1/live/845410/fin')
  bail.fermeturePage()
  assert.equal(envois.length, 1, 'idempotent : rien a rendre la seconde fois')
})
