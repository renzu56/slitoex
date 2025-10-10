// @ts-nocheck
/**
 * orders-create: erstellt eine PayPal-Order für ein Item.
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
    const supabase = createClient(SB_URL, SB_SERVICE_ROLE_KEY);
    const { itemId, buyerUserId } = await req.json();
    if (!itemId) return json(400, { error: "itemId required" });

    // Item holen (nur approved)
    const { data: item, error: itemErr } = await supabase
      .from("submissions")
      .select("*")
      .eq("id", itemId)
      .eq("approved", true)
      .single();
    if (itemErr || !item) return json(404, { error: "Item not found or not approved" });

    // Limited check
    if (item.limited && item.edition_quantity) {
      const { data: sales, error: salesErr } = await supabase
        .from("sales")
        .select("id")
        .eq("item_id", item.id);
      if (salesErr) return json(500, { error: "Failed to check inventory" });
      const remaining = Math.max(item.edition_quantity - (sales?.length ?? 0), 0);
      if (remaining <= 0) return json(409, { error: "Sold out" });
    }

    // PayPal Order erstellen
    const accessToken = await getPayPalAccessToken();
    const orderRes = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            description: item.name || item.style || "Corpus",
            amount: { currency_code: "EUR", value: Number(item.price).toFixed(2) },
          },
        ],
      }),
    });
    const orderJson = await orderRes.json();
    if (!orderRes.ok) return json(orderRes.status, { error: "PayPal create order failed", details: orderJson });

    // Optional: pending order in DB speichern
    // await supabase.from("orders").insert({ item_id: item.id, buyer_user_id: buyerUserId, provider_order_id: orderJson.id, status: "created" });

    return json(200, { id: orderJson.id });
  } catch (e) {
    console.error("orders-create error", e);
    return json(500, { error: "Internal error", details: String(e) });
  }
});
