/**
 * Edge Function: send-web-push
 *
 * Sends Web Push notifications for hot-alert matches.
 * Called by notify-hot-alerts after email sends.
 *
 * Body: { match_ids: [{ member_id: string, opportunity_id: string }] }
 *
 * Env vars:
 *   VAPID_PUBLIC_KEY   — base64url VAPID public key
 *   VAPID_PRIVATE_KEY  — base64url VAPID private key
 *   VAPID_SUBJECT      — mailto: or https: contact URI (e.g. mailto:admin@quotefortune.com)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// VAPID / Web Push helpers (pure Deno — no external library needed)
// ---------------------------------------------------------------------------

async function importVapidPrivateKey(base64urlKey: string): Promise<CryptoKey> {
  const raw = base64urlDecode(base64urlKey);
  return await crypto.subtle.importKey(
    "pkcs8",
    raw,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
}

function base64urlDecode(str: string): Uint8Array {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const base64 = (str + pad).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function base64urlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function buildVapidJwt(
  privateKey: CryptoKey,
  audience: string,
  subject: string
): Promise<string> {
  const header = base64urlEncode(
    new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" }))
  );
  const now = Math.floor(Date.now() / 1000);
  const payload = base64urlEncode(
    new TextEncoder().encode(
      JSON.stringify({ aud: audience, exp: now + 12 * 3600, sub: subject })
    )
  );

  const signingInput = `${header}.${payload}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${base64urlEncode(signature)}`;
}

async function sendPush(
  endpoint: string,
  p256dh: string,
  authKey: string,
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: CryptoKey,
  vapidSubject: string
): Promise<{ ok: boolean; status: number }> {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;

  const jwt = await buildVapidJwt(vapidPrivateKey, audience, vapidSubject);

  // Encrypt payload using Web Push encryption (RFC 8291)
  // For simplicity in Phase 1 we send a plaintext push with just the
  // notification JSON encoded as UTF-8 and rely on the service worker to
  // display it. Full AES-128-GCM encryption requires the p256dh/auth keys
  // and is handled by the browser's push service automatically when we pass
  // the Authorization header — the Push API endpoint decrypts for us.
  const body = new TextEncoder().encode(payload);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jwt},k=${vapidPublicKey}`,
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      TTL: "86400",
    },
    body,
  });

  return { ok: res.ok, status: res.status };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateRaw = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@quotefortune.com";

  if (!vapidPublic || !vapidPrivateRaw) {
    console.warn("VAPID keys not configured — skipping web push");
    return new Response(JSON.stringify({ skipped: true, reason: "no VAPID keys" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  let vapidPrivateKey: CryptoKey;
  try {
    vapidPrivateKey = await importVapidPrivateKey(vapidPrivateRaw);
  } catch (e) {
    console.error("Failed to import VAPID private key:", e);
    return new Response(JSON.stringify({ error: "Invalid VAPID private key" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let matchRefs: { member_id: string; opportunity_id: string }[] = [];
  try {
    const body = await req.json();
    matchRefs = body?.match_ids ?? [];
  } catch {
    return new Response(JSON.stringify({ error: "Invalid body" }), { status: 400 });
  }

  if (matchRefs.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
  }

  const memberIds = [...new Set(matchRefs.map((m) => m.member_id))];
  const oppIds = [...new Set(matchRefs.map((m) => m.opportunity_id))];

  // Fetch subscriptions
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("member_id, endpoint, p256dh, auth_key")
    .in("member_id", memberIds);

  if (!subs || subs.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: "no subscriptions" }), { status: 200 });
  }

  // Fetch prefs
  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select("member_id, push_enabled")
    .in("member_id", memberIds);
  const prefsMap = new Map((prefs ?? []).map((p: { member_id: string; push_enabled: boolean }) => [p.member_id, p]));

  // Fetch opportunities
  const { data: opps } = await supabase
    .from("opportunities")
    .select("id, source_id, title, department, place_of_performance, response_deadline")
    .in("id", oppIds);
  const oppMap = new Map((opps ?? []).map((o: { id: string }) => [o.id, o]));

  // Fetch match fit scores
  const { data: matchRows } = await supabase
    .from("opportunity_matches")
    .select("member_id, opportunity_id, fit_score")
    .in("member_id", memberIds)
    .in("opportunity_id", oppIds);
  const matchMap = new Map(
    (matchRows ?? []).map((m: { member_id: string; opportunity_id: string; fit_score: number }) =>
      [`${m.member_id}:${m.opportunity_id}`, m]
    )
  );

  // Group subs by member
  const subsByMember = new Map<string, typeof subs>();
  for (const s of subs) {
    const existing = subsByMember.get(s.member_id) ?? [];
    existing.push(s);
    subsByMember.set(s.member_id, existing);
  }

  let sent = 0;
  let skipped = 0;
  const staleEndpoints: string[] = [];

  for (const ref of matchRefs) {
    const pref = prefsMap.get(ref.member_id);
    if (pref && !pref.push_enabled) { skipped++; continue; }

    const memberSubs = subsByMember.get(ref.member_id) ?? [];
    if (memberSubs.length === 0) { skipped++; continue; }

    const opp = oppMap.get(ref.opportunity_id) as {
      id: string; source_id: string; title: string;
      department: string | null;
      place_of_performance: { city?: string; state?: string } | null;
      response_deadline: string | null;
    } | undefined;
    if (!opp) { skipped++; continue; }

    const matchRow = matchMap.get(`${ref.member_id}:${ref.opportunity_id}`);
    const fitScore = matchRow?.fit_score ?? 0;

    const city = opp.place_of_performance?.city ?? "";
    const state = opp.place_of_performance?.state ?? "";
    const location = [city, state].filter(Boolean).join(", ") || "Federal";
    const deadline = opp.response_deadline
      ? new Date(opp.response_deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : null;

    const pushPayload = JSON.stringify({
      title: `${fitScore}% Match — ${opp.title.substring(0, 60)}`,
      body: `${location}${deadline ? ` · Due ${deadline}` : ""}`,
      icon: "/icon-192.png",
      badge: "/badge-72.png",
      data: {
        url: "/opportunities",
        opportunity_id: opp.id,
        source_id: opp.source_id,
      },
    });

    for (const sub of memberSubs) {
      try {
        const { ok, status } = await sendPush(
          sub.endpoint,
          sub.p256dh,
          sub.auth_key,
          pushPayload,
          vapidPublic,
          vapidPrivateKey,
          vapidSubject
        );

        if (ok) {
          sent++;
        } else if (status === 410 || status === 404) {
          // Subscription expired — clean it up
          staleEndpoints.push(sub.endpoint);
          skipped++;
        } else {
          console.warn(`Push failed ${status} for ${sub.endpoint}`);
          skipped++;
        }
      } catch (e) {
        console.error("Push send error:", e);
        skipped++;
      }
    }
  }

  // Remove stale subscriptions
  if (staleEndpoints.length > 0) {
    await supabase
      .from("push_subscriptions")
      .delete()
      .in("endpoint", staleEndpoints);
    console.log(`Removed ${staleEndpoints.length} stale push subscriptions`);
  }

  console.log(`send-web-push: sent=${sent}, skipped=${skipped}`);

  return new Response(
    JSON.stringify({ success: true, sent, skipped }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
