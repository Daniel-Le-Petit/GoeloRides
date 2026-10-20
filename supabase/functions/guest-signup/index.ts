/**
 * GoëloRides — Inscription invité sans compte (Edge Function)
 *
 * Pourquoi une Edge Function ?
 * - L'IP lue via `current_setting('request.headers')` en RPC PostgREST
 *   dépend de X-Forwarded-For / proxies : un client peut tenter de spoof
 *   le premier hop. On ne fait donc JAMAIS confiance à une IP fournie
 *   dans le body JSON du navigateur.
 * - Ici l'IP est lue côté serveur (headers d'entrée de la plateforme),
 *   hashée (SHA-256), puis transmise à la RPC via service_role uniquement.
 * - Le parcours visiteur reste transparent (même formulaire, un POST).
 *
 * Auth navigateur : clé anon (pas de compte). Service role uniquement
 * dans l'environnement Edge (jamais exposé au client).
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

/** IP d'entrée plateforme — jamais lue depuis le body client. */
function extractRequestIp(req: Request): string | null {
  const cf = (req.headers.get("cf-connecting-ip") || "").trim();
  if (cf) return cf.slice(0, 64);

  const real = (req.headers.get("x-real-ip") || "").trim();
  if (real) return real.slice(0, 64);

  // Dernier hop non vide de XFF (souvent ajouté par le proxy de confiance).
  // On ne prend PAS le premier hop (spoofable par le client).
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

  // Ignorer toute tentative d'IP / hash fourni par le navigateur
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

  const ip = extractRequestIp(req);
  const edgeIpHash = ip ? await sha256Hex(ip) : null;

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.rpc("guest_self_register", {
    p_route_id: routeId,
    p_pseudo: pseudo,
    p_client_key: clientKey,
    p_hp: hp || null,
    p_edge_ip_hash: edgeIpHash,
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

  // Ne jamais renvoyer d'IP / hash / téléphone
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
