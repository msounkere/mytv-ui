import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BLOC_MS, blocsCouvrant, creerClientEpg, debutDemiHeureLocale, fusionner, limitesDepuisCompte,
  paquets, programmeEnCours, programmeSuivant, versProgramme, LIMITES_PAR_DEFAUT, type Programme,
} from '../../src/lib/epg'

const HEURE = 3_600_000
const T0 = Date.parse('2026-10-15T20:00:00Z')

const prog = (chaine: string, debut: number, fin: number, titre = 'P'): Programme => ({ chaine, titre, debut, fin })

test('programme du contrat : UTC RFC 3339 → millisecondes, titres nettoyes', () => {
  const p = versProgramme('iptva:1', { debut: '2026-10-15T20:30:00Z', fin: '2026-10-15T21:30:00+00:00', titre: ' Journal ', description: '' })
  assert.deepEqual(p, { chaine: 'iptva:1', titre: 'Journal', description: undefined, debut: Date.parse('2026-10-15T20:30:00Z'), fin: Date.parse('2026-10-15T21:30:00Z') })
  assert.equal(versProgramme('x', { debut: 'n', fin: 'n', titre: 'a' }), null)
  assert.equal(versProgramme('x', { debut: '2026-10-15T21:00:00Z', fin: '2026-10-15T20:00:00Z', titre: 'a' }), null)
  assert.equal(versProgramme('x', null), null)
  assert.equal(versProgramme('x', { debut: '2026-10-15T20:00:00Z', fin: '2026-10-15T21:00:00Z' })?.titre, 'Programme sans titre')
})

test('en cours et suivant', () => {
  const g = [prog('c', T0, T0 + HEURE, 'A'), prog('c', T0 + HEURE, T0 + 2 * HEURE, 'B')]
  assert.equal(programmeEnCours(g, T0 + 10)?.titre, 'A')
  assert.equal(programmeEnCours(g, T0 + HEURE)?.titre, 'B', 'la fin est exclue')
  assert.equal(programmeEnCours(g, T0 - 1), undefined)
  assert.equal(programmeSuivant(g, g[0])?.titre, 'B')
  assert.equal(programmeSuivant(g, undefined), undefined)
})

test('fuseau local : demi-heures locales, y compris Nepal (UTC+5:45) et Inde (UTC+5:30)', () => {
  const t = Date.parse('2026-10-15T20:10:00Z') // 01:55 a Katmandou
  // getTimezoneOffset() vaut -345 a Katmandou : la graduation tombe a 01:45 locale.
  const g = debutDemiHeureLocale(t, -345)
  assert.equal(new Date(g + 345 * 60_000).toISOString(), '2026-10-16T01:30:00.000Z', 'minutes locales = :30')
  assert.ok(g <= t && t - g < 30 * 60_000)
  assert.equal(debutDemiHeureLocale(t, 0), Date.parse('2026-10-15T20:00:00Z'))
  assert.equal(debutDemiHeureLocale(t, 600), Date.parse('2026-10-15T20:00:00Z') - 0, 'UTC-10 : meme demi-heure')
  const inde = debutDemiHeureLocale(Date.parse('2026-10-15T20:10:00Z'), -330)
  assert.equal((inde + 330 * 60_000) % (30 * 60_000), 0)
})

test('limites du compte, repli prudent', () => {
  assert.deepEqual(limitesDepuisCompte({ limites: { pagination_max: 200, grille_fenetre: 172800 } }), { chaines: 200, fenetreMs: 172_800_000 })
  assert.deepEqual(limitesDepuisCompte({}), LIMITES_PAR_DEFAUT)
  assert.deepEqual(limitesDepuisCompte(null), LIMITES_PAR_DEFAUT)
  assert.deepEqual(limitesDepuisCompte({ limites: { pagination_max: 0, grille_fenetre: 5 } }), LIMITES_PAR_DEFAUT)
})

