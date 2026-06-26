import RequestsBoard from './RequestsBoard.jsx'

// Dashboard straordinari di manager e admin: vista e gestione delle richieste.
// (La gestione utenti, riservata all'admin, è ora un'area dedicata nell'hub.)
export default function Dashboard({ user, permConfig = null }) {
  return (
    <main className="content dashboard">
      <RequestsBoard user={user} permConfig={permConfig} />
    </main>
  )
}
