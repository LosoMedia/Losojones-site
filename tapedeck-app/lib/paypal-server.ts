// Server-only PayPal helpers (client id/secret come from server env, never NEXT_PUBLIC_*).
// Returns null when the platform's PayPal app is not configured — callers treat
// that as "feature dark", not as an error.

export type PayPalConfig = { base: string; accessToken: string };

export function paypalConfigured(): boolean {
  return !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

export async function paypalAccess(): Promise<PayPalConfig | null> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) return null;
  const base =
    process.env.PAYPAL_ENV === "sandbox"
      ? "https://api-m.sandbox.paypal.com"
      : "https://api-m.paypal.com";
  const auth = Buffer.from(`${clientId}:${secret}`).toString("base64");
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) return null;
  return { base, accessToken: json.access_token };
}
