/**
 * Edge Function: send-daily-digest
 *
 * Runs on a daily cron. For each member with digest_enabled, fetches all
 * new matches from the past 24 hours not yet included in a digest, and
 * sends a single summary email via Resend.
 *
 * Invoke: POST /functions/v1/send-daily-digest
 *
 * Env vars:
 *   RESEND_API_KEY
 *   FROM_EMAIL   (e.g. "Bid Assassin <digest@quotefortune.com>")
 *   APP_URL      (e.g. "https://bidassassin.com")
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API = "https://api.resend.com/emails";

// ---------------------------------------------------------------------------
// HTML builder
// ---------------------------------------------------------------------------

interface DigestOpp {
  matchId: string;
  title: string;
  location: string;
  fitScore: number;
  deadline: string | null;
  agency: string;
  sourceId: string;
}

function buildDigestHtml(
  memberName: string,
  opps: DigestOpp[],
  appUrl: string
): string {
  const rows = opps
    .slice(0, 10)
    .map(
      (o, i) => `
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:12px 14px;font-size:13px;color:#111827;font-weight:600;">${i + 1}.</td>
        <td style="padding:12px 0;">
          <a href="https://sam.gov/opp/${o.sourceId}/view" style="font-size:14px;font-weight:600;color:#111827;text-decoration:none;display:block;margin-bottom:2px;">${o.title}</a>
          <span style="font-size:12px;color:#6b7280;">${o.agency} &nbsp;·&nbsp; ${o.location}${o.deadline ? ` &nbsp;·&nbsp; Due ${o.deadline}` : ""}</span>
        </td>
        <td style="padding:12px 14px;text-align:right;">
          <span style="background:${o.fitScore >= 80 ? "#fee2e2" : o.fitScore >= 60 ? "#fef3c7" : "#f1f5f9"};color:${o.fitScore >= 80 ? "#dc2626" : o.fitScore >= 60 ? "#d97706" : "#64748b"};padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;white-space:nowrap;">${o.fitScore}%</span>
        </td>
      </tr>`
    )
    .join("");

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
            <span style="color:#fff;font-size:18px;font-weight:700;">&#9678; Bid Assassin</span>
            <span style="display:block;color:rgba(255,255,255,0.85);font-size:13px;margin-top:2px;">Daily Opportunity Digest</span>
          </td>
        </tr>

        <!-- Greeting -->
        <tr>
          <td style="padding:24px 28px 16px;">
            <p style="margin:0;font-size:15px;color:#374151;">
              Hi ${memberName}, here are today's top federal contract matches for your profile:
            </p>
          </td>
        </tr>

        <!-- Opportunities table -->
        <tr>
          <td style="padding:0 28px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
              <tr style="background:#f9fafb;">
                <td colspan="3" style="padding:8px 14px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">#&nbsp;&nbsp;&nbsp;Opportunity</td>
              </tr>
              ${rows}
            </table>
            ${opps.length > 10 ? `<p style="font-size:12px;color:#9ca3af;margin:8px 0 0;text-align:right;">+${opps.length - 10} more in your dashboard</p>` : ""}
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td style="padding:24px 28px;">
            <a href="${appUrl}/opportunities" style="display:block;background:#DC2626;color:#fff;text-align:center;padding:14px;border-radius:8px;font-size:15px;font-weight:600;text-decoration:none;">View All in Dashboard →</a>
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
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.warn("RESEND_API_KEY not set — skipping digest sends");
    return new Response(JSON.stringify({ skipped: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const from = Deno.env.get("FROM_EMAIL") ?? "Bid Assassin <digest@quotefortune.com>";
  const appUrl = Deno.env.get("APP_URL") ?? "https://bidassassin.com";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Fetch all members with digest enabled
  const { data: prefsRows } = await supabase
    .from("notification_preferences")
    .select("member_id, email_enabled, digest_enabled")
    .eq("digest_enabled", true)
    .eq("email_enabled", true);

  if (!prefsRows || prefsRows.length === 0) {
    return new Response(JSON.stringify({ sent: 0, message: "No members with digest enabled" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const memberIds = prefsRows.map((p: { member_id: string }) => p.member_id);
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Fetch new matches in the last 24h not yet notified (or only hot-alert notified)
  const { data: matchRows } = await supabase
    .from("opportunity_matches")
    .select(`
      id, member_id, fit_score, status,
      opportunity:opportunities (
        id, source_id, title, department, office,
        response_deadline, place_of_performance
      )
    `)
    .in("member_id", memberIds)
    .gte("created_at", cutoff)
    .neq("status", "passed")
    .order("fit_score", { ascending: false });

  if (!matchRows || matchRows.length === 0) {
    return new Response(JSON.stringify({ sent: 0, message: "No new matches to digest" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Group matches by member
  const byMember = new Map<string, typeof matchRows>();
  for (const m of matchRows) {
    const existing = byMember.get(m.member_id) ?? [];
    existing.push(m);
    byMember.set(m.member_id, existing);
  }

  // Fetch profiles for all members
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", memberIds);

  const profileMap = new Map((profiles ?? []).map((p: { id: string; full_name: string | null; email: string | null }) => [p.id, p]));

  let sent = 0;
  let skipped = 0;
  const digestedMatchIds: string[] = [];

  for (const [memberId, matches] of byMember) {
    const profile = profileMap.get(memberId);
    if (!profile?.email) { skipped++; continue; }

    const memberName = profile.full_name || profile.email.split("@")[0];

    const digestOpps: DigestOpp[] = matches.map((m) => {
      const opp = m.opportunity as {
        id: string; source_id: string; title: string;
        department: string | null; office: string | null;
        response_deadline: string | null;
        place_of_performance: { city?: string; state?: string } | null;
      };
      const city = opp.place_of_performance?.city ?? "";
      const state = opp.place_of_performance?.state ?? "";
      return {
        matchId: m.id,
        title: opp.title,
        location: [city, state].filter(Boolean).join(", ") || "N/A",
        fitScore: m.fit_score,
        deadline: opp.response_deadline
          ? new Date(opp.response_deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })
          : null,
        agency: [opp.department, opp.office].filter(Boolean).join(" / ").substring(0, 50) || "Federal Agency",
        sourceId: opp.source_id,
      };
    });

    const subject = `${digestOpps.length} new opportunit${digestOpps.length === 1 ? "y" : "ies"} matched your profile today`;
    const html = buildDigestHtml(memberName, digestOpps, appUrl);

    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [profile.email], subject, html }),
    });

    if (res.ok) {
      sent++;
      digestedMatchIds.push(...matches.map((m) => m.id));
    } else {
      const body = await res.text();
      console.error(`Resend error for ${profile.email}:`, body);
      skipped++;
    }
  }

  // Mark digested matches
  if (digestedMatchIds.length > 0) {
    await supabase
      .from("opportunity_matches")
      .update({
        notified_at: new Date().toISOString(),
        notification_channel: "email_digest",
      })
      .in("id", digestedMatchIds)
      .is("notified_at", null); // don't overwrite hot-alert timestamps
  }

  console.log(`send-daily-digest: sent=${sent}, skipped=${skipped}`);

  return new Response(
    JSON.stringify({ success: true, sent, skipped, total_matches: digestedMatchIds.length }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
