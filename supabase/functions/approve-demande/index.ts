import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type DemandeRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  level: string | null;
  status: string | null;
  auth_user_id: string | null;
  approved_at: string | null;
  approval_processed_at: string | null;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isJwtAdmin(user: { app_metadata?: Record<string, unknown> } | null) {
  if (!user?.app_metadata) return false;
  const v = user.app_metadata.goelo_admin;
  return v === true || v === "true" || v === "t" || v === "1";
}

async function findUserIdByEmail(
  admin: ReturnType<typeof createClient>,
  email: string,
): Promise<string | null> {
  let page = 1;
  const perPage = 200;
  const target = email.toLowerCase();

  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users ?? [];
    const found = users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (found?.id) return found.id;
    if (users.length < perPage) break;
    page += 1;
  }
  return null;
}

async function ensureAuthUser(
  admin: ReturnType<typeof createClient>,
  demande: DemandeRow,
): Promise<{ userId: string; created: boolean }> {
  const email = (demande.email ?? "").trim().toLowerCase();
  if (!email) throw new Error("demande_missing_email");

  if (demande.auth_user_id) {
    return { userId: demande.auth_user_id, created: false };
  }

  const existingId = await findUserIdByEmail(admin, email);
  if (existingId) {
    return { userId: existingId, created: false };
  }

  const firstName = (demande.first_name ?? "").trim();
  const lastName = (demande.last_name ?? "").trim();
  const displayName = [firstName, lastName].filter(Boolean).join(" ").trim();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      first_name: firstName || null,
      last_name: lastName || null,
      name: displayName || null,
      pseudo: firstName || null,
      cyclist_level: (demande.level ?? "vert").toLowerCase(),
    },
  });

  if (error) {
    const msg = (error.message ?? "").toLowerCase();
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
      const fallbackId = await findUserIdByEmail(admin, email);
      if (fallbackId) return { userId: fallbackId, created: false };
    }
    throw error;
  }

  if (!data.user?.id) throw new Error("auth_user_create_failed");
  return { userId: data.user.id, created: true };
}

async function upsertTeamRiderProfile(
  admin: ReturnType<typeof createClient>,
  userId: string,
  demande: DemandeRow,
) {
  const firstName = (demande.first_name ?? "").trim();
  const level = (demande.level ?? "vert").toLowerCase();

  const { error } = await admin.from("profiles").upsert(
    {
      id: userId,
      role: "team_rider",
      pseudo: firstName || null,
      cyclist_level: level,
    },
    { onConflict: "id" },
  );
  if (error) throw error;
}

async function sendAdminOneSignalNotification(demande: DemandeRow, userCreated: boolean) {
  const appId = Deno.env.get("ONESIGNAL_APP_ID") ?? "";
  const apiKey = Deno.env.get("ONESIGNAL_REST_API_KEY") ?? "";
  if (!appId || !apiKey) {
    console.warn("[approve-demande] OneSignal skipped: missing secrets");
    return { sent: false, reason: "onesignal_not_configured" };
  }

  const segment = (Deno.env.get("ONESIGNAL_ADMIN_SEGMENT") ?? "").trim();
  const body: Record<string, unknown> = {
    app_id: appId,
    headings: { en: "New user approval required" },
    contents: {
      en: "A new Goelo Rides user has been approved and needs account creation validation",
    },
    data: {
      type: "demande_approved",
      demande_id: demande.id,
      email: demande.email,
      level: demande.level,
      user_created: userCreated,
    },
  };

  if (segment) {
    body.included_segments = [segment];
  } else {
    body.filters = [
      { field: "tag", key: "role", relation: "=", value: "admin" },
    ];
  }

  const res = await fetch("https://onesignal.com/api/v1/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[approve-demande] OneSignal error:", res.status, text);
    throw new Error("onesignal_send_failed");
  }

  return { sent: true };
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
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  if (!supabaseUrl || !serviceKey || !anonKey) {
    return jsonResponse({ ok: false, error: "server_misconfigured" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ ok: false, error: "auth_required" }, 401);
  }

  let demandeId = "";
  try {
    const payload = await req.json();
    demandeId = String(payload?.demande_id ?? payload?.id ?? "").trim();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }

  if (!demandeId) {
    return jsonResponse({ ok: false, error: "demande_id_required" }, 400);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse({ ok: false, error: "auth_required" }, 401);
  }

  const caller = userData.user;
  let callerIsAdmin = isJwtAdmin(caller);

  if (!callerIsAdmin) {
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", caller.id)
      .maybeSingle();
    callerIsAdmin = profile?.role === "admin";
  }

  if (!callerIsAdmin) {
    return jsonResponse({ ok: false, error: "forbidden" }, 403);
  }

  const { data: demande, error: fetchError } = await admin
    .from("demandes")
    .select(
      "id, email, first_name, last_name, level, status, auth_user_id, approved_at, approval_processed_at",
    )
    .eq("id", demandeId)
    .maybeSingle();

  if (fetchError) {
    console.error("[approve-demande] fetch:", fetchError.message);
    return jsonResponse({ ok: false, error: fetchError.message }, 500);
  }
  if (!demande) {
    return jsonResponse({ ok: false, error: "demande_not_found" }, 404);
  }

  const row = demande as DemandeRow;

  if (row.approval_processed_at) {
    console.log("[approve-demande] idempotent skip", { demandeId, event: "already_processed" });
    return jsonResponse({
      ok: true,
      idempotent: true,
      status: "approved",
      auth_user_id: row.auth_user_id,
      user_created: false,
      notification_sent: false,
    });
  }

  if (row.status === "refused") {
    return jsonResponse({ ok: false, error: "demande_refused" }, 409);
  }

  const now = new Date().toISOString();
  let userCreated = false;
  let userId = row.auth_user_id;

  try {
    if (!userId) {
      const ensured = await ensureAuthUser(admin, row);
      userId = ensured.userId;
      userCreated = ensured.created;
      console.log("[approve-demande] auth user", {
        demandeId,
        userId,
        created: userCreated,
        event: userCreated ? "user_created" : "user_already_exists",
      });
    } else {
      console.log("[approve-demande] auth user", {
        demandeId,
        userId,
        event: "user_already_linked",
      });
    }

    await upsertTeamRiderProfile(admin, userId, row);

    const { data: updated, error: updateError } = await admin
      .from("demandes")
      .update({
        status: "approved",
        approved_at: row.approved_at ?? now,
        auth_user_id: userId,
      })
      .eq("id", demandeId)
      .neq("status", "refused")
      .select(
        "id, email, first_name, last_name, level, status, auth_user_id, approved_at, approval_processed_at",
      )
      .maybeSingle();

    if (updateError) throw updateError;
    if (!updated) throw new Error("demande_update_failed");

    const notifyResult = await sendAdminOneSignalNotification(updated as DemandeRow, userCreated);

    const { error: finalizeError } = await admin
      .from("demandes")
      .update({ approval_processed_at: now })
      .eq("id", demandeId)
      .is("approval_processed_at", null);

    if (finalizeError) throw finalizeError;

    console.log("[approve-demande] completed", {
      demandeId,
      userId,
      userCreated,
      notification_sent: notifyResult.sent,
      level: row.level,
    });

    return jsonResponse({
      ok: true,
      status: "approved",
      auth_user_id: userId,
      user_created: userCreated,
      notification_sent: notifyResult.sent,
      level: row.level,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[approve-demande] failed", { demandeId, message });
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
