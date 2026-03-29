"use client";

import { useCart } from "@/context/CartContext";
import { usePreferences } from "@/context/PreferencesContext";
import Link from "next/link";
import { useEffect } from "react";

export default function CartDrawer() {
    const { items, isCartOpen, setIsCartOpen, removeItem, updateQuantity, cartTotal } = useCart();
    const { convertPrice } = usePreferences();

    // Lock body scroll when drawer is open
    useEffect(() => {
        if (isCartOpen) {
            document.body.style.overflow = "hidden";
            return () => { document.body.style.overflow = ""; };
        }
    }, [isCartOpen]);

    if (!isCartOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={() => setIsCartOpen(false)}
                style={{
                    position: "fixed", inset: 0,
                    backgroundColor: "rgba(26,26,24,0.4)",
                    backdropFilter: "blur(2px)",
                    zIndex: 1000,
                    animation: "fadeIn 0.3s ease",
                }}
            />

            {/* Drawer */}
            <div
                style={{
                    position: "fixed",
                    top: 0, right: 0, bottom: 0,
                    width: "min(400px, 90vw)",
                    backgroundColor: "#FAFAF8",
                    boxShadow: "-10px 0 40px rgba(0,0,0,0.1)",
                    zIndex: 1001,
                    display: "flex", flexDirection: "column",
                    animation: "slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
            >
                <div style={{
                    padding: "1.5rem",
                    borderBottom: "1px solid rgba(26,26,24,0.06)",
                    display: "flex", alignItems: "center", justifyContent: "space-between"
                }}>
                    <h2 style={{
                        fontFamily: "var(--font-sans)", fontSize: "0.85rem",
                        letterSpacing: "0.15em", textTransform: "uppercase", fontWeight: 500
                    }}>Bag</h2>
                    <button
                        onClick={() => setIsCartOpen(false)}
                        style={{
                            background: "none", border: "none", cursor: "pointer",
                            fontSize: "1.2rem", padding: "0.5rem"
                        }}
                    >
                        ✕
                    </button>
                </div>

                <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem" }}>
                    {items.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "3rem 0", color: "var(--color-muted)", fontFamily: "var(--font-sans)", fontSize: "0.9rem" }}>
                            Your bag is empty.
                        </div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                            {items.map((item) => (
                                <div key={item.id} style={{ display: "flex", gap: "1rem" }}>
                                    <div style={{
                                        width: "80px", height: "100px",
                                        background: `linear-gradient(135deg, ${item.imageGradientFrom}, ${item.imageGradientTo})`,
                                        flexShrink: 0
                                    }} />
                                    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                                            <Link
                                                href={`/gallery/${item.slug}`}
                                                onClick={() => setIsCartOpen(false)}
                                                style={{
                                                    fontFamily: "var(--font-serif)", fontSize: "1.1rem",
                                                    fontStyle: "italic", textDecoration: "none", color: "var(--color-charcoal)"
                                                }}
                                            >
                                                {item.title}
                                            </Link>
                                            <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.9rem", fontWeight: 500 }}>
                                                {convertPrice(item.price * item.quantity)}
                                            </span>
                                        </div>
                                        <div style={{ fontFamily: "var(--font-sans)", fontSize: "0.75rem", color: "var(--color-muted)", marginTop: "0.25rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                                            <span style={{ textTransform: "capitalize" }}>{item.type} {item.finish ? `— ${item.finish}` : ""}</span>
                                            {item.size && <span>Size: {item.size}</span>}
                                        </div>

                                        <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                            {item.type === "print" ? (
                                                <div style={{ display: "flex", alignItems: "center", border: "1px solid rgba(26,26,24,0.1)", borderRadius: "4px" }}>
                                                    <button onClick={() => updateQuantity(item.id, -1)} style={{ background: "none", border: "none", padding: "0.2rem 0.6rem", cursor: "pointer" }}>-</button>
                                                    <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.8rem", width: "1.5rem", textAlign: "center" }}>{item.quantity}</span>
                                                    <button onClick={() => updateQuantity(item.id, 1)} style={{ background: "none", border: "none", padding: "0.2rem 0.6rem", cursor: "pointer" }}>+</button>
                                                </div>
                                            ) : (
                                                <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.8rem", color: "var(--color-muted)" }}>Qty 1</span>
                                            )}
                                            <button
                                                onClick={() => removeItem(item.id)}
                                                style={{
                                                    background: "none", border: "none", fontFamily: "var(--font-sans)", fontSize: "0.7rem",
                                                    textDecoration: "underline", color: "var(--color-muted)", cursor: "pointer"
                                                }}
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {items.length > 0 && (
                    <div style={{ padding: "1.5rem", borderTop: "1px solid rgba(26,26,24,0.06)", backgroundColor: "#fff" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1.5rem", fontFamily: "var(--font-sans)", fontSize: "0.9rem" }}>
                            <span style={{ color: "var(--color-muted)" }}>Subtotal</span>
                            <span style={{ fontWeight: 600 }}>{convertPrice(cartTotal)}</span>
                        </div>
                        <p style={{ fontFamily: "var(--font-sans)", fontSize: "0.7rem", color: "var(--color-muted)", textAlign: "center", marginBottom: "1rem" }}>
                            Taxes and shipping calculated at checkout
                        </p>
                        <button
                            onClick={() => {
                                setIsCartOpen(false);
                                window.location.href = "/checkout";
                            }}
                            style={{
                                width: "100%", padding: "1rem", backgroundColor: "var(--color-charcoal)",
                                color: "var(--color-cream)", border: "none", fontFamily: "var(--font-sans)",
                                fontSize: "0.85rem", letterSpacing: "0.15em", textTransform: "uppercase",
                                cursor: "pointer", transition: "opacity 0.2s"
                            }}
                            onMouseEnter={e => e.currentTarget.style.opacity = "0.9"}
                            onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                        >
                            Checkout
                        </button>
                    </div>
                )}
            </div>

            <style>{`
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
            `}</style>
        </>
    );
}
