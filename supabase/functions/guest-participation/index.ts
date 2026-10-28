import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const origin = Deno.env.get('GUEST_SITE_ORIGIN') || 'https://goelorides.onrender.com';
const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store', 'Vary': 'Origin' };
function reply(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
async function hash(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
function token() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
}
function cleanText(value, limit) { return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, limit); }

Deno.serve(async request => {
  if (request.headers.get('origin') && request.headers.get('origin') !== origin) return reply({ ok: false, error: 'forbidden_origin' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return reply({ ok: false, error: 'method_not_allowed' }, 405);
  // Ne pas activer le formulaire public avant la migration et la configuration des e-mails.
  const mailKey = Deno.env.get('RESEND_API_KEY');
  const sender = Deno.env.get('GUEST_MAIL_FROM');
  const pepper = Deno.env.get('GUEST_RATE_LIMIT_SECRET');
  try {
    if (Number(request.headers.get('content-length')) > 4096) return reply({ ok: false, error: 'invalid_input' }, 400);
    const raw = await request.text();
    if (raw.length > 4096) return reply({ ok: false, error: 'invalid_input' }, 400);
    const body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return reply({ ok: false, error: 'invalid_input' }, 400);
    if ((body.action === 'request' && (!mailKey || !sender || !pepper)) ||
        (['request','confirm'].includes(body.action) && Deno.env.get('GUEST_PARTICIPATION_ENABLED') !== 'true')) return reply({ ok: false, error: 'not_ready' }, 503);
    const admin = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
    if (body.action === 'request') {
      const email = cleanText(body.email, 255).toLowerCase();
      const pseudo = cleanText(body.pseudo, 61);
      const route = cleanText(body.route_id, 150);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !pseudo || pseudo.length > 60 || !route || body.website) return reply({ ok: false, error: 'invalid_input' }, 400);
      // L’adresse IP ne sert qu’au quota. Elle n’est ni stockée en clair ni renvoyée.
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || request.headers.get('cf-connecting-ip') || 'unknown';
      const secret = token();
      const result = await admin.rpc('guest_signup_prepare', {
        p_route_id: route, p_email: email, p_pseudo: pseudo, p_token_hash: await hash(secret),
        p_email_hash: await hash(pepper + ':email:' + email), p_ip_hash: await hash(pepper + ':ip:' + ip),
        p_visitor_session_id: cleanText(body.visitor_session_id, 100) || null
      });
      if (result.error) return reply({ ok: false, error: 'server_error' }, 500);
      if (!result.data?.ok) return reply(result.data, result.data?.error === 'rate_limited' ? 429 : 400);
      const link = origin + '/participation-invite.html#token=' + secret;
      const sent = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { 'Authorization': 'Bearer ' + mailKey, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ from: sender, to: [email], subject: 'Ta participation à une sortie GoëloRides',
          text: 'Bonjour ' + pseudo + ',\n\nPour confirmer ta participation à « ' + cleanText(result.data.title, 200) + ' », ouvre ce lien puis appuie sur Confirmer :\n' + link + '\n\nLa confirmation est possible pendant 24 heures, selon les places disponibles. Aucune place n’est réservée avant confirmation.\nConserve ce même lien pour annuler ensuite. Aucun compte ni mot de passe n’est créé.\n\nSi tu n’es pas à l’origine de cette demande, ignore cet e-mail.' })
      });
      if (!sent.ok) return reply({ ok: false, error: 'mail_failed' }, 502);
      return reply({ ok: true, status: 'email_sent' });
    }
    if (!['status', 'confirm', 'cancel'].includes(body.action) || !/^[a-f0-9]{64}$/.test(body.token || '')) return reply({ ok: false, error: 'invalid_input' }, 400);
    const result = await admin.rpc('guest_signup_manage', { p_token_hash: await hash(body.token), p_action: body.action });
    if (result.error) return reply({ ok: false, error: 'server_error' }, 500);
    return reply(result.data, result.data?.ok ? 200 : 400);
  } catch (_) {
    // Ne pas journaliser l’adresse e-mail, le lien privé ni le contenu de la requête.
    return reply({ ok: false, error: 'request_failed' }, 500);
  }
});
