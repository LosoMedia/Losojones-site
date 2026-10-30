// Client-side PayPal config. The JS SDK client id is a public identifier, so it
// ships as NEXT_PUBLIC_PAYPAL_CLIENT_ID. When it's unset the paid segment is
// feature-dark: no SDK load, no buttons, no way to create a paid entry.
export const PAYPAL_CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? "";

export function paidEntriesConfigured(): boolean {
  return PAYPAL_CLIENT_ID.length > 0;
}
