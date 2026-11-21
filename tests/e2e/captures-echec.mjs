// Captures des tests de bout en bout qui echouent, sans toucher aux scripts eux-memes.
//   node --import ./tests/e2e/captures-echec.mjs tests/e2e/us46.mjs
//
// POURQUOI : en CI, un echec ne laissait que « Timeout 30000ms exceeded » ; on ne voyait jamais
// ce que la page affichait. Chaque contexte Playwright est photographie juste avant sa fermeture
// (image + adresse + texte visible) et les dernieres photos sont GARDEES EN MEMOIRE ; elles ne
// sont ecrites dans captures/ (artefact « captures » du CI) que si le script echoue : une ligne
// « KO » / « ECHEC » affichee, une exception non rattrapee, ou un code de sortie non nul.
// Un echec affiche declenche aussi une photo immediate des pages ouvertes a cet instant.
import { chromium, firefox, webkit } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const GARDEES = 6
const script = basename(process.argv[1] ?? 'e2e', '.mjs')
const dossier = join(process.cwd(), 'captures')
const memoire = [] // { nom, png, texte }
const contextes = new Set()
let echec = false
let n = 0

async function photographier(ctx, raison) {
  const out = []
  for (const page of ctx.pages()) {
    try {
      const png = await page.screenshot({ timeout: 3000 })
      const texte = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '')
      out.push({ nom: `${script}-${++n}-${raison}`, png, texte: `${page.url()}\n\n${texte}` })
    } catch {
      // page deja fermee ou bloquee : rien a garder
    }
  }
  return out
}

function garder(photos) {
  memoire.push(...photos)
  while (memoire.length > GARDEES) memoire.shift()
}

function ecrire() {
  if (!memoire.length) return
  try {
    mkdirSync(dossier, { recursive: true })
    for (const p of memoire) {
      writeFileSync(join(dossier, `${p.nom}.png`), p.png)
      writeFileSync(join(dossier, `${p.nom}.txt`), p.texte)
    }
    console.error(`captures : ${memoire.length} photo(s) ecrites dans captures/ (${script})`)
    memoire.length = 0
  } catch (e) {
    console.error(`captures : ecriture impossible (${e})`)
  }
}

for (const type of [chromium, firefox, webkit]) {
  const lancer = type.launch.bind(type)
  type.launch = async (...a) => {
    const nav = await lancer(...a)
    const nouveau = nav.newContext.bind(nav)
    nav.newContext = async (...o) => {
      const ctx = await nouveau(...o)
      contextes.add(ctx)
      const fermer = ctx.close.bind(ctx)
      ctx.close = async (...f) => {
        contextes.delete(ctx)
        garder(await photographier(ctx, 'fermeture'))
        if (echec) ecrire()
        return fermer(...f)
      }
      return ctx
    }
    return nav
  }
}

// Une ligne d'echec : photo immediate de ce qui est ouvert (l'etat AU moment de l'echec).
for (const flux of ['log', 'error']) {
  const orig = console[flux].bind(console)
  console[flux] = (...a) => {
    orig(...a)
    const ligne = a.map(String).join(' ')
    if (/^(KO |\s*ECHEC )/.test(ligne)) {
      echec = true
      for (const ctx of contextes) void photographier(ctx, 'echec').then((p) => { garder(p); ecrire() })
    }
  }
}

process.on('uncaughtException', (e) => {
  console.error(e)
  echec = true
  ecrire()
  process.exit(1)
})
// « exit » est synchrone, comme ecrire() : il couvre aussi une attente de premier niveau
// rejetee (TimeoutError hors de tout try), qui ne passe pas par uncaughtException.
process.on('exit', (code) => {
  if (echec || code !== 0) ecrire()
})
