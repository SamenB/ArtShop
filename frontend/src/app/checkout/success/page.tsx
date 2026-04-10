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
            background: "linear-gradient(135deg, #fdfbfb 0%, #ebedee 100%)", // Very subtle luxury backdrop
        }}>
            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes fadeUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .luxury-btn {
                    display: inline-block;
                    padding: 1rem 3rem;
                    background: linear-gradient(135deg, #ff7e5f, #feb47b);
                    color: white;
                    text-decoration: none;
                    border-radius: 50px;
                    font-size: 0.85rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.15em;
                    box-shadow: 0 8px 20px rgba(255, 126, 95, 0.3);
                    transition: transform 0.3s ease, box-shadow 0.3s ease;
                    border: none;
                    cursor: pointer;
                }
                .luxury-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 12px 25px rgba(255, 126, 95, 0.5);
                }
                .outline-btn {
                    display: inline-block;
                    padding: 1rem 3rem;
                    background: transparent;
                    color: #333;
                    text-decoration: none;
                    border-radius: 50px;
                    border: 1px solid rgba(0,0,0,0.1);
                    font-size: 0.85rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.15em;
                    transition: all 0.3s ease;
                }
                .outline-btn:hover {
                    border-color: rgba(0,0,0,0.3);
                    background: rgba(0,0,0,0.02);
                }
            `}</style>

            <div style={{
                maxWidth: "520px",
                width: "100%",
                background: "rgba(255, 255, 255, 0.8)",
                backdropFilter: "blur(20px)",
                border: "1px solid rgba(255, 255, 255, 0.5)",
                boxShadow: "0 20px 40px rgba(0,0,0,0.04)",
                borderRadius: "24px",
                padding: "4rem 2rem",
                textAlign: "center",
                animation: "fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
            }}>

                {/* Loading / Polling */}
                {(status === "loading" || status === "awaiting_payment") && (
                    <>
                        <div style={{
                            width: "60px", height: "60px",
                            border: "2px solid rgba(0,0,0,0.05)",
                            borderTopColor: "#ff7e5f",
                            borderRadius: "50%",
                            animation: "spin 1s linear infinite",
                            margin: "0 auto 2.5rem auto",
                        }} />
                        <h1 style={{
                            fontFamily: "var(--font-serif)",
                            fontSize: "2.2rem",
                            fontWeight: 400,
                            letterSpacing: "-0.02em",
                            marginBottom: "1rem",
                            color: "#111",
                        }}>
                            Confirming Payment
                        </h1>
                        <p style={{
                            color: "#666",
                            lineHeight: 1.8,
                            fontSize: "0.95rem",
                            maxWidth: "80%",
                            margin: "0 auto",
                        }}>
                            Securely connecting to the bank. This usually takes just a moment.
                        </p>
                    </>
                )}

                {/* Processing */}
                {status === "processing" && (
                    <>
                        <div style={{
                            width: "60px", height: "60px",
                            border: "2px solid rgba(0,0,0,0.05)",
                            borderTopColor: "#334C75",
                            borderRadius: "50%",
                            animation: "spin 1s linear infinite",
                            margin: "0 auto 2.5rem auto",
                        }} />
                        <h1 style={{
                            fontFamily: "var(--font-serif)",
                            fontSize: "2.2rem",
                            fontWeight: 400,
                            letterSpacing: "-0.02em",
                            marginBottom: "1rem",
                            color: "#111",
                        }}>
                            Processing
                        </h1>
                        <p style={{
                            color: "#666",
                            lineHeight: 1.8,
                            fontSize: "0.95rem",
                            maxWidth: "80%",
                            margin: "0 auto",
                        }}>
                            Your payment is being processed. You will receive an email confirmation shortly.
                        </p>
                    </>
                )}

                {/* Success */}
                {status === "paid" && (
                    <>
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="url(#successGradient)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 2rem auto", display: "block" }}>
                            <defs>
                                <linearGradient id="successGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#ff7e5f" />
                                    <stop offset="100%" stopColor="#feb47b" />
                                </linearGradient>
                            </defs>
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                            <polyline points="22 4 12 14.01 9 11.01"></polyline>
                        </svg>
                        <h1 style={{
                            fontFamily: "var(--font-serif)",
                            fontSize: "2.5rem",
                            fontWeight: 400,
                            letterSpacing: "-0.02em",
                            marginBottom: "1rem",
                            color: "#111",
                        }}>
                            Order Confirmed
                        </h1>
                        <p style={{
                            color: "#666",
                            lineHeight: 1.8,
                            fontSize: "1rem",
                            marginBottom: "0.5rem",
                        }}>
                            Thank you for your purchase.
                        </p>
                        <p style={{
                            color: "#888",
                            lineHeight: 1.8,
                            marginBottom: "2.5rem",
                            fontSize: "0.85rem",
                            letterSpacing: "0.02em",
                        }}>
                            Order #{orderId} — A confirmation email is on its way.
                        </p>
                        <Link href="/gallery" className="luxury-btn">
                            Return to Gallery
                        </Link>
                    </>
                )}

                {/* Failed */}
                {status === "failed" && (
                    <>
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#E53E3E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 2rem auto", display: "block" }}>
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="15" y1="9" x2="9" y2="15"></line>
                            <line x1="9" y1="9" x2="15" y2="15"></line>
                        </svg>
                        <h1 style={{
                            fontFamily: "var(--font-serif)",
                            fontSize: "2.5rem",
                            fontWeight: 400,
                            letterSpacing: "-0.02em",
                            marginBottom: "1rem",
                            color: "#111",
                        }}>
                            Payment Failed
                        </h1>
                        <p style={{
                            color: "#666",
                            lineHeight: 1.8,
                            fontSize: "0.95rem",
                            marginBottom: "2.5rem",
                            maxWidth: "90%",
                            margin: "0 auto",
                        }}>
                            Unfortunately, the transaction could not be completed. No charges have been made.
                        </p>
                        <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap", marginTop: "2rem" }}>
                            <Link href="/checkout" className="luxury-btn">
                                Try Again
                            </Link>
                            <Link href="/contact" className="outline-btn">
                                Contact Us
                            </Link>
                        </div>
                    </>
                )}

                {/* Unknown / No Order */}
                {status === "unknown" && (
                    <>
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 2rem auto", display: "block" }}>
                            <circle cx="12" cy="12" r="10"></circle>
                            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                            <line x1="12" y1="17" x2="12.01" y2="17"></line>
                        </svg>
                        <h1 style={{
                            fontFamily: "var(--font-serif)",
                            fontSize: "2.2rem",
                            fontWeight: 400,
                            letterSpacing: "-0.02em",
                            marginBottom: "1rem",
                            color: "#111",
                        }}>
                            Status Unavailable
                        </h1>
                        <p style={{
                            color: "#666",
                            lineHeight: 1.8,
                            fontSize: "0.95rem",
                            marginBottom: "2.5rem",
                        }}>
                            We couldn&apos;t retrieve the status of your order at this time.
                            If you made a payment, please check your email.
                        </p>
                        <Link href="/gallery" className="outline-btn">
                            Back to Gallery
                        </Link>
                    </>
                )}
            </div>
        </div>
    );
}
