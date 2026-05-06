import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authApi } from '../../api/auth'
import { derivePublicKey, isValidAccountId } from '../../utils/hedera'
import PrivateKeyInput from './PrivateKeyInput'
import Req from '../ui/Req'

export default function RegisterForm() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', email: '', hederaAccountId: '', privateKey: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function update(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
    setError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValidAccountId(form.hederaAccountId)) {
      setError('ID de compte Hedera invalide (ex: 0.0.12345)')
      return
    }

    setLoading(true)
    try {
      const publicKeyHex = await derivePublicKey(form.privateKey)
      await authApi.register({
        username: form.username,
        email: form.email,
        hederaAccountId: form.hederaAccountId,
        publicKeyHex
      })
      navigate('/login', { state: { registered: true } })
    } catch (err: unknown) {
      const axiosMsg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      const jsMsg = (err instanceof Error) ? err.message : null
      setError(axiosMsg ?? jsMsg ?? 'Erreur lors de l\'inscription')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: '4rem auto', padding: '0 1rem' }}>
      <div className="card">
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '1.5rem' }}>Créer un compte</h1>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Nom d'utilisateur <Req /></label>
            <input required value={form.username} onChange={e => update('username', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Email <Req /></label>
            <input type="email" required value={form.email} onChange={e => update('email', e.target.value)} />
          </div>
          <div className="form-group">
            <label>ID de compte Hedera (ex: 0.0.12345) <Req /></label>
            <input required value={form.hederaAccountId} onChange={e => update('hederaAccountId', e.target.value)} placeholder="0.0.12345" />
          </div>
          <PrivateKeyInput
            value={form.privateKey}
            onChange={v => update('privateKey', v)}
            label={<>Clé privée ED25519 <Req /></>}
          />

          <button type="submit" className="btn-primary" style={{ width: '100%', padding: '.65rem' }} disabled={loading}>
            {loading ? <span className="spinner" /> : 'S\'inscrire'}
          </button>
        </form>

        <p style={{ marginTop: '1rem', textAlign: 'center', fontSize: '.875rem', color: 'var(--text-muted)' }}>
          Déjà un compte ? <Link to="/login">Se connecter</Link>
        </p>
      </div>
    </div>
  )
}
