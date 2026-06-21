import { useEffect, useState } from 'react'
import { login } from './data/api.js'
import Welcome from './components/Welcome.jsx'
import Hub from './components/Hub.jsx'
import Login from './components/Login.jsx'
import Header from './components/Header.jsx'
import EmployeeHome from './components/EmployeeHome.jsx'
import Dashboard from './components/Dashboard.jsx'
import ComingSoon from './components/ComingSoon.jsx'

const SESSION_KEY = 'straordinari_session'

export default function App() {
  const [user, setUser] = useState(null)
  // Percorso di accesso scelto nella schermata iniziale (null = mostra i due
  // pulsanti; 'staff' | 'employee' = mostra il form di login).
  const [authRole, setAuthRole] = useState(null)
  // Area selezionata nell'hub (null = mostra l'hub).
  const [area, setArea] = useState(null)
  const [ready, setReady] = useState(false)

  // Ripristina la sessione precedente all'avvio (salviamo il profilo, non la
  // password, così non serve un nuovo accesso a ogni ricarica).
  useEffect(() => {
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
  }

  function backToHub() {
    setArea(null)
  }

  if (!ready) return null

  // --- Non autenticato: scelta del tipo di accesso, poi login ---
  if (!user) {
    if (!authRole) return <Welcome onChoose={setAuthRole} />
    return (
      <Login
        role={authRole}
        onLogin={handleLogin}
        onBack={() => setAuthRole(null)}
      />
    )
  }

  // --- Autenticato: hub delle aree, poi schermata in base al ruolo ---
  if (!area) return <Hub onSelect={setArea} user={user} onLogout={handleLogout} />

  if (area === 'straordinari') {
    const isStaff = user.role === 'manager' || user.role === 'admin'
    return (
      <div className={isStaff ? 'app app-wide' : 'app'}>
        <Header user={user} onLogout={handleLogout} onBack={backToHub} />
        {isStaff ? <Dashboard user={user} /> : <EmployeeHome user={user} />}
      </div>
    )
  }

  // Altre aree: ancora in sviluppo.
  return <ComingSoon area={area} onBack={backToHub} />
}
