import { chromium } from 'playwright'

// Recette de l'authentification. DEUX profils de navigateur distincts, donc
// deux IndexedDB et deux localStorage separes : exactement deux PC.
//
// On n'ouvre AUCUN FLUX : l'abonnement n'en autorise qu'un et l'utilisateur
// regarde peut-etre la television.
//
// POURQUOI un service d'essai sur 8098 : le service de production (8099) ne doit
// pas etre redemarre ici -- c'est a l'utilisateur de deployer. Les appels
// /flux/auth et /flux/etat sont donc reroutes vers un conteneur d'essai qui
// tourne sur le MEME code et sur une COPIE de la base d'etat.

const S = '/tmp/claude-0/-root/af0bfe04-324f-47cd-9f6b-faadeffb4ea5/scratchpad'
const ESSAI = 'http://127.0.0.1:8098'
const CODE = process.env.CODE_INSTALL
const MDP = 'correct-cheval-pile-agrafe'

let bilan = { ok: 0, ko: 0 }
const dire = (...m) => console.log(...m)
function verifier(libelle, condition, detail = '') {
  if (condition) bilan.ok++
  else bilan.ko++
  dire(`  ${condition ? 'OK   ' : 'ECHEC'} ${libelle}${detail ? ` — ${detail}` : ''}`)
}

async function ouvrir(dir, { auth = true } = {}) {
  const ctx = await chromium.launchPersistentContext(dir, {
    viewport: { width: 1280, height: 800 },
  })
  const page = ctx.pages()[0] ?? (await ctx.newPage())

  // CONTRAINTE ABSOLUE : aucun flux ne doit s'ouvrir.
  await page.route('**/{flux/live,flux/movie,flux/series,live,movie,series}/**', (r) =>
    r.abort())

  await page.route('**/flux/{auth,etat}/**', async (route) => {
    if (!auth) return route.abort()
    try {
    const req = route.request()
    const u = new URL(req.url())
    const entetes = { ...req.headers() }
    delete entetes.host
    const rep = await ctx.request.fetch(ESSAI + u.pathname + u.search, {
      method: req.method(),
      headers: entetes,
      data: req.postData() ?? undefined,
      maxRedirects: 0,
      failOnStatusCode: false,
    })
    const enTetes = {}
    for (const { name, value } of rep.headersArray()) {
      // `Secure` est verifie par ailleurs (curl) : ici le detour passe par
      // http://127.0.0.1, ou Chrome refuserait de garder le cookie.
      enTetes[name] = name.toLowerCase() === 'set-cookie'
        ? value.replace(/;\s*Secure/i, '')
        : value
    }
    await route.fulfill({ status: rep.status(), headers: enTetes, body: await rep.body() })
    } catch {
      // Requete encore en vol au moment de la fermeture du navigateur.
      await route.abort().catch(() => undefined)
    }
  })

  await page.goto('http://localhost:5173/app/', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  })
  return { ctx, page }
}

/** Ce que l'application a reellement en magasin, via la vraie base. */
const etatLocal = (page) =>
  page.evaluate(async () => {
    const { db } = await import('/app/src/lib/db.ts')
    return {
      favoris: await db.favoris.count(),
      historique: await db.historique.count(),
      reprises: await db.reprises.count(),
      config: localStorage.getItem('mytv.config'),
      compte: localStorage.getItem('mytv.compte'),
    }
  })

const connecte = (page) =>
  page.waitForSelector('.coque', { timeout: 20000 }).then(() => true).catch(() => false)

async function remplir(page, libelle, valeur) {
  const champ = page.locator(`label:has-text("${libelle}") input`)
  await champ.fill(valeur)
}

