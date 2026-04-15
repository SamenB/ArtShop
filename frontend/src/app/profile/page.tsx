"use client";

/**
 * My Orders Dashboard page.
 * Provides a minimal, premium light-themed interface for customers
 * to view and track their order history via a simplified pipeline.
 */

import { useState, useEffect } from "react";
import { useUser } from "@/context/UserContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getApiUrl, getImageUrl, apiFetch } from "@/utils";

/** Represents an item within an order. */
interface OrderItem {
    id: number;
    artwork_id: number;
    edition_type: string;
    finish: string;
    size: string | null;
    price: number;
    artwork?: { id: number; title: string; images?: (string | { thumb: string; medium: string; original: string })[] };
}

/** Represents a full order record. */
interface Order {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    total_price: number;
    payment_status: string;
    fulfillment_status: string;
    created_at: string;
    shipping_city: string | null;
    shipping_country: string | null;
    shipping_country_code: string | null;
    // Tracking
    tracking_number: string | null;
    carrier: string | null;
    tracking_url: string | null;
    // Lifecycle timestamps
    confirmed_at: string | null;
    print_ordered_at: string | null;
    shipped_at: string | null;
    delivered_at: string | null;
    items: OrderItem[];
}

/** Payment status badge colors tuned for light background readability. */
const PAYMENT_COLORS: Record<string, { bg: string; text: string; label: string }> = {
    paid:             { bg: "rgba(34,197,94,0.15)",   text: "#15803d", label: "💳 Paid" },
    pending:          { bg: "rgba(250,204,21,0.2)",   text: "#b45309", label: "💳 Pending" },
    awaiting_payment: { bg: "rgba(250,204,21,0.2)",   text: "#b45309", label: "💳 Awaiting Payment" },
    processing:       { bg: "rgba(96,165,250,0.15)",  text: "#1d4ed8", label: "💳 Processing" },
    failed:           { bg: "rgba(239,68,68,0.12)",   text: "#b91c1c", label: "💳 Failed" },
    refunded:         { bg: "rgba(168,85,247,0.15)",  text: "#7e22ce", label: "💳 Refunded" },
    mock_paid:        { bg: "rgba(34,197,94,0.15)",   text: "#15803d", label: "💳 Paid" },
    hold:             { bg: "rgba(96,165,250,0.15)",  text: "#1d4ed8", label: "💳 On Hold" },
};

function StatusBadge({ status }: { status: string }) {
    const config = PAYMENT_COLORS[status] || { bg: "rgba(0,0,0,0.05)", text: "#555", label: status };
    return (
        <span style={{
            display: "inline-block",
            padding: "0.2rem 0.65rem",
            borderRadius: "999px",
            fontSize: "0.65rem",
            fontFamily: "var(--font-sans, system-ui)",
            fontWeight: 650,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            backgroundColor: config.bg,
            color: config.text,
            whiteSpace: "nowrap",
        }}>
            {config.label}
        </span>
    );
}

/** Simplified Fulfillment progress steps for client-facing view. */
const FULFILLMENT_STEPS = [
    { key: "received",    icon: "🛒", label: "Order Placed" },
    { key: "processing",  icon: "⚙️", label: "Processing" },
    { key: "shipped",     icon: "🚀", label: "Shipped" },
    { key: "delivered",   icon: "🎨", label: "Delivered" },
];

/** Maps internal granular DB fulfillment statuses to the simplified client UI pipeline. */
const getUIFulfillmentIndex = (dbStatus: string): number => {
    switch (dbStatus) {
        case "pending": return 0;
        case "confirmed": return 1;
        case "print_ordered": return 1;
        case "print_received": return 1;
        case "packaging": return 1;
        case "shipped": return 2;
        case "delivered": return 3;
        case "cancelled": return -1;
        default: return 0;
    }
};

