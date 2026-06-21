// Schermata iniziale quando NON si è ancora effettuato l'accesso: due grandi
// pulsanti che indirizzano il tipo di accesso (staff o dipendente). La scelta
// porta al form di login; il ruolo effettivo è poi determinato dalle credenziali.
export default function Welcome({ onChoose }) {
  return (
    <div className="login role-gate">
      <div className="login-brand">
        <img className="login-logo" src="./greeneco-logo.jpeg" alt="greeneco wastewater" />
        <h1>Operations</h1>
        <p>Come vuoi accedere?</p>
      </div>

      <div className="role-buttons">
        <button className="role-btn role-btn-staff" onClick={() => onChoose('staff')}>
          <span className="role-btn-title">Accedi come manager / amministratore</span>
          <span className="role-btn-sub">Dashboard, approvazioni e gestione utenti</span>
        </button>

        <button className="role-btn role-btn-employee" onClick={() => onChoose('employee')}>
          <span className="role-btn-title">Accedi come dipendente</span>
          <span className="role-btn-sub">Invia e consulta le tue richieste</span>
        </button>
      </div>
    </div>
  )
}