test('blocs alignes, paquets, fusion sans doublon', () => {
  assert.deepEqual(blocsCouvrant(T0, T0 + 1, BLOC_MS), [Math.floor(T0 / BLOC_MS) * BLOC_MS])
  assert.equal(blocsCouvrant(T0, T0 + 6 * HEURE, BLOC_MS).length, 3, 'une plage de 6 h a cheval touche 3 blocs')
  assert.deepEqual(blocsCouvrant(T0, T0, BLOC_MS), [])
  assert.deepEqual(paquets([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
  assert.deepEqual(paquets([], 2), [])
  const a = prog('c', T0, T0 + HEURE)
  const f = fusionner([[a, prog('c', T0 + HEURE, T0 + 2 * HEURE)], [{ ...a }]])
  assert.equal(f.length, 2)
})

// --- Client : ce qu'il demande au serveur -----------------------------------

function serveur(opts: { limites?: unknown; grille?: (ids: string[], de: number, a: number) => Record<string, unknown[]> } = {}) {
  const appels: string[] = []
  let maintenant = T0 + 5 * 60_000
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://x')
    appels.push(url.pathname + url.search)
    const json = (corps: unknown, statut = 200) => new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json' } })
    if (url.pathname === '/api/v1/compte') return json(opts.limites ?? { limites: { pagination_max: 3, grille_fenetre: 3 * 3600 } })
    if (url.pathname === '/api/v1/epg/grille') {
      const ids = (url.searchParams.get('chaines') ?? '').split(',')
      const de = Date.parse(url.searchParams.get('de') ?? '')
      const a = Date.parse(url.searchParams.get('a') ?? '')
      return json({ chaines: opts.grille?.(ids, de, a) ?? {} })
    }
    if (/\/maintenant$/.test(url.pathname)) {
      return json({
        courant: { debut: new Date(T0).toISOString(), fin: new Date(T0 + HEURE).toISOString(), titre: 'Journal' },
        suivant: { debut: new Date(T0 + HEURE).toISOString(), fin: new Date(T0 + 2 * HEURE).toISOString(), titre: 'Film' },
      })
    }
    return json({ code: 'non_disponible', message: 'x' }, 501)
  }) as typeof fetch
  const client = creerClientEpg({ fetch: fetchImpl, maintenant: () => maintenant })
  return { client, appels, avancer: (ms: number) => (maintenant += ms) }
}

// Un programme qui couvre toute la plage demandee : il chevauche donc la fenetre.
const grilles = (ids: string[], de: number, a: number) =>
  Object.fromEntries(ids.map((id) => [id, [{ debut: new Date(de).toISOString(), fin: new Date(a).toISOString(), titre: `prog ${id}` }]]))

test('7 chaines visibles, limite 3 par appel : 3 appels, jamais un par chaine, ids sur une seule requete', async () => {
  const { client, appels } = serveur({ grille: (ids, de, a) => grilles(ids, de, a) })
  const ids = ['f:1', 'f:2', 'f:3', 'f:4', 'f:5', 'f:6', 'f:7']
  const g = await client.grille(ids, T0, T0 + HEURE)
  const grilleAppels = appels.filter((a) => a.startsWith('/api/v1/epg/grille'))
  assert.equal(grilleAppels.length, 3, '7 chaines / 3 par appel = 3 appels (un seul bloc de 3 h)')
  assert.equal(appels.filter((a) => a.includes('/compte')).length, 1)
  assert.equal(g.size, 7)
  assert.equal(g.get('f:5')?.[0]?.titre, 'prog f:5')
})

test('deuxieme lecture de la meme fenetre : zero appel (cache de blocs)', async () => {
  const { client, appels } = serveur({ grille: (ids, de, a) => grilles(ids, de, a) })
  await client.grille(['f:1', 'f:2'], T0, T0 + HEURE)
  const avant = appels.length
  await client.grille(['f:1', 'f:2'], T0 + 10 * 60_000, T0 + 50 * 60_000)
  assert.equal(appels.length, avant)
})

test('fenetre glissante : seul le bloc nouveau est demande', async () => {
  const { client, appels } = serveur({ grille: (ids, de, a) => grilles(ids, de, a) })
  await client.grille(['f:1'], T0, T0 + HEURE)
  const avant = appels.filter((a) => a.includes('epg/grille')).length
  // On glisse de 3 h vers l'avenir : un nouveau bloc, un appel.
  await client.grille(['f:1'], T0 + BLOC_MS, T0 + BLOC_MS + HEURE)
  assert.equal(appels.filter((a) => a.includes('epg/grille')).length, avant + 1)
})

test('une chaine sans guide est gardee vide : elle ne rappelle pas le serveur', async () => {
  const { client, appels } = serveur({ grille: () => ({}) })
  const g = await client.grille(['f:9'], T0, T0 + HEURE)
  assert.deepEqual(g.get('f:9'), [])
  const n = appels.length
  await client.grille(['f:9'], T0, T0 + HEURE)
  assert.equal(appels.length, n)
})

test('appels simultanes identiques : une seule requete', async () => {
  const { client, appels } = serveur({ grille: (ids, de, a) => grilles(ids, de, a) })
  await Promise.all([client.grille(['f:1'], T0, T0 + HEURE), client.grille(['f:1'], T0, T0 + HEURE)])
  assert.equal(appels.filter((a) => a.includes('epg/grille')).length, 1)
})

test('un programme a cheval sur deux blocs apparait une seule fois', async () => {
  const bloc = Math.floor(T0 / BLOC_MS) * BLOC_MS
  const { client } = serveur({
    grille: (ids) => Object.fromEntries(ids.map((id) => [id, [{ debut: new Date(bloc + BLOC_MS - HEURE).toISOString(), fin: new Date(bloc + BLOC_MS + HEURE).toISOString(), titre: 'Long' }]])),
  })
  const g = await client.grille(['f:1'], bloc + BLOC_MS - 30 * 60_000, bloc + BLOC_MS + 30 * 60_000)
  assert.equal(g.get('f:1')?.length, 1)
})

test('les bornes viennent de /compte : fenetre de 1 h → blocs de 1 h', async () => {
  const { client, appels } = serveur({ limites: { limites: { pagination_max: 50, grille_fenetre: 3600 } }, grille: (ids, de, a) => grilles(ids, de, a) })
  await client.grille(['f:1'], T0, T0 + 3 * HEURE)
  const urls = appels.filter((a) => a.includes('epg/grille'))
  assert.equal(urls.length, 3)
  for (const u of urls) {
    const q = new URL(u, 'http://x').searchParams
    assert.ok(Date.parse(q.get('a')!) - Date.parse(q.get('de')!) <= HEURE)
  }
})

test('/maintenant : en cours et suivant, mis en cache jusqu a la fin du programme', async () => {
  const { client, appels, avancer } = serveur()
  const a = await client.maintenant('f:1')
  assert.equal(a.courant?.titre, 'Journal')
  assert.equal(a.suivant?.titre, 'Film')
  await client.maintenant('f:1')
  assert.equal(appels.filter((x) => x.endsWith('/maintenant')).length, 1)
  avancer(6 * 60_000) // depasse la validite (5 min) : on redemande
  await client.maintenant('f:1')
  assert.equal(appels.filter((x) => x.endsWith('/maintenant')).length, 2)
})

test('mini-guide : huit chaines → un appel de grille, pas huit /maintenant', async () => {
  const { client, appels } = serveur({
    limites: { limites: { pagination_max: 200, grille_fenetre: 172800 } },
    grille: (ids, de, a) => grilles(ids, de, a),
  })
  const ids = Array.from({ length: 8 }, (_, i) => `f:${i + 1}`)
  const m = await client.enCoursPour(ids, undefined, 60_000)
  assert.equal(m.size, 8)
  assert.equal(m.get('f:3')?.courant?.titre, 'prog f:3')
  assert.equal(appels.filter((a) => a.endsWith('/maintenant')).length, 0)
  assert.equal(appels.filter((a) => a.includes('epg/grille')).length, 1)
})

test('guide non active (501) : erreur nommee, pas un plantage', async () => {
  const { client } = serveur()
  const c2 = creerClientEpg({ fetch: (async () => new Response(JSON.stringify({ code: 'non_disponible', message: 'x' }), { status: 501 })) as typeof fetch })
  await assert.rejects(c2.maintenant('f:1'), (e: { couche: string }) => e.couche === 'relais')
  void client
})
