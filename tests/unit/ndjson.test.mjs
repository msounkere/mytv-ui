// Lecture NDJSON par lots : logique pure, sans navigateur ni reseau.
import test from 'node:test'
import assert from 'node:assert/strict'
import { lireNdjson, ErreurNdjson } from '../../src/lib/ndjson.ts'

/** Flux d'octets decoupe en morceaux arbitraires, comme le fait le reseau. */
function flux(morceaux) {
  const enc = new TextEncoder()
  let i = 0
  return new ReadableStream({
    pull(c) {
      if (i < morceaux.length) c.enqueue(typeof morceaux[i] === 'string' ? enc.encode(morceaux[i++]) : morceaux[i++])
      else c.close()
    },
  })
}

async function tout(corps, taille) {
  const lots = []
  for await (const lot of lireNdjson(corps, taille)) lots.push(lot)
  return lots
}

test('une ligne a cheval sur deux morceaux est reconstituee', async () => {
  const lots = await tout(flux(['{"a":1}\n{"b"', ':2}\n{"c":3}\n']))
  assert.deepEqual(lots.flat(), [{ a: 1 }, { b: 2 }, { c: 3 }])
})

test('un caractere multi-octets coupe entre deux morceaux reste intact', async () => {
  const octets = new TextEncoder().encode('{"nom":"Amélie — été"}\n')
  const coupe = octets.indexOf(0xc3) + 1 // au milieu du « é »
  const lots = await tout(flux([octets.slice(0, coupe), octets.slice(coupe)]))
  assert.deepEqual(lots.flat(), [{ nom: 'Amélie — été' }])
})

test('la derniere ligne sans saut de ligne final est lue', async () => {
  assert.deepEqual((await tout(flux(['{"a":1}\n{"a":2}']))).flat(), [{ a: 1 }, { a: 2 }])
})

test('les lignes vides et les fins de ligne CRLF sont ignorees', async () => {
  assert.deepEqual((await tout(flux(['{"a":1}\r\n\r\n\n{"a":2}\r\n']))).flat(), [{ a: 1 }, { a: 2 }])
})

test('les lots respectent la taille demandee et ne sont jamais vides', async () => {
  const lignes = Array.from({ length: 7 }, (_, i) => `{"i":${i}}\n`).join('')
  const lots = await tout(flux([lignes]), 3)
  assert.deepEqual(lots.map((l) => l.length), [3, 3, 1])
  assert.ok(lots.every((l) => l.length > 0))
})

test('un flux vide ne rend aucun lot', async () => {
  assert.deepEqual(await tout(flux([])), [])
  assert.deepEqual(await tout(flux(['\n\n'])), [])
})

test('une ligne illisible leve ErreurNdjson avec son numero', async () => {
  await assert.rejects(
    tout(flux(['{"a":1}\n{pas du json}\n'])),
    (e) => e instanceof ErreurNdjson && e.numeroLigne === 2,
  )
})

test('le lecteur est libere si le consommateur abandonne', async () => {
  let annule = false
  const corps = new ReadableStream({
    pull(c) {
      c.enqueue(new TextEncoder().encode('{"a":1}\n'.repeat(10)))
    },
    cancel() {
      annule = true
    },
  })
  for await (const lot of lireNdjson(corps, 2)) {
    assert.equal(lot.length, 2)
    break
  }
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(annule, true)
})
