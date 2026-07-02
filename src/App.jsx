import { useEffect, useState } from 'react'
import { login, getFinesForEmployee, acknowledgeFine, getPermissionsConfig } from './data/api.js'
import { puo } from './permissions.js'
import Welcome from './components/Welcome.jsx'
import Hub from './components/Hub.jsx'
import Login from './components/Login.jsx'
import Header from './components/Header.jsx'
import EmployeeHome from './components/EmployeeHome.jsx'
import Dashboard from './components/Dashboard.jsx'
import UsersAdmin from './components/UsersAdmin.jsx'
import VehicleHandover from './components/VehicleHandover.jsx'
import VehiclesDashboard from './components/VehiclesDashboard.jsx'
import Timbrature from './components/Timbrature.jsx'
import TimbratureBoard from './components/TimbratureBoard.jsx'
import CassettoDipendente from './components/CassettoDipendente.jsx'
import PagheCassetti from './components/PagheCassetti.jsx'
import PermessiPage from './components/PermessiPage.jsx'
import ClientsAdmin from './components/ClientsAdmin.jsx'
import FineNoticeModal from './components/FineNoticeModal.jsx'
import RapportinoIntervento from './components/RapportinoIntervento.jsx'
import ComingSoon from './components/ComingSoon.jsx'

const SESSION_KEY = 'straordinari_session'

