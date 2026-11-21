// Lance les tests de bout en bout un par un, avec captures en cas d'echec, et REJOUE UNE FOIS
// un script qui echoue.
//   node tests/e2e/lancer-e2e.mjs us19 us20-lecture NAVIGATEUR=firefox:us47-responsive ...
// (« VAR=val&VAR2=val:script » pose des variables d'environnement pour ce script seulement.)
//
// POURQUOI rejouer : sur les machines du CI, des scripts echouaient au hasard (30 echecs sur 39
// executions du 01 au 22/11/2026, chaque fois ailleurs : delais de 30 s depasses sur une machine
// chargee) et bloquaient la publication. Un vrai defaut echoue deux fois et fait toujours
// echouer le lancement ; un alea passe au second essai mais reste SIGNALE (bilan et
// ::warning:: GitHub), avec ses captures, pour qu'on le corrige au lieu de l'oublier.
import { spawnSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'

const capture = new URL('./captures-echec.mjs', import.meta.url).pathname
const bilan = []
let rouge = false

for (const arg of process.argv.slice(2)) {
  const [vars, nom] = arg.includes(':') ? arg.split(':', 2) : ['', arg]
  const env = { ...process.env }
  for (const kv of vars ? vars.split('&') : []) {
    const i = kv.indexOf('=')
    env[kv.slice(0, i)] = kv.slice(i + 1)
  }
  const fichier = `tests/e2e/${nom}.mjs`
  const essai = (n) => {
    console.log(`\n=== ${arg} (essai ${n}) ===`)
    const t0 = Date.now()
    const r = spawnSync(process.execPath, ['--import', capture, fichier], { stdio: 'inherit', env })
    return { ok: r.status === 0, s: Math.round((Date.now() - t0) / 1000) }
  }
  const a = essai(1)
  if (a.ok) { bilan.push(`ok       ${arg} (${a.s} s)`); continue }
  const b = essai(2)
  if (b.ok) {
    bilan.push(`ALEA     ${arg} : echec puis succes au second essai (voir l'artefact « captures »)`)
    console.log(`::warning title=Test instable::${arg} a echoue puis reussi au second essai`)
  } else {
    bilan.push(`ECHEC    ${arg} : deux echecs`)
    rouge = true
  }
}

const texte = `\n--- bilan des tests de bout en bout ---\n${bilan.join('\n')}\n`
console.log(texte)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '```\n' + texte + '```\n')
process.exit(rouge ? 1 : 0)
