import { Match, Show, Switch, lazy, onMount, Suspense } from 'solid-js'
import { etatAuth, verifierSession } from './lib/auth'
import Connexion from './screens/Connexion'

// Porte d'entree de l'application.
//
// POURQUOI la coque est chargee PARESSEUSEMENT : non connecte, rien de
// l'application ne doit etre monte -- ni le rail, ni l'en-tete, ni le
// catalogue. C'est ce qui fait qu'une URL publique ne montre plus une interface
// utilisable, et accessoirement ce qui rend la page de connexion legere.

const App = lazy(() => import('./App'))

export default function Portail() {
  onMount(() => void verifierSession())

  return (
    <Switch fallback={<Connexion />}>
      <Match when={etatAuth() === 'inconnu'}>
        {/* Bref : une seule requete separe cet ecran de la suite. Y mettre un
            texte evite le clignotement d'une page blanche. */}
        <p class="tertiaire" style={{ padding: '24px' }}>Ouverture de la session…</p>
      </Match>
      <Match when={etatAuth() === 'connecte'}>
        <Suspense
          fallback={<p class="tertiaire" style={{ padding: '24px' }}>Chargement…</p>}
        >
          <Show when={etatAuth() === 'connecte'}>
            <App />
          </Show>
        </Suspense>
      </Match>
    </Switch>
  )
}
