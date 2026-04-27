"use client";

import React from "react";
import Link from "next/link";
import { CartItem } from "@/context/CartContext";

export function OrderSummary({
    items,
    promoApplied,
    discountAmount,
    cartTotal,
    currentTotal,
    convertPrice,
}: {
    items: CartItem[];
    promoApplied: boolean;
    discountAmount: number;
    cartTotal: number;
    currentTotal: number;
    convertPrice: (price: number) => string;
}) {
    return (
        <div className="checkout-summary" style={{ position: "relative" }}>
            <div style={{
                position: "sticky",
                top: "2rem",
                display: "flex",
                flexDirection: "column",
                gap: "1.5rem",
                background: "#FAFAF8",
                borderRadius: "16px",
                border: "1px solid rgba(17,17,17,0.06)",
                padding: "2rem",
            }}>
                <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "1.3rem", fontWeight: 500, fontStyle: "italic" }}>
                    Order Summary
                </h2>

                <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                    {items.map((item) => {
                        const isPrint = item.type === "print";
                        const isDiscounted = promoApplied && isPrint;
                        const discountedPrice = isDiscounted ? Math.round(item.price * 0.9) : item.price;

                        return (
                            <div key={item.id} style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
                                <div style={{
                                    width: "64px", height: "64px", borderRadius: "8px",
                                    background: item.imageUrl ? "none" : `linear-gradient(160deg, ${item.imageGradientFrom}, ${item.imageGradientTo})`,
                                    flexShrink: 0, overflow: "hidden",
                                }}>
                                    {item.imageUrl && <img src={item.imageUrl} alt={item.title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ fontFamily: "var(--font-serif)", fontSize: "0.95rem", fontStyle: "italic", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                        {item.title}
                                    </p>
                                    <p style={{ fontFamily: "var(--font-sans)", fontSize: "0.72rem", color: "#999", margin: "0.15rem 0 0", textTransform: "capitalize" }}>
                                        {item.type === "original" ? "Original painting" : "Fine Art Print"}
                                        {item.size ? ` · ${item.size}` : ""}
                                        {item.finish ? ` · ${item.finish}` : ""}
                                    </p>
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.3rem" }}>
                                        {isDiscounted ? (
                                            <>
                                                <span className="font-price" style={{ fontSize: "0.9rem", fontWeight: 700, color: "#ec4899" }}>{convertPrice(discountedPrice)}</span>
                                                <span className="font-price" style={{ fontSize: "0.8rem", color: "#999", textDecoration: "line-through" }}>{convertPrice(item.price)}</span>
                                            </>
                                        ) : (
                                            <span className="font-price" style={{ fontSize: "0.9rem", fontWeight: 600 }}>{convertPrice(item.price)}</span>
                                        )}
                                        {item.quantity > 1 && <span style={{ fontSize: "0.75rem", color: "#999" }}>× {item.quantity}</span>}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(17,17,17,0.06)", paddingTop: "1rem" }}>
                    <Link href="/shop" style={{ fontFamily: "var(--font-sans)", fontSize: "0.75rem", color: "#ec4899", textDecoration: "underline" }}>
                        Continue Shopping
                    </Link>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", borderTop: "1px solid rgba(17,17,17,0.06)", paddingTop: "1rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-sans)", fontSize: "0.85rem" }}>
                        <span style={{ color: "#888" }}>Subtotal</span>
                        <span className="font-price" style={{ fontWeight: 600, fontSize: "0.95rem", textDecoration: promoApplied ? "line-through" : "none" }}>{convertPrice(cartTotal)}</span>
                    </div>
                    {promoApplied && (
                        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-sans)", fontSize: "0.85rem", color: "#ec4899" }}>
                            <span>Discount (10% prints)</span>
                            <span className="font-price" style={{ fontWeight: 600, fontSize: "0.95rem" }}>−{convertPrice(discountAmount)}</span>
                        </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-sans)", fontSize: "0.85rem" }}>
                        <span style={{ color: "#888" }}>Shipping</span>
                        <span style={{ fontWeight: 600, color: "#38A169" }}>FREE</span>
                    </div>
                    <div style={{
                        display: "flex", justifyContent: "space-between", fontFamily: "var(--font-sans)", fontSize: "1.1rem",
                        borderTop: "1px solid rgba(17,17,17,0.08)", paddingTop: "0.75rem", marginTop: "0.25rem",
                    }}>
                        <span style={{ fontWeight: 500 }}>Total</span>
                        <span className="font-price" style={{ fontWeight: 700, fontSize: "1.2rem" }}>{convertPrice(currentTotal)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
