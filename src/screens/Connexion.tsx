import { Show, createSignal, onCleanup, onMount } from 'solid-js'
import Icone from '../components/Icone'
import { connexion, etatAuth, raisonConnexion, verifierSession, type Echec } from '../lib/auth'

// Page de connexion. Tant qu'elle est affichee, AUCUN ecran de l'application
// n'est monte (voir Portail.tsx) : l'URL publique ne montre donc plus une
// interface utilisable mais une porte.
//
// POURQUOI l'etat du service est dit franchement : sans lui, un service arrete
// donnerait un formulaire qui refuse tout sans jamais expliquer pourquoi --
// exactement l'ecran muet que le brief interdit.

export default function Connexion() {
  const [identifiant, poserIdentifiant] = createSignal('')
  const [motDePasse, poserMotDePasse] = createSignal('')
  const [echec, poserEchec] = createSignal<Echec | null>(null)
  const [enCours, poserEnCours] = createSignal(false)
  // Un compte ne se cree pas ici : le contrat n'offre aucune route d'inscription,
  // les comptes sont poses par l'administrateur du serveur.
  // `retard` : secondes restantes avant un nouvel essai quand le serveur temporise
  // (429). Le bouton reste inerte pendant ce delai au lieu de relancer le refus.
  const [retard, poserRetard] = createSignal(0)

  let champIdentifiant: HTMLInputElement | undefined
  let champMotDePasse: HTMLInputElement | undefined

  onMount(() => {
    if (etatAuth() === 'inconnu') void verifierSession()
    // Focus initial sur le premier champ utile (US-47 CA4, audit A UX1) : l'attribut
    // `autofocus` ne vaut qu'au chargement du document, pas a l'arrivee de l'ecran.
    requestAnimationFrame(() => champIdentifiant?.focus())
  })

  const injoignable = () => etatAuth() === 'injoignable'

  async function envoyer(e: Event) {
    e.preventDefault()
    if (enCours()) return
    poserEchec(null)
    poserEnCours(true)
    const r = await connexion(identifiant().trim(), motDePasse())
    poserEnCours(false)
    if (r) {
      poserEchec(r)
      poserMotDePasse('')
      if (r.retardSecondes) demarrerRetard(r.retardSecondes)
      // Apres un refus, on retape le mot de passe : le focus y revient (A UX1).
      requestAnimationFrame(() => champMotDePasse?.focus())
    }
  }

  let minuteur: ReturnType<typeof setInterval> | undefined
  onCleanup(() => clearInterval(minuteur))
  function demarrerRetard(secondes: number) {
    clearInterval(minuteur)
    poserRetard(Math.ceil(secondes))
    minuteur = setInterval(() => {
      poserRetard((n) => Math.max(0, n - 1))
      if (retard() === 0) clearInterval(minuteur)
    }, 1000)
  }

  async function reessayer() {
    poserEchec(null)
    poserEnCours(true)
    await verifierSession()
    poserEnCours(false)
  }

  return (
    <div
      style={{
        height: '100%', display: 'grid', 'place-items': 'center',
        padding: '24px', background: 'var(--bgfx, var(--bg))',
      }}
    >
      <form
        onSubmit={envoyer}
        style={{
          width: 'min(360px, 100%)', display: 'grid', gap: '14px',
          padding: '28px 26px', background: 'var(--panel)',
          border: '1px solid var(--line)', 'border-radius': 'var(--r-xl)',
          'box-shadow': 'var(--moov-shadow-xl)',
        }}
      >
        <div style={{ display: 'flex', 'align-items': 'center', gap: '10px' }}>
          <span style={{ display: 'grid', color: 'var(--acc-fg)' }}>
            <Icone nom="vpn_lock" taille={24} />
          </span>
          <div style={{ display: 'grid' }}>
            <h1 style={{ 'font-size': '18px' }}>MyTV</h1>
            <span class="secondaire" style={{ 'font-size': '12px' }}>
              Connexion
            </span>
          </div>
        </div>

        <Show when={injoignable()}>
          <Encadre couche="err" titre="Service injoignable">
            Le service ne répond pas. La connexion est impossible tant qu'il est
            arrêté — les favoris et l'historique déjà présents sur cette machine,
            eux, ne sont pas perdus.
          </Encadre>
        </Show>

        {/* Session expiree (A bug 12, B UX20) : on le dit, et la reconnexion
            ramene a l'ecran d'ou l'on vient (l'URL est conservee). */}
        <Show when={!injoignable() && raisonConnexion() === 'expiree' && !echec()}>
          <Encadre couche="info" titre="Session expirée">
            Votre session a expiré, reconnectez-vous. Vous retrouverez l’écran où vous étiez.
          </Encadre>
        </Show>

        <Show when={!injoignable()}>
          <Champ
            libelle="Identifiant"
            valeur={identifiant()}
            surSaisie={poserIdentifiant}
            auto="username"
            ref={(el) => (champIdentifiant = el)}
          />
          <Champ
            libelle="Mot de passe"
            valeur={motDePasse()}
            surSaisie={poserMotDePasse}
            masque
            auto="current-password"
            ref={(el) => (champMotDePasse = el)}
          />
        </Show>

        <Show when={echec()}>
          {(e) => (
            <Encadre couche="err" titre="Connexion refusée">
              {e().message}
            </Encadre>
          )}
        </Show>

        <Show
          when={!injoignable()}
          fallback={
            <button
              type="button"
              onClick={reessayer}
              disabled={enCours()}
              style={{ border: '1px solid var(--line2)', padding: '9px 16px' }}
            >
              {enCours() ? 'Vérification…' : 'Réessayer'}
            </button>
          }
        >
          <button
            type="submit"
            disabled={enCours() || retard() > 0 || !identifiant() || !motDePasse()}
            style={{
              background: 'var(--acc)', color: 'var(--acc-ink)',
              padding: '9px 16px', opacity: enCours() ? 0.7 : 1,
            }}
          >
            {enCours() ? 'Vérification…' : retard() > 0 ? `Patienter ${retard()} s` : 'Se connecter'}
          </button>
        </Show>

      </form>
    </div>
  )
}

