import { PrivateKey } from '@hashgraph/sdk'
import { bytesToHex } from './crypto'

/**
 * Derives the ED25519 public key hex from a private key string.
 * Supports DER-encoded and raw hex formats accepted by the Hedera SDK.
 */
export function derivePublicKey(privateKeyStr: string): string {
  const privateKey = PrivateKey.fromString(privateKeyStr)
  const pubKey = privateKey.publicKey
  // toBytes() returns the 32-byte raw public key
  return bytesToHex(pubKey.toBytes())
}

/**
 * Signs a UTF-8 message with an ED25519 private key.
 * Returns the 64-byte signature as a hex string.
 * The private key never leaves the browser.
 */
export function signMessage(message: string, privateKeyStr: string): string {
  const privateKey = PrivateKey.fromString(privateKeyStr)
  const messageBytes = new TextEncoder().encode(message)
  const signatureBytes = privateKey.sign(messageBytes)
  return bytesToHex(signatureBytes)
}

/** Basic Hedera account ID validation (e.g. "0.0.12345") */
export function isValidAccountId(accountId: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(accountId.trim())
}
