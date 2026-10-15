import { chromium } from 'playwright'

// Recette de la reprise d'etat entre machines : DEUX profils de navigateur
// distincts, donc deux IndexedDB et deux localStorage separes, exactement comme
// deux PC. On n'ouvre AUCUN flux : l'abonnement n'en autorise qu'un, et
// l'utilisateur regarde peut-etre la television.
//
// DEPUIS L'AUTHENTIFICATION : la synchronisation exige une session. Les deux
// machines se connectent donc au compte de l'application avant de synchroniser,
// avec les identifiants donnes dans l'environnement :
//   MYTV_ID=<identifiant> MYTV_MDP=<mot de passe> node tests/synchro.mjs

const S = '/tmp/claude-0/-root/af0bfe04-324f-47cd-9f6b-faadeffb4ea5/scratchpad'

const trace = []
const dire = (...m) => { console.log(...m); trace.push(m.join(' ')) }

async function ouvrir(dir) {
  const ctx = await chromium.launchPersistentContext(dir, { viewport: { width: 1280, height: 800 } })
  const page = ctx.pages()[0] ?? (await ctx.newPage())
  // CONTRAINTE ABSOLUE : aucun flux ne doit s'ouvrir.
  await page.route('**/{flux/live,flux/movie,flux/series,live,movie,series}/**', (r) => r.abort())
  // Le service d'etat est joint comme en production : meme origine que la page.
  // Cette interception ne sert qu'a SIMULER sa panne.
  await page.route('**/flux/etat/**', (route) =>
    ctx.horsLigne ? route.abort() : route.fallback())
  await page.goto('http://localhost:5173/app/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction(() => !!window.mytvSynchro, null, { timeout: 30000 })
  await connecter(page)
  return { ctx, page }
}

/** Ouvre la session si la porte est fermee. Sans elle, le service refuse tout
 *  et la recette ne mesurerait plus rien. */
async function connecter(page) {
  if (!(await page.locator('button[type=submit]').count())) return
  const id = process.env.MYTV_ID
  const mdp = process.env.MYTV_MDP
  if (!id || !mdp) throw new Error('MYTV_ID et MYTV_MDP sont attendus dans l\'environnement')
  await page.locator('label:has-text("Identifiant") input').fill(id)
  await page.locator('label:has-text("Mot de passe") input').fill(mdp)
  await page.locator('button[type=submit]').click()
  await page.waitForSelector('.coque', { timeout: 30000 })
}

const sync = (page) => page.evaluate(() => window.mytvSynchro.synchroniser())

/** Etat personnel tel que les ecrans le liront, via les VRAIES fonctions. */
const etat = (page) =>
  page.evaluate(async () => {
    const p = await window.mytvSynchro.prefs()
    const { db } = await import('/app/src/lib/db.ts')
    return {
      favoris: (await db.favoris.orderBy('ajouteLe').toArray()).map((f) => f.cle),
      favorisResolus: (await p.favoris()).map((e) => e.nom),
      historique: (await p.historiqueRecent(50)).map((e) => e.nom),
      reprises: (await db.reprises.toArray()).map((r) => `${r.cle}@${Math.round(r.position)}`),
      epingles: (await db.reglages.get('epingles.live'))?.valeur ?? [],
      masquees: (await db.categories.where('[type+masquee]').equals(['live', 1]).toArray()).map((c) => c.cle),
      journal: await db.journal.count(),
      filigrane: (await db.reglages.get('synchro.filigrane.defaut'))?.valeur ?? 0,
    }
  })

/** Remise a zero du cote « machine neuve » : elle a importe le catalogue (ce
 *  qui ne se synchronise PAS) mais n'a aucun etat personnel. */
const vider = (page) =>
  page.evaluate(async () => {
    const { db } = await import('/app/src/lib/db.ts')
    await db.favoris.clear()
    await db.historique.clear()
    await db.reprises.clear()
    await db.journal.clear()
    await db.reglages.delete('epingles.live')
    for (const r of await db.reglages.toArray())
      if (String(r.cle).startsWith('synchro.')) await db.reglages.delete(r.cle)
    for (const c of await db.categories.where('[type+masquee]').equals(['live', 1]).toArray())
      await db.categories.update(c.cle, { masquee: 0 })
    return { catalogue: await db.catalogue.count() }
  })

// Les deux machines doivent AJOUTER un favori hors ligne : on choisit donc une
// serie qui n'en est pas deja un, sinon la bascule le retirerait.
const PIOCHE = `window.nonFavori = async (db, rang) => {
  const cands = await db.catalogue.where('type').equals('series').limit(40).toArray()
  const libres = []
  for (const c of cands) if (!(await db.favoris.get(c.cle))) libres.push(c)
  return libres[rang]
}`

const A = await ouvrir(`${S}/synchro-a`)
const B = await ouvrir(`${S}/synchro-b`)

try {
  dire('--- 1. deux machines, deux stockages ---')
  dire('A catalogue:', JSON.stringify(await A.page.evaluate(async () => {
    const { db } = await import('/app/src/lib/db.ts')
    return { entrees: await db.catalogue.count() }
  })))
  dire('B remise a neuf:', JSON.stringify(await vider(B.page)))
  dire('A : etat de synchronisation oublie (machine jamais synchronisee):',
       JSON.stringify(await A.page.evaluate(async () => {
         const { db } = await import('/app/src/lib/db.ts')
         await db.journal.clear()
         for (const r of await db.reglages.toArray())
           if (String(r.cle).startsWith('synchro.')) await db.reglages.delete(r.cle)
         return { favoris: await db.favoris.count(), journal: await db.journal.count() }
       })))
  await A.page.reload({ waitUntil: 'domcontentloaded' })
  await A.page.waitForFunction(() => !!window.mytvSynchro)
  await B.page.reload({ waitUntil: 'domcontentloaded' })
  await B.page.waitForFunction(() => !!window.mytvSynchro)

  dire('--- 2. A : un favori pose DEPUIS L ECRAN (aucun ecran modifie) ---')
  // L'etoile au survol d'une affiche : c'est l'Accueil qui l'affiche et appelle
  // `basculerFavori`, et il n'a pas change d'une ligne.
  await A.page.getByRole('button', { name: /^Accueil$/ }).first().click()
  await A.page.waitForTimeout(4000)
  const cartes = A.page.locator('div[role="button"][tabindex="0"]')
  let parEcran = null
  for (let k = 0; k < Math.min(await cartes.count(), 40) && !parEcran; k++) {
    await cartes.nth(k).hover().catch(() => {})
    const etoile = A.page.getByRole('button', { name: 'Ajouter aux favoris' }).first()
    if (!(await etoile.count()) || !(await etoile.isVisible())) continue
    const avant = await A.page.evaluate(async () => {
      const { db } = await import('/app/src/lib/db.ts')
      return db.favoris.count()
    })
    // L'affiche se charge par-dessus l'etoile : on force le clic plutot que de
    // courir apres le survol.
    await etoile.click({ force: true })
    await A.page.waitForTimeout(500)
    parEcran = await A.page.evaluate(async (avant) => {
      const { db } = await import('/app/src/lib/db.ts')
      if ((await db.favoris.count()) <= avant) return null
      const f = (await db.favoris.orderBy('ajouteLe').last())
      const e = await db.catalogue.get(f.cle)
      return { cle: f.cle, nom: e?.nom, journal: await db.journal.count() }
    }, avant)
  }
  dire('favori pose par un clic sur l etoile:', JSON.stringify(parEcran))

  dire('--- 3. A : historique, reprise et epingle, par les vraies fonctions ---')
  const pose = await A.page.evaluate(async () => {
    const p = await window.mytvSynchro.prefs()
    const { db } = await import('/app/src/lib/db.ts')
    const film = (await db.catalogue.where('type').equals('vod').limit(1).toArray())[0]
    const chaine = (await db.catalogue.where('type').equals('live').limit(1).toArray())[0]
    await p.basculerFavori(film.cle)
    await p.noterOuverture(film.cle)
    await p.noterPosition(film.cle, 1234, 5400)
    await p.noterOuverture(chaine.cle)
    // Epingle et masquage : ecrits comme l'ecran Parcours les ecrit, sans
    // passer par la synchronisation.
    const cats = await db.categories.where('[type+masquee]').equals(['live', 0]).limit(2).toArray()
    await db.reglages.put({ cle: 'epingles.live', valeur: [cats[0].id] })
    await db.categories.update(cats[1].cle, { masquee: 1 })
    return { film: film.nom, chaine: chaine.nom, epingle: cats[0].id, masquee: cats[1].cle }
  })
  dire('pose sur A:', JSON.stringify(pose))

  dire('--- 4. synchronisation A puis B ---')
  dire('A ->', JSON.stringify(await sync(A.page)))
  dire('B ->', JSON.stringify(await sync(B.page)))
  const eA = await etat(A.page)
  const eB = await etat(B.page)
  dire('A favoris:', eA.favoris.length, '| B favoris:', eB.favoris.length)
  dire('B retrouve, par titre:', JSON.stringify(eB.favorisResolus.slice(0, 6)))
  dire('B historique:', JSON.stringify(eB.historique.slice(0, 4)))
  dire('B reprises:', JSON.stringify(eB.reprises))
  dire('B epingles:', JSON.stringify(eB.epingles), '| B masquees:', JSON.stringify(eB.masquees))
  const memeFavoris = JSON.stringify([...eA.favoris].sort()) === JSON.stringify([...eB.favoris].sort())
  dire('memes favoris des deux cotes:', memeFavoris)
  dire('reprise lue par reprisePour sur B:', await B.page.evaluate(async (cle) => {
    const p = await window.mytvSynchro.prefs()
    return p.reprisePour(cle)
  }, (await A.page.evaluate(async () => {
    const { db } = await import('/app/src/lib/db.ts')
    return (await db.reprises.toArray())[0].cle
  }))))

  dire('--- 5. fusion : les deux machines modifient HORS LIGNE ---')
  await A.page.evaluate(PIOCHE)
  await B.page.evaluate(PIOCHE)
  A.ctx.horsLigne = true
  B.ctx.horsLigne = true
  const horsLigne = await Promise.all([
    A.page.evaluate(async () => {
      const p = await window.mytvSynchro.prefs()
      const { db } = await import('/app/src/lib/db.ts')
      const e = await nonFavori(db, 0)
      await p.basculerFavori(e.cle)
      const r = await window.mytvSynchro.synchroniser()
      return { ajoute: e.cle, nom: e.nom, synchro: r.etat }
    }),
    B.page.evaluate(async () => {
      const p = await window.mytvSynchro.prefs()
      const { db } = await import('/app/src/lib/db.ts')
      const e = await nonFavori(db, 1)
      await p.basculerFavori(e.cle)
      // Et un favori RETIRE : la suppression doit voyager, pas ressusciter.
      const retire = (await db.favoris.orderBy('ajouteLe').toArray())[0].cle
      await p.basculerFavori(retire)
      const r = await window.mytvSynchro.synchroniser()
      return { ajoute: e.cle, nom: e.nom, retire, synchro: r.etat }
    }),
  ])
  dire('hors ligne:', JSON.stringify(horsLigne))
  const fA = await etat(A.page)
  const fB = await etat(B.page)
  dire('service injoignable : journal en attente A/B =', fA.journal, '/', fB.journal,
       '— et les ecrans continuent de lire', fA.favoris.length, '/', fB.favoris.length, 'favoris')

  dire('--- 6. retour du reseau : fusion ---')
  A.ctx.horsLigne = false
  B.ctx.horsLigne = false
  dire('B ->', JSON.stringify(await sync(B.page)))
  dire('A ->', JSON.stringify(await sync(A.page)))
  dire('B ->', JSON.stringify(await sync(B.page)))
  const gA = await etat(A.page)
  const gB = await etat(B.page)
  const ajouteA = horsLigne[0].ajoute
  const ajouteB = horsLigne[1].ajoute
  const retire = horsLigne[1].retire
  dire('A a les deux ajouts:', gA.favoris.includes(ajouteA) && gA.favoris.includes(ajouteB))
  dire('B a les deux ajouts:', gB.favoris.includes(ajouteA) && gB.favoris.includes(ajouteB))
  dire('le retrait a voyage (absent des deux):',
       !gA.favoris.includes(retire) && !gB.favoris.includes(retire))
  dire('convergence stricte:', JSON.stringify([...gA.favoris].sort()) === JSON.stringify([...gB.favoris].sort()))
  dire('A journal vide:', gA.journal === 0, '| B journal vide:', gB.journal === 0)
  dire('A filigrane:', gA.filigrane, '| B filigrane:', gB.filigrane)

  dire('--- 7. cloisonnement par profil ---')
  dire('profil enfant (vide, meme compte):', JSON.stringify(await B.page.evaluate(async () => {
    const r = await fetch('/flux/etat/enfant', { headers: { 'X-Compte': await (async () => {
      const { config } = await import('/app/src/config.ts')
      const c = config()
      const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`mytv-etat-v1|${c.username}|${c.password}`))
      return [...new Uint8Array(b)].map((o) => o.toString(16).padStart(2, '0')).join('')
    })() } })
    const d = await r.json()
    return { elements: d.elements.length }
  })))
  dire('sans jeton:', await B.page.evaluate(() =>
    fetch('/flux/etat/defaut').then((r) => r.status)))
} finally {
  await A.ctx.close()
  await B.ctx.close()
}
console.log('\n=== fin ===')
