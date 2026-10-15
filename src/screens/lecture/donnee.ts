import { createEffect, createSignal, onCleanup } from 'solid-js'

/**
 * Donnée asynchrone qui ne SUSPEND jamais, et qui reste donc écrite à la main.
 *
 * POURQUOI elle survit au passage à TanStack Query : la donnée d'une requête
 * est portée par une ressource Solid, et une ressource en attente lue pendant
 * le rendu décroche tout le lecteur de la page le temps d'un appel — zapper
 * faisait disparaître l'image et le son pendant que la grille EPG arrivait,
 * exactement l'écran noir silencieux que le dossier proscrit. Le CACHE, lui,
 * est bien celui de l'application : les chargeurs qui passent par ici passent
 * par `donneePartagee`, donc zapper vers une chaîne déjà vue ne redemande rien.
 */
export function donnee<S, T>(source: () => S, charger: (s: S) => Promise<T>, initial: T) {
  const [valeur, poser] = createSignal<T>(initial)
  createEffect(() => {
    const s = source()
    let annule = false
    poser(() => initial)
    void charger(s).then((v) => {
      if (!annule) poser(() => v)
    })
    onCleanup(() => {
      annule = true
    })
  })
  return valeur
}
