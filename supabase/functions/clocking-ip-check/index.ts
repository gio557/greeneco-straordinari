// ---------------------------------------------------------------------------
// Edge Function (Supabase) — Cross-check posizione GPS ↔ IP (Anti-frode Liv. 3)
//
// Riceve { id, lat, lng } di una timbratura appena registrata, ricava l'IP del
// chiamante, lo geolocalizza (approssimativamente, a livello di città/paese) e
// calcola la distanza dalla posizione GPS dichiarata. Se la distanza supera la
// soglia, marca la timbratura come `ip_mismatch = true` (es. GPS in una città,
// IP in un'altra: possibile GPS finto/VPN).
//
// È una verifica COARSE e con implicazioni privacy: va attivata solo dopo
// valutazione col Consulente (controllo a distanza, art. 4 L. 300/1970 + GDPR).
//
// Deploy:   supabase functions deploy clocking-ip-check
// Richiede: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (forniti dal runtime).
// Attivazione lato app: VITE_IP_CHECK_ENABLED=true (vedi .env.example).
// ---------------------------------------------------------------------------

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Oltre questa distanza tra GPS e posizione dell'IP, si segnala il disallineamento.
const MISMATCH_KM = 150

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { id, lat, lng } = await req.json()
    if (!id || typeof lat !== 'number' || typeof lng !== 'number') {
      return new Response(JSON.stringify({ ok: false, reason: 'bad-input' }), {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    // IP del chiamante (primo della lista x-forwarded-for).
    const fwd = req.headers.get('x-forwarded-for') || ''
    const ip = fwd.split(',')[0].trim()

    // Geolocalizzazione IP (approssimata). Servizio gratuito con HTTPS.
    let ipInfo: { latitude?: number; longitude?: number; country?: string } = {}
    try {
      const r = await fetch(`https://ipapi.co/${ip}/json/`)
      if (r.ok) ipInfo = await r.json()
    } catch {
      /* geolocalizzazione non disponibile: si esce senza marcare */
    }

    let ip_country: string | null = ipInfo.country ?? null
    let ip_distance_km: number | null = null
    let ip_mismatch: boolean | null = null
    if (typeof ipInfo.latitude === 'number' && typeof ipInfo.longitude === 'number') {
      ip_distance_km = Math.round(haversineKm(lat, lng, ipInfo.latitude, ipInfo.longitude))
      ip_mismatch = ip_distance_km > MISMATCH_KM
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    await supabase
      .from('time_clockings')
      .update({ ip_country, ip_distance_km, ip_mismatch })
      .eq('id', id)

    return new Response(JSON.stringify({ ok: true, ip_country, ip_distance_km, ip_mismatch }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, reason: String(e) }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