export default function App() {
  const [user, setUser] = useState(null)
  const [authRole, setAuthRole] = useState(null)
  const [area, setArea] = useState(null)
  // Mezzo da prendere in carico arrivato via QR/deep-link (?vehicle=...).
  const [pendingVehicle, setPendingVehicle] = useState(null)
  const [ready, setReady] = useState(false)
  // Sanzioni del dipendente (per notifica/badge/modale).
  const [fines, setFines] = useState([])
  const [fineModalSeen, setFineModalSeen] = useState(false)
  const [ackBusy, setAckBusy] = useState(false)
  const [cassettoSub, setCassettoSub] = useState(null) // sotto-sezione iniziale del cassetto
  // Configurazione categorie/permessi (decide la visibilità delle aree).
  const [permConfig, setPermConfig] = useState(null)

  useEffect(() => {
    // Deep-link da QR: ?vehicle=ID → avvia la presa in carico di quel mezzo.
    const params = new URLSearchParams(window.location.search)
    const v = params.get('vehicle')
    if (v) {
      setPendingVehicle(v)
      window.history.replaceState({}, '', window.location.pathname)
    }
    // Ripristina la sessione precedente (profilo, non la password).
    try {
      const saved = localStorage.getItem(SESSION_KEY)
      if (saved) setUser(JSON.parse(saved))
    } catch {
      localStorage.removeItem(SESSION_KEY)
    }
    setReady(true)
  }, [])

  // Carica la configurazione categorie/permessi (e la ricarica al login, perché
  // un amministratore può averla modificata da un altro dispositivo).
  useEffect(() => {
    getPermissionsConfig().then(setPermConfig).catch(() => {})
  }, [user])

  // Chi ha un proprio "cassetto" con le multe (flag multe.view_own) può ricevere
  // sanzioni: per loro carichiamo le multe (badge, banner e modale di avviso).
  const hasOwnFines = puo(user, 'multe.view_own', permConfig)

  useEffect(() => {
    if (hasOwnFines) {
      getFinesForEmployee(user.id).then(setFines).catch(() => {})
    } else {
      setFines([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, hasOwnFines])

  function reloadFines() {
    if (hasOwnFines) getFinesForEmployee(user.id).then(setFines).catch(() => {})
  }

  async function handleLogin(identifier, password) {
    const u = await login(identifier, password)
    localStorage.setItem(SESSION_KEY, JSON.stringify(u))
    setUser(u)
  }

  function handleLogout() {
    localStorage.removeItem(SESSION_KEY)
    setUser(null)
    setAuthRole(null)
    setArea(null)
    setPendingVehicle(null)
    setFines([])
    setFineModalSeen(false)
    setCassettoSub(null)
  }

  function backToHub() {
    setArea(null)
    setCassettoSub(null)
  }

  function openMulte() {
    setCassettoSub('multe')
    setArea('cassetto')
  }

  if (!ready) return null

  // --- Non autenticato: scelta del tipo di accesso, poi login ---
  if (!user) {
    if (!authRole) return <Welcome onChoose={setAuthRole} />
    return <Login role={authRole} onLogin={handleLogin} onBack={() => setAuthRole(null)} />
  }

  // Sanzioni non ancora prese in visione (per badge, banner e modale di avviso).
  const unackFines = fines.filter((f) => f.status === 'registered')
  const fineModal =
    hasOwnFines && unackFines.length > 0 && !fineModalSeen ? (
      <FineNoticeModal
        fines={unackFines}
        busy={ackBusy}
        onAcknowledgeAll={async () => {
          setAckBusy(true)
          for (const f of unackFines) {
            try { await acknowledgeFine(f.id, user.id) } catch { /* ignore */ }
          }
          reloadFines()
          setAckBusy(false)
          setFineModalSeen(true)
        }}
        onOpenDetails={() => { setFineModalSeen(true); openMulte() }}
        onClose={() => setFineModalSeen(true)}
      />
    ) : null

  // --- Presa in carico mezzo via QR (ha la precedenza, per qualsiasi ruolo) ---
  if (pendingVehicle) {
    return (
      <div className="app">
        <Header user={user} onLogout={handleLogout} onBack={() => setPendingVehicle(null)} finesCount={unackFines.length} />
        <VehicleHandover
          user={user}
          vehicleId={pendingVehicle}
          onBack={() => setPendingVehicle(null)}
        />
      </div>
    )
  }

  // --- Autenticato: hub delle aree, poi schermata in base all'area/ruolo ---
  if (!area)
    return (
      <>
        <Hub
          onSelect={setArea}
          user={user}
          onLogout={handleLogout}
          finesPending={unackFines.length}
          onOpenFines={openMulte}
          permConfig={permConfig}
        />
        {fineModal}
      </>
    )

  // Quale "faccia" di un'area mostrare è deciso dai permessi della categoria:
  // chi ha il flag *.board vede il cruscotto di gestione, gli altri la vista
  // personale. (Gli admin hanno sempre tutti i flag.) Finché la configurazione
  // non è stata caricata si ripiega sul vecchio comportamento per ruolo, così
  // non c'è "lampeggio" di una vista sbagliata.
  const staffFallback = user.role === 'manager' || user.role === 'admin'
  const seeBoard = (perm) => (permConfig ? puo(user, perm, permConfig) : staffFallback)
  const seeStraordinariBoard = seeBoard('straordinari.board')
  const seeAutomezziBoard = seeBoard('automezzi.board')
  const seeTimbratureBoard = seeBoard('timbrature.board')

  if (area === 'straordinari') {
    return (
      <div className={seeStraordinariBoard ? 'app app-wide' : 'app'}>
        <Header user={user} onLogout={handleLogout} onBack={backToHub} finesCount={unackFines.length} />
        {seeStraordinariBoard
          ? <Dashboard user={user} permConfig={permConfig} />
          : <EmployeeHome user={user} permConfig={permConfig} />}
      </div>
    )
  }

  if (area === 'utenti' && puo(user, 'area.utenti', permConfig)) {
    return (
      <div className="app app-wide">
        <Header user={user} onLogout={handleLogout} onBack={backToHub} finesCount={unackFines.length} />
        <main className="content dashboard">
          <UsersAdmin admin={user} />
        </main>
      </div>
    )
  }

  if (area === 'permessi' && puo(user, 'area.permessi', permConfig)) {
    return (
      <div className="app app-wide">
        <Header user={user} onLogout={handleLogout} onBack={backToHub} finesCount={unackFines.length} />
        <main className="content dashboard">
          <PermessiPage user={user} />
        </main>
      </div>
    )
  }

  if (area === 'clienti' && puo(user, 'clienti.manage', permConfig)) {
    return (
      <div className="app app-wide">
        <Header user={user} onLogout={handleLogout} onBack={backToHub} finesCount={unackFines.length} />
        <main className="content dashboard">
          <ClientsAdmin />
        </main>
      </div>
    )
  }

  if (area === 'automezzi') {
    return (
      <div className={seeAutomezziBoard ? 'app app-wide' : 'app'}>
        <Header user={user} onLogout={handleLogout} onBack={backToHub} finesCount={unackFines.length} />
        {seeAutomezziBoard
          ? <VehiclesDashboard user={user} permConfig={permConfig} />
          : <VehicleHandover user={user} onBack={backToHub} permConfig={permConfig} />}
      </div>
    )
  }

  if (area === 'timbrature') {
    return (
      <div className={seeTimbratureBoard ? 'app app-wide' : 'app'}>
        <Header user={user} onLogout={handleLogout} onBack={backToHub} finesCount={unackFines.length} />
        {seeTimbratureBoard
          ? <TimbratureBoard user={user} permConfig={permConfig} />
          : <Timbrature user={user} permConfig={permConfig} />}
      </div>
    )
  }

  if (area === 'rapportini') {
    return (
      <div className="app app-wide">
        <Header user={user} onLogout={handleLogout} onBack={backToHub} finesCount={unackFines.length} />
        <RapportinoIntervento user={user} />
      </div>
    )
  }

  if (area === 'cassetto') {
    return (
      <div className="app">
        <Header user={user} onLogout={handleLogout} onBack={backToHub} finesCount={unackFines.length} />
        <CassettoDipendente user={user} initialSub={cassettoSub} onChangeFines={reloadFines} permConfig={permConfig} />
      </div>
    )
  }

  if (area === 'cassetti-paghe' && puo(user, 'cassetti.manage', permConfig)) {
    return (
      <div className="app app-wide">
        <Header user={user} onLogout={handleLogout} onBack={backToHub} />
        <PagheCassetti user={user} permConfig={permConfig} />
      </div>
    )
  }

  // Altre aree: ancora in sviluppo.
  return <ComingSoon area={area} onBack={backToHub} />
}
