// Lance les tests unitaires (`*.test.ts`) sans dependance de plus : chaque test
// est empaquete par rolldown (deja la pour vite) puis execute par le lanceur de
// Node. Seule la logique PURE est testee ici -- pas d'ecran, pas de navigateur.
//
//   NODE_OPTIONS=--tls-max-v1.2 node tests/unit/lancer.mjs [filtre]
import { build } from 'rolldown'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const ici = dirname(fileURLToPath(import.meta.url))
const filtre = process.argv[2] ?? ''
const sortie = mkdtempSync(join(tmpdir(), 'mytv-unit-'))

try {
  const tests = readdirSync(ici).filter((f) => f.endsWith('.test.ts') && f.includes(filtre))
  if (tests.length === 0) {
    console.error('aucun test ne correspond')
    process.exit(1)
  }
  const fichiers = []
  for (const t of tests) {
    const out = join(sortie, basename(t, '.ts') + '.mjs')
    await build({
      input: join(ici, t),
      platform: 'node',
      output: { file: out, format: 'esm' },
      logLevel: 'warn',
    })
    fichiers.push(out)
  }
  // TZ fixe : les tests de fuseau choisissent le leur, le reste ne doit pas
  // dependre de la machine.
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=spec', ...fichiers], {
    stdio: 'inherit',
    env: { ...process.env, TZ: 'UTC', MYTV_RACINE: join(ici, '..', '..') },
  })
  process.exitCode = r.status ?? 1
} finally {
  rmSync(sortie, { recursive: true, force: true })
}
