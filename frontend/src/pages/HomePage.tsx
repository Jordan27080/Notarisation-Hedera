import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function HomePage() {
  const { isAuthenticated } = useAuth()

  return (
    <div style={{ maxWidth: 700, margin: '4rem auto', padding: '0 1rem', textAlign: 'center' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '1rem' }}>
        Notarisation de documents sur Hedera
      </h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '1.05rem', maxWidth: 500, margin: '0 auto 2.5rem' }}>
        Prouvez l'existence et l'intégrité de vos documents grâce à la blockchain Hedera.
        Authentification par signature cryptographique ED25519.
      </p>

      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '3rem' }}>
        {isAuthenticated ? (
          <Link to="/notarise">
            <button className="btn-primary" style={{ padding: '.75rem 1.75rem', fontSize: '1rem' }}>
              Notariser un document
            </button>
          </Link>
        ) : (
          <Link to="/register">
            <button className="btn-primary" style={{ padding: '.75rem 1.75rem', fontSize: '1rem' }}>
              Commencer
            </button>
          </Link>
        )}
        <Link to="/verify">
          <button className="btn-secondary" style={{ padding: '.75rem 1.75rem', fontSize: '1rem' }}>
            Vérifier un document
          </button>
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
        {[
          { icon: '🔐', title: 'Authentification forte', desc: 'Challenge-response + signature ED25519. La clé privée ne quitte jamais votre navigateur.' },
          { icon: '⛓️', title: 'Preuve blockchain', desc: 'Le hash SHA-256 est enregistré sur Hedera Consensus Service — horodatage infalsifiable.' },
          { icon: '✅', title: 'Vérification publique', desc: 'N\'importe qui peut vérifier l\'authenticité d\'un document sans compte.' },
        ].map(card => (
          <div key={card.title} className="card" style={{ textAlign: 'left' }}>
            <div style={{ fontSize: '1.75rem', marginBottom: '.5rem' }}>{card.icon}</div>
            <h3 style={{ fontWeight: 700, marginBottom: '.35rem', fontSize: '.95rem' }}>{card.title}</h3>
            <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>{card.desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
