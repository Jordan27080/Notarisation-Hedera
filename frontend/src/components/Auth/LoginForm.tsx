import { useState } from 'react'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { authApi } from '../../api/auth'
import { signMessage, isValidAccountId } from '../../utils/hedera'
import { useAuth } from '../../contexts/AuthContext'
import PrivateKeyInput from './PrivateKeyInput'
import Req from '../ui/Req'

export default function LoginForm() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const registered = (location.state as { registered?: boolean })?.registered

  const [accountId, setAccountId] = useState('')
  const [privateKey, setPrivateKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValidAccountId(accountId)) {
      setError('ID de compte Hedera invalide')
      return
    }
    setLoading(true)
    setError('')

    try {
      // Step 1: request a challenge nonce from the server
      const { nonce } = await authApi.challenge(accountId)

      // Step 2: sign the nonce client-side (private key never leaves browser)
      const signatureHex = await signMessage(nonce, privateKey)

      // Step 3: send the signature for server-side ED25519 verification
      const user = await authApi.login({ hederaAccountId: accountId, nonce, signatureHex })
      login(user)
      navigate('/')
    } catch (err: unknown) {
      const axiosMsg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      const jsMsg = (err instanceof Error) ? err.message : null
      setError(axiosMsg ?? jsMsg ?? 'Authentification échouée. Vérifiez vos identifiants.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 440, margin: '4rem auto', padding: '0 1rem' }}>
      <div className="card">
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '1.5rem' }}>Connexion</h1>

        {registered && (
          <div className="alert alert-success">Compte créé avec succès. Connectez-vous.</div>
        )}
        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>ID de compte Hedera <Req /></label>
            <input required value={accountId} onChange={e => setAccountId(e.target.value)} placeholder="0.0.12345" />
          </div>
          <PrivateKeyInput
            value={privateKey}
            onChange={setPrivateKey}
            label={<>Clé privée ED25519 (signe le challenge localement) <Req /></>}
          />

          <button type="submit" className="btn-primary" style={{ width: '100%', padding: '.65rem' }} disabled={loading}>
            {loading ? <span className="spinner" /> : 'Se connecter'}
          </button>
        </form>

        <p style={{ marginTop: '1rem', textAlign: 'center', fontSize: '.875rem', color: 'var(--text-muted)' }}>
          Pas encore de compte ? <Link to="/register">S'inscrire</Link>
        </p>
      </div>
    </div>
  )
}