function FulfillmentProgressBar({ status, order }: { status: string; order: Order }) {
    const isCancelled = status === "cancelled";
    const currentIdx = getUIFulfillmentIndex(status);

    if (isCancelled) {
        return (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.75rem", background: "rgba(239,68,68,0.08)", borderRadius: "8px", border: "1px solid rgba(239,68,68,0.2)" }}>
                <span style={{ fontSize: "1rem", color: "#b91c1c" }}>✗</span>
                <span style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#b91c1c" }}>Order Cancelled</span>
            </div>
        );
    }

    return (
        <div style={{ overflowX: "auto", paddingBottom: "4px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "4px", minWidth: "max-content" }}>
                {FULFILLMENT_STEPS.map((step, idx) => {
                    const isCompleted = idx < currentIdx;
                    const isCurrent = idx === currentIdx;
                    const isPending = idx > currentIdx;
                    return (
                        <div key={step.key} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <div style={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                gap: "4px",
                                opacity: isPending ? 0.35 : 1,
                            }}>
                                <div style={{
                                    width: isCurrent ? "2.2rem" : "1.85rem",
                                    height: isCurrent ? "2.2rem" : "1.85rem",
                                    borderRadius: "50%",
                                    background: isCompleted ? "rgba(34,197,94,0.15)" : isCurrent ? "rgba(26,26,24,0.06)" : "transparent",
                                    border: isCompleted ? "1.5px solid rgba(34,197,94,0.6)" : isCurrent ? "1.5px solid rgba(26,26,24,0.4)" : "1.5px solid rgba(26,26,24,0.15)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: isCurrent ? "1.1rem" : "0.9rem",
                                    boxShadow: isCurrent ? "0 4px 12px rgba(0,0,0,0.06)" : "none",
                                    transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
                                }}>
                                    {isCompleted ? <span style={{ color: "#15803d", fontSize: "1rem", fontWeight: 800 }}>✓</span> : step.icon}
                                </div>
                                <span style={{
                                    fontSize: "0.60rem",
                                    fontWeight: isCurrent ? 700 : 500,
                                    color: isCompleted ? "#15803d" : isCurrent ? "#1a1a18" : "rgba(26,26,24,0.5)",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.06em",
                                    whiteSpace: "nowrap",
                                }}>
                                    {step.label}
                                </span>
                            </div>
                            {idx < FULFILLMENT_STEPS.length - 1 && (
                                <div style={{
                                    width: "36px",
                                    height: "1.5px",
                                    background: isCompleted ? "rgba(34,197,94,0.5)" : "rgba(26,26,24,0.1)",
                                    flexShrink: 0,
                                    marginBottom: "14px",
                                    transition: "background 0.3s ease",
                                }} />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Tracking info (visible when shipped) */}
            {(status === "shipped" || status === "delivered") && order.tracking_number && (
                <div style={{ marginTop: "1rem", padding: "0.85rem 1rem", background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: "8px" }}>
                    <p style={{ fontSize: "0.6rem", fontWeight: 750, textTransform: "uppercase", letterSpacing: "0.12em", color: "#15803d", marginBottom: "0.3rem" }}>Tracking</p>
                    <p style={{ fontSize: "0.75rem", color: "var(--color-charcoal)", fontFamily: "monospace" }}>
                        {order.carrier && <span style={{ fontWeight: 600, marginRight: "6px", textTransform: "capitalize" }}>{order.carrier.replace(/_/g, " ")}</span>}
                        {order.tracking_number}
                    </p>
                    {order.tracking_url && (
                        <a
                            href={order.tracking_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ display: "inline-block", marginTop: "0.45rem", fontSize: "0.7rem", color: "#15803d", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: "3px" }}>
                            Track your parcel →
                        </a>
                    )}
                </div>
            )}
        </div>
    );
}

/**
 * Personal account management view.
 * Exclusive "My Orders" manager matching the premium light-themed UI.
 */
export default function ProfilePage() {
    const { user, loading } = useUser();
    const { convertPrice } = usePreferences();
    const router = useRouter();
    const [orders, setOrders] = useState<Order[]>([]);
    const [dataLoading, setDataLoading] = useState(false);
    const [expandedOrder, setExpandedOrder] = useState<number | null>(null);

    /** Security check: Redirect non-authenticated users, and admins to /admin. */
    useEffect(() => {
        if (!loading && !user) {
            router.push("/");
        } else if (user?.is_admin) {
            router.push("/admin");
        }
    }, [user, loading, router]);

    /** Data hydration: Pulls historical orders. */
    useEffect(() => {
        if (!user || user.is_admin) return;
        const fetchData = async () => {
            setDataLoading(true);
            try {
                const res = await apiFetch(`${getApiUrl()}/orders/me`);
                if (res.ok) setOrders(await res.json());
            } catch (err) {
                console.error("Error fetching user data", err);
            } finally {
                setDataLoading(false);
            }
        };
        fetchData();
    }, [user]);

    if (loading || (!user && !loading)) return <div className="min-h-screen pt-[150px] flex justify-center text-[var(--color-charcoal)] bg-[var(--color-cream)]">Loading profile...</div>;

    return (
        <div className="min-h-screen bg-[var(--color-cream)] pt-[150px] pb-24 text-[var(--color-charcoal)]">
            <main className="max-w-[1000px] mx-auto px-6 lg:px-12">
                <header className="mb-12 border-b border-[rgba(26,26,24,0.06)] pb-8">
                    <h1 className="text-4xl lg:text-5xl font-serif tracking-widest mb-4">My Orders</h1>
                    <p className="text-[rgba(26,26,24,0.5)] font-mono text-[0.8rem] tracking-widest uppercase">
                        Welcome back, {user.username}
                    </p>
                </header>

                {dataLoading ? (
                    <div className="text-center py-20 text-[rgba(26,26,24,0.4)] font-mono text-sm tracking-widest animate-pulse">
                        Synchronizing order data...
                    </div>
                ) : (
                    <div className="space-y-6">
                        {orders.length === 0 ? (
                            <div className="text-center py-20 border border-[rgba(26,26,24,0.06)] rounded-2xl bg-[rgba(26,26,24,0.02)]">
                                <p className="font-serif italic text-xl text-[rgba(26,26,24,0.4)] mb-4">No completed orders yet.</p>
                                <Link href="/shop" className="text-sm font-sans uppercase tracking-widest hover:text-[var(--color-charcoal)] transition-colors text-[rgba(26,26,24,0.5)] underline underline-offset-4">Browse Collection</Link>
                            </div>
                        ) : (
                            orders
                                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                                .map((order) => {
                                    const isExpanded = expandedOrder === order.id;
                                    const fulfillmentStatus = order.fulfillment_status || "pending";
                                    return (
                                        <div
                                            key={order.id}
                                            className="rounded-xl overflow-hidden transition-all duration-300"
                                            style={{
                                                backgroundColor: "rgba(255,255,255,0.65)",
                                                backdropFilter: "blur(12px) saturate(1.2)",
                                                WebkitBackdropFilter: "blur(12px) saturate(1.2)",
                                                border: "1px solid rgba(26,26,24,0.08)",
                                                boxShadow: isExpanded ? "0 12px 40px rgba(0,0,0,0.04)" : "0 4px 20px rgba(0,0,0,0.02)",
                                                transform: isExpanded ? "translateY(-2px)" : "none",
                                            }}
                                        >
                                            {/* Order Header */}
                                            <button
                                                onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                                                className="w-full p-5 sm:p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-left outline-none"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-3 flex-wrap mb-2">

                                                        <StatusBadge status={order.payment_status} />
                                                    </div>
                                                    <p className="font-sans text-[0.9rem] font-medium text-[var(--color-charcoal)] mb-4">
                                                        {new Date(order.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                                                        {order.items && order.items.length > 0 && (
                                                            <span className="text-[rgba(26,26,24,0.4)] ml-2 font-normal">· {order.items.length} {order.items.length === 1 ? "item" : "items"}</span>
                                                        )}
                                                    </p>
                                                    {/* Fulfillment progress bar */}
                                                    <FulfillmentProgressBar status={fulfillmentStatus} order={order} />
                                                </div>
                                                <div className="flex items-center gap-4 ml-0 sm:ml-4 flex-shrink-0 mt-4 sm:mt-0">
                                                    <p className="font-price text-xl tracking-tight font-semibold text-[var(--color-charcoal)]">{convertPrice(order.total_price)}</p>
                                                    <div style={{
                                                        width: "32px", height: "32px",
                                                        borderRadius: "50%",
                                                        backgroundColor: isExpanded ? "rgba(26,26,24,0.06)" : "transparent",
                                                        display: "flex", alignItems: "center", justifyContent: "center",
                                                        transition: "all 0.2s ease"
                                                    }}>
                                                        <span className="text-[rgba(26,26,24,0.4)] text-[0.65rem]" style={{ transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.3s ease" }}>▼</span>
                                                    </div>
                                                </div>
                                            </button>

                                            {/* Expanded Details */}
                                            {isExpanded && (
                                                <div className="border-t border-[rgba(26,26,24,0.06)] px-5 sm:px-6 py-6 space-y-6 bg-white/50" style={{ animation: "fadeIn 0.3s ease" }}>

                                                    {/* Items with artwork info */}
                                                    {order.items && order.items.length > 0 && (
                                                        <div>
                                                            <p className="font-mono text-[0.65rem] text-[rgba(26,26,24,0.4)] uppercase tracking-widest mb-3 font-semibold">Items</p>
                                                            <div className="space-y-3">
                                                                {order.items.map((item, idx) => {
                                                                    const imgSrc = item.artwork?.images?.[0]
                                                                        ? getImageUrl(item.artwork.images[0], "thumb")
                                                                        : null;
                                                                    return (
                                                                        <div key={idx} className="flex items-center gap-4 py-3 border-b border-[rgba(26,26,24,0.04)] last:border-0 hover:bg-[rgba(26,26,24,0.01)] transition-colors rounded-lg -mx-2 px-2">
                                                                            {imgSrc && (
                                                                                <img src={imgSrc} alt="" className="w-12 h-12 rounded object-cover border border-[rgba(26,26,24,0.06)] flex-shrink-0 shadow-sm" />
                                                                            )}
                                                                            <div className="flex-1 min-w-0">
                                                                                <p className="font-sans text-[0.95rem] text-[var(--color-charcoal)] truncate font-medium">
                                                                                    {item.artwork?.title || `Artwork #${item.artwork_id}`}
                                                                                </p>
                                                                                <p className="font-mono text-[0.65rem] text-[rgba(26,26,24,0.5)] uppercase tracking-wider mt-0.5 font-semibold">
                                                                                    {item.edition_type === "original" ? "Original" : "Print"}
                                                                                    {item.size && <span className="text-[rgba(26,26,24,0.3)] mx-1">/</span>}
                                                                                    {item.size && item.size}
                                                                                    {item.finish && <span className="text-[rgba(26,26,24,0.3)] mx-1">/</span>}
                                                                                    {item.finish && item.finish}
                                                                                </p>
                                                                            </div>
                                                                            <p className="font-price text-lg font-semibold tracking-tight text-[var(--color-charcoal)] flex-shrink-0">{convertPrice(item.price)}</p>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Shipping */}
                                                    {(order.shipping_city || order.shipping_country) && (
                                                        <div>
                                                            <p className="font-mono text-[0.65rem] text-[rgba(26,26,24,0.4)] uppercase tracking-widest mb-1 font-semibold">Delivery Address</p>
                                                            <p className="font-sans text-[0.85rem] text-[rgba(26,26,24,0.7)] font-medium">
                                                                {[order.shipping_city, order.shipping_country].filter(Boolean).join(", ")}
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
