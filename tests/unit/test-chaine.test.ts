import test from 'node:test'
import assert from 'node:assert/strict'
import { DUREE_RESULTAT_MS, premierSegment, resultatValide, testerVariantes, type VarianteATester } from '../../src/lib/test-chaine'

// US-39 CA4 : test actif, une variante a la fois, avec un faux `fetch` (aucun reseau).

const PLAYLIST = '#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:10.000,\n/api/v1/live/1301/seg/jeton0\n#EXTINF:10.000,\n/api/v1/live/1301/seg/jeton1\n'

test('CA4 : premier segment d une playlist, relatif ou absolu', () => {
  assert.equal(premierSegment(PLAYLIST, '/api/v1/live/1301.m3u8?cap=hevc'), '/api/v1/live/1301/seg/jeton0')
  assert.equal(premierSegment('#EXTM3U\n#EXTINF:2,\nseg/a.ts?x=1\n', '/api/v1/live/7.m3u8'), '/api/v1/live/seg/a.ts?x=1')
  assert.equal(premierSegment('#EXTM3U\n#EXT-X-ENDLIST\n', '/api/v1/live/7.m3u8'), undefined)
})

test('CA4 : un resultat vaut 24 h, pas plus ; un stockage abime est ignore', () => {
  const r = JSON.stringify({ a: 1_000_000, resultats: [] })
  assert.ok(resultatValide(r, 1_000_000 + DUREE_RESULTAT_MS - 1))
  assert.equal(resultatValide(r, 1_000_000 + DUREE_RESULTAT_MS), undefined)
  assert.equal(resultatValide(r, 999_999), undefined)
  assert.equal(resultatValide('{', 0), undefined)
  assert.equal(resultatValide(null, 0), undefined)
  assert.equal(resultatValide(JSON.stringify({ a: 'x' }), 0), undefined)
})

const variantes: VarianteATester[] = [
  { cle: 'live:1', nom: 'TF1 HD', qualite: 'HD', url: '/api/v1/live/1301.m3u8?cap=' },
  { cle: 'live:2', nom: 'TF1 FHD', qualite: 'FHD', url: '/api/v1/live/1302.m3u8?cap=' },
  { cle: 'live:3', nom: 'TF1 4K', qualite: '4K', url: '/api/v1/live/1303.m3u8?cap=' },
]

/** Faux serveur : journalise, verifie qu'une seule requete est en vol, repond selon la chaine. */
function fauxServeur(reponses: Record<string, (url: string) => Response> = {}) {
  const journal: string[] = []
  let enVol = 0
  let maxEnVol = 0
  let horloge = 0
  const fetchImpl = (async (entree: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entree)
    journal.push(url)
    assert.equal((init?.headers as Record<string, string>)['X-Mytv-Capacites'], 'hevc', 'les en-tetes du lecteur sont joints')
    enVol++
    maxEnVol = Math.max(maxEnVol, enVol)
    await new Promise((r) => setTimeout(r, 2))
    horloge += 100
    enVol--
    const chaine = /\/live\/(\d+)/.exec(url)?.[1] ?? ''
    const sur = reponses[chaine]
    if (sur) return sur(url)
    if (url.includes('/seg/')) return new Response(new Uint8Array(250_000), { status: 200 })
    return new Response(PLAYLIST.replaceAll('1301', chaine), { status: 200 })
  }) as typeof fetch
  return { fetchImpl, journal, maxEnVol: () => maxEnVol, maintenant: () => horloge }
}

test('CA4 : les variantes sont testees UNE par UNE (jamais deux requetes en vol), 1 playlist + 1 segment chacune, latence et debit notes', async () => {
  const s = fauxServeur()
  const progres: number[] = []
  const r = await testerVariantes(variantes, { fetchImpl: s.fetchImpl, entetes: { 'X-Mytv-Capacites': 'hevc' }, maintenant: s.maintenant, surProgres: (x) => progres.push(x.length) })
  assert.deepEqual(s.journal, [
    '/api/v1/live/1301.m3u8?cap=', '/api/v1/live/1301/seg/jeton0',
    '/api/v1/live/1302.m3u8?cap=', '/api/v1/live/1302/seg/jeton0',
    '/api/v1/live/1303.m3u8?cap=', '/api/v1/live/1303/seg/jeton0',
  ])
  assert.equal(s.maxEnVol(), 1)
  assert.equal(r.resultats.length, 3)
  assert.equal(r.refus, undefined)
  for (const x of r.resultats) {
    assert.equal(x.latenceMs, 100)
    assert.equal(x.octets, 250_000)
    assert.equal(x.debitKbps, 20_000, '250 000 octets en 100 ms = 20 000 kbit/s')
    assert.equal(x.erreur, undefined)
  }
  assert.deepEqual(progres, [1, 2, 3])
})

test('CA4 : une lecture en cours ailleurs dans mytv (compte_utilise_par_mytv) arrete le test, sans toucher aux variantes suivantes', async () => {
  const s = fauxServeur({
    '1301': () => new Response('{"code":"compte_utilise_par_mytv"}', { status: 503, headers: { 'X-Mytv-Erreur': 'compte_utilise_par_mytv', 'Retry-After': '30' } }),
  })
  const r = await testerVariantes(variantes, { fetchImpl: s.fetchImpl, entetes: { 'X-Mytv-Capacites': 'hevc' }, maintenant: s.maintenant })
  assert.equal(r.refus, 'compte_utilise_par_mytv')
  assert.deepEqual(s.journal, ['/api/v1/live/1301.m3u8?cap='], 'aucune autre requete')
  assert.equal(r.resultats.length, 1)
  assert.equal(r.resultats[0]!.code, 'compte_utilise_par_mytv')
})

test('CA4 : une variante en erreur (415, playlist vide, segment refuse) est notee et le test continue', async () => {
  const s = fauxServeur({
    '1301': () => new Response('', { status: 415, headers: { 'X-Mytv-Erreur': 'format_hevc_non_lisible' } }),
    '1302': (url) => (url.includes('/seg/') ? new Response('', { status: 404 }) : new Response(PLAYLIST.replaceAll('1301', '1302'))),
  })
  const r = await testerVariantes(variantes, { fetchImpl: s.fetchImpl, entetes: { 'X-Mytv-Capacites': 'hevc' }, maintenant: s.maintenant })
  assert.equal(r.refus, undefined)
  assert.deepEqual(r.resultats.map((x) => x.erreur), ['HTTP 415', 'segment HTTP 404', undefined])
  assert.equal(r.resultats[0]!.code, 'format_hevc_non_lisible')
  assert.equal(r.resultats[2]!.debitKbps, 20_000)
})

test('CA4 : une annulation (AbortError) remonte telle quelle', async () => {
  const fetchImpl = (async () => { throw new DOMException('annule', 'AbortError') }) as unknown as typeof fetch
  await assert.rejects(testerVariantes(variantes, { fetchImpl, entetes: { 'X-Mytv-Capacites': 'hevc' } }), (e: DOMException) => e.name === 'AbortError')
})
