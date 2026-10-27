// Faux serveur mytv pour les tests de l'interface : l'API /api/v1 (sous-ensemble
// du contrat docs/openapi.yaml) + le dossier `dist` sous /app/, sur UNE origine
// comme en production. Il ecoute 127.0.0.1 sur un port ephemere et ne contacte
// jamais personne : aucun vrai fournisseur, aucun vrai flux.
//
// Il sert a verifier l'interface, pas le serveur : le harnais `cmd/mytv-dev`
// (US-15) prendra le relais pour la recette de bout en bout (US-22).
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import crypto from 'node:crypto'

const TYPES_MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2',
}

export const MOT_DE_PASSE = 'secret-de-test-ui1'
export const COMPTE = 'alice'

function genererCatalogue({ chaines, films, series }) {
  const maintenant = Date.now()
  const iso = (ms) => new Date(ms).toISOString()
  const categories = []
  const nomsCat = {
    live: ['FR | Généralistes', 'EN | News', 'FR | Sport'],
    vod: ['VOD - CRIME-THRILLER [FR]', 'VOD - NEW ADDED [FR]', 'VOD - ACTION [EN]'],
    series: ['SERIES - DRAME [FR]', 'SERIES - COMEDIE [FR]', 'SERIES - NEW ADDED [FR]'],
  }
  for (const [type, noms] of Object.entries(nomsCat))
    noms.forEach((nom, i) =>
      categories.push({ id: `iptva:${type === 'live' ? 10 : type === 'vod' ? 20 : 30}${i}`, fournisseur: 'iptva', type, nom, ordre: i }),
    )
  const parType = (t) => categories.filter((c) => c.type === t)
  const live = Array.from({ length: chaines }, (_, i) => ({
    id: `iptva:${100000 + i}`, nom: `FR - Chaîne ${i}`, logo: `/img/logo${i}.png`,
    numero: i + 1, epg_id: `ch${i}.fr`, categorie: parType('live')[i % 3].id,
    lecture: `/api/v1/live/${100000 + i}.m3u8`, ajoute: iso(maintenant - i * 60_000),
  }))
  const vod = Array.from({ length: films }, (_, i) => ({
    id: `iptva:${5000 + i}`, nom: `Film Test ${i} (${2000 + (i % 24)})`, image: `/img/film${i}.jpg`,
    categorie: parType('vod')[i % 3].id, extension: i % 5 === 0 ? 'mkv' : 'mp4', note: 3 + (i % 70) / 10,
    annee: String(2000 + (i % 24)), ajoute: iso(maintenant - i * 3_600_000), lecture: `/api/v1/vod/iptva:${5000 + i}`,
  }))
  const sr = Array.from({ length: series }, (_, i) => ({
    id: `iptva:s${5000 + i}`, nom: `Série Test ${i}`, image: `/img/serie${i}.jpg`,
    categorie: parType('series')[i % 3].id, note: 5 + (i % 40) / 10, annee: String(2010 + (i % 12)),
    ajoute: iso(maintenant - i * 7_200_000), saisons: `/api/v1/series/iptva:s${5000 + i}/saisons`,
  }))
  return { categories, live, vod, series: sr }
}

