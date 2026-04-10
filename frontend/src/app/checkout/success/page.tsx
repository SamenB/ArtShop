"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { getApiUrl, apiFetch } from "@/utils";

/**
 * Payment confirmation page shown after Monobank redirect.
 *
 * Flow:
 * 1. Reads `orderId` from the URL query parameters.
 * 2. Polls the backend `/payments/{orderId}/status` endpoint to determine
 *    the final payment outcome.
 * 3. Displays a success, pending, or failure message accordingly.
 *
 * Monobank redirects the buyer here regardless of payment outcome.
 * The actual payment status is confirmed via the backend (which receives
 * it from the Monobank webhook, verified by ECDSA signature).
 */

type PaymentStatus = "loading" | "paid" | "awaiting_payment" | "processing" | "failed" | "unknown";

export default function CheckoutSuccessPage() {
    return (
        <Suspense fallback={
            <div style={{
                minHeight: "100vh", display: "flex", alignItems: "center",
                justifyContent: "center", fontFamily: "var(--font-sans)",
            }}>
                <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>⏳</div>
                    <p style={{ color: "#888" }}>Loading order status...</p>
                </div>
            </div>
        }>
            <CheckoutSuccessContent />
        </Suspense>
    );
}

function CheckoutSuccessContent() {
    const searchParams = useSearchParams();
    const orderId = searchParams.get("orderId");
    const [status, setStatus] = useState<PaymentStatus>("loading");
    const [pollCount, setPollCount] = useState(0);

    useEffect(() => {
        if (!orderId) {
            setStatus("unknown");
            return;
        }

        let cancelled = false;

        const checkStatus = async () => {
            try {
                const res = await apiFetch(`${getApiUrl()}/payments/${orderId}/status`);
                if (!res.ok) {
                    setStatus("unknown");
                    return;
                }

                const data = await res.json();
                const ps = data.payment_status;

                if (ps === "paid") {
                    setStatus("paid");
                } else if (ps === "failed") {
                    setStatus("failed");
                } else if (ps === "processing" || ps === "hold") {
                    setStatus("processing");
                    // Continue polling — payment is still being processed.
                    if (!cancelled && pollCount < 30) {
                        setTimeout(() => setPollCount(c => c + 1), 3000);
                    }
                } else {
                    setStatus("awaiting_payment");
                    // Continue polling — webhook may not have arrived yet.
                    if (!cancelled && pollCount < 30) {
                        setTimeout(() => setPollCount(c => c + 1), 3000);
                    }
                }
            } catch {
                if (!cancelled) setStatus("unknown");
            }
        };

        checkStatus();
        return () => { cancelled = true; };
    }, [orderId, pollCount]);

    return (
        <div style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
            fontFamily: "var(--font-sans)",
        }}>
            <div style={{ maxWidth: "560px", textAlign: "center" }}>

                {/* Loading / Polling */}
                {(status === "loading" || status === "awaiting_payment") && (
                    <>
                        <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>⏳</div>
                        <h1 style={{
                            fontFamily: "var(--font-serif)",
                            fontSize: "2rem",
                            fontStyle: "italic",
                            marginBottom: "1rem",
                        }}>
                            Confirming Payment...
                        </h1>
                        <p style={{
                            color: "var(--color-muted)",
                            lineHeight: 1.7,
                            marginBottom: "2rem",
                        }}>
                            We&apos;re waiting for payment confirmation from the bank.
                            This usually takes a few seconds.
                        </p>
                        <div style={{
                            width: "40px", height: "40px",
                            border: "3px solid #e5e7eb",
                            borderTopColor: "#334C75",
                            borderRadius: "50%",
                            animation: "spin 1s linear infinite",
                            margin: "0 auto",
                        }} />
                        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    </>
                )}

                {/* Processing */}
                {status === "processing" && (
                    <>
                        <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🔄</div>
                        <h1 style={{
                            fontFamily: "var(--font-serif)",
                            fontSize: "2rem",
                            fontStyle: "italic",
                            marginBottom: "1rem",
                        }}>
                            Payment Processing
                        </h1>
                        <p style={{
                            color: "var(--color-muted)",
                            lineHeight: 1.7,
                            marginBottom: "2rem",
                        }}>
                            Your payment is being processed by the bank.
                            You will receive an email confirmation once it&apos;s complete.
                        </p>
                    </>
                )}

                {/* Success */}
                {status === "paid" && (
                    <>
                        <div style={{ fontSize: "3.5rem", marginBottom: "1rem" }}>🎉</div>
                        <h1 style={{
                            fontFamily: "var(--font-serif)",
                            fontSize: "2.5rem",
                            fontStyle: "italic",
                            marginBottom: "1rem",
                            color: "#166534",
                        }}>
                            Thank You!
                        </h1>
                        <p style={{
                            color: "var(--color-muted)",
                            lineHeight: 1.7,
                            marginBottom: "0.5rem",
                        }}>
                            Your payment has been confirmed successfully.
                        </p>
                        <p style={{
                            color: "var(--color-muted)",
                            lineHeight: 1.7,
                            marginBottom: "2rem",
                            fontSize: "0.9rem",
                        }}>
                            Order #{orderId} — A confirmation email is on its way.
                        </p>
                        <Link
                            href="/gallery"
                            style={{
                                display: "inline-block",
                                padding: "1rem 2.5rem",
                                backgroundColor: "#334C75",
                                color: "#fff",
                                textDecoration: "none",
                                borderRadius: "4px",
                                fontSize: "0.85rem",
                                fontWeight: 600,
                                textTransform: "uppercase",
                                letterSpacing: "0.1em",
                                transition: "opacity 0.2s",
                            }}
                        >
                            Continue Browsing
                        </Link>
                    </>
                )}

                {/* Failed */}
                {status === "failed" && (
                    <>
                        <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>❌</div>
                        <h1 style={{
                            fontFamily: "var(--font-serif)",
                            fontSize: "2rem",
                            fontStyle: "italic",
                            marginBottom: "1rem",
                            color: "#991B1B",
                        }}>
                            Payment Failed
                        </h1>
                        <p style={{
                            color: "var(--color-muted)",
                            lineHeight: 1.7,
                            marginBottom: "2rem",
                        }}>
                            Unfortunately, your payment could not be processed.
                            No charges have been made. Please try again or contact us for assistance.
                        </p>
                        <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
                            <Link
                                href="/checkout"
                                style={{
                                    padding: "1rem 2rem",
                                    backgroundColor: "#334C75",
                                    color: "#fff",
                                    textDecoration: "none",
                                    borderRadius: "4px",
                                    fontSize: "0.85rem",
                                    fontWeight: 600,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.1em",
                                }}
                            >
                                Try Again
                            </Link>
                            <Link
                                href="/contact"
                                style={{
                                    padding: "1rem 2rem",
                                    border: "1px solid #d1d5db",
                                    color: "#374151",
                                    textDecoration: "none",
                                    borderRadius: "4px",
                                    fontSize: "0.85rem",
                                    fontWeight: 600,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.1em",
                                }}
                            >
                                Contact Support
                            </Link>
                        </div>
                    </>
                )}

                {/* Unknown / No Order */}
                {status === "unknown" && (
                    <>
                        <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🤔</div>
                        <h1 style={{
                            fontFamily: "var(--font-serif)",
                            fontSize: "2rem",
                            fontStyle: "italic",
                            marginBottom: "1rem",
                        }}>
                            Order Not Found
                        </h1>
                        <p style={{
                            color: "var(--color-muted)",
                            lineHeight: 1.7,
                            marginBottom: "2rem",
                        }}>
                            We couldn&apos;t find information about this order.
                            If you believe this is an error, please contact our support team.
                        </p>
                        <Link
                            href="/gallery"
                            style={{
                                display: "inline-block",
                                padding: "1rem 2rem",
                                backgroundColor: "#334C75",
                                color: "#fff",
                                textDecoration: "none",
                                borderRadius: "4px",
                                fontSize: "0.85rem",
                                fontWeight: 600,
                                textTransform: "uppercase",
                                letterSpacing: "0.1em",
                            }}
                        >
                            Back to Gallery
                        </Link>
                    </>
                )}
            </div>
        </div>
    );
}
