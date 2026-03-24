/**
 * Edge Function: notify-hot-alerts
 *
 * Called by match-opportunities after scoring. Sends immediate hot-alert
 * emails via Resend for every match that hit the member's hot_alert_threshold.
 *
 * Body: { match_ids: [{ member_id: string, opportunity_id: string }] }
 *
 * Env vars:
 *   RESEND_API_KEY
 *   FROM_EMAIL  (e.g. "Bid Assassin <alerts@quotefortune.com>")
 *   APP_URL     (e.g. "https://bidassassin.com")
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API = "https://api.resend.com/emails";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MatchRef {
  member_id: string;
  opportunity_id: string;
}

interface MemberRow {
  id: string;          // match id
  member_id: string;
  fit_score: number;
  score_breakdown: Record<string, number>;
  profile: {
    full_name: string | null;
    email: string | null;
  };
  notif_prefs: {
    email_enabled: boolean;
    hot_alert_threshold: number;
  } | null;
  opportunity: {
    id: string;
    source_id: string;
    title: string;
    department: string | null;
    office: string | null;
    response_deadline: string | null;
    naics_code: string | null;
    set_aside_description: string | null;
    place_of_performance: {
      city?: string | null;
      state?: string | null;
    } | null;
    contacts: Array<{
      type?: string;
      fullName?: string;
      email?: string;
      phone?: string;
    }> | null;
    solicitation_number: string | null;
  };
}

// ---------------------------------------------------------------------------
// HTML email builder
// ---------------------------------------------------------------------------

function buildHotAlertHtml(
  memberName: string,
  match: MemberRow,
  appUrl: string
): string {
  const opp = match.opportunity;
  const city = opp.place_of_performance?.city ?? "";
  const state = opp.place_of_performance?.state ?? "";
  const location = [city, state].filter(Boolean).join(", ") || "N/A";
  const deadline = opp.response_deadline
    ? new Date(opp.response_deadline).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "Not specified";
  const agency = [opp.department, opp.office].filter(Boolean).join(" / ") || "Federal Agency";
  const contact = opp.contacts?.find((c) => c.type === "primary") ?? opp.contacts?.[0];
  const samUrl = `https://sam.gov/opp/${opp.source_id}/view`;
  const dashboardUrl = `${appUrl}/opportunities`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:#DC2626;padding:20px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <span style="color:#fff;font-size:18px;font-weight:700;letter-spacing:-0.3px;">&#9678; Bid Assassin</span>
                </td>
                <td align="right">
                  <span style="background:rgba(255,255,255,0.2);color:#fff;padding:4px 12px;border-radius:20px;font-size:13px;font-weight:700;">${match.fit_score}% Match</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:28px;">

            <p style="margin:0 0 6px;font-size:14px;color:#6b7280;">Hot Alert for ${memberName}</p>
            <h1 style="margin:0 0 20px;font-size:20px;font-weight:700;color:#111827;line-height:1.3;">${opp.title}</h1>

            <!-- Details table -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
              <tr style="background:#f9fafb;">
                <td style="padding:10px 14px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;width:40%;border-bottom:1px solid #e5e7eb;">Agency</td>
                <td style="padding:10px 14px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb;">${agency}</td>
              </tr>
              <tr>
                <td style="padding:10px 14px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Location</td>
                <td style="padding:10px 14px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb;">${location}</td>
              </tr>
              <tr style="background:#f9fafb;">
                <td style="padding:10px 14px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Bid Deadline</td>
                <td style="padding:10px 14px;font-size:14px;color:#111827;font-weight:600;border-bottom:1px solid #e5e7eb;">${deadline}</td>
              </tr>
              ${opp.set_aside_description ? `
              <tr>
                <td style="padding:10px 14px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Set-Aside</td>
                <td style="padding:10px 14px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb;">${opp.set_aside_description}</td>
              </tr>` : ""}
              ${contact ? `
              <tr style="background:#f9fafb;">
                <td style="padding:10px 14px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Contact</td>
                <td style="padding:10px 14px;font-size:14px;color:#111827;">
                  ${contact.fullName ? `<strong>${contact.fullName}</strong><br>` : ""}
                  ${contact.email ? `<a href="mailto:${contact.email}" style="color:#DC2626;">${contact.email}</a>` : ""}
                  ${contact.phone ? `<br>${contact.phone}` : ""}
                </td>
              </tr>` : ""}
            </table>

            <!-- CTA buttons -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-right:8px;" width="50%">
                  <a href="${dashboardUrl}" style="display:block;background:#DC2626;color:#fff;text-align:center;padding:12px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;">View in Dashboard</a>
                </td>
                <td width="50%">
                  <a href="${samUrl}" style="display:block;background:#f9fafb;color:#374151;text-align:center;padding:12px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;border:1px solid #e5e7eb;">View on SAM.gov ↗</a>
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:16px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
              Bid Assassin · The Prospector &nbsp;|&nbsp;
              <a href="${appUrl}/settings" style="color:#9ca3af;">Manage Notifications</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Send via Resend
// ---------------------------------------------------------------------------

async function sendEmail(
  apiKey: string,
  from: string,
  to: string,
  subject: string,
  html: string
): Promise<boolean> {
  const res = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`Resend error ${res.status}:`, body);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.warn("RESEND_API_KEY not set — skipping email sends");
    return new Response(JSON.stringify({ skipped: true, reason: "no API key" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const from = Deno.env.get("FROM_EMAIL") ?? "Bid Assassin <alerts@quotefortune.com>";
  const appUrl = Deno.env.get("APP_URL") ?? "https://bidassassin.com";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let matchRefs: MatchRef[] = [];
  try {
    const body = await req.json();
    matchRefs = body?.match_ids ?? [];
  } catch {
    return new Response(JSON.stringify({ error: "Invalid body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (matchRefs.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Group by member_id for a single lookup
  const memberIds = [...new Set(matchRefs.map((m) => m.member_id))];
  const oppIds = [...new Set(matchRefs.map((m) => m.opportunity_id))];

  // Fetch profiles
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", memberIds);

  const profileMap = new Map((profiles ?? []).map((p: { id: string; full_name: string | null; email: string | null }) => [p.id, p]));

  // Fetch notification prefs
  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select("member_id, email_enabled, hot_alert_threshold")
    .in("member_id", memberIds);

  const prefsMap = new Map((prefs ?? []).map((p: { member_id: string; email_enabled: boolean; hot_alert_threshold: number }) => [p.member_id, p]));

  // Fetch opportunities
  const { data: opps } = await supabase
    .from("sam_opportunities")
    .select("id, source_id, title, department, office, response_deadline, naics_code, set_aside_description, place_of_performance, contacts, solicitation_number")
    .in("id", oppIds);

  const oppMap = new Map((opps ?? []).map((o: { id: string }) => [o.id, o]));

  // Fetch match records (for fit_score)
  const { data: matchRows } = await supabase
    .from("opportunity_matches")
    .select("id, member_id, opportunity_id, fit_score, score_breakdown, notified_at")
    .in("member_id", memberIds)
    .in("opportunity_id", oppIds);

  const matchMap = new Map(
    (matchRows ?? []).map((m: { member_id: string; opportunity_id: string }) => [`${m.member_id}:${m.opportunity_id}`, m])
  );

  let sent = 0;
  let skipped = 0;
  const notifiedMatchIds: string[] = [];

  for (const ref of matchRefs) {
    const profile = profileMap.get(ref.member_id);
    const pref = prefsMap.get(ref.member_id);
    const opp = oppMap.get(ref.opportunity_id);
    const matchRow = matchMap.get(`${ref.member_id}:${ref.opportunity_id}`);

    // Skip if already notified, no email, or email disabled
    if (!profile?.email) { skipped++; continue; }
    if (pref && !pref.email_enabled) { skipped++; continue; }
    if (matchRow?.notified_at) { skipped++; continue; }
    if (!opp) { skipped++; continue; }

    const memberName = profile.full_name || profile.email.split("@")[0];
    const location = [
      opp.place_of_performance?.city,
      opp.place_of_performance?.state,
    ].filter(Boolean).join(", ") || "federal";

    // Derive trade from naics_code for subject line (best-effort)
    const subject = `Hot Match ${matchRow?.fit_score ?? ""}% — ${opp.title.substring(0, 60)}${opp.title.length > 60 ? "…" : ""} (${location})`;

    const html = buildHotAlertHtml(memberName, {
      id: matchRow?.id ?? "",
      member_id: ref.member_id,
      fit_score: matchRow?.fit_score ?? 0,
      score_breakdown: matchRow?.score_breakdown ?? {},
      profile: { full_name: profile.full_name, email: profile.email },
      notif_prefs: pref ?? null,
      opportunity: opp as MemberRow["opportunity"],
    }, appUrl);

    const ok = await sendEmail(apiKey, from, profile.email, subject, html);

    if (ok) {
      sent++;
      if (matchRow?.id) notifiedMatchIds.push(matchRow.id);
    } else {
      skipped++;
    }
  }

  // Mark matches as notified
  if (notifiedMatchIds.length > 0) {
    await supabase
      .from("opportunity_matches")
      .update({
        notified_at: new Date().toISOString(),
        notification_channel: "email",
      })
      .in("id", notifiedMatchIds);
  }

  console.log(`notify-hot-alerts: sent=${sent}, skipped=${skipped}`);

  // Trigger web push (fire and forget)
  if (matchRefs.length > 0) {
    const pushUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-web-push`;
    fetch(pushUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ match_ids: matchRefs }),
    }).catch((e) => console.warn("Could not trigger send-web-push:", e));
  }

  return new Response(
    JSON.stringify({ success: true, sent, skipped }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