export async function demarrerServeurFactice({ dist, taille = { chaines: 300, films: 600, series: 40 }, latenceChunk = 0 } = {}) {
  const etat = {
    catalogue: genererCatalogue(taille),
    version: 'v1',
    sessions: new Map(), // jeton -> { profil }
    profils: [], // { id, nom }
    favoris: new Map(), // profil -> [ids]
    historique: new Map(), // profil -> Map(id -> {contenu, serie, position, duree, vu})
    reglages: new Map(), // profil -> { valeurs, revision }
    echecExport: null, // { type, apres } : coupe le flux apres N lignes, une fois
    conflitProchainPut: null, // fonction appelee juste avant de repondre 409
    requetes: [],
    // US-36 : instantanes du catalogue par version (pour `depuis=`), et evenements
    // de telemetrie recus (POST /diagnostic/evenements).
    versions: new Map(), // version -> { live, vod, series } (copies)
    evenements: [],
    latenceChunk,
    profilsMax: 10,
    sessionNom: false, // true : GET /compte rend `session.nom` (US-16b)
    admin: false, // true : la session est celle d'un administrateur (US-25)
    fournisseurs: [], // reponse de GET /admin/fournisseurs (US-25)
    // US-28 : reponses de GET /films/{id} et /series/{id}. Cle = identifiant ; valeur =
    // { statut (HTTP), latence (ms), statutDetails, details } ; absent = fiche complete par defaut.
    details: new Map(),
  }
  let nProfil = 0
  const reg = (p) => {
    if (!etat.reglages.has(p)) etat.reglages.set(p, { valeurs: {}, revision: 1 })
    return etat.reglages.get(p)
  }

  const json = (res, statut, corps, entetes = {}) => {
    const buf = Buffer.from(JSON.stringify(corps))
    res.writeHead(statut, { 'Content-Type': 'application/json', 'Content-Length': buf.length, ...entetes })
    res.end(buf)
  }
  const erreur = (res, statut, code, message = code, entetes = {}) => json(res, statut, { code, message }, entetes)
  const corpsJson = (req) =>
    new Promise((ok) => {
      const morceaux = []
      req.on('data', (c) => morceaux.push(c))
      req.on('end', () => {
        try { ok(JSON.parse(Buffer.concat(morceaux).toString() || 'null')) } catch { ok(undefined) }
      })
    })
  const jeton = (req) => /(?:^|;\s*)mytv=([^;]+)/.exec(req.headers.cookie ?? '')?.[1]
  const session = (req) => { const j = jeton(req); return j ? etat.sessions.get(j) : undefined }
  const etag = () => `W/"${etat.version}"`
  const total = () => {
    const c = etat.catalogue
    return { categories: c.categories.length, chaines: c.live.length, films: c.vod.length, series: c.series.length }
  }

  const instantane = () => ({ live: [...etat.catalogue.live], vod: [...etat.catalogue.vod], series: [...etat.catalogue.series] })
  /** Retient le catalogue courant sous sa version, comme le journal du serveur. */
  const retenirVersion = () => { if (!etat.versions.has(etat.version)) etat.versions.set(etat.version, instantane()) }

  async function exporter(req, res, type, depuis) {
    const c = etat.catalogue
    let lignes = type === 'categories' ? c.categories : type === 'live' ? c.live : type === 'vod' ? c.vod : type === 'series' ? c.series : null
    if (!lignes) return erreur(res, 400, 'requete_invalide')
    if (req.headers['if-none-match'] === etag()) { res.writeHead(304, { ETag: etag() }); return res.end() }
    let supprimes
    if (depuis && type !== 'categories') {
      // Export par difference (US-36 CA3) : lignes dont le JSON a change depuis
      // l'instantane de cette version, et identifiants disparus.
      const ancien = depuis === etat.version ? instantane() : etat.versions.get(depuis)
      if (!ancien) return erreur(res, 409, 'version_inconnue', 'version inconnue ou trop ancienne : import complet necessaire')
      const avant = new Map(ancien[type].map((l) => [l.id, JSON.stringify(l)]))
      const courants = new Set(lignes.map((l) => l.id))
      lignes = lignes.filter((l) => avant.get(l.id) !== JSON.stringify(l))
      supprimes = [...avant.keys()].filter((id) => !courants.has(id))
    }
    const entetes = { 'Content-Type': 'application/x-ndjson', ETag: etag(), 'X-Elements': String(lignes.length) }
    if (supprimes) entetes['X-Supprimes'] = String(supprimes.length)
    const gzip = /gzip/.test(req.headers['accept-encoding'] ?? '')
    if (gzip) entetes['Content-Encoding'] = 'gzip'
    res.writeHead(200, entetes)
    const sortie = gzip ? zlib.createGzip() : res
    if (gzip) sortie.pipe(res)
    if (supprimes) sortie.write(JSON.stringify({ type: 'suppressions', ids: supprimes }) + '\n')
    const coupe = etat.echecExport && etat.echecExport.type === type ? etat.echecExport.apres : Infinity
    const PAQUET = 100
    for (let i = 0; i < lignes.length; i += PAQUET) {
      if (i >= coupe) {
        etat.echecExport = null
        if (gzip) sortie.flush()
        // Coupure franche en plein corps : ce que fait un reseau qui lache.
        setTimeout(() => req.socket.destroy(), 20)
        return
      }
      sortie.write(lignes.slice(i, i + PAQUET).map((l) => JSON.stringify(l)).join('\n') + '\n')
      if (gzip) sortie.flush()
      if (etat.latenceChunk) await new Promise((r) => setTimeout(r, etat.latenceChunk))
    }
    sortie.end()
  }

  const serveur = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    const chemin = url.pathname
    const entree = { methode: req.method, chemin, requete: url.search, t: Date.now(), inm: req.headers['if-none-match'] }
    etat.requetes.push(entree)

    // --- Pilotage par les tests ------------------------------------------------
    if (chemin.startsWith('/__test/')) {
      const op = chemin.slice('/__test/'.length)
      const c = await corpsJson(req)
      if (op === 'etat') return json(res, 200, { version: etat.version, total: total(), favoris: Object.fromEntries(etat.favoris), historique: Object.fromEntries([...etat.historique].map(([k, v]) => [k, [...v.values()]])), reglages: Object.fromEntries(etat.reglages), profils: etat.profils, sessions: etat.sessions.size })
      if (op === 'requetes') return json(res, 200, etat.requetes)
      if (op === 'vider-requetes') { etat.requetes.length = 0; return json(res, 200, {}) }
      if (op === 'nouvelle-version') {
        // L'ancienne version reste connue (journal des differences), sauf
        // `sansHistorique` : elle est oubliee, comme une version purgee.
        if (c.sansHistorique) etat.versions.clear()
        else retenirVersion()
        etat.version = c.version ?? `v${Date.now()}`
        if (c.retirerFilms) etat.catalogue.vod.splice(0, c.retirerFilms)
        if (c.ajouterFilms) for (let i = 0; i < c.ajouterFilms; i++) etat.catalogue.vod.push({ ...etat.catalogue.vod[0], id: `iptva:${90000 + i}`, nom: `Nouveauté ${i}`, ajoute: new Date().toISOString(), lecture: `/api/v1/vod/iptva:${90000 + i}` })
        if (c.renommerFilms) for (let i = 0; i < c.renommerFilms; i++) etat.catalogue.vod[i] = { ...etat.catalogue.vod[i], nom: `${etat.catalogue.vod[i].nom} (remasterisé)` }
        if (c.retirerChaines) etat.catalogue.live.splice(0, c.retirerChaines)
        return json(res, 200, { version: etat.version })
      }
      if (op === 'oublier-versions') { etat.versions.clear(); return json(res, 200, {}) }
      if (op === 'evenements') return json(res, 200, etat.evenements)
      if (op === 'echec-export') { etat.echecExport = c; return json(res, 200, {}) }
      if (op === 'expirer-sessions') { etat.sessions.clear(); return json(res, 200, {}) }
      if (op === 'reglages') { const r = reg(c.profil); Object.assign(r.valeurs, c.valeurs); for (const k of c.supprimer ?? []) delete r.valeurs[k]; r.revision++; return json(res, 200, r) }
      if (op === 'conflit-prochain-put') {
        // L'« autre machine » ecrit entre notre lecture et notre ecriture.
        etat.conflitProchainPut = () => { const r = reg(c.profil); Object.assign(r.valeurs, c.valeurs); r.revision++ }
        return json(res, 200, {})
      }
      if (op === 'favoris') { etat.favoris.set(c.profil, c.ids); return json(res, 200, {}) }
      if (op === 'historique') {
        if (!etat.historique.has(c.profil)) etat.historique.set(c.profil, new Map())
        etat.historique.get(c.profil).set(c.contenu, { contenu: c.contenu, position: c.position, duree: c.duree, vu: new Date().toISOString() })
        return json(res, 200, {})
      }
      if (op === 'admin') { etat.admin = !!c.actif; return json(res, 200, {}) }
      if (op === 'fournisseurs') { etat.fournisseurs = c.lignes; return json(res, 200, {}) }
      if (op === 'session-nom') { etat.sessionNom = c.actif; return json(res, 200, {}) }
      if (op === 'details') { etat.details.set(c.id, c.reglage); return json(res, 200, {}) }
      if (op === 'details-effacer') { etat.details.clear(); return json(res, 200, {}) }
      if (op === 'latence') { etat.latenceChunk = c.ms; return json(res, 200, {}) }
      return erreur(res, 404, 'inconnu')
    }

    // --- Images du faux catalogue : un pixel, servi localement ------------------
    if (chemin.startsWith('/img/')) {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=3600' })
      return res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'))
    }

    // --- Interface statique ----------------------------------------------------
    if (!chemin.startsWith('/api/')) {
      // L'interface est construite avec base « / » (servie a la racine par mytv) ; l'ancien
      // prefixe /app/ reste accepte pour les parcours qui l'utilisent encore.
      if (!dist) { res.writeHead(404); return res.end() }
      let fichier = path.join(dist, chemin.startsWith('/app/') ? chemin.slice('/app/'.length) : chemin.slice(1))
      if (!fichier.startsWith(dist)) { res.writeHead(403); return res.end() }
      if (!fs.existsSync(fichier) || fs.statSync(fichier).isDirectory()) fichier = path.join(dist, 'index.html')
      res.writeHead(200, { 'Content-Type': TYPES_MIME[path.extname(fichier)] ?? 'application/octet-stream' })
      return fs.createReadStream(fichier).pipe(res)
    }

    // --- API v1 ----------------------------------------------------------------
    const p = chemin.slice('/api/v1'.length)
    const s = session(req)
    if (p === '/sante') return json(res, 200, { statut: 'ok' })
    if (p === '/connexion' && req.method === 'POST') {
      const c = await corpsJson(req)
      if (!c || typeof c.nom !== 'string') return erreur(res, 400, 'requete_invalide')
      if (c.nom !== COMPTE || c.mot_de_passe !== MOT_DE_PASSE) return erreur(res, 401, 'identifiants_invalides', 'Identifiants invalides')
      const j = crypto.randomBytes(16).toString('hex')
      etat.sessions.set(j, { profil: undefined })
      res.setHeader('Set-Cookie', `mytv=${j}; Path=/; HttpOnly; SameSite=Lax`)
      return json(res, 200, { id: 's-' + j.slice(0, 6), admin: etat.admin, expire: new Date(Date.now() + 3600e3).toISOString() })
    }
    if (!s) return erreur(res, 401, 'non_authentifie', 'Session absente ou expiree')

    if (p === '/deconnexion') { etat.sessions.delete(jeton(req)); res.setHeader('Set-Cookie', 'mytv=; Path=/; Max-Age=0; HttpOnly'); res.writeHead(204); return res.end() }
    if (p === '/compte') {
      return json(res, 200, {
        session: { id: 's1', ...(etat.sessionNom ? { nom: COMPTE } : {}), admin: etat.admin, ...(s.profil ? { profil_id: s.profil } : {}), expire: new Date(Date.now() + 3600e3).toISOString() },
        profils: etat.profils,
        limites: { pagination_max: 200, grille_fenetre: 21600, favoris_max: 500, historique_max: 500, reglages_octets_max: 8192 },
      })
    }
    if (p === '/admin/fournisseurs') {
      if (!etat.admin) return erreur(res, 403, 'interdit', 'Reserve aux administrateurs')
      return json(res, 200, { fournisseurs: etat.fournisseurs })
    }
    if (p === '/compte/profils' && req.method === 'GET') return json(res, 200, { elements: etat.profils })
    if (p === '/compte/profils' && req.method === 'POST') {
      const c = await corpsJson(req)
      if (!c?.nom || typeof c.nom !== 'string') return erreur(res, 400, 'requete_invalide')
      if (etat.profils.length >= etat.profilsMax) return erreur(res, 409, 'limite_atteinte')
      const profil = { id: `p${++nProfil}`, nom: c.nom }
      etat.profils.push(profil)
      return json(res, 201, profil)
    }
    let m = /^\/compte\/profils\/([^/]+)$/.exec(p)
    if (m && req.method === 'DELETE') {
      const i = etat.profils.findIndex((x) => x.id === m[1])
      if (i < 0) return erreur(res, 404, 'introuvable')
      etat.profils.splice(i, 1)
      for (const se of etat.sessions.values()) if (se.profil === m[1]) se.profil = undefined
      res.writeHead(204); return res.end()
    }
    if (p === '/compte/profil-actif' && req.method === 'PUT') {
      const c = await corpsJson(req)
      if (!etat.profils.some((x) => x.id === c?.profil_id)) return erreur(res, 404, 'introuvable')
      s.profil = c.profil_id
      res.writeHead(204); return res.end()
    }

    if (p === '/catalogue/version') {
      if (req.headers['if-none-match'] === etag()) { res.writeHead(304, { ETag: etag() }); return res.end() }
      return json(res, 200, { version: etat.version, ...total(), synchronise: new Date().toISOString() }, { ETag: etag() })
    }
    if (p === '/catalogue/export') return exporter(req, res, url.searchParams.get('type'), url.searchParams.get('depuis'))
    if (p === '/diagnostic/evenements' && req.method === 'POST') {
      const c = await corpsJson(req)
      for (const e of c?.evenements ?? []) etat.evenements.push(e)
      res.writeHead(204); return res.end()
    }
    // --- US-28 : fiche d'un film / d'une serie avec ses details ---------------------------
    m = /^\/(films|series)\/([^/]+)$/.exec(p)
    if (m && req.method === 'GET') {
      const [, genre, id] = m
      const ligne = (genre === 'films' ? etat.catalogue.vod : etat.catalogue.series).find((x) => x.id === id)
      if (!ligne) return erreur(res, 404, 'introuvable', 'contenu introuvable')
      const r = etat.details.get(id) ?? etat.details.get('*') ?? {}
      if (r.latence) await new Promise((ok) => setTimeout(ok, r.latence))
      if (r.statut && r.statut >= 400) return erreur(res, r.statut, 'erreur_test')
      const statutDetails = r.statutDetails ?? 'ok'
      const complets = {
        synopsis: `Synopsis de ${ligne.nom}. Une histoire de famille et de secrets.`, genre: 'Drame, Thriller',
        casting: 'Alice Martin, Bruno Durand', realisateur: 'Denis Lefevre', pays: 'France', sortie: '2019-05-03',
        bande_annonce: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', image_fond: '/img/fond.png', affiche: '/img/affiche.png',
        note: 7.8, age: '12', ...(genre === 'films' ? { duree: 6000 } : { duree_episode: 2400 }),
      }
      const details = statutDetails === 'ok' || statutDetails === 'perime' ? (r.details ?? complets) : undefined
      return json(res, 200, { ...ligne, ...(details ? { details } : {}), details_statut: statutDetails }, { ETag: `W/"d-${id}-${statutDetails}"` })
    }
    m = /^\/series\/([^/]+)\/saisons$/.exec(p)
    if (m) {
      // Les identifiants de series sont `fournisseur:s<numero>` : leur numero recoupe
      // volontairement celui de films (5000..), pour prouver que l'interface ne les confond pas.
      const num = Number(m[1].split(':s')[1])
      return json(res, 200, {
        elements: [1, 2].map((sn) => ({
          numero: sn,
          episodes: [1, 2, 3].map((en) => ({
            id: `iptva:${num * 100 + sn * 10 + en}.mkv`, numero: en, titre: `Épisode ${en}`, extension: 'mkv',
            duree: 2400, lecture: `/api/v1/vod/iptva:${num * 100 + sn * 10 + en}.mkv`,
            ...(en < 3 ? { synopsis: `Résumé de l'épisode ${en} de la saison ${sn}.`, image: '/img/ep.png', sortie: `2020-0${sn}-0${en}` } : {}),
          })),
        })),
      })
    }

    // --- Etat du profil actif ---------------------------------------------------
    if (p.startsWith('/profil/')) {
      if (!s.profil) return erreur(res, 409, 'profil_requis', 'Aucun profil actif')
      const profil = s.profil
      if (p === '/profil/favoris' && req.method === 'GET') {
        const tous = etat.favoris.get(profil) ?? []
        const limite = Math.min(Number(url.searchParams.get('limite') ?? 50), 200)
        const decalage = Number(url.searchParams.get('decalage') ?? 0)
        const elements = tous.slice(decalage, decalage + limite)
        return json(res, 200, { elements, limite, decalage, suivant: decalage + limite < tous.length ? decalage + limite : null })
      }
      m = /^\/profil\/favoris\/([^/]+)$/.exec(p)
      if (m) {
        const liste = etat.favoris.get(profil) ?? []
        if (req.method === 'PUT') { if (!liste.includes(m[1])) liste.push(m[1]); etat.favoris.set(profil, liste) }
        else if (req.method === 'DELETE') etat.favoris.set(profil, liste.filter((x) => x !== m[1]))
        res.writeHead(204); return res.end()
      }
      if (p === '/profil/historique' && req.method === 'GET') {
        const h = [...(etat.historique.get(profil)?.values() ?? [])].sort((a, b) => b.vu.localeCompare(a.vu))
        return json(res, 200, { elements: h })
      }
      m = /^\/profil\/historique\/([^/]+)$/.exec(p)
      if (m) {
        if (!etat.historique.has(profil)) etat.historique.set(profil, new Map())
        const h = etat.historique.get(profil)
        if (req.method === 'PUT') {
          const c = await corpsJson(req)
          const episode = /\.[A-Za-z0-9]+$/.test(m[1].split(':')[1])
          if (!c || typeof c.position !== 'number') return erreur(res, 400, 'requete_invalide')
          // Regle du contrat : `serie` requis pour un episode, interdit sinon.
          if (episode !== (c.serie !== undefined)) return erreur(res, 400, 'requete_invalide', 'serie')
          h.set(m[1], { contenu: m[1], ...(c.serie ? { serie: c.serie } : {}), position: c.position, duree: c.duree ?? 0, vu: new Date().toISOString() })
        } else if (req.method === 'DELETE') h.delete(m[1])
        res.writeHead(204); return res.end()
      }
      if (p === '/profil/reglages') {
        const r = reg(profil)
        if (req.method === 'GET') return json(res, 200, r)
        if (req.method === 'PUT') {
          const c = await corpsJson(req)
          if (etat.conflitProchainPut) { etat.conflitProchainPut(); etat.conflitProchainPut = null }
          if (!c || typeof c.revision !== 'number' || typeof c.valeurs !== 'object') return erreur(res, 400, 'requete_invalide')
          if (c.revision !== r.revision) return erreur(res, 409, 'conflit', 'Revision perimee')
          r.valeurs = c.valeurs
          r.revision++
          return json(res, 200, r)
        }
      }
    }
    return erreur(res, 404, 'introuvable')
  })

  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok))
  const port = serveur.address().port
  return {
    port,
    origine: `http://127.0.0.1:${port}`,
    etat,
    async appel(op, corps) {
      const r = await fetch(`http://127.0.0.1:${port}/__test/${op}`, { method: 'POST', body: JSON.stringify(corps ?? {}) })
      return r.json()
    },
    async lire(op) {
      const r = await fetch(`http://127.0.0.1:${port}/__test/${op}`, { method: 'POST', body: '{}' })
      return r.json()
    },
    fermer: () => new Promise((ok) => { serveur.closeAllConnections?.(); serveur.close(ok) }),
  }
}
