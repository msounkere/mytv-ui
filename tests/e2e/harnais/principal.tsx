import { Show, createMemo, createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { QueryClientProvider } from '@tanstack/solid-query'
import { clientRequetes } from '../../../src/lib/requetes'
import { brancherRouteur } from '../../../src/etat'
import { db, type EntreeCatalogue } from '../../../src/lib/db'
import Lecture from '../../../src/screens/Lecture'
import Guide from '../../../src/screens/Guide'
import '../../../src/styles/tokens.css'
import '../../../src/styles/base.css'

// Monte UN ecran reel selon `?ecran=lecture|guide`, sans coque ni session. La
// page de test pilote le reste par `window.harnais`.

const ecranDemande = new URLSearchParams(location.search).get('ecran') ?? 'lecture'
const [chemin, poserChemin] = createSignal(ecranDemande === 'guide' ? '/guide' : '/lecture/x')
brancherRouteur(chemin, (h) => poserChemin(h))

const [entree, poserEntree] = createSignal<EntreeCatalogue | null>(null)
const [urlForcee, poserUrlForcee] = createSignal<string | undefined>(undefined)
const ouvertures: string[] = []
// Derniere entree non nulle : le lecteur lit encore son entree pendant qu'il se demonte.
const derniere = createMemo<EntreeCatalogue | null>((prec) => entree() ?? prec, null)

declare global {
  interface Window {
    harnais: {
      ouvrir: (e: Record<string, unknown>, urlForcee?: string) => void
      fermer: () => void
      semer: (entrees: Array<Record<string, unknown>>) => Promise<void>
      ouvertures: string[]
    }
  }
}

window.harnais = {
  ouvrir: (e, forcee) => {
    ouvertures.push(String(e['cle']))
    poserUrlForcee(forcee)
    poserEntree(e as unknown as EntreeCatalogue)
  },
  fermer: () => poserEntree(null),
  // Le Guide lit le catalogue local : on y depose des chaines factices.
  semer: async (entrees) => {
    await db.catalogue.clear()
    await db.catalogue.bulkPut(entrees as unknown as EntreeCatalogue[])
  },
  ouvertures,
}

render(
  () => (
    <QueryClientProvider client={clientRequetes}>
      <Show when={ecranDemande === 'guide'}>
        <div style={{ height: '100vh' }}>
          <Guide surOuvrir={(e) => ouvertures.push(e.cle)} />
        </div>
      </Show>
      <Show when={ecranDemande === 'lecture' && entree()}>
        <div style={{ height: '100vh' }}>
          <Lecture
            entree={derniere()!}
            urlForcee={urlForcee()}
            surChanger={(n) => poserEntree(n)}
            surFermer={() => poserEntree(null)}
          />
        </div>
      </Show>
    </QueryClientProvider>
  ),
  document.getElementById('root')!,
)
