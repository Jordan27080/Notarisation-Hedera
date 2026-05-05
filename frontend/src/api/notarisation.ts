import client from './client'

export interface NotarisePayload {
  documentHash: string
  fileName:     string
  folder?:      string   // nom de la formation — pour grouper dans Mes documents
}

export interface NotarisationRecord {
  id:                  number
  documentHash:        string
  fileName:            string
  folder?:             string
  hederaTransactionId: string
  consensusTimestamp:  string | null
  notarisedAt:         string
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

  verify: (data: VerifyPayload): Promise<VerifyResult> =>
    client.post('/verification/verify', data).then(r => r.data),
}
