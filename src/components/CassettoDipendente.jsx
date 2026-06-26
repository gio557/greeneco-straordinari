import { useState } from 'react'
import { puo } from '../permissions.js'
import DocumentList from './DocumentList.jsx'
import EmployeeFines from './EmployeeFines.jsx'

const svgProps = {
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8,
  strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
}
function IcoPayslip() {
  return <svg {...svgProps}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8.5 8h7M8.5 11.5h7M8.5 15h4" /></svg>
}
function IcoFine() {
  return <svg {...svgProps}><rect x="3.5" y="6" width="17" height="12" rx="2" /><path d="M8 6v12M8 9.5h0M8 14.5h0" /><path d="M12 10.5h5M12 13.5h5" /></svg>
}
function IcoDoc() {
  return <svg {...svgProps}><path d="M7 3h7l4 4v14a0 0 0 0 1 0 0H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><path d="M14 3v4h4" /><path d="M12 11v3.5M12 17h0" /></svg>
}

const TILES = [
  { key: 'cedolini', title: 'Cedolini', sub: 'I tuoi cedolini paga', accent: '#0d3b66', Ico: IcoPayslip },
  { key: 'multe', title: 'Multe', sub: 'Le sanzioni relative ai mezzi aziendali', accent: '#b7791f', Ico: IcoFine },
  { key: 'disciplinari', title: 'Sanzioni Disciplinari', sub: 'Provvedimenti disciplinari', accent: '#d64545', Ico: IcoDoc },
]

// Cassetto personale del dipendente: tre sezioni. Mostra SOLO i propri dati
// (ogni sotto-vista interroga con il proprio user.id).
export default function CassettoDipendente({ user, initialSub = null, onChangeFines, permConfig = null }) {
  const canSeeMulte = puo(user, 'multe.view_own', permConfig)
  const tiles = TILES.filter((t) => t.key !== 'multe' || canSeeMulte)
  const [sub, setSub] = useState(initialSub)
  const back = (
    <button className="back-link" onClick={() => setSub(null)}>‹ Cassetto del dipendente</button>
  )

  if (sub === 'multe' && canSeeMulte) {
    return (
      <>
        <div className="content sub-back">{back}</div>
        <EmployeeFines user={user} onChange={onChangeFines} />
      </>
    )
  }
  if (sub === 'cedolini' || sub === 'disciplinari') {
    return (
      <main className="content">
        {back}
        <DocumentList user={user} kind={sub === 'cedolini' ? 'cedolino' : 'disciplinare'} />
      </main>
    )
  }

  return (
    <main className="content">
      <h2 className="section-title">Cassetto del dipendente</h2>
      <div className="cassetto-tiles">
        {tiles.map((t) => (
          <button key={t.key} className="admin-tile" style={{ '--accent': t.accent }} onClick={() => setSub(t.key)}>
            <span className="admin-tile-ico"><t.Ico /></span>
            <span className="admin-tile-text">
              <span className="admin-tile-title">{t.title}</span>
              <span className="admin-tile-sub">{t.sub}</span>
            </span>
            <span className="admin-tile-arrow" aria-hidden>›</span>
          </button>
        ))}
      </div>
    </main>
  )
}
