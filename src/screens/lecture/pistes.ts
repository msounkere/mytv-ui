import { createSignal } from 'solid-js'
import type { PisteLecteur } from '../../components/PistesLecteur'

// Les pistes audio et de sous-titres n'existent nulle part ailleurs que sur
// l'élément `<video>` : ni le catalogue ni la sonde ne les connaissent. Elles
// se relisent donc sur lui, à chaque fois qu'une image arrive.

export function creerPistes(video: () => HTMLVideoElement) {
  const [sousTitre, poserSousTitre] = createSignal(-1)
  const [pistesTexte, poserPistesTexte] = createSignal<PisteLecteur[]>([])
  const [pistesAudio, poserPistesAudio] = createSignal<PisteLecteur[]>([])

  /** Pistes réellement exposées par le navigateur pour ce fichier. */
  function relirePistes() {
    const v = video()
    const texte: PisteLecteur[] = [{ libelle: 'Désactivés' }]
    for (let i = 0; i < v.textTracks.length; i++) {
      const t = v.textTracks[i]!
      if (t.kind !== 'subtitles' && t.kind !== 'captions') continue
      texte.push({ libelle: t.label || t.language || `Piste ${i + 1}`, codec: t.language })
    }
    poserPistesTexte(texte.length > 1 ? texte : [])

    // `audioTracks` n'est implémenté ni par Chrome ni par Firefox : la liste
    // reste vide plutôt que d'inventer une piste qu'on ne saurait pas changer.
    const pistes = (v as HTMLVideoElement & { audioTracks?: ArrayLike<{ label: string; language: string }> }).audioTracks
    poserPistesAudio(
      pistes
        ? Array.from({ length: pistes.length }, (_, i) => ({
            libelle: pistes[i]!.label || pistes[i]!.language || `Piste ${i + 1}`,
            codec: pistes[i]!.language || undefined,
          }))
        : [],
    )
  }

  function choisirSousTitre(index: number) {
    poserSousTitre(index)
    const v = video()
    for (let i = 0; i < v.textTracks.length; i++)
      v.textTracks[i]!.mode = i === index - 1 ? 'showing' : 'disabled'
  }

  return { sousTitre, pistesTexte, pistesAudio, relirePistes, choisirSousTitre }
}
