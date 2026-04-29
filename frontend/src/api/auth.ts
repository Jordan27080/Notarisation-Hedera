import client from './client'

export interface RegisterPayload {
  username: string
  email: string
  hederaAccountId: string
  publicKeyHex: string
}

export interface ChallengeResponse {
  nonce: string
  message: string
  expiresAt: string
}

export interface LoginPayload {
  hederaAccountId: string
  nonce: string
  signatureHex: string
}

export interface LoginResponse {
  token: string
  username: string
  hederaAccountId: string
  expiresAt: string
}

export const authApi = {
  register: (data: RegisterPayload) =>
    client.post('/auth/register', data).then(r => r.data),

  challenge: (hederaAccountId: string): Promise<ChallengeResponse> =>
    client.post('/auth/challenge', { hederaAccountId }).then(r => r.data),

  login: (data: LoginPayload): Promise<LoginResponse> =>
    client.post('/auth/login', data).then(r => r.data),
}
