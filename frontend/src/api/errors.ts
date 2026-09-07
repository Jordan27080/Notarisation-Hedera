import type { AxiosError } from 'axios'

/**
 * Traduction des erreurs API en messages affichables.
 *
 * Le backend renvoie systématiquement `{ message }` (voir ExceptionMiddleware) :
 * 503 → réseau Hedera injoignable, 502 → transaction refusée par le réseau,
 * 500 → message générique. Ce module centralise l'extraction, qui était
 * dupliquée — et incohérente — dans chaque composant.
 */

/** Statut HTTP renvoyé par l'API, ou `undefined` si la requête n'a jamais abouti. */
export function apiErrorStatus(error: unknown): number | undefined {
  return (error as AxiosError | undefined)?.response?.status
}

/**
 * Vrai si le réseau Hedera est injoignable (503). L'opération n'a rien enregistré
 * et peut être relancée telle quelle — inutile, en revanche, d'enchaîner les
 * tentatives suivantes d'un lot.
 */
export function isHederaUnavailable(error: unknown): boolean {
  return apiErrorStatus(error) === 503
}

/**
 * Message destiné à l'utilisateur.
 *
 * Sur un téléchargement (`responseType: 'blob'`), axios livre le corps d'erreur
 * sous forme de Blob et non d'objet : il faut le relire pour retrouver le JSON.
 */
export async function apiErrorMessage(error: unknown, fallback: string): Promise<string> {
  const axiosError = error as AxiosError | undefined
  const response   = axiosError?.response
  const data: unknown = response?.data

  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text()) as { message?: unknown }
      if (typeof parsed.message === 'string') return parsed.message
    } catch {
      // corps non JSON — on retombe sur le fallback
    }
  } else if (typeof (data as { message?: unknown } | undefined)?.message === 'string') {
    return (data as { message: string }).message
  }

  // Requête partie mais aucune réponse : serveur éteint, DNS, coupure réseau.
  if (!response && axiosError?.request)
    return "Le serveur est injoignable. Vérifiez que l'API est démarrée."

  return fallback
}
