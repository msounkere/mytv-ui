import { Show, createSignal } from 'solid-js'
import { config } from '../config'
import { deconnexion, session } from '../lib/auth'
import { ClientXtream } from '../lib/xtream'
import { ErreurLecteur, LIBELLE_COUCHE } from '../lib/errors'
import { importerCatalogue, type Avancement } from '../lib/catalogue'
import { invaliderCatalogue } from '../lib/requetes'

// Écran minimal : compte, état du relais, import du catalogue.
//
// POURQUOI plus aucune saisie d'identifiants : le service les détient et les
// sert à une session valide (voir lib/auth.ts). Les laisser modifiables ici
// n'aurait plus de sens — ce ne sont plus les identifiants de l'utilisateur mais
// ceux du serveur. Ils restent AFFICHÉS, en lecture seule, parce qu'un service
// qui refuse un compte est le premier soupçon quand plus rien ne se lit.

export default function Reglages() {
  const [etat, poserEtat] = createSignal('')
  const [erreur, poserErreur] = createSignal<ErreurLecteur | null>(null)
  const [avancement, poserAvancement] = createSignal<Avancement | null>(null)

  function signaler(e: unknown) {
    poserErreur(e instanceof ErreurLecteur ? e : new ErreurLecteur('relais', String(e), 'Réessayer.'))
  }

  async function verifier() {
    poserErreur(null)
    poserEtat('Vérification du relais…')
    try {
      const infos = (await new ClientXtream().authentifier()).user_info
      if (!infos || infos.auth !== 1) {
        poserErreur(
          new ErreurLecteur(
            'auth',
            'Le relais a répondu, mais a refusé ce compte.',
            'Vérifier les identifiants du relais dans le .env du service.',
          ),
        )
        poserEtat('')
        return
      }
      poserEtat(
        `Compte valide — statut ${infos.status ?? 'inconnu'}, ` +
          `${infos.active_cons ?? '?'} / ${infos.max_connections ?? '?'} connexion(s).`,
      )
    } catch (e) {
      signaler(e)
      poserEtat('')
    }
  }

  async function importer() {
    poserErreur(null)
    poserEtat('')
    try {
      const r = await importerCatalogue(poserAvancement)
      poserAvancement(null)
      // L'import est le SEUL ecrivain du catalogue : c'est donc le seul moment
      // ou les lectures mises en cache cessent d'etre vraies. Les ecrans
      // restent montes derriere cet ecran, personne ne relirait de lui-meme.
      await invaliderCatalogue()
      poserEtat(`${r.entrees.toLocaleString('fr-FR')} entrées importées, ${r.categories} catégories.`)
    } catch (e) {
      poserAvancement(null)
      signaler(e)
    }
  }

  return (
    <div style={{ 'max-width': '560px', padding: '32px 24px' }}>
      <h1>Réglages</h1>

      <h2 style={{ 'margin-top': '24px' }}>Compte</h2>
      <div
        style={{
          display: 'flex', 'align-items': 'center', gap: '12px',
          margin: '12px 0 16px', padding: '12px 14px',
          background: 'var(--elev)', border: '1px solid var(--line)',
          'border-radius': 'var(--r-md)',
        }}
      >
        <div style={{ flex: 1, display: 'grid', gap: '2px', 'min-width': 0 }}>
          <strong class="tronque">{session()?.identifiant ?? 'Session inconnue'}</strong>
          <span class="secondaire" style={{ 'font-size': '12px' }}>
            Favoris, historique et reprises suivent ce compte d'une machine à l'autre.
          </span>
        </div>
        <button
          onClick={() => void deconnexion()}
          style={{ border: '1px solid var(--line2)', padding: '7px 14px' }}
        >
          Se déconnecter
        </button>
      </div>

      <h2 style={{ 'margin-top': '24px' }}>Relais</h2>
      <p class="secondaire" style={{ margin: '6px 0 12px', 'font-size': '12px' }}>
        Détenus par le service, en lecture seule. Ils se changent dans son
        fichier <code>.env</code>, jamais ici.
      </p>
      <div style={{ display: 'grid', gap: '8px', margin: '0 0 16px' }}>
        <Ligne libelle="Adresse" valeur={config().base || `${location.host} (même origine)`} />
        <Ligne libelle="Utilisateur" valeur={config().username || '—'} />
        {/* Masqué, et sans bouton pour le révéler : l'afficher ne répond à
            aucune question que l'utilisateur se pose encore. */}
        <Ligne libelle="Mot de passe" valeur={config().password ? '••••••••••' : '—'} />
        <Show when={config().hoteLocal}>
          {(h) => <Ligne libelle="Diffusion locale" valeur={h()} />}
        </Show>
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={verifier} style={{ background: 'var(--acc)', color: 'var(--acc-ink)', padding: '8px 16px' }}>
          Vérifier le relais
        </button>
        <button
          onClick={importer}
          disabled={!!avancement()}
          style={{ border: '1px solid var(--line2)', padding: '8px 16px' }}
        >
          Importer le catalogue
        </button>
      </div>

      <Show when={avancement()}>
        {(a) => (
          <div style={{ 'margin-top': '16px' }}>
            <p class="secondaire" style={{ margin: '0 0 6px' }}>{a().etape}…</p>
            <div style={{ height: '4px', background: 'var(--elev)', 'border-radius': '2px', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%', background: 'var(--acc)',
                  width: `${Math.round((a().part ?? 0) * 100)}%`,
                  transition: 'width var(--dur) var(--ease)',
                }}
              />
            </div>
          </div>
        )}
      </Show>

      <Show when={etat()}>
        <p style={{ color: 'var(--ok)', 'margin-top': '16px' }}>{etat()}</p>
      </Show>

      <Show when={erreur()}>
        {(e) => (
          <div
            style={{
              'margin-top': '16px', padding: '12px 14px',
              background: 'var(--err-bg)', border: '1px solid var(--err)',
              'border-radius': 'var(--r-md)',
            }}
          >
            <strong style={{ color: 'var(--err)' }}>{LIBELLE_COUCHE[e().couche]}</strong>
            <p style={{ margin: '4px 0' }}>{e().message}</p>
            <p class="secondaire" style={{ margin: 0 }}>{e().action}</p>
            <Show when={e().detail}>
              <p class="tertiaire" style={{ margin: '6px 0 0', 'font-family': 'var(--moov-font-mono)', 'font-size': '12px' }}>
                {e().detail}
              </p>
            </Show>
          </div>
        )}
      </Show>
    </div>
  )
}

function Ligne(props: { libelle: string; valeur: string }) {
  return (
    <div style={{ display: 'flex', gap: '12px', 'align-items': 'baseline' }}>
      <span class="secondaire" style={{ width: '130px', 'flex-shrink': 0, 'font-size': '12px' }}>
        {props.libelle}
      </span>
      <span class="tronque" style={{ 'font-family': 'var(--moov-font-mono)', 'font-size': '12px' }}>
        {props.valeur}
      </span>
    </div>
  )
}
