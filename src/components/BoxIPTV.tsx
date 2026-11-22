import { For, Show, createMemo, createResource, createSignal } from 'solid-js'
import { json, versErreurLecteur } from '../lib/api'
import { emettreToast } from '../lib/toasts'

// Reglages > Box IPTV (lot 11, administrateur) : les langues et pays envoyes aux box IPTV
// (Formuler / MYTVOnline). Le serveur range le choix et filtre ce que la box recoit ;
// l'interface web n'est pas concernee.

interface PrefixeDispo {
  code: string
  chaines: number
  films: number
  series: number
}

interface EtatBox {
  prefixes: string[]
  disponibles: PrefixeDispo[]
  revision: number
}

/** Noms lisibles des prefixes les plus courants (les autres restent en code). */
const NOMS: Record<string, string> = {
  FR: 'France', EN: 'Anglais', ENG: 'Anglais', UK: 'Royaume-Uni', US: 'États-Unis', USA: 'États-Unis',
  AR: 'Arabe', DE: 'Allemagne', ES: 'Espagne', IT: 'Italie', PT: 'Portugal', BR: 'Brésil', NL: 'Pays-Bas',
  BE: 'Belgique', CA: 'Canada', CAFR: 'Canada (français)', CH: 'Suisse', AF: 'Afrique', MA: 'Maroc',
  DZ: 'Algérie', TN: 'Tunisie', TR: 'Turquie', PL: 'Pologne', RO: 'Roumanie', GR: 'Grèce', IN: 'Inde',
  NF: 'Netflix', MULTI: 'Multilingue',
}

const nombre = (n: number) => n.toLocaleString('fr-FR')

export default function BoxIPTV() {
  const [etat, { mutate }] = createResource(() => json<EtatBox>('/admin/xtream'))
  const [choisis, poserChoisis] = createSignal<Set<string> | null>(null)
  const [filtre, poserFiltre] = createSignal('')
  const [envoi, poserEnvoi] = createSignal(false)

  // Le choix en cours d'edition ; tant qu'on n'a rien touche, celui du serveur.
  const courant = () => choisis() ?? new Set(etat()?.prefixes ?? [])
  const modifie = () => {
    const c = choisis()
    if (!c) return false
    const s = new Set(etat()?.prefixes ?? [])
    return c.size !== s.size || [...c].some((p) => !s.has(p))
  }
  const visibles = createMemo(() => {
    const f = filtre().trim().toLowerCase()
    return (etat()?.disponibles ?? []).filter((p) => !f || p.code.toLowerCase().includes(f) || (NOMS[p.code] ?? '').toLowerCase().includes(f))
  })
  const total = createMemo(() => {
    const c = courant()
    const t = { chaines: 0, films: 0, series: 0 }
    for (const p of etat()?.disponibles ?? []) {
      if (c.size === 0 || c.has(p.code)) {
        t.chaines += p.chaines
        t.films += p.films
        t.series += p.series
      }
    }
    return t
  })

  function basculer(code: string) {
    const c = new Set(courant())
    if (c.has(code)) c.delete(code)
    else c.add(code)
    poserChoisis(c)
  }

  async function enregistrer() {
    const e = etat()
    if (!e) return
    poserEnvoi(true)
    try {
      const r = await json<{ prefixes: string[]; revision: number }>('/admin/xtream', {
        methode: 'PUT', corps: { prefixes: [...courant()].sort(), revision: e.revision },
      })
      mutate({ ...e, prefixes: r.prefixes, revision: r.revision })
      poserChoisis(null)
      emettreToast({ message: r.prefixes.length ? `Box IPTV : ${r.prefixes.join(', ')} seulement` : 'Box IPTV : tout le catalogue' })
    } catch (err) {
      emettreToast({ message: versErreurLecteur(err).message, ton: 'erreur' })
    } finally {
      poserEnvoi(false)
    }
  }

  return (
    <section aria-label="Box IPTV" data-role="box-iptv">
      <h2 style={{ 'margin-top': '24px' }}>Box IPTV</h2>
      <p class="secondaire" style={{ margin: '6px 0 12px', 'font-size': '12px' }}>
        Langues et pays envoyés aux box IPTV (Formuler, MYTVOnline…). Rien de coché : tout le catalogue.
        L’interface web n’est pas concernée. Après un changement, actualisez le portail sur la box.
      </p>
      <Show when={!etat.loading} fallback={<p class="tertiaire" style={{ 'font-size': '13px' }}>Comptage du catalogue…</p>}>
        <Show when={!etat.error} fallback={<p class="tertiaire" style={{ 'font-size': '13px' }}>Réglage indisponible : {versErreurLecteur(etat.error).message}</p>}>
          <p data-role="box-resume" style={{ margin: '0 0 10px', 'font-size': '13px' }}>
            La box recevra <strong>{courant().size === 0 ? 'tout' : [...courant()].sort().join(', ')}</strong> —{' '}
            {nombre(total().chaines)} chaînes, {nombre(total().films)} films, {nombre(total().series)} séries.
          </p>
          <div style={{ display: 'flex', gap: '8px', 'flex-wrap': 'wrap', margin: '0 0 10px' }}>
            <input
              type="search"
              placeholder="Chercher un code ou un pays"
              aria-label="Chercher un code ou un pays"
              value={filtre()}
              onInput={(e) => poserFiltre(e.currentTarget.value)}
              style={{ flex: '1 1 200px', padding: '6px 10px' }}
            />
            <button onClick={() => poserChoisis(new Set())} style={{ border: '1px solid var(--line2)', padding: '6px 12px' }}>
              Tout décocher
            </button>
            <button
              onClick={() => void enregistrer()}
              disabled={!modifie() || envoi()}
              style={{ background: 'var(--acc)', color: 'var(--acc-ink)', padding: '6px 16px', opacity: modifie() ? 1 : 0.5 }}
            >
              {envoi() ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
          <div style={{ display: 'grid', gap: '4px', 'max-height': '360px', overflow: 'auto', margin: '0 0 16px' }} data-role="box-prefixes">
            <For each={visibles()}>
              {(p) => (
                <label style={{ display: 'flex', 'align-items': 'center', gap: '10px', padding: '6px 12px', border: '1px solid var(--line)', 'border-radius': 'var(--r-md)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={courant().has(p.code)} onChange={() => basculer(p.code)} aria-label={`${p.code} ${NOMS[p.code] ?? ''}`.trim()} />
                  <strong style={{ width: '48px', flex: 'none' }}>{p.code}</strong>
                  <span class="tronque" style={{ flex: 1 }}>{NOMS[p.code] ?? ''}</span>
                  <span class="num tertiaire" style={{ 'font-size': '12px', flex: 'none' }}>
                    {nombre(p.chaines)} ch. · {nombre(p.films)} films · {nombre(p.series)} séries
                  </span>
                </label>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </section>
  )
}