function Encadre(props: { couche: 'err' | 'info'; titre: string; children: unknown }) {
  const couleur = () => (props.couche === 'err' ? 'var(--err)' : 'var(--acc-fg)')
  return (
    <div
      role={props.couche === 'err' ? 'alert' : 'status'}
      data-role={props.couche === 'err' ? 'connexion-erreur' : 'connexion-info'}
      style={{
        padding: '10px 12px', background: props.couche === 'err' ? 'var(--err-bg)' : 'var(--acc-bg)',
        border: `1px solid ${couleur()}`, 'border-radius': 'var(--r-md)',
        'font-size': '13px',
      }}
    >
      <strong style={{ color: couleur() }}>{props.titre}</strong>
      <p style={{ margin: '3px 0 0' }}>{props.children as never}</p>
    </div>
  )
}

function Champ(props: {
  libelle: string
  valeur: string
  surSaisie: (v: string) => void
  masque?: boolean
  auto?: string
  ref?: (el: HTMLInputElement) => void
}) {
  return (
    <label style={{ display: 'grid', gap: '4px' }}>
      <span class="secondaire" style={{ 'font-size': '12px' }}>{props.libelle}</span>
      <input
        ref={props.ref}
        type={props.masque ? 'password' : 'text'}
        value={props.valeur}
        autocomplete={props.auto}
        spellcheck={false}
        onInput={(e) => props.surSaisie(e.currentTarget.value)}
        // 44 px au doigt (D21 : champs de 34 px sur telephone).
        style={{ 'min-height': '44px' }}
      />
    </label>
  )
}
