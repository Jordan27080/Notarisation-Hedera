import { getPublicKeyAsync, signAsync } from '@noble/ed25519'
import { bytesToHex, hexToBytes } from './crypto'

/**
 * Derives the ED25519 public key hex from a Hedera private key string.
 * Accepts DER hex, PEM, or raw 32-byte hex.
 */
export async function derivePublicKey(privateKeyStr: string): Promise<string> {
  const raw = extractRawPrivateKey(normalise(privateKeyStr))
  const pubKey = await getPublicKeyAsync(raw)
  return bytesToHex(pubKey)
}

/**
 * Signs a UTF-8 message with an ED25519 private key.
 * The private key never leaves the browser.
 */
export async function signMessage(message: string, privateKeyStr: string): Promise<string> {
  const raw = extractRawPrivateKey(normalise(privateKeyStr))
  const messageBytes = new TextEncoder().encode(message)
  const signature = await signAsync(messageBytes, raw)
  return bytesToHex(signature)
}

/**
 * Reads a key file (.pem, .txt, .key) and returns its text content.
 */
export function readKeyFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve((e.target?.result as string) ?? '')
    reader.onerror = () => reject(new Error('Impossible de lire le fichier'))
    reader.readAsText(file)
  })
}

// ─── Normalisation ──────────────────────────────────────────────────────────

/**
 * Normalise any private key format into lowercase hex (or PEM for further parsing).
 */
function normalise(input: string): string {
  const trimmed = input.trim()

  // PEM format: -----BEGIN PRIVATE KEY----- ... -----END PRIVATE KEY-----
  if (trimmed.includes('-----BEGIN')) {
    return parsePem(trimmed)
  }

  return trimmed.toLowerCase().replace(/\s+/g, '')
}

/**
 * Extracts the hex from a PEM-encoded private key.
 * PEM = base64(DER) wrapped in headers.
 */
function parsePem(pem: string): string {
  const b64 = pem
    .replace(/-----BEGIN[\s\S]+?-----/, '')
    .replace(/-----END[\s\S]+?-----/, '')
    .replace(/\s+/g, '')
  const binary = atob(b64)
  let hex = ''
  for (let i = 0; i < binary.length; i++)
    hex += binary.charCodeAt(i).toString(16).padStart(2, '0')
  return hex
}

// ─── Extraction clé brute ────────────────────────────────────────────────────

/**
 * Extracts the 32-byte raw private key from:
 * - DER PKCS#8 hex  (any length, searches for OctetString marker 0420)
 * - Raw 64-char hex (32 bytes)
 */
function extractRawPrivateKey(hex: string): Uint8Array {
  // Détection clé publique (SubjectPublicKeyInfo)
  if (hex.startsWith('302a300506032b6570032100')) {
    throw new Error(
      'Vous avez fourni votre clé PUBLIQUE. Utilisez votre clé PRIVÉE (commence par 302e020100...).'
    )
  }

  // DER PKCS#8 : cherche le marqueur OctetString 0420 (tag=04, length=20h=32)
  const marker = '0420'
  const idx = hex.indexOf(marker)
  if (idx !== -1) {
    const raw = hex.slice(idx + marker.length, idx + marker.length + 64)
    if (raw.length === 64) return hexToBytes(raw)
  }

  // Clé brute 32 octets
  if (hex.length === 64) return hexToBytes(hex)

  throw new Error(
    'Format non reconnu. Utilisez la clé DER hex (302e020100...), PEM ou raw 32 octets hex.'
  )
}

/** Validation de l'ID de compte Hedera (ex: 0.0.12345) */
export function isValidAccountId(accountId: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(accountId.trim())
}
