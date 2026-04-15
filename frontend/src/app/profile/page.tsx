"use client";

/**
 * Profile and Admin Dashboard page.
 * Provides a unified interface for customers (Order History, Saved Artworks)
 * and administrators (Dashboard with artworks, settings, and orders tabs).
 */

import { useState, useEffect } from "react";
import { useUser } from "@/context/UserContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { getApiUrl, getImageUrl, artworkUrl, apiFetch } from "@/utils";

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

/** Represents a lightweight artwork summary for liked/saved items. */
interface Artwork {
    id: number;
    slug?: string;
    title: string;
    medium: string;
    size: string;
    images?: (string | { thumb: string; medium: string; original: string })[];
    original_price?: number;
    original_status?: string;
    has_prints?: boolean;
    base_print_price?: number;
    orientation?: string;
    aspectRatio?: string;
    gradientFrom?: string;
    gradientTo?: string;
}

/** Payment status badge colors. */
const PAYMENT_COLORS: Record<string, { bg: string; text: string; label: string }> = {
    paid:             { bg: "rgba(34,197,94,0.15)",   text: "#22c55e", label: "💳 Paid" },
    pending:          { bg: "rgba(250,204,21,0.15)",  text: "#eab308", label: "💳 Pending" },
    awaiting_payment: { bg: "rgba(250,204,21,0.15)",  text: "#eab308", label: "💳 Awaiting Payment" },
    processing:       { bg: "rgba(96,165,250,0.15)",  text: "#60a5fa", label: "💳 Processing" },
    failed:           { bg: "rgba(239,68,68,0.15)",   text: "#ef4444", label: "💳 Failed" },
    refunded:         { bg: "rgba(168,85,247,0.15)",  text: "#a855f7", label: "💳 Refunded" },
    mock_paid:        { bg: "rgba(34,197,94,0.15)",   text: "#22c55e", label: "💳 Paid" },
    hold:             { bg: "rgba(96,165,250,0.15)",  text: "#60a5fa", label: "💳 On Hold" },
};

