// US-25 CA5 : compte fournisseur expire / refuse. Aucun vrai fournisseur : deux faux
// serveurs locaux (127.0.0.1), qui repondent comme le vrai serveur mytv
// (502 fournisseur_compte_invalide / fournisseur_adresse_refusee, codes aussi dans
// l'en-tete X-Mytv-Erreur) et comme /admin/fournisseurs.
//   NODE_OPTIONS=--tls-max-v1.2 node tests/e2e/us25-fournisseur.mjs
import { chromium } from 'playwright'
import { build } from 'vite'
import { fileURLToPath } from 'node:url'
import { construireHarnais, ouvrirBanc, creerVerificateur, jusqua, attendre, chaine, film } from './banc.mjs'
import { demarrerServeurFactice, COMPTE, MOT_DE_PASSE } from './serveur-factice.mjs'

const v = creerVerificateur('US-25 fournisseur')
const ici = fileURLToPath(new URL('.', import.meta.url))
const DIST_APP = ici + '.dist-us25'

// ====================== A. Le lecteur ======================================
console.log('A. lecteur : messages specifiques')
await construireHarnais()
const banc = await ouvrirBanc({ ecran: 'lecture' })
const { page } = banc
try {
  const ouvrir = (e) => page.evaluate((x) => window.harnais.ouvrir(x), e)
  const fermer = () => page.evaluate(() => window.harnais.fermer())
  const reinit = async () => {
    await fermer()
    await attendre(1800)
    banc.serveur.reinit()
  }
  const alerte = () => page.locator('[role="alert"]')
  const bandeau = () => page.locator('[data-role="reconnexion"]')
  const texte = async () => (await alerte().first().innerText().catch(() => '')) || ''
  const playlists = (n) => banc.api((r) => r.chemin.startsWith(`/api/v1/live/${n}`) && r.chemin.endsWith('.m3u8')).length

  console.log('A1. direct : abonnement expire, date connue')
  await ouvrir(chaine(1006))
  v.ok(await jusqua(async () => (await alerte().count()) > 0, 15_000), "un panneau d'erreur est affiche")
  let t = await texte()
  v.ok(/Abonnement expiré ou refusé par le fournisseur/.test(t), 'message « Abonnement expiré ou refusé par le fournisseur »')
  v.ok(/expiré le 1 octobre 2026|1 octobre 2026/.test(t), `la date d'expiration est donnee (${t.split('\n').find((l) => /octobre/.test(l)) ?? 'absente'})`)
  v.ok(!/Relais|relais/.test(t.split('\n')[0] ?? ''), "ce n'est pas presente comme une panne du relais")
  v.ok(/Fournisseur/i.test(t), 'la couche « Fournisseur » est nommee')
  v.ok((await bandeau().count()) === 0, 'aucune reconnexion automatique annoncee')
  // hls.js refait UNE fois la requete de playlist de lui-meme (manifestLoadingMaxRetry: 1) ;
  // la politique de reprise de l'interface, elle, ne reessaie jamais un compte refuse.
  const n1 = playlists(1006)
  await attendre(4500)
  v.ok(playlists(1006) === n1 && n1 <= 2, `aucune reprise automatique sur un compte refuse (${n1} requetes de playlist, dont le reessai interne de hls.js)`)
  v.ok((await page.evaluate(() => window.__session ?? 0)) === 0, 'et la session n est pas declaree expiree (ce n est pas un 401)')

  console.log('A2. direct : adresse refusee')
  await reinit()
  await ouvrir(chaine(1007))
  v.ok(await jusqua(async () => (await alerte().count()) > 0, 15_000), "un panneau d'erreur est affiche")
  t = await texte()
  v.ok(/Adresse du serveur refusée par le fournisseur/.test(t), 'message « Adresse du serveur refusée par le fournisseur »')
  v.ok(!/Abonnement/.test(t), 'distinct du compte invalide')
  await attendre(2500)
  v.ok(playlists(1007) <= 2, `aucune reprise automatique (${playlists(1007)} requetes de playlist)`)

  console.log('A3. direct : compte refuse sans date')
  await reinit()
  await ouvrir(chaine(1008))
  v.ok(await jusqua(async () => (await alerte().count()) > 0, 15_000), "un panneau d'erreur est affiche")
  t = await texte()
  v.ok(/Abonnement expiré ou refusé par le fournisseur\./.test(t) && !/échéance|expiré le/.test(t), 'pas de date inventee quand le serveur ne la donne pas')

  console.log('A4. film : le HEAD sans corps porte le code dans ses en-tetes')
  await reinit()
  await ouvrir(film(105))
  v.ok(await jusqua(async () => (await alerte().count()) > 0, 15_000), "un panneau d'erreur est affiche")
  t = await texte()
  v.ok(/Abonnement expiré ou refusé par le fournisseur/.test(t) && /octobre 2026/.test(t), 'film : meme message, avec la date')
  await attendre(1500)
  v.ok(banc.api((r) => r.chemin.startsWith('/api/v1/vod/iptva:105')).length === 1, 'un seul HEAD, aucun reessai')

  console.log('A5. direct en cours : le compte expire en pleine lecture')
  await reinit()
  await ouvrir(chaine(1009))
  v.ok(await jusqua(() => banc.api((r) => r.chemin.startsWith('/api/v1/live/1009/seg/')).length >= 1, 15_000), 'la lecture demarre (les deux premiers segments passent)')
  v.ok(await jusqua(async () => /Abonnement expiré ou refusé/.test(await texte()), 60_000, 250), 'segments refuses : le message « abonnement » remplace la lecture')

  v.ok(banc.externes.length === 0, `aucune requete hors 127.0.0.1 (${banc.externes.length})`)
} finally {
  await banc.fermer()
}

