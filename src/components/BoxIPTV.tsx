import { For, Show, createMemo, createResource, createSignal, onCleanup } from 'solid-js'
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
  /** Profil dont la box montre « Ma liste », « En cours », « Mes chaînes » ; vide = celui de la box. */
  profil_listes?: string
  profils?: { id: string; nom: string }[]
}

/** Noms lisibles des prefixes les plus courants (les autres restent en code). */
const NOMS: Record<string, string> = {
  FR: 'France', EN: 'Anglais', ENG: 'Anglais', UK: 'Royaume-Uni', US: 'États-Unis', USA: 'États-Unis',
  AR: 'Arabe', DE: 'Allemagne', ES: 'Espagne', IT: 'Italie', PT: 'Portugal', BR: 'Brésil', NL: 'Pays-Bas',
  BE: 'Belgique', CA: 'Canada', CAFR: 'Canada (français)', CH: 'Suisse', AF: 'Afrique', MA: 'Maroc',
  DZ: 'Algérie', TN: 'Tunisie', TR: 'Turquie', PL: 'Pologne', RO: 'Roumanie', GR: 'Grèce', IN: 'Inde',
  NF: 'Netflix', MULTI: 'Multilingue',
}

/** Attente apres une case cochee : plusieurs clics d'affilee partent en une seule ecriture. */
const DELAI_CASES = 800

const nombre = (n: number) => n.toLocaleString('fr-FR')

export default function BoxIPTV() {
  const [etat, { mutate }] = createResource(() => json<EtatBox>('/admin/xtream'))
  const [choisis, poserChoisis] = createSignal<Set<string> | null>(null)
  const [filtre, poserFiltre] = createSignal('')
  // Enregistrement automatique, comme les autres onglets : peu apres le dernier changement
  // (plusieurs cases cochees d'affilee = une seule ecriture), une ecriture a la fois.
  const [statut, poserStatut] = createSignal<'repos' | 'attente' | 'envoi' | 'enregistre' | 'erreur'>('repos')
  const [profilChoisi, poserProfilChoisi] = createSignal<string | null>(null)
  const profil = () => profilChoisi() ?? etat()?.profil_listes ?? ''

  // Le choix en cours d'edition ; tant qu'on n'a rien touche, celui du serveur.
  const courant = () => choisis() ?? new Set(etat()?.prefixes ?? [])
  const modifie = () => {
    if (profilChoisi() !== null && profilChoisi() !== (etat()?.profil_listes ?? '')) return true
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
    planifier(DELAI_CASES)
  }

  let minuteur: ReturnType<typeof setTimeout> | undefined
  let enCours = false
  let encore = false
  onCleanup(() => clearTimeout(minuteur))

  function planifier(delai: number) {
    clearTimeout(minuteur)
    poserStatut('attente')
    minuteur = setTimeout(() => void enregistrer(), delai)
  }

  async function enregistrer() {
    const e = etat()
    if (!e) return
    if (enCours) {
      encore = true // un changement pendant l'envoi : renvoye des que celui-ci revient
      return
    }
    if (!modifie()) {
      poserStatut('repos')
      return
    }
    enCours = true
    poserStatut('envoi')
    try {
      const r = await json<{ prefixes: string[]; revision: number; profil_listes?: string }>('/admin/xtream', {
        methode: 'PUT', corps: { prefixes: [...courant()].sort(), profil_listes: profil(), revision: e.revision },
      })
      // Le choix local reste la reference (il a pu bouger pendant l'envoi) ; le serveur donne
      // la nouvelle revision et ce qui est enregistre.
      mutate({ ...e, prefixes: r.prefixes, revision: r.revision, profil_listes: r.profil_listes ?? '' })
      poserStatut('enregistre')
    } catch (err) {
      poserStatut('erreur')
      emettreToast({ message: versErreurLecteur(err).message, ton: 'erreur' })
    } finally {
      enCours = false
    }
    if (encore) {
      encore = false
      void enregistrer()
    }
  }

  const libelleStatut = () => {
    switch (statut()) {
      case 'attente':
      case 'envoi':
        return 'Enregistrement…'
      case 'enregistre':
        return 'Enregistré — actualisez le portail sur la box'
      case 'erreur':
        return 'Non enregistré : réessayez'
      default:
        return ''
    }
  }

  return (
    <section aria-label="Box IPTV" data-role="box-iptv">
      <h2 style={{ 'margin-top': '24px' }}>Box IPTV</h2>
      <p data-role="box-statut" aria-live="polite" class="secondaire" style={{ margin: '4px 0 0', 'font-size': '12px', 'min-height': '16px', color: statut() === 'erreur' ? 'var(--err)' : statut() === 'enregistre' ? 'var(--ok)' : undefined }}>
        {libelleStatut()}
      </p>
      <p class="secondaire" style={{ margin: '6px 0 12px', 'font-size': '12px' }}>
        Langues et pays envoyés aux box IPTV (Formuler, MYTVOnline…). Rien de coché : tout le catalogue.
        L’interface web n’est pas concernée. Enregistré automatiquement ; actualisez ensuite le portail sur la box.
      </p>
      <Show when={!etat.loading} fallback={<p class="tertiaire" style={{ 'font-size': '13px' }}>Comptage du catalogue…</p>}>
        <Show when={!etat.error} fallback={<p class="tertiaire" style={{ 'font-size': '13px' }}>Réglage indisponible : {versErreurLecteur(etat.error).message}</p>}>
          <label style={{ display: 'flex', 'align-items': 'center', gap: '10px', 'flex-wrap': 'wrap', margin: '0 0 12px', 'font-size': '13px' }}>
            <span>Listes sur la box (Ma liste, En cours, Mes chaînes) :</span>
            <select
              data-role="box-profil"
              value={profil()}
              onChange={(e) => {
                poserProfilChoisi(e.currentTarget.value)
                planifier(0)
              }}
              style={{ padding: '6px 10px' }}
            >
              <option value="">Aucune (profil de la box)</option>
              <For each={etat()?.profils ?? []}>{(p) => <option value={p.id}>{p.nom}</option>}</For>
            </select>
          </label>
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
            <button onClick={() => { poserChoisis(new Set<string>()); planifier(0) }} style={{ border: '1px solid var(--line2)', padding: '6px 12px' }}>
              Tout décocher
            </button>
          </div>
          <div style={{ display: 'grid', gap: '4px', 'max-height': '360px', overflow: 'auto', margin: '0 0 12px' }} data-role="box-prefixes">
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
