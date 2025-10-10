// @ts-nocheck
/**
 * orders-capture: captured PayPal-Order, schreibt Sale in DB.
 * Public (no JWT), CORS-enabled.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ENV – KEINE SUPABASE_* Namen!
const SB_URL = Deno.env.get("SB_URL")!;
const SB_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY")!;
const PAYPAL_API_BASE = Deno.env.get("PAYPAL_API_BASE") ?? "https://api-m.paypal.com";
const PAYPAL_CLIENT_ID = Deno.env.get("PAYPAL_CLIENT_ID")!;
const PAYPAL_CLIENT_SECRET = Deno.env.get("PAYPAL_CLIENT_SECRET")!;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
}

async function getPayPalAccessToken(): Promise<string> {
  const creds = btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`);
  const r = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!r.ok) throw new Error(`PayPal token error ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const { orderId, itemId } = await req.json();
    if (!orderId) return json(400, { ok: false, error: "orderId required" });

    const accessToken = await getPayPalAccessToken();

    // Capture
    const capRes = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${orderId}/capture`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    });
    const capJson = await capRes.json();
    if (!capRes.ok) return json(capRes.status, { ok: false, error: "PayPal capture failed", details: capJson });

    const amount = Number(capJson?.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value ?? "0");

    // Sale speichern
    const supabase = createClient(SB_URL, SB_SERVICE_ROLE_KEY);
    await supabase.from("sales").insert({
      item_id: itemId ?? null,   // wenn du es aus dem Client mitsendest
      amount: amount || 0,
      order_id: orderId,
    });

    return json(200, { ok: true, capture: capJson });
  } catch (e) {
    console.error("orders-capture error", e);
    return json(500, { ok: false, error: "Internal error", details: String(e) });
  }
});
