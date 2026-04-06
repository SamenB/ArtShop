"use client";

/**
 * Checkout Process View.
 * Handles user contact collection, cart summarization, promo codes (specifically for prints),
 * and dispatches the final purchase request to the backend. Includes Google OAuth for quick pre-filling.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { useCart } from "@/context/CartContext";
import { usePreferences } from "@/context/PreferencesContext";
import { GoogleLogin } from "@react-oauth/google";
import { useUser } from "@/context/UserContext";
import { getApiUrl, apiFetch } from "@/utils";

/**
 * Main Checkout component. orchestrates form logic, validation, and submission.
 */
export default function CheckoutPage() {
    const { items, cartTotal, clearCart } = useCart();
    const { convertPrice } = usePreferences();
    const { user, refreshUser } = useUser();
    
    const [formData, setFormData] = useState({
        firstName: "",
        lastName: "",
        phone: "",
        email: "",
        newsletter: "yes",
        discovery: "",
        promoCode: ""
    });

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [orderDone, setOrderDone] = useState(false);
    const [promoApplied, setPromoApplied] = useState(false);
    const [promoMessage, setPromoMessage] = useState({ text: "", isError: false });

    /** Pre-files form attributes safely if the user context is authenticated. */
    useEffect(() => {
        if (user) {
            const [first, ...rest] = (user.username || "").split(" ");
            setFormData(prev => ({
                ...prev,
                firstName: prev.firstName || first || "",
                lastName: prev.lastName || rest.join(" ") || "",
                email: prev.email || user.email || ""
            }));
        }
    }, [user, user?.username, user?.email]);

    /** Authenticates a guest via Google, triggering a pre-fill refresh upon success. */
    const handleGoogleSuccess = async (credentialResponse: any) => {
        try {
            const res = await fetch(`${getApiUrl()}/auth/google`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: credentialResponse.credential }),
                credentials: "include"
            });
            if (res.ok) {
                await refreshUser();
            }
        } catch (err) {
            console.error("Google Auth failed:", err);
        }
    };

    /** Synchronizes form inputs. */
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    /** Validates and applies applicable discount codes sequentially. */
    const applyPromo = () => {
        if (formData.promoCode.toUpperCase() === "ART10") {
            setPromoApplied(true);
            setPromoMessage({ text: "10% discount applied to prints!", isError: false });
        } else {
            setPromoMessage({ text: "Invalid promo code.", isError: true });
        }
    };

    /** Calculate mathematical totals applying constraints (e.g. 10% discount targets fine art prints only) */
    const printTotal = items.filter(i => i.type === "print").reduce((sum, i) => sum + (i.price * i.quantity), 0);
    const discountAmount = promoApplied ? Math.round(printTotal * 0.1) : 0;
    const currentTotal = cartTotal - discountAmount;

    /** Dispatches the final standardized payload to the generic orders endpoint. */
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        
        try {
            const orderRequest = {
                first_name: formData.firstName,
                last_name: formData.lastName,
                email: formData.email,
                phone: formData.phone,
                newsletter_opt_in: formData.newsletter === "yes",
                discovery_source: formData.discovery,
                promo_code: promoApplied ? formData.promoCode : null,
                total_price: currentTotal,
                items: items.map(item => ({
                    artwork_id: 1, // Placeholder assumption; robust implementations extract artwork_id securely.
                    edition_type: item.type,
                    finish: item.finish,
                    size: item.size,
                    price: item.price
                }))
            };

            const res = await apiFetch(`${getApiUrl()}/orders`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(orderRequest)
            });

            if (res.ok) {
                setOrderDone(true);
                clearCart();
            } else {
                const errData = await res.json();
                alert(`Order failed: ${errData.detail || "Unknown error"}`);
            }
        } catch (err) {
            console.error("Order failed:", err);
            alert("Connection error.");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (orderDone) {
        return (
            <div style={{ backgroundColor: "#fff", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "2rem" }}>
                <div style={{ maxWidth: "500px" }}>
                    <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "2.5rem", fontStyle: "italic", marginBottom: "1rem" }}>Thank You!</h1>
                    <p style={{ fontFamily: "var(--font-sans)", color: "var(--color-muted)", lineHeight: 1.6, marginBottom: "2rem" }}>
                        Your order has been placed successfully. You will receive a confirmation email shortly.
                    </p>
                    <Link href="/gallery" style={{ 
                        padding: "1rem 2rem", backgroundColor: "#334C75", color: "#fff", textDecoration: "none", 
                        borderRadius: "4px", fontFamily: "var(--font-sans)", fontSize: "0.85rem", fontWeight: 600,
                        textTransform: "uppercase", letterSpacing: "0.1em"
                    }}>
                        Back to Gallery
                    </Link>
                </div>
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <div style={{ backgroundColor: "#fff", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "2rem" }}>
                <div>
                   <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "2rem", marginBottom: "1rem" }}>Your cart is empty.</h2>
                   <Link href="/gallery" style={{ color: "#334C75", textDecoration: "underline" }}>Return to Gallery</Link>
                </div>
            </div>
        );
    }

    return (
        <div style={{ backgroundColor: "#fff", minHeight: "100vh", padding: "4rem 2rem" }}>
            <div style={{ maxWidth: "1200px", margin: "0 auto", display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "5rem" }}>
                
                {/* ── LEFT COLUMN: FORMS ── */}
                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "3rem" }}>
                    
                    {/* Google Auth Integration Pre-fill */}
                    {!user && (
                        <div style={{ backgroundColor: "#F9F9F7", padding: "2rem", borderRadius: "8px", border: "1px solid var(--color-border)", textAlign: "center" }}>
                            <h2 style={{ fontFamily: "var(--font-sans)", fontSize: "0.8rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1rem" }}>Returning Customer?</h2>
                            <div style={{ display: "flex", justifyContent: "center" }}>
                                <GoogleLogin
                                    onSuccess={handleGoogleSuccess}
                                    onError={() => console.log("Login Failed")}
                                    theme="outline"
                                    size="large"
                                    text="signin_with"
                                />
                            </div>
                            <p style={{ marginTop: "1rem", fontSize: "0.75rem", color: "var(--color-muted)" }}>Sign in to pre-fill your details</p>
                        </div>
                    )}
                    
                    {user && (
                        <div style={{ backgroundColor: "#F1F5F9", padding: "1.5rem", borderRadius: "8px", border: "1px solid #E2E8F0", fontSize: "0.85rem" }}>
                            <p style={{ color: "#334155", fontWeight: 500 }}>Signed in as <strong>{user.email}</strong>. Form pre-filled.</p>
                        </div>
                    )}

                    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
                        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "2rem", fontWeight: 500 }}>Contact Information</h1>
                        
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                            <input 
                                type="text" name="firstName" placeholder="First Name (Required)" required
                                value={formData.firstName} onChange={handleInputChange}
                                style={{ padding: "1rem", border: "1px solid var(--color-border-dark)", borderRadius: "4px", fontFamily: "var(--font-sans)", fontSize: "0.9rem" }}
                            />
                            <input 
                                type="text" name="lastName" placeholder="Last Name (Required)" required
                                value={formData.lastName} onChange={handleInputChange}
                                style={{ padding: "1rem", border: "1px solid var(--color-border-dark)", borderRadius: "4px", fontFamily: "var(--font-sans)", fontSize: "0.9rem" }}
                            />
                            <input 
                                type="tel" name="phone" placeholder="Phone e.g. +1234567890 (Required)" required
                                pattern="^\+[1-9]\d{6,14}$"
                                title="Number must start with '+' followed by country code and digits (e.g. +1234567890)"
                                value={formData.phone} onChange={handleInputChange}
                                style={{ padding: "1rem", border: "1px solid var(--color-border-dark)", borderRadius: "4px", fontFamily: "var(--font-sans)", fontSize: "0.9rem" }}
                            />
                            <input 
                                type="email" name="email" placeholder="Email (Required)" required
                                value={formData.email} onChange={handleInputChange}
                                style={{ padding: "1rem", border: "1px solid var(--color-border-dark)", borderRadius: "4px", fontFamily: "var(--font-sans)", fontSize: "0.9rem" }}
                            />
                        </div>

                        {/* Newsletter */}
                        <div style={{ backgroundColor: "#F1F5F9", padding: "1.5rem 2rem", borderRadius: "8px", display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
                            <span style={{ fontFamily: "var(--font-serif)", fontSize: "1.1rem", fontStyle: "italic", color: "var(--color-charcoal)" }}>Sign up for Semen's email newsletter?</span>
                            <div style={{ display: "flex", gap: "2rem" }}>
                                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "0.9rem" }}>
                                    <input type="radio" name="newsletter" value="yes" checked={formData.newsletter === "yes"} onChange={handleInputChange} /> Yes
                                </label>
                                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "0.9rem" }}>
                                    <input type="radio" name="newsletter" value="no" checked={formData.newsletter === "no"} onChange={handleInputChange} /> No
                                </label>
                            </div>
                        </div>

                        {/* Discovery */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                            <input 
                                type="text" name="discovery" placeholder="How did you discover Semen's artwork?"
                                value={formData.discovery} onChange={handleInputChange}
                                style={{ padding: "1rem", border: "1px solid var(--color-border-dark)", borderRadius: "4px", fontFamily: "var(--font-sans)", fontSize: "0.9rem" }}
                            />
                        </div>

                        <button 
                            disabled={isSubmitting}
                            type="submit"
                            style={{
                                marginTop: "1rem", padding: "1.25rem", backgroundColor: isSubmitting ? "#ccc" : "#334C75", color: "#fff",
                                border: "none", borderRadius: "4px", fontFamily: "var(--font-sans)", fontSize: "0.85rem",
                                fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", cursor: isSubmitting ? "default" : "pointer",
                                transition: "background 0.2s"
                            }}>
                            {isSubmitting ? "Processing..." : "Continue to Payment Method"}
                        </button>
                    </div>
                </form>

                {/* ── RIGHT COLUMN: SUMMARY ── */}
                <div style={{ backgroundColor: "#fff", borderLeft: "1px solid var(--color-border)", paddingLeft: "5rem" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
                        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "1.5rem", fontWeight: 500, fontStyle: "italic" }}>Order Summary</h2>

                        {/* Cart Items List */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
                            {items.map(item => {
                                const isPrint = item.type === "print";
                                const isDiscounted = promoApplied && isPrint;
                                const discountedPrice = isDiscounted ? Math.round(item.price * 0.9) : item.price;
                                
                                return (
                                    <div key={item.id} style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start" }}>
                                        <div style={{ width: "80px", height: "80px", borderRadius: "4px", background: `linear-gradient(160deg, ${item.imageGradientFrom} 0%, ${item.imageGradientTo} 100%)`, flexShrink: 0 }} />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: "flex", justifyItems: "space-between", alignItems: "flex-start" }}>
                                                <h3 style={{ fontFamily: "var(--font-serif)", fontSize: "1.1rem", fontStyle: "italic", margin: 0 }}>{item.title}</h3>
                                                {isDiscounted && (
                                                    <span style={{ 
                                                        backgroundColor: "#334C75", color: "#fff", fontSize: "0.6rem", 
                                                        fontWeight: 700, padding: "2px 6px", borderRadius: "3px", 
                                                        textTransform: "uppercase", letterSpacing: "0.05em" 
                                                    }}>10% OFF</span>
                                                )}
                                            </div>
                                            <p style={{ fontFamily: "var(--font-sans)", fontSize: "0.75rem", color: "var(--color-muted)", marginTop: "0.25rem", lineHeight: 1.4 }}>
                                                {item.type === "original" ? "Original painting" : "Fine Art Print"}<br />
                                                {item.size && `${item.size} · `}{item.finish}
                                            </p>
                                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem" }}>
                                                {isDiscounted ? (
                                                    <>
                                                        <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.9rem", fontWeight: 700, color: "#334C75" }}>
                                                            {convertPrice(discountedPrice)}
                                                        </span>
                                                        <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.75rem", color: "var(--color-muted)", textDecoration: "line-through" }}>
                                                            {convertPrice(item.price)}
                                                        </span>
                                                    </>
                                                ) : (
                                                    <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.9rem", fontWeight: 600 }}>
                                                        {convertPrice(item.price)}
                                                    </span>
                                                )}
                                                {item.quantity > 1 && (
                                                    <span style={{ fontWeight: 400, color: "var(--color-muted)", fontSize: "0.8rem" }}>× {item.quantity}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--color-border)", paddingTop: "1.5rem" }}>
                            <Link href="#" style={{ fontFamily: "var(--font-sans)", fontSize: "0.8rem", color: "#334C75", textDecoration: "underline" }}>Edit Cart</Link>
                            <Link href="/gallery" style={{ fontFamily: "var(--font-sans)", fontSize: "0.8rem", color: "#334C75", textDecoration: "underline" }}>Continue Shopping</Link>
                        </div>

                        {/* Promo Code */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                            <div style={{ display: "flex", gap: "0.5rem" }}>
                                <input 
                                    type="text" name="promoCode" placeholder="Promo Code"
                                    value={formData.promoCode} onChange={handleInputChange}
                                    style={{ flex: 1, padding: "0.75rem 1rem", border: "1px solid var(--color-border-dark)", borderRadius: "4px", fontFamily: "var(--font-sans)", fontSize: "0.9rem" }}
                                />
                                <button 
                                    type="button"
                                    onClick={applyPromo}
                                    style={{
                                        padding: "0.75rem 1.5rem", backgroundColor: "#334C75", color: "#fff",
                                        border: "none", borderRadius: "4px", fontFamily: "var(--font-sans)", fontSize: "0.75rem",
                                        fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", cursor: "pointer"
                                    }}>
                                    Apply
                                </button>
                            </div>
                            {promoMessage.text && (
                                <p style={{ 
                                    fontFamily: "var(--font-sans)", fontSize: "0.80rem", marginTop: "0.25rem",
                                    color: promoMessage.isError ? "#E53E3E" : "#38A169", fontWeight: 500
                                }}>
                                    {promoMessage.text}
                                </p>
                            )}
                        </div>

                        {/* Totals */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", borderTop: "1px solid var(--color-border)", paddingTop: "1.5rem" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-sans)", fontSize: "0.9rem" }}>
                                <span style={{ color: "var(--color-muted)" }}>Subtotal</span>
                                <span style={{ fontWeight: 600, textDecoration: promoApplied ? "line-through" : "none" }}>{convertPrice(cartTotal)}</span>
                            </div>
                            {promoApplied && (
                                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-sans)", fontSize: "0.9rem", color: "#334C75" }}>
                                    <span>Discount (10% on prints only)</span>
                                    <span style={{ fontWeight: 600 }}>-{convertPrice(discountAmount)}</span>
                                </div>
                            )}
                            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-sans)", fontSize: "0.9rem" }}>
                                <span style={{ color: "var(--color-muted)" }}>Shipping</span>
                                <span style={{ fontWeight: 600, color: "#334C75" }}>FREE</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-sans)", fontSize: "1.1rem", borderTop: "1px solid var(--color-border)", paddingTop: "1rem" }}>
                                <span style={{ fontWeight: 500 }}>Total</span>
                                <span style={{ fontWeight: 700 }}>{convertPrice(currentTotal)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
