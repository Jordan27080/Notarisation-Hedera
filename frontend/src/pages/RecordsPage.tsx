import { useQuery } from '@tanstack/react-query'
import { notarisationApi } from '../api/notarisation'

export default function RecordsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['my-records'],
    queryFn: notarisationApi.getMyRecords
  })

  if (isLoading) return <div style={{ padding: '2rem', textAlign: 'center' }}><span className="spinner" /></div>
  if (error) return <div className="alert alert-error" style={{ margin: '2rem' }}>Erreur de chargement</div>

  return (
    <div style={{ maxWidth: 800, margin: '2rem auto', padding: '0 1rem' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '1.5rem' }}>Mes documents notarisés</h1>

      {data?.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          Aucun document notarisé pour l'instant.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {data?.map(record => (
          <div key={record.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '.75rem' }}>
              <p style={{ fontWeight: 600 }}>{record.fileName}</p>
              <span className="badge badge-info">#{record.id}</span>
            </div>
            <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', fontFamily: 'monospace', wordBreak: 'break-all', marginBottom: '.5rem' }}>
              {record.documentHash}
            </p>
            <p style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
              Tx: <span style={{ fontFamily: 'monospace' }}>{record.hederaTransactionId}</span>
            </p>
            <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: '.25rem' }}>
              {new Date(record.notarisedAt).toLocaleString('fr')}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
