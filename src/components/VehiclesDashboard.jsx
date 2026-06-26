import { useState } from 'react'
import { puo } from '../permissions.js'
import VehiclesBoard from './VehiclesBoard.jsx'
import VehiclesAdmin from './VehiclesAdmin.jsx'
import VehicleFines from './VehicleFines.jsx'

// Sezione automezzi per manager/admin: stato e storico mezzi, sanzioni; chi ha
// il permesso "anagrafica" gestisce anche i mezzi e i QR.
export default function VehiclesDashboard({ user, permConfig = null }) {
  const canAnagrafica = puo(user, 'automezzi.anagrafica', permConfig)
  const [view, setView] = useState('board')

  return (
    <main className="content dashboard">
      <div className="dash-tabs">
        <button
          className={view === 'board' ? 'dash-tab dash-tab-active' : 'dash-tab'}
          onClick={() => setView('board')}
        >
          Stato mezzi
        </button>
        <button
          className={view === 'fines' ? 'dash-tab dash-tab-active' : 'dash-tab'}
          onClick={() => setView('fines')}
        >
          Sanzioni
        </button>
        {canAnagrafica && (
          <button
            className={view === 'admin' ? 'dash-tab dash-tab-active' : 'dash-tab'}
            onClick={() => setView('admin')}
          >
            Anagrafica & QR
          </button>
        )}
      </div>

      {view === 'admin' && canAnagrafica ? (
        <VehiclesAdmin admin={user} />
      ) : view === 'fines' ? (
        <VehicleFines user={user} permConfig={permConfig} />
      ) : (
        <VehiclesBoard user={user} />
      )}
    </main>
  )
}