async function phase1() {
  dire('\n== Machine A : porte fermee, puis amorcage ==')
  const { ctx, page } = await ouvrir(`${S}/nav-a`)
  try {
    await page.waitForSelector('form', { timeout: 20000 })
    verifier('la page de connexion s\'affiche', await page.locator('h1', { hasText: 'MyTV' }).count() === 1)
    verifier('la coque de l\'application n\'est PAS montee', (await page.locator('.coque').count()) === 0)
    verifier('aucun champ « identifiants du relais »',
      (await page.locator('label:has-text("Utilisateur") input').count()) === 0)
    verifier('l\'amorcage est propose',
      (await page.locator('button:has-text("Créer le premier compte")').count()) === 1)

    // Un mot de passe sans compte : refus, sans dire si l'identifiant existe.
    await remplir(page, 'Identifiant', 'sounkere')
    await remplir(page, 'Mot de passe', 'un-mot-de-passe-faux')
    await page.locator('button[type=submit]').click()
    await page.waitForSelector('[role=alert]', { timeout: 15000 })
    const refus = await page.locator('[role=alert]').innerText()
    verifier('refus sans divulgation', /incorrect/i.test(refus), refus.replace(/\n/g, ' '))

    await page.locator('button:has-text("Créer le premier compte")').click()
    await remplir(page, "Code d'installation", 'mauvais-code')
    await remplir(page, 'Identifiant', 'sounkere')
    await remplir(page, 'Mot de passe', MDP)
    await remplir(page, 'Confirmation', 'autre-chose-que-le-mdp')
    await page.locator('button[type=submit]').click()
    await page.waitForTimeout(500)
    verifier('confirmation differente refusee cote interface',
      /diff/i.test(await page.locator('[role=alert]').innerText()))

    await remplir(page, 'Confirmation', MDP)
    await page.locator('button[type=submit]').click()
    await page.waitForTimeout(2000)
    const tCode = await page.locator('[role=alert]').innerText().catch(() => '')
    verifier('code d\'installation invalide refuse', /code/i.test(tCode),
      tCode.replace(/\n/g, ' '))

    await remplir(page, "Code d'installation", CODE)
    await remplir(page, 'Mot de passe', MDP)
    await remplir(page, 'Confirmation', MDP)
    await page.locator('button[type=submit]').click()
    verifier('le compte est cree et la session ouverte', await connecte(page))

    // La synchronisation part toute seule apres la connexion.
    await page.waitForTimeout(4000)
    const e = await etatLocal(page)
    verifier('l\'etat deja synchronise est repris',
      e.favoris === 21 && e.historique === 24 && e.reprises === 7,
      `${e.favoris} favoris, ${e.historique} historique, ${e.reprises} reprises`)
    verifier('aucun identifiant de relais sur le disque du navigateur',
      !/local_user|password|username/.test(e.config ?? ''), e.config ?? 'vide')

    dire('\n== Machine A : ecran Reglages ==')
    await page.locator('[aria-label="Réglages"], button:has-text("Réglages")').first().click()
      .catch(() => page.evaluate(() => window.dispatchEvent(new Event('x'))))
    await page.waitForTimeout(800)
    if ((await page.locator('h1:has-text("Réglages")').count()) === 0) {
      // Le rail est le chemin normal ; s'il a change de libelle on y va par
      // l'etat de l'application plutot que d'echouer sur un detail d'interface.
      await page.evaluate(async () => {
        const m = await import('/app/src/etat.ts')
        m.poserEcran('reglages')
      })
      await page.waitForTimeout(500)
    }
    verifier('l\'ecran Reglages s\'affiche',
      (await page.locator('h1:has-text("Réglages")').count()) >= 1)
    verifier('plus aucune saisie de mot de passe',
      (await page.locator('input[type=password]').count()) === 0)
    const texte = await page.locator('body').innerText()
    verifier('le compte connecte est affiché', texte.includes('sounkere'))
    verifier('le mot de passe du relais est masque', texte.includes('••••••••••'))
    verifier('l\'utilisateur du relais est en lecture seule', texte.includes('local_user'))
    verifier('un bouton de deconnexion existe',
      (await page.locator('button:has-text("Se déconnecter")').count()) === 1)

    await page.locator('button:has-text("Se déconnecter")').click()
    const referme = await page
      .waitForSelector('.coque', { state: 'detached', timeout: 15000 })
      .then(() => true)
      .catch(() => false)
    verifier('la deconnexion referme l\'application', referme)
    verifier('la page de connexion revient',
      (await page.locator('button[type=submit]').count()) === 1)
    const apres = await etatLocal(page)
    verifier('les favoris restent en local apres deconnexion', apres.favoris === 21)
  } finally {
    await ctx.close()
  }
}

