import { Show } from 'solid-js'
import PistesLecteur, { type PisteLecteur } from '../../components/PistesLecteur'
import { surtitre } from './format'

// Colonne de droite en VOD : il n'y a rien à zapper dans un film, seulement des
// pistes à choisir — et la catégorie, qui est le seul renseignement que le
// catalogue ajoute au fichier.

export default function ColonnePistes(props: {
  pistesAudio: PisteLecteur[]
  pistesTexte: PisteLecteur[]
  sousTitre: number
  categorie: string | undefined
  surSousTitre: (index: number) => void
}) {
  return (
    <div style={{ display: 'grid', 'align-content': 'start', gap: '22px', padding: '16px 14px', overflow: 'auto' }}>
      <PistesLecteur
        titre="Pistes audio"
        pistes={props.pistesAudio}
        selection={0}
        surChoisir={() => {}}
        vide="Ce navigateur n’expose pas les pistes audio d’un MP4. Diffuser vers le téléviseur donne accès au son d’origine."
      />
      <PistesLecteur
        titre="Sous-titres"
        pistes={props.pistesTexte}
        selection={props.sousTitre + 1}
        surChoisir={(i) => props.surSousTitre(i)}
        vide="Aucune piste de sous-titres dans ce fichier."
      />
      <Show when={props.categorie}>
        {(c) => (
          <section style={{ display: 'grid', gap: '4px' }}>
            <h2 class="tertiaire" style={surtitre}>Catégorie</h2>
            <p class="secondaire" style={{ margin: 0, padding: '0 6px', 'font-size': '13px' }}>{c()}</p>
          </section>
        )}
      </Show>
    </div>
  )
}
