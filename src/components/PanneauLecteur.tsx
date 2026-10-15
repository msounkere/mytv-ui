import { For, Show, onMount } from 'solid-js'
import Icone from './Icone'
import { config } from '../config'
import { qualite, poserQualite, lectureEnCours, type ClefQualite } from '../etat'
import { enLocal, formaterDebit, mesurerDebit, sonde } from '../sonde-debit'

// Tout ce que la barre supérieure portait en permanence — mode distant, débit,
// qualité, codec — vit ici. Le dossier de conception le déplace parce que ces
// quatre valeurs ne servent qu'au moment où l'on arbitre une qualité, et que le
// reste du temps elles occupaient la place de ce qu'on regarde.

const QUALITES: Array<{ cle: ClefQualite; libelle: string; debit: string; besoin: number }> = [
  { cle: 'auto', libelle: 'Auto (recommandé)', debit: '≤ 720p', besoin: 0 },
  { cle: '1080', libelle: '1080p', debit: '~8 Mbit/s', besoin: 8 },
  { cle: '720', libelle: '720p', debit: '~4 Mbit/s', besoin: 4 },
  { cle: '480', libelle: '480p', debit: '~2 Mbit/s', besoin: 2 },
]

export default function PanneauLecteur(props: {
  flux: { actifs: number; max: number }
  surFermer: () => void
}) {
  // La mesure part à l'ouverture du panneau, pas au démarrage : c'est le seul
  // moment où le chiffre est regardé, et le seul où disputer quelques dixièmes
  // de seconde de bande passante à un flux en cours se justifie.
  onMount(() => {
    if (sonde().etat === 'jamais') void mesurerDebit()
  })

  const mesure = () => {
    const s = sonde()
    return s.etat === 'ok' ? s.mesure : undefined
  }

  const valeurDebit = () => {
    const s = sonde()
    if (s.etat === 'mesure') return 'mesure en cours…'
    if (s.etat === 'ok') return formaterDebit(s.mesure.debit)
    if (s.etat === 'echec') return `non mesurable — ${s.cause}`
    return '—'
  }

  // Le conseil ne peut être donné qu'une fois le lien connu : avant la mesure,
  // on dit qu'on ne sait pas plutôt que d'inventer un plafond.
  const conseil = () => {
    const m = mesure()
    if (!m) {
      return sonde().etat === 'mesure'
        ? 'Mesure du débit en cours sur la liaison qui sert cette page.'
        : 'Débit non mesuré : impossible de recommander une qualité pour l’instant.'
    }
    const tenable = QUALITES.filter((q) => q.besoin > 0 && m.debit >= q.besoin * 1.5)[0]
    const lieu = enLocal() ? 'Réseau local' : 'Liaison distante'
    return tenable === undefined
      ? `${lieu} mesurée à ${formaterDebit(m.debit)} : trop juste même pour du 480p, les coupures sont à prévoir.`
      : `${lieu} mesurée à ${formaterDebit(m.debit)} : ${tenable.libelle} tient confortablement, au-delà un seul flux peut saturer la liaison.`
  }

  const lignes = (): Array<[string, string]> => {
    const m = mesure()
    const l = lectureEnCours()
    return [
      ['Mode réseau', enLocal() ? 'Domicile · réseau local' : 'Distant · tunnel chiffré'],
      ['Débit mesuré', valeurDebit()],
      ['Latence relais', m ? `${Math.round(m.latence)} ms` : '—'],
      ['Échantillon', m ? `${(m.octets / 1024 / 1024).toFixed(1).replace('.', ',')} Mo` : '—'],
      ['Flux actifs', `${props.flux.actifs} sur ${props.flux.max} autorisé${props.flux.max > 1 ? 's' : ''}`],
      ['En lecture', l ? l.titre : '—'],
      ['Relais', config().base.length > 0 ? config().base : location.host],
    ]
  }

  return (
    <div class="panneau" role="dialog" aria-label="Lecteur : qualité et informations techniques">
      <div class="panneau-titre">Qualité</div>
      <For each={QUALITES}>
        {(q) => (
          <button
            class="panneau-option"
            role="menuitemradio"
            aria-checked={qualite() === q.cle}
            onClick={() => {
              poserQualite(q.cle)
              props.surFermer()
            }}
          >
            {/* Le contour de `radio_button_checked` est le même cercle vide que
                celui de `radio_button_unchecked` : seul le tracé plein porte la
                pastille centrale, donc l'option cochée doit l'être aussi. */}
            <Icone
              nom={qualite() === q.cle ? 'radio_button_checked' : 'radio_button_unchecked'}
              taille={16}
              plein={qualite() === q.cle}
            />
            <span style={{ flex: 1 }}>{q.libelle}</span>
            <span class="panneau-appoint">{q.debit}</span>
          </button>
        )}
      </For>

      <p class="panneau-conseil">{conseil()}</p>

      <div class="panneau-titre">
        <span>Informations techniques</span>
        <button
          class="panneau-remesurer"
          disabled={sonde().etat === 'mesure'}
          onClick={() => void mesurerDebit()}
        >
          <Icone nom="refresh" taille={14} />
          <Show when={sonde().etat === 'mesure'} fallback="Mesurer">
            Mesure…
          </Show>
        </button>
      </div>
      <dl class="panneau-infos">
        <For each={lignes()}>
          {([clef, valeur]) => (
            <>
              <dt>{clef}</dt>
              <dd class="num">{valeur}</dd>
            </>
          )}
        </For>
      </dl>
    </div>
  )
}
