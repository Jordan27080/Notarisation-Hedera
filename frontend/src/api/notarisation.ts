import client from './client'

export interface NotarisePayload {
  documentHash: string
  fileName:     string
  folder?:      string    // nom de la formation — pour grouper dans Mes documents
  pdfBase64?:   string    // contenu PDF encodé base64 — pour re-téléchargement
}

export interface NotarisationRecord {
  id:                  number
  documentHash:        string
  fileName:            string
  folder?:             string
  hederaTransactionId: string
  consensusTimestamp:  string | null
  notarisedAt:         string
  hasPdf:              boolean
}

export interface VerifyPayload {
  documentHash: string
}

export interface VerifyResult {
  isAuthentic: boolean
  documentHash: string
  hederaTransactionId: string | null
  consensusTimestamp: string | null
  notarisedAt: string | null
  notarisedBy: string | null
  fileName: string | null
}

export const notarisationApi = {
  notarise: (data: NotarisePayload): Promise<NotarisationRecord> =>
    client.post('/notarisation', data).then(r => r.data),

  getMyRecords: (): Promise<NotarisationRecord[]> =>
    client.get('/notarisation').then(r => r.data),

  /** Télécharge le PDF stocké côté serveur pour un enregistrement donné */
  downloadPdf: async (id: number, fileName: string): Promise<void> => {
    const response = await client.get(`/notarisation/${id}/download`, { responseType: 'blob' })
    const url = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }))
    const a   = document.createElement('a')
    a.href     = url
    a.download = fileName
    // L'élément doit être dans le DOM avant .click() — sinon Chrome bloque le blob URL
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  },

  verify: (data: VerifyPayload): Promise<VerifyResult> =>
    client.post('/verification/verify', data).then(r => r.data),
}
