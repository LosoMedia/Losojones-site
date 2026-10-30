import { NextRequest, NextResponse } from "next/server";
import { paypalAccess } from "../../../../lib/paypal-server";

// POST { orderId } — asks PayPal (server to server) whether this order was
// really captured, for how much, and to whom. The client never gets to claim
// an amount on its own word.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { orderId?: string } | null;
  const orderId = body?.orderId;
  if (!orderId) {
    return NextResponse.json({ verified: false, reason: "missing_order_id" }, { status: 400 });
  }

  const config = await paypalAccess();
  if (!config) {
    return NextResponse.json({ verified: false, reason: "not_configured" });
  }

  const res = await fetch(`${config.base}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${config.accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    return NextResponse.json({ verified: false, reason: "order_not_found", status: null });
  }

  const order = (await res.json()) as {
    status?: string;
    purchase_units?: {
      amount?: { value?: string };
      payee?: { email_address?: string };
      payments?: { captures?: { id?: string; status?: string }[] };
    }[];
  };
  const unit = order.purchase_units?.[0];
  const capture = unit?.payments?.captures?.[0];
  const amountCents = unit?.amount?.value ? Math.round(parseFloat(unit.amount.value) * 100) : null;
  const verified = order.status === "COMPLETED" && capture?.status === "COMPLETED" && amountCents != null;

  return NextResponse.json({
    verified,
    status: order.status ?? null,
    amount_cents: amountCents,
    capture_id: capture?.id ?? null,
    payee_email: unit?.payee?.email_address ?? null,
  });
}
