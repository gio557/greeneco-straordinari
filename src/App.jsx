import { useEffect, useState } from 'react'
import { login } from './data/api.js'
import Welcome from './components/Welcome.jsx'
import Hub from './components/Hub.jsx'
import Login from './components/Login.jsx'
import Header from './components/Header.jsx'
import EmployeeHome from './components/EmployeeHome.jsx'
import Dashboard from './components/Dashboard.jsx'
import UsersAdmin from './components/UsersAdmin.jsx'
import VehicleHandover from './components/VehicleHandover.jsx'
import VehiclesDashboard from './components/VehiclesDashboard.jsx'
import ComingSoon from './components/ComingSoon.jsx'

const SESSION_KEY = 'straordinari_session'

export default function App() {
  const [user, setUser] = useState(null)
  const [authRole, setAuthRole] = useState(null)
  const [area, setArea] = useState(null)
  // Mezzo da prendere in carico arrivato via QR/deep-link (?vehicle=...).
  const [pendingVehicle, setPendingVehicle] = useState(null)
  const [ready, setReady] = useState(false)

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
  }

  function backToHub() {
    setArea(null)
  }

  if (!ready) return null

  // --- Non autenticato: scelta del tipo di accesso, poi login ---
  if (!user) {
    if (!authRole) return <Welcome onChoose={setAuthRole} />
    return <Login role={authRole} onLogin={handleLogin} onBack={() => setAuthRole(null)} />
  }

  // --- Presa in carico mezzo via QR (ha la precedenza, per qualsiasi ruolo) ---
  if (pendingVehicle) {
    return (
      <div className="app">
        <Header user={user} onLogout={handleLogout} onBack={() => setPendingVehicle(null)} />
        <VehicleHandover
          user={user}
          vehicleId={pendingVehicle}
          onBack={() => setPendingVehicle(null)}
        />
      </div>
    )
  }

  // --- Autenticato: hub delle aree, poi schermata in base all'area/ruolo ---
  if (!area) return <Hub onSelect={setArea} user={user} onLogout={handleLogout} />

  const isStaff = user.role === 'manager' || user.role === 'admin'

  if (area === 'straordinari') {
    return (
      <div className={isStaff ? 'app app-wide' : 'app'}>
        <Header user={user} onLogout={handleLogout} onBack={backToHub} />
        {isStaff ? <Dashboard user={user} /> : <EmployeeHome user={user} />}
      </div>
    )
  }

  if (area === 'utenti' && user.role === 'admin') {
    return (
      <div className="app app-wide">
        <Header user={user} onLogout={handleLogout} onBack={backToHub} />
        <main className="content dashboard">
          <UsersAdmin admin={user} />
        </main>
      </div>
    )
  }

  if (area === 'automezzi') {
    return (
      <div className={isStaff ? 'app app-wide' : 'app'}>
        <Header user={user} onLogout={handleLogout} onBack={backToHub} />
        {isStaff ? <VehiclesDashboard user={user} /> : <VehicleHandover user={user} onBack={backToHub} />}
      </div>
    )
  }

  // Altre aree: ancora in sviluppo.
  return <ComingSoon area={area} onBack={backToHub} />
}
