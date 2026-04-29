import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

export default function Navbar() {
  const { user, logout, isAuthenticated } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <nav style={{
      background: '#6c47ff',
      color: '#fff',
      padding: '0 2rem',
      height: '56px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      boxShadow: '0 2px 4px rgba(0,0,0,.15)'
    }}>
      <Link to="/" style={{ color: '#fff', fontWeight: 700, fontSize: '1.1rem' }}>
        🔏 Notarisation Hedera
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', fontSize: '.875rem' }}>
        <Link to="/verify" style={{ color: 'rgba(255,255,255,.85)' }}>Vérifier</Link>

        {isAuthenticated ? (
          <>
            <Link to="/notarise" style={{ color: 'rgba(255,255,255,.85)' }}>Notariser</Link>
            <Link to="/records" style={{ color: 'rgba(255,255,255,.85)' }}>Mes documents</Link>
            <span style={{ color: 'rgba(255,255,255,.6)', fontSize: '.75rem' }}>
              {user?.hederaAccountId}
            </span>
            <button
              onClick={handleLogout}
              style={{ background: 'rgba(255,255,255,.15)', color: '#fff', padding: '.35rem .85rem', borderRadius: '6px' }}
            >
              Déconnexion
            </button>
          </>
        ) : (
          <>
            <Link to="/login" style={{ color: 'rgba(255,255,255,.85)' }}>Connexion</Link>
            <Link to="/register" style={{
              background: '#fff', color: '#6c47ff',
              padding: '.35rem .85rem', borderRadius: '6px', fontWeight: 600
            }}>S'inscrire</Link>
          </>
        )}
      </div>
    </nav>
  )
}
