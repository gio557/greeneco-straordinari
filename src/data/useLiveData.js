import { useEffect } from 'react'
import { subscribeToRequests } from './api.js'

// ---------------------------------------------------------------------------
// Hook per tenere una lista SEMPRE aggiornata, con tre meccanismi che si
// completano a vicenda:
//
//   1) Realtime (Supabase): quando arriva una modifica e la finestra è attiva,
//      la lista si aggiorna all'istante.
//   2) Rientro in primo piano: i browser — soprattutto sui telefoni —
//      "congelano" le schede in background, quindi un evento realtime può
//      arrivare in ritardo. Appena la finestra torna visibile/attiva
//      ricarichiamo subito, così non si vede mai un dato vecchio.
//   3) Polling leggero di sicurezza (solo a finestra visibile): se per qualche
//      motivo la connessione realtime cade, ogni 20 secondi ricontrolliamo.
//
// `refresh(showSpinner)` è la funzione di ricarica del componente; `deps` sono
// le dipendenze che, cambiando, fanno ripartire la sottoscrizione (es. l'utente
// che ha effettuato l'accesso).
// ---------------------------------------------------------------------------
export function useLiveData(refresh, deps = []) {
  useEffect(() => {
    let active = true

    const reload = () => {
      if (active && document.visibilityState === 'visible') refresh(false)
    }

    // Caricamento iniziale (con indicatore di attesa).
    refresh(true)

    // 1) Aggiornamenti realtime dal database centrale.
    const unsubscribe = subscribeToRequests(reload)

    // 2) Ricarica al ritorno in primo piano / a finestra di nuovo visibile.
    document.addEventListener('visibilitychange', reload)
    window.addEventListener('focus', reload)

    // 3) Rete di sicurezza: ricontrollo periodico finché la finestra è visibile.
    const interval = setInterval(reload, 20000)

    return () => {
      active = false
      unsubscribe()
      document.removeEventListener('visibilitychange', reload)
      window.removeEventListener('focus', reload)
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
