"use client";
import { useEffect, useRef, useState } from "react";
import { PAYPAL_CLIENT_ID } from "../lib/paypal";

export type PayPalResult = {
  orderId: string;
  captureId: string | null;
  amountCents: number;
  // true  → the server verified the capture with PayPal; safe to activate.
  // false → money moved client-side but the server isn't configured to verify;
  //         the payment is recorded as pending_verification and nothing activates.
  verified: boolean;
};

type VerifyResponse = {
  verified?: boolean;
  reason?: string;
  status?: string | null;
  amount_cents?: number | null;
  capture_id?: string | null;
};

type CaptureDetails = {
  purchase_units?: { payments?: { captures?: { id?: string }[] } }[];
};

type PayPalButtonsConfig = {
  style?: Record<string, string>;
  createOrder: (data: unknown, actions: { order: { create: (payload: unknown) => Promise<string> } }) => Promise<string>;
  onApprove: (data: { orderID: string }, actions: { order: { capture: () => Promise<CaptureDetails> } }) => Promise<void>;
  onError: (err: unknown) => void;
};

type PayPalNamespace = {
  Buttons: (config: PayPalButtonsConfig) => { render: (el: HTMLElement) => Promise<void>; close?: () => void };
};

declare global {
  interface Window {
    paypal?: PayPalNamespace;
  }
}

let sdkPromise: Promise<PayPalNamespace> | null = null;

function loadPayPalSdk(): Promise<PayPalNamespace> {
  if (window.paypal) return Promise.resolve(window.paypal);
  if (!sdkPromise) {
    sdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(PAYPAL_CLIENT_ID)}&currency=USD`;
      script.async = true;
      script.onload = () => (window.paypal ? resolve(window.paypal) : reject(new Error("PayPal SDK loaded without a namespace.")));
      script.onerror = () => reject(new Error("The PayPal SDK failed to load."));
      document.body.appendChild(script);
    });
  }
  return sdkPromise;
}

// Renders the PayPal Buttons for one fixed-purpose payment (a paid line entry
// or a top-up). Money goes straight to the host (payee) — pass-through, the
// platform takes no cut in the PayPal phase. The capture is always checked by
// /api/paypal/verify before onSuccess fires with verified=true.
export default function PayPalButton({
  amountCents,
  payeeEmail,
  description,
  onSuccess,
  onError,
}: {
  amountCents: number;
  payeeEmail: string;
  description: string;
  onSuccess: (result: PayPalResult) => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const amountRef = useRef(amountCents);
  const callbacksRef = useRef({ onSuccess, onError });
  const [sdkError, setSdkError] = useState("");

  useEffect(() => {
    amountRef.current = amountCents;
  }, [amountCents]);

  useEffect(() => {
    callbacksRef.current = { onSuccess, onError };
  }, [onSuccess, onError]);

  useEffect(() => {
    let cancelled = false;
    let buttons: { render: (el: HTMLElement) => Promise<void>; close?: () => void } | null = null;
    loadPayPalSdk()
      .then((paypal) => {
        if (cancelled || !containerRef.current) return;
        buttons = paypal.Buttons({
          style: { layout: "vertical", color: "gold", shape: "rect", label: "paypal" },
          createOrder: (_data, actions) =>
            actions.order.create({
              purchase_units: [
                {
                  amount: { value: (amountRef.current / 100).toFixed(2), currency_code: "USD" },
                  payee: { email_address: payeeEmail },
                  description,
                },
              ],
            }),
          onApprove: async (data, actions) => {
            try {
              const details = await actions.order.capture();
              const clientCaptureId = details?.purchase_units?.[0]?.payments?.captures?.[0]?.id ?? null;
              const res = await fetch("/api/paypal/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId: data.orderID }),
              });
              const verify = (await res.json().catch(() => ({}))) as VerifyResponse;
              if (verify.reason === "not_configured") {
                await callbacksRef.current.onSuccess({
                  orderId: data.orderID,
                  captureId: clientCaptureId,
                  amountCents: amountRef.current,
                  verified: false,
                });
                return;
              }
              if (!verify.verified || verify.status !== "COMPLETED" || verify.amount_cents == null) {
                callbacksRef.current.onError("PayPal couldn't verify that payment — nothing was activated. If money left your account, contact the platform with your PayPal receipt.");
                return;
              }
              if (verify.amount_cents !== amountRef.current) {
                callbacksRef.current.onError("The amount PayPal confirmed doesn't match the amount you chose — nothing was activated. Contact the platform with your PayPal receipt.");
                return;
              }
              await callbacksRef.current.onSuccess({
                orderId: data.orderID,
                captureId: verify.capture_id ?? clientCaptureId,
                amountCents: verify.amount_cents,
                verified: true,
              });
            } catch {
              callbacksRef.current.onError("Something went wrong finishing that payment — nothing was activated. Check PayPal before trying again.");
            }
          },
          onError: () => {
            callbacksRef.current.onError("PayPal reported an error — no payment was completed.");
          },
        });
        containerRef.current.innerHTML = "";
        return buttons.render(containerRef.current);
      })
      .catch(() => {
        if (!cancelled) setSdkError("PayPal couldn't load here — check your connection and reload the page.");
      });
    return () => {
      cancelled = true;
      buttons?.close?.();
    };
    // Buttons are configured once; the live amount is read from amountRef at click time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payeeEmail, description]);

  if (sdkError) return <div className="notice">{sdkError}</div>;
  return <div ref={containerRef} style={{ marginTop: 12, maxWidth: 420 }} />;
}
