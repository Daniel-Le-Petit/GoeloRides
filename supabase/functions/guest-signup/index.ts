/**
 * GoëloRides — Inscription invité (Edge Function — seule entrée publique)
 *
 * Fiabilité IP (Supabase managed Edge) :
 * - Aucun header (CF-Connecting-IP, X-Real-IP, X-Forwarded-For) n'est
 *   documenté comme « sanitizé / non spoofable » par Supabase pour les
 *   Edge Functions. On ne les traite donc PAS comme preuve d'identité.
 * - Protection principale : tickets one-shot en base (client_key + route),
 *   émis et consommés uniquement via service_role.
 * - IP éventuelle : télémétrie soft uniquement (ip_trusted=false).
 *
 * Le navigateur n'appelle JAMAIS guest_self_register directement.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Lit une IP candidate pour télémétrie uniquement.
 * Ne jamais marquer ip_trusted=true tant que Supabase ne documente pas
 * un header d'ingress garanti.
 */
function extractSoftIp(req: Request): string | null {
  const cf = (req.headers.get("cf-connecting-ip") || "").trim();
  if (cf) return cf.slice(0, 64);
  const real = (req.headers.get("x-real-ip") || "").trim();
  if (real) return real.slice(0, 64);
  const xff = (req.headers.get("x-forwarded-for") || "").trim();
  if (xff) {
    const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1].slice(0, 64);
  }
  return null;
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function normalizePseudo(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .slice(0, 40);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    console.error("[guest-signup] missing env");
    return jsonResponse({ ok: false, error: "server_misconfigured" }, 500);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }

  // Ignorer IP / hash / ticket fournis par le navigateur
  const routeId = String(body.route_id ?? body.p_route_id ?? "").trim();
  const pseudo = normalizePseudo(body.pseudo ?? body.p_pseudo);
  const clientKey = String(body.client_key ?? body.p_client_key ?? "").trim();
  const hp = String(body.hp ?? body.p_hp ?? "");

  if (!routeId) return jsonResponse({ ok: false, error: "invalid_route" }, 400);
  if (pseudo.length < 2) {
    return jsonResponse({ ok: false, error: "pseudo_too_short" }, 400);
  }
  if (clientKey.length < 8 || clientKey.length > 128) {
    return jsonResponse({ ok: false, error: "client_key_required" }, 400);
  }

  // Soft IP only — jamais trusted (pas de garantie infra documentée)
  const softIp = extractSoftIp(req);
  const softIpHash = softIp ? await sha256Hex(softIp) : null;

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) Ticket one-shot (anti-abus sans IP fiable)
  const ticketRes = await admin.rpc("guest_signup_ticket_issue", {
    p_client_key: clientKey,
    p_route_id: routeId,
    p_ip_hash: softIpHash,
    p_ip_trusted: false,
  });

  if (ticketRes.error) {
    console.warn("[guest-signup] ticket:", ticketRes.error.message);
    return jsonResponse({ ok: false, error: ticketRes.error.message || "ticket_failed" }, 400);
  }

  const ticket = (ticketRes.data || {}) as Record<string, unknown>;
  if (ticket.ok === false) {
    return jsonResponse({ ok: false, error: ticket.error || "rate_limited" }, 200);
  }

  const ticketId = ticket.ticket_id;
  if (!ticketId) {
    return jsonResponse({ ok: false, error: "ticket_failed" }, 500);
  }

  // 2) Inscription via service_role + ticket (RPC inaccessible à anon)
  const { data, error } = await admin.rpc("guest_self_register", {
    p_route_id: routeId,
    p_pseudo: pseudo,
    p_client_key: clientKey,
    p_hp: hp || null,
    p_edge_ip_hash: null,
    p_ticket_id: ticketId,
  });

  if (error) {
    console.warn("[guest-signup] rpc:", error.message);
    return jsonResponse({ ok: false, error: error.message || "rpc_error" }, 400);
  }

  const payload = (data && typeof data === "object" ? data : {}) as Record<
    string,
    unknown
  >;

  if (payload.ok === false) {
    return jsonResponse(payload, 200);
  }

  return jsonResponse({
    ok: true,
    waitlist: !!payload.waitlist,
    manage_token: payload.manage_token ?? null,
    confirmed_count: payload.confirmed_count ?? payload.count ?? null,
    waitlist_count: payload.waitlist_count ?? null,
    count: payload.confirmed_count ?? payload.count ?? null,
    participant: payload.participant ?? null,
    honeypot: !!payload.honeypot,
    via: "edge",
  });
});