function StatusBadge({ status }: { status: string }) {
    const config = PAYMENT_COLORS[status] || { bg: "rgba(255,255,255,0.1)", text: "#999", label: status };
    return (
        <span style={{
            display: "inline-block",
            padding: "0.2rem 0.65rem",
            borderRadius: "999px",
            fontSize: "0.65rem",
            fontFamily: "var(--font-sans, system-ui)",
            fontWeight: 600,
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

/** Fulfillment progress steps for customer-facing display */
const FULFILLMENT_STEPS: { key: string; icon: string; label: string }[] = [
    { key: "pending",        icon: "🛒", label: "Order Placed" },
    { key: "confirmed",      icon: "✅", label: "Confirmed" },
    { key: "print_ordered",  icon: "🖨", label: "Being Printed" },
    { key: "print_received", icon: "📦", label: "Print Ready" },
    { key: "packaging",      icon: "🎁", label: "Packaging" },
    { key: "shipped",        icon: "🚀", label: "Shipped" },
    { key: "delivered",      icon: "🎨", label: "Delivered" },
];

const FULFILLMENT_ORDER = FULFILLMENT_STEPS.map(s => s.key);

function FulfillmentProgressBar({ status, order }: { status: string; order: Order }) {
    const isCancelled = status === "cancelled";
    const currentIdx = isCancelled ? -1 : FULFILLMENT_ORDER.indexOf(status);

    if (isCancelled) {
        return (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.75rem", background: "rgba(239,68,68,0.08)", borderRadius: "8px", border: "1px solid rgba(239,68,68,0.2)" }}>
                <span style={{ fontSize: "1rem" }}>✗</span>
                <span style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#ef4444" }}>Order Cancelled</span>
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
                                gap: "3px",
                                opacity: isPending ? 0.3 : 1,
                            }}>
                                <div style={{
                                    width: isCurrent ? "2rem" : "1.75rem",
                                    height: isCurrent ? "2rem" : "1.75rem",
                                    borderRadius: "50%",
                                    background: isCompleted ? "rgba(34,197,94,0.2)" : isCurrent ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)",
                                    border: isCompleted ? "1.5px solid rgba(34,197,94,0.5)" : isCurrent ? "1.5px solid rgba(255,255,255,0.5)" : "1.5px solid rgba(255,255,255,0.1)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: isCurrent ? "1rem" : "0.8rem",
                                    boxShadow: isCurrent ? "0 0 0 3px rgba(255,255,255,0.08)" : "none",
                                    transition: "all 0.2s",
                                }}>
                                    {step.icon}
                                </div>
                                <span style={{
                                    fontSize: "0.55rem",
                                    fontWeight: isCurrent ? 700 : 500,
                                    color: isCompleted ? "#22c55e" : isCurrent ? "#F7F3EC" : "#64748b",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.05em",
                                    whiteSpace: "nowrap",
                                }}>
                                    {step.label}
                                </span>
                            </div>
                            {idx < FULFILLMENT_STEPS.length - 1 && (
                                <div style={{
                                    width: "20px",
                                    height: "1.5px",
                                    background: isCompleted ? "rgba(34,197,94,0.4)" : "rgba(255,255,255,0.08)",
                                    flexShrink: 0,
                                    marginBottom: "12px",
                                }} />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Tracking info (visible when shipped) */}
            {(status === "shipped" || status === "delivered") && order.tracking_number && (
                <div style={{ marginTop: "0.75rem", padding: "0.65rem 0.85rem", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: "8px" }}>
                    <p style={{ fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#22c55e", marginBottom: "0.3rem" }}>Tracking</p>
                    <p style={{ fontSize: "0.75rem", color: "#d4d4d8", fontFamily: "monospace" }}>
                        {order.carrier && <span style={{ fontWeight: 600, marginRight: "6px", textTransform: "capitalize" }}>{order.carrier.replace(/_/g, " ")}</span>}
                        {order.tracking_number}
                    </p>
                    {order.tracking_url && (
                        <a
                            href={order.tracking_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ display: "inline-block", marginTop: "0.35rem", fontSize: "0.65rem", color: "#22c55e", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: "2px" }}>
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
 * Features a dynamic tabbed interface that upgrades to a full administrative 
 * dashboard for users with sufficient privileges.
 */
export default function ProfilePage() {
    const { user, loading } = useUser();
    const { convertPrice } = usePreferences();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<"orders" | "likes">("orders");
    const [orders, setOrders] = useState<Order[]>([]);
    const [likes, setLikes] = useState<Artwork[]>([]);
    const [dataLoading, setDataLoading] = useState(false);
    const [expandedOrder, setExpandedOrder] = useState<number | null>(null);

    /** Security check: Redirect non-authenticated users to landing page. */
    useEffect(() => {
        if (!loading && !user) {
            router.push("/");
        } else if (user?.is_admin) {
            router.push("/admin");
        }
    }, [user, loading, router]);

    /** Data hydration: Pulls historical orders and saved favorites. */
    useEffect(() => {
        if (!user) return;
        const fetchData = async () => {
            setDataLoading(true);
            try {
                const [ordersRes, likesRes] = await Promise.all([
                    apiFetch(`${getApiUrl()}/orders/me`),
                    apiFetch(`${getApiUrl()}/users/me/likes`)
                ]);
                if (ordersRes.ok) setOrders(await ordersRes.json());
                if (likesRes.ok) setLikes(await likesRes.json());
            } catch (err) {
                console.error("Error fetching user data", err);
            } finally {
                setDataLoading(false);
            }
        };
        fetchData();
    }, [user]);

    if (loading || !user) return <div className="min-h-screen pt-[150px] flex justify-center text-[#F7F3EC]">Loading profile...</div>;

    return (
        <div className="min-h-screen bg-[#111111] pt-[150px] pb-24 text-[#F7F3EC]">
            <main className="max-w-[1200px] mx-auto px-6 lg:px-12">
                <header className="mb-12">
                    <h1 className="text-4xl lg:text-5xl font-serif italic mb-4">Account Overview</h1>
                    <p className="text-zinc-400 font-mono text-sm tracking-widest uppercase mb-4">
                        Welcome back, {user.username}
                    </p>
                </header>

                {/* Primary Navigation Tabs */}
                <div className="flex gap-8 mb-12 border-b border-white/10">
                    <button
                        onClick={() => setActiveTab("orders")}
                        className={`pb-4 text-sm font-sans tracking-widest uppercase transition-colors ${activeTab === "orders" ? "text-white border-b border-white" : "text-zinc-500 hover:text-zinc-300"}`}
                    >
                        Order History
                    </button>
                    <button
                        onClick={() => setActiveTab("likes")}
                        className={`pb-4 text-sm font-sans tracking-widest uppercase transition-colors ${activeTab === "likes" ? "text-white border-b border-white" : "text-zinc-500 hover:text-zinc-300"}`}
                    >
                        Saved Artworks
                    </button>

                </div>

                {dataLoading ? (
                    <div className="text-center py-20 text-zinc-500 font-mono text-sm tracking-widest animate-pulse">
                        Synchronizing collection data...
                    </div>
                ) : (
                    <div>
                        {/* Order History View */}
                        {activeTab === "orders" && (
                            <div className="space-y-4">
                                {orders.length === 0 ? (
                                    <div className="text-center py-20 border border-white/5 rounded-2xl bg-white/2">
                                        <p className="font-serif italic text-xl text-zinc-400 mb-4">No completed orders yet.</p>
                                        <Link href="/shop" className="text-sm font-sans uppercase tracking-widest hover:text-white transition-colors text-zinc-500 underline underline-offset-4">Browse Collection</Link>
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
                                                    className="border border-white/10 rounded-xl bg-white/[0.02] overflow-hidden transition-all hover:border-white/20"
                                                >
                                                    {/* Order Header */}
                                                    <button
                                                        onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                                                        className="w-full p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-left"
                                                    >
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-3 flex-wrap mb-1.5">
                                                                <p className="font-mono text-xs uppercase tracking-widest text-zinc-500">Order #{order.id}</p>
                                                                <StatusBadge status={order.payment_status} />
                                                            </div>
                                                            <p className="font-sans text-sm text-zinc-300 mb-3">
                                                                {new Date(order.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                                                                {order.items && order.items.length > 0 && (
                                                                    <span className="text-zinc-500 ml-2">· {order.items.length} {order.items.length === 1 ? "item" : "items"}</span>
                                                                )}
                                                            </p>
                                                            {/* Fulfillment progress bar */}
                                                            <FulfillmentProgressBar status={fulfillmentStatus} order={order} />
                                                        </div>
                                                        <div className="flex items-center gap-4 ml-4 flex-shrink-0">
                                                            <p className="font-serif italic text-xl text-[#EAE5D9]">{convertPrice(order.total_price)}</p>
                                                            <span className="text-zinc-500 text-xs transition-transform" style={{ transform: isExpanded ? "rotate(180deg)" : "none" }}>▼</span>
                                                        </div>
                                                    </button>

                                                    {/* Expanded Details */}
                                                    {isExpanded && (
                                                        <div className="border-t border-white/5 px-5 py-5 space-y-5" style={{ animation: "fadeIn 0.2s ease" }}>

                                                            {/* Items with artwork info */}
                                                            {order.items && order.items.length > 0 && (
                                                                <div>
                                                                    <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mb-3">Items</p>
                                                                    <div className="space-y-2">
                                                                        {order.items.map((item, idx) => {
                                                                            const imgSrc = item.artwork?.images?.[0]
                                                                                ? getImageUrl(item.artwork.images[0], "thumb")
                                                                                : null;
                                                                            return (
                                                                                <div key={idx} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                                                                                    {imgSrc && (
                                                                                        <img src={imgSrc} alt="" className="w-10 h-10 rounded object-cover border border-white/10 flex-shrink-0" />
                                                                                    )}
                                                                                    <div className="flex-1 min-w-0">
                                                                                        <p className="font-sans text-sm text-zinc-200 truncate">
                                                                                            {item.artwork?.title || `Artwork #${item.artwork_id}`}
                                                                                        </p>
                                                                                        <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider">
                                                                                            {item.edition_type === "original" ? "Original" : "Print"}
                                                                                            {item.size && ` · ${item.size}`}
                                                                                            {item.finish && ` · ${item.finish}`}
                                                                                        </p>
                                                                                    </div>
                                                                                    <p className="font-sans text-sm text-zinc-300 font-medium flex-shrink-0">{convertPrice(item.price)}</p>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Shipping */}
                                                            {(order.shipping_city || order.shipping_country) && (
                                                                <div>
                                                                    <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Shipping To</p>
                                                                    <p className="font-sans text-sm text-zinc-400">
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

                        {/* Favorite Artworks View */}
                        {activeTab === "likes" && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8 gap-y-12">
                                {likes.length === 0 ? (
                                    <div className="col-span-full text-center py-20 border border-white/5 rounded-2xl bg-white/2">
                                        <p className="font-serif italic text-xl text-zinc-400 mb-4">Your saved collection is empty.</p>
                                        <Link href="/shop" className="text-sm font-sans uppercase tracking-widest hover:text-white transition-colors text-zinc-500 underline underline-offset-4">Browse Shop</Link>
                                    </div>
                                ) : (
                                    likes.map((work) => {
                                        const imgSrc = work.images?.[0] ? getImageUrl(work.images[0], "medium") || "" : "";
                                        const handleRemove = async (e: React.MouseEvent) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            try {
                                                await apiFetch(`${getApiUrl()}/users/me/likes/${work.id}`, { method: "DELETE" });
                                                setLikes(prev => prev.filter(l => l.id !== work.id));
                                            } catch (err) {
                                                console.error("Failed to remove like", err);
                                            }
                                        };
                                        return (
                                            <Link
                                                key={work.id}
                                                href={artworkUrl(work.slug || work.id)}
                                                className="flex flex-col group"
                                                style={{ textDecoration: "none" }}
                                            >
                                                <div
                                                    className="w-full rounded-sm overflow-hidden mb-3 bg-zinc-900 border border-white/5 relative"
                                                    style={{ aspectRatio: work.orientation === "horizontal" ? "5/4" : work.orientation === "square" ? "1/1" : "4/5" }}
                                                >
                                                    {imgSrc ? (
                                                        <img
                                                            src={imgSrc}
                                                            alt={work.title}
                                                            style={{
                                                                width: "100%",
                                                                height: "100%",
                                                                objectFit: "cover",
                                                                transition: "transform 0.25s ease-out, filter 0.25s ease",
                                                            }}
                                                            className="group-hover:scale-[1.03]"
                                                        />
                                                    ) : (
                                                        <div
                                                            className="absolute inset-0 opacity-80 group-hover:opacity-100 transition-opacity"
                                                            style={{ background: `linear-gradient(160deg, ${work.gradientFrom || '#3A3A3A'} 0%, ${work.gradientTo || '#1A1A1A'} 100%)` }}
                                                        />
                                                    )}
                                                </div>
                                                <div className="flex justify-between items-start gap-3">
                                                    <div style={{ minWidth: 0, flex: 1 }}>
                                                        <p className="font-serif text-lg italic text-[#F7F3EC] mb-0.5 truncate">{work.title}</p>
                                                        <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                                                            {work.original_status === "available" && work.original_price
                                                                ? convertPrice(work.original_price)
                                                                : work.original_status?.replace(/_/g, " ") || ""}
                                                        </p>
                                                    </div>
                                                    <button
                                                        onClick={handleRemove}
                                                        className="text-xs text-zinc-500 hover:text-red-400 transition-colors uppercase font-mono tracking-widest border border-white/10 px-3 py-1.5 rounded-full hover:border-red-400 flex-shrink-0"
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            </Link>
                                        );
                                    })
                                )}
                            </div>
                        )}


                    </div>
                )}
            </main>
        </div>
    );
}
