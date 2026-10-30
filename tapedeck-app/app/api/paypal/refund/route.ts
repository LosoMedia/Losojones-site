import { NextRequest, NextResponse } from "next/server";
import { paypalAccess } from "../../../../lib/paypal-server";

// POST { captureId } — refunds a captured PayPal payment in full (14-day
// no-show protection). When the platform's PayPal app isn't configured the
// caller records a manual refund request instead.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { captureId?: string } | null;
  const captureId = body?.captureId;
  if (!captureId) {
    return NextResponse.json({ refunded: false, reason: "missing_capture_id" }, { status: 400 });
  }

  const config = await paypalAccess();
  if (!config) {
    return NextResponse.json({ refunded: false, reason: "not_configured" });
  }

  const res = await fetch(`${config.base}/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json" },
    body: "{}",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { id?: string; status?: string };
  return NextResponse.json({
    refunded: res.ok && json.status === "COMPLETED",
    status: json.status ?? null,
    refund_id: json.id ?? null,
  });
}