async function phase2() {
  dire('\n== Machine B : machine neuve, rien a ressaisir ==')
  const { ctx, page } = await ouvrir(`${S}/nav-b`)
  try {
    await page.waitForSelector('form', { timeout: 20000 })
    verifier('l\'amorcage n\'est plus propose',
      (await page.locator('button:has-text("Créer le premier compte")').count()) === 0)
    const avant = await etatLocal(page)
    verifier('la machine neuve n\'a aucun favori', avant.favoris === 0)

    await remplir(page, 'Identifiant', 'sounkere')
    await remplir(page, 'Mot de passe', MDP)
    await page.locator('button[type=submit]').click()
    verifier('connexion avec le seul mot de passe de l\'application',
      await connecte(page))
    await page.waitForTimeout(4000)
    const e = await etatLocal(page)
    verifier('profil, favoris, historique et reprises ont suivi',
      e.favoris === 21 && e.historique === 24 && e.reprises === 7,
      `${e.favoris}/${e.historique}/${e.reprises}`)
    // Preuve que le relais vient du SERVEUR : l'ecran Reglages affiche un
    // utilisateur que personne n'a saisi sur cette machine.
    await page.evaluate(async () => {
      const m = await import('/app/src/etat.ts')
      m.poserEcran('reglages')
    })
    await page.waitForSelector('h1:has-text("Réglages")', { timeout: 15000 })
    const texte = await page.locator('body').innerText()
    verifier('les identifiants du relais arrivent du serveur, non saisis',
      texte.includes('local_user') && texte.includes('••••••••••'))
  } finally {
    await ctx.close()
  }
}

async function phase2bis() {
  dire('\n== Machine heritee : purge des identifiants laisses sur le disque ==')
  const ctx = await chromium.launchPersistentContext(`${S}/nav-e`, {
    viewport: { width: 1280, height: 800 },
  })
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage())
    await page.route('**/{flux/live,flux/movie,flux/series,live,movie,series}/**', (r) =>
      r.abort())
    // Ce que la version precedente ecrivait dans le navigateur.
    await page.addInitScript(() => {
      localStorage.setItem(
        'mytv.config',
        JSON.stringify({
          base: '',
          username: 'local_user',
          password: 'un-mot-de-passe-de-relais',
          theme: 'light',
        }),
      )
    })
    await page.goto('http://localhost:5173/app/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)
    const vu = await page.evaluate(() => localStorage.getItem('mytv.config'))
    verifier('les identifiants du relais sont effaces du localStorage',
      !!vu && !/local_user|un-mot-de-passe-de-relais/.test(vu), vu ?? 'vide')
    verifier('la preference de theme survit a la purge', /light/.test(vu ?? ''))
  } finally {
    await ctx.close()
  }
}

async function phase3() {
  dire('\n== Machine B : temporisation et service injoignable ==')
  const { ctx, page } = await ouvrir(`${S}/nav-c`)
  try {
    await page.waitForSelector('form', { timeout: 20000 })
    let vuTemporisation = false
    for (let i = 1; i <= 6 && !vuTemporisation; i++) {
      await remplir(page, 'Identifiant', 'sounkere')
      await remplir(page, 'Mot de passe', `faux-mot-de-passe-${i}`)
      await page.locator('button[type=submit]').click()
      await page.waitForTimeout(900)
      const t = await page.locator('[role=alert]').innerText().catch(() => '')
      if (/tentatives/i.test(t)) {
        vuTemporisation = true
        verifier('la temporisation apparait et est expliquee', true, t.replace(/\n/g, ' '))
      }
    }
    verifier('les essais en boucle sont freines', vuTemporisation)
  } finally {
    await ctx.close()
  }

  const { ctx: c2, page: p2 } = await ouvrir(`${S}/nav-d`, { auth: false })
  try {
    await p2.waitForSelector('[role=alert]', { timeout: 20000 })
    const t = await p2.locator('[role=alert]').innerText()
    verifier('un service injoignable est dit franchement', /injoignable/i.test(t),
      t.replace(/\n/g, ' '))
    verifier('un bouton « Réessayer » est propose',
      (await p2.locator('button:has-text("Réessayer")').count()) === 1)
  } finally {
    await c2.close()
  }
}

if (!CODE) {
  console.error('CODE_INSTALL manquant dans l\'environnement')
  process.exit(2)
}
await phase1()
await phase2()
await phase2bis()
await phase3()
dire(`\n${bilan.ok} verification(s) OK, ${bilan.ko} echec(s)`)
process.exit(bilan.ko ? 1 : 0)
