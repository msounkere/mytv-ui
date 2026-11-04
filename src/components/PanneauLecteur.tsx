import { For, Show, onMount } from 'solid-js'
import Icone from './Icone'
import { lectureEnCours } from '../etat'
import { LIBELLE_QUALITE_MODE, choisirQualite, qualite, type ModeQualite } from '../lib/qualite'
import { noter } from '../lib/diagnostic'
import { enLocal, formaterDebit, mesurerDebit, sonde } from '../sonde-debit'

// Tout ce que la barre supérieure portait en permanence — mode distant, débit,
// qualité, codec — vit ici. Le dossier de conception le déplace parce que ces
// valeurs ne servent qu'au moment où l'on arbitre une qualité, et que le reste
// du temps elles occupaient la place de ce qu'on regarde.
//
// Lot 10 (US-47 CA5, audit A bug 2 / D E8) : la qualité proposée ici est LA
// qualité de l'application — `lib/qualite.ts`, Auto / Éco, lue par le lecteur
// et mémorisée par appareil — et non plus un choix 1080p/720p/480p que rien ne
// lisait. Un seul réglage, le même mot partout (Réglages > Lecture, lecteur).

const QUALITES: Array<{ cle: ModeQualite; detail: string }> = [
  { cle: 'auto', detail: 'le serveur choisit' },
  { cle: 'eco', detail: '480p, ~1,2 Mbit/s' },
]

/** Debit (Mbit/s) a partir duquel la qualite Auto tient sans coupure. */
const DEBIT_CONFORT = 5

export default function PanneauLecteur(props: {
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
    if (s.etat === 'echec') return 'non mesurable'
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
    const lieu = enLocal() ? 'Réseau local' : 'Liaison distante'
    return m.debit >= DEBIT_CONFORT
      ? `${lieu} mesurée à ${formaterDebit(m.debit)} : la qualité Auto tient sans coupure.`
      : `${lieu} mesurée à ${formaterDebit(m.debit)} : trop juste pour la qualité Auto, préférez Éco.`
  }

  const lignes = (): Array<[string, string]> => {
    const m = mesure()
    const l = lectureEnCours()
    return [
      ['Mode réseau', enLocal() ? 'Domicile · réseau local' : 'Distant · tunnel chiffré'],
      ['Débit mesuré', valeurDebit()],
      ['Latence relais', m ? `${Math.round(m.latence)} ms` : '—'],
      ['Échantillon', m ? `${(m.octets / 1024 / 1024).toFixed(1).replace('.', ',')} Mo` : '—'],
      ['En lecture', l ? l.titre : '—'],
      ['Serveur', location.host],
    ]
  }

  return (
    <div class="panneau" role="dialog" aria-label="Lecteur : qualité et informations techniques">
      <div class="panneau-titre">Qualité</div>
      <div role="radiogroup" aria-label="Qualité du flux">
        <For each={QUALITES}>
          {(q) => (
            <button
              class="panneau-option"
              role="radio"
              aria-checked={qualite() === q.cle}
              data-role={`panneau-qualite-${q.cle}`}
              onClick={() => {
                choisirQualite(q.cle)
                noter('eco:choix', { qualite: q.cle, origine: 'en-tete' })
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
              <span style={{ flex: 1 }}>{LIBELLE_QUALITE_MODE[q.cle]}</span>
              <span class="panneau-appoint">{q.detail}</span>
            </button>
          )}
        </For>
      </div>

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