// ====================== B. Le bandeau de l'administrateur =================
console.log('B. bandeau administrateur')
await build({ configFile: false, root: fileURLToPath(new URL('../..', import.meta.url)), base: '/app/', logLevel: 'error',
  plugins: [(await import('vite-plugin-solid')).default()],
  resolve: { dedupe: ['solid-js', 'solid-js/web', 'solid-js/store'] },
  optimizeDeps: { exclude: ['solid-js', 'solid-js/web', '@tanstack/solid-virtual'] },
  build: { outDir: DIST_APP, emptyOutDir: true, target: 'es2022',
    rollupOptions: { output: { manualChunks: (id) => (id.includes('hls.js') ? 'hls' : undefined) } } },
})
const navigateur = await chromium.launch()
const externes = []
try {
  async function session(options, corps) {
    const serveur = await demarrerServeurFactice({ dist: DIST_APP, taille: { chaines: 20, films: 20, series: 2 } })
    await serveur.appel('admin', { actif: options.admin })
    await serveur.appel('fournisseurs', { lignes: options.lignes ?? [] })
    const ctx = await navigateur.newContext({ viewport: { width: 1360, height: 860 }, locale: 'fr-FR' })
    await ctx.route('**/*', (route) => {
      const u = new URL(route.request().url())
      if (u.hostname === '127.0.0.1' || u.protocol === 'data:' || u.protocol === 'blob:') return route.continue()
      externes.push(route.request().url())
      return route.abort()
    })
    const p = await ctx.newPage()
    const erreurs = []
    p.on('pageerror', (e) => erreurs.push(e.message))
    try {
      await p.goto(`${serveur.origine}/app/`)
      await p.getByLabel('Identifiant').fill(COMPTE)
      await p.getByLabel('Mot de passe').fill(MOT_DE_PASSE)
      await p.getByRole('button', { name: 'Se connecter' }).click()
      await p.getByPlaceholder('Nom du profil').fill('Salon')
      await p.getByRole('button', { name: 'Créer et utiliser' }).click()
      await corps({ serveur, page: p, erreurs })
    } finally {
      await ctx.close()
      await serveur.fermer()
    }
  }
  const demandesAdmin = (serveur) => serveur.etat.requetes.filter((r) => r.chemin === '/api/v1/admin/fournisseurs').length
  const bandeauAbo = (p) => p.getByTestId('bandeau-abonnement')
  const ligne = (extra) => ({ id: 'iptva', etat: 'ok', statut_compte: 'Active', expiration: null, expire_dans_secondes: null, alerte_expiration: false, ...extra })

  console.log('B1. utilisateur ordinaire : pas de bandeau, pas meme de requete')
  await session({ admin: false, lignes: [ligne({ expiration: '2026-10-18T00:00:00Z', expire_dans_secondes: 259200, alerte_expiration: true })] }, async ({ serveur, page: p }) => {
    await p.getByTestId('bandeau-import').waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {})
    await attendre(1500)
    v.ok((await bandeauAbo(p).count()) === 0, "pas de bandeau pour un utilisateur ordinaire")
    v.ok(demandesAdmin(serveur) === 0, `aucune requete a /admin/fournisseurs (${demandesAdmin(serveur)})`)
  })

  console.log('B2. administrateur, abonnement loin : pas de bandeau')
  await session({ admin: true, lignes: [ligne({ expiration: '2027-06-01T00:00:00Z', expire_dans_secondes: 20_000_000 })] }, async ({ serveur, page: p }) => {
    v.ok(await jusqua(() => demandesAdmin(serveur) >= 1, 15_000), "l'administrateur interroge /admin/fournisseurs")
    await attendre(800)
    v.ok((await bandeauAbo(p).count()) === 0, 'rien a signaler')
  })

  console.log('B3. administrateur, expiration proche : bandeau, masquable, memorise')
  await session({ admin: true, lignes: [ligne({ expiration: '2026-10-18T12:00:00Z', expire_dans_secondes: 3 * 86400 + 600, alerte_expiration: true })] }, async ({ serveur, page: p }) => {
    v.ok(await jusqua(async () => (await bandeauAbo(p).count()) > 0, 15_000), 'le bandeau apparait')
    const txt = await bandeauAbo(p).innerText()
    v.ok(/L’abonnement du fournisseur expire dans 3 jours \(le 18 octobre 2026\)\./.test(txt), `texte : ${txt.split('\n')[0]}`)
    v.ok((await bandeauAbo(p).getAttribute('data-niveau')) === 'proche', 'niveau « proche » (pas une erreur)')
    await p.getByTestId('bandeau-abonnement-masquer').click()
    v.ok((await bandeauAbo(p).count()) === 0, 'Masquer le retire')
    await p.reload()
    await attendre(1500)
    v.ok((await bandeauAbo(p).count()) === 0, 'et il reste masque apres rechargement (meme situation)')
    // Le fournisseur a renouvele puis une nouvelle echeance approche : le bandeau revient.
    await serveur.appel('fournisseurs', { lignes: [ligne({ expiration: '2026-11-30T00:00:00Z', expire_dans_secondes: 4 * 86400, alerte_expiration: true })] })
    await p.reload()
    v.ok(await jusqua(async () => (await bandeauAbo(p).count()) > 0, 15_000), 'une situation differente fait reparaitre le bandeau')
    v.ok(/30 novembre 2026/.test(await bandeauAbo(p).innerText()), 'avec la nouvelle date')
  })

  console.log('B4. administrateur, compte refuse / adresse refusee')
  await session({ admin: true, lignes: [ligne({ etat: 'compte_invalide', statut_compte: 'Expired', expiration: '2026-10-01T00:00:00Z', expire_dans_secondes: -1_200_000, alerte_expiration: true })] }, async ({ page: p }) => {
    v.ok(await jusqua(async () => (await bandeauAbo(p).count()) > 0, 15_000), 'le bandeau apparait')
    v.ok((await bandeauAbo(p).getAttribute('data-niveau')) === 'expire', 'niveau « expire »')
    v.ok(/Abonnement du fournisseur expiré ou refusé \(échéance : 1 octobre 2026\)/.test(await bandeauAbo(p).innerText()), 'texte avec la date')
  })
  await session({ admin: true, lignes: [ligne({ etat: 'adresse_refusee' })] }, async ({ page: p }) => {
    v.ok(await jusqua(async () => (await bandeauAbo(p).count()) > 0, 15_000), 'le bandeau apparait')
    v.ok(/refuse l’adresse de ce serveur/.test(await bandeauAbo(p).innerText()), 'texte « adresse refusée »')
  })
  v.ok(externes.length === 0, `aucune requete hors 127.0.0.1 (${externes.length})`)
} finally {
  await navigateur.close()
}
v.termine()
