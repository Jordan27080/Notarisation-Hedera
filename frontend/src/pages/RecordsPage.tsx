import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { notarisationApi, type NotarisationRecord } from '../api/notarisation'
import React from 'react'

// ─── Groupement par dossier ───────────────────────────────────────────────────

function groupByFolder(records: NotarisationRecord[]) {
  const map = new Map<string, NotarisationRecord[]>()
  for (const rec of records) {
    const key = rec.folder?.trim() || '📄 Documents'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(rec)
  }
  // Trie : dossiers nommés d'abord (alphabétique), puis "Documents" en dernier
  return Array.from(map.entries()).sort(([a], [b]) => {
    if (a === '📄 Documents') return 1
    if (b === '📄 Documents') return -1
    return a.localeCompare(b, 'fr')
  })
}

// ─── Composant principal ───────────────────────────────────────────────────────

export default function RecordsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['my-records'],
    queryFn:  notarisationApi.getMyRecords,
  })

  if (isLoading) return (
    <div style={{ padding: '3rem', textAlign: 'center' }}>
      <span className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  )
  if (error) return (
    <div className="alert alert-error" style={{ margin: '2rem' }}>Erreur de chargement</div>
  )

  const groups = groupByFolder(data ?? [])
  const total  = data?.length ?? 0

  return (
    <div style={{ maxWidth: 860, margin: '2rem auto', padding: '0 1rem' }}>

      {/* ── En-tête ── */}
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '.3rem' }}>
          📁 Mes documents notarisés
        </h1>
        <p style={{ fontSize: '.875rem', color: 'var(--text-muted)' }}>
          {total === 0
            ? 'Aucun document notarisé pour l\'instant.'
            : `${total} document${total > 1 ? 's' : ''} notarisé${total > 1 ? 's' : ''} — ${groups.length} dossier${groups.length > 1 ? 's' : ''}`}
        </p>
      </div>

      {total === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '3rem', marginBottom: '.75rem' }}>📭</div>
          <p>Générez et téléchargez des attestations pour les voir apparaître ici.</p>
        </div>
      )}

      {/* ── Dossiers ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {groups.map(([folderName, recs]) => (
          <FolderCard key={folderName} name={folderName} records={recs} />
        ))}
      </div>
    </div>
  )
}

// ─── Carte dossier (collapsible) ─────────────────────────────────────────────

function FolderCard({ name, records }: { name: string; records: NotarisationRecord[] }) {
  const [open, setOpen] = useState(true)
  const isNamed = !name.startsWith('📄')

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>

      {/* En-tête du dossier */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', textAlign: 'left',
          display: 'flex', alignItems: 'center', gap: '.75rem',
          padding: '.85rem 1rem',
          background: isNamed ? 'var(--primary)' : 'var(--surface-hover)',
          border: 'none', cursor: 'pointer',
          borderBottom: open ? '1px solid var(--border)' : 'none',
        }}
      >
        <span style={{ fontSize: '1.3rem' }}>{isNamed ? '📂' : '📄'}</span>
        <span style={{
          flex: 1, fontWeight: 700,
          fontSize: '.95rem',
          color: isNamed ? '#fff' : 'var(--text)',
        }}>
          {isNamed ? name : 'Documents'}
        </span>
        <span style={{
          fontSize: '.75rem', fontWeight: 600,
          background: isNamed ? 'rgba(255,255,255,.2)' : 'var(--border)',
          color: isNamed ? '#fff' : 'var(--text-muted)',
          padding: '2px 8px', borderRadius: 12,
        }}>
          {records.length} fichier{records.length > 1 ? 's' : ''}
        </span>
        <span style={{ color: isNamed ? '#fff' : 'var(--text-muted)', fontSize: '.8rem' }}>
          {open ? '▾' : '▸'}
        </span>
      </button>

      {/* Fichiers */}
      {open && (
        <div>
          {records.map((rec, idx) => (
            <FileRow key={rec.id} rec={rec} last={idx === records.length - 1} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Ligne fichier ────────────────────────────────────────────────────────────

function FileRow({ rec, last }: { rec: NotarisationRecord; last: boolean }) {
  const [expanded,    setExpanded]    = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [dlError,     setDlError]     = useState('')

  async function handleDownload(e: React.MouseEvent) {
    e.stopPropagation()   // ne pas toggler l'expand
    if (downloading) return
    setDownloading(true)
    setDlError('')
    try {
      await notarisationApi.downloadPdf(rec.id, rec.fileName)
    } catch {
      setDlError('Téléchargement impossible.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div style={{ borderBottom: last ? 'none' : '1px solid var(--border)' }}>

      {/* Ligne principale */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex', alignItems: 'center', gap: '.75rem',
          padding: '.65rem 1rem', cursor: 'pointer',
          background: expanded ? 'var(--surface-hover)' : 'transparent',
          transition: 'background .1s',
        }}
      >
        <span style={{ fontSize: '1.1rem' }}>📋</span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 600, fontSize: '.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {rec.fileName}
          </p>
          <p style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: '.1rem' }}>
            {new Date(rec.notarisedAt).toLocaleString('fr')}
          </p>
        </div>

        <span className="badge badge-success" style={{ fontSize: '.7rem', whiteSpace: 'nowrap' }}>✓ Notarisé</span>

        {/* Bouton téléchargement */}
        {rec.hasPdf && (
          <button
            onClick={handleDownload}
            disabled={downloading}
            title="Re-télécharger le PDF"
            style={{
              background: 'var(--primary)', color: '#fff',
              border: 'none', borderRadius: 6,
              padding: '.3rem .65rem', fontSize: '.75rem',
              cursor: downloading ? 'default' : 'pointer',
              opacity: downloading ? .7 : 1,
              display: 'flex', alignItems: 'center', gap: '.35rem',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            {downloading ? <span className="spinner" style={{ width: 12, height: 12 }} /> : '⬇️'}
            {downloading ? 'Chargement…' : 'PDF'}
          </button>
        )}

        <span style={{ color: 'var(--text-muted)', fontSize: '.75rem' }}>{expanded ? '▾' : '▸'}</span>
      </div>

      {dlError && (
        <p style={{ fontSize: '.75rem', color: 'var(--error)', padding: '0 1rem .5rem 2.85rem' }}>
          ❌ {dlError}
        </p>
      )}

      {/* Détails dépliables */}
      {expanded && (
        <div style={{
          padding: '.75rem 1rem .85rem 2.85rem',
          background: 'var(--surface-hover)',
          borderTop: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', gap: '.4rem',
        }}>
          <DetailField label="Hash SHA-256"       value={rec.documentHash} mono />
          <DetailField label="Transaction Hedera" value={rec.hederaTransactionId} mono />
          <DetailField
            label="Horodatage blockchain"
            value={rec.consensusTimestamp
              ? new Date(rec.consensusTimestamp).toLocaleString('fr')
              : '—'}
          />
        </div>
      )}
    </div>
  )
}

// ─── Micro-composants ────────────────────────────────────────────────────────

function DetailField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
      <span style={{ fontSize: '.7rem', color: 'var(--text-muted)', minWidth: 150, fontWeight: 600 }}>
        {label}
      </span>
      <span style={{
        fontFamily: mono ? 'monospace' : undefined,
        fontSize: '.75rem', wordBreak: 'break-all',
      }}>
        {value}
      </span>
    </div>
  )
}
