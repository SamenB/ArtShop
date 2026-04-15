"use client";

/**
 * Orders Management Tab — Full Lifecycle Dashboard.
 *
 * Features:
 * - Dual status badges: payment + fulfillment (independent axes)
 * - Quick-action fulfillment pipeline buttons (1 click to advance/change)
 * - Tracking number / carrier input with auto-link generation
 * - Visual timeline of lifecycle timestamps
 * - Inline admin notes
 * - Filter by payment or fulfillment status
 */

import { useState, useEffect } from "react";
import { getApiUrl, apiFetch, getImageUrl } from "@/utils";

// ── Status Configurations ────────────────────────────────────────────────────

const PAYMENT_STATUS_CONFIG: Record<string, { bg: string; border: string; text: string; label: string }> = {
    paid:             { bg: "#f0fdf4", border: "#86efac", text: "#15803d", label: "Paid" },
    pending:          { bg: "#fefce8", border: "#fde047", text: "#854d0e", label: "Pending" },
    awaiting_payment: { bg: "#fefce8", border: "#fde047", text: "#854d0e", label: "Awaiting Pay" },
    processing:       { bg: "#eff6ff", border: "#93c5fd", text: "#1d4ed8", label: "Processing" },
    failed:           { bg: "#fef2f2", border: "#fca5a5", text: "#991b1b", label: "Failed" },
    refunded:         { bg: "#faf5ff", border: "#c4b5fd", text: "#6b21a8", label: "Refunded" },
    mock_paid:        { bg: "#f0fdf4", border: "#86efac", text: "#15803d", label: "Mock Paid" },
    hold:             { bg: "#f8fafc", border: "#cbd5e1", text: "#475569", label: "On Hold" },
};

const FULFILLMENT_STATUS_CONFIG: Record<string, { bg: string; border: string; text: string; label: string; icon: string }> = {
    pending:        { bg: "#f8fafc", border: "#cbd5e1", text: "#64748b", label: "Pending",        icon: "⏳" },
    confirmed:      { bg: "#eff6ff", border: "#93c5fd", text: "#1d4ed8", label: "Confirmed",      icon: "✅" },
    print_ordered:  { bg: "#fdf4ff", border: "#e879f9", text: "#86198f", label: "Print Ordered",  icon: "🖨" },
    print_received: { bg: "#fdf4ff", border: "#c084fc", text: "#7e22ce", label: "Print Received", icon: "📦" },
    packaging:      { bg: "#fff7ed", border: "#fb923c", text: "#9a3412", label: "Packaging",      icon: "🎁" },
    shipped:        { bg: "#f0fdf4", border: "#4ade80", text: "#15803d", label: "Shipped",        icon: "🚀" },
    delivered:      { bg: "#f0fdf4", border: "#22c55e", text: "#166534", label: "Delivered",      icon: "🎨" },
    cancelled:      { bg: "#fef2f2", border: "#f87171", text: "#991b1b", label: "Cancelled",      icon: "✗" },
};

// The pipeline order for the quick-action buttons
const FULFILLMENT_PIPELINE = [
    "pending",
    "confirmed",
    "print_ordered",
    "print_received",
    "packaging",
    "shipped",
    "delivered",
];

const CARRIERS = [
    { value: "nova_poshta", label: "Nova Poshta" },
    { value: "ukrposhta",   label: "Ukrposhta" },
    { value: "dhl",         label: "DHL" },
    { value: "fedex",       label: "FedEx" },
    { value: "ups",         label: "UPS" },
    { value: "meest",       label: "Meest Express" },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function PaymentBadge({ status }: { status: string }) {
    const c = PAYMENT_STATUS_CONFIG[status] || { bg: "#f8fafc", border: "#e2e8f0", text: "#64748b", label: status };
    return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-widest border"
            style={{ backgroundColor: c.bg, borderColor: c.border, color: c.text }}>
            💳 {c.label}
        </span>
    );
}

function FulfillmentBadge({ status }: { status: string }) {
    const c = FULFILLMENT_STATUS_CONFIG[status] || { bg: "#f8fafc", border: "#e2e8f0", text: "#64748b", label: status, icon: "?" };
    return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-widest border"
            style={{ backgroundColor: c.bg, borderColor: c.border, color: c.text }}>
            {c.icon} {c.label}
        </span>
    );
}

function AdminLabel({ text }: { text: string }) {
    return (
        <p className="text-[9px] uppercase font-sans text-zinc-400 tracking-[0.2em] mb-2 font-bold leading-none">
            {text}
        </p>
    );
}

/** Visual timeline of lifecycle timestamps */
function OrderTimeline({ order }: { order: any }) {
    const steps = [
        { key: "created_at",       label: "Order Placed",    icon: "🛒" },
        { key: "confirmed_at",     label: "Confirmed",       icon: "✅" },
        { key: "print_ordered_at", label: "Print Ordered",   icon: "🖨" },
        { key: "print_received_at",label: "Print Received",  icon: "📦" },
        { key: "shipped_at",       label: "Shipped",         icon: "🚀" },
        { key: "delivered_at",     label: "Delivered",       icon: "🎨" },
    ];

    const activeSteps = steps.filter(s => order[s.key]);
    if (activeSteps.length === 0) return null;

    return (
        <div>
            <AdminLabel text="Order Timeline" />
            <div className="space-y-2">
                {steps.map((step) => {
                    const ts = order[step.key];
                    if (!ts) return null;
                    return (
                        <div key={step.key} className="flex items-start gap-3">
                            <span className="text-sm w-5 flex-shrink-0">{step.icon}</span>
                            <div>
                                <p className="text-[11px] font-bold text-zinc-700">{step.label}</p>
                                <p className="text-[10px] text-zinc-400 font-mono">
                                    {new Date(ts).toLocaleString("en-GB", {
                                        day: "2-digit", month: "short", year: "numeric",
                                        hour: "2-digit", minute: "2-digit"
                                    })}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/** Quick-action pipeline buttons for advancing fulfillment */
function FulfillmentPipeline({
    order,
    onStatusChange,
    saving,
}: {
    order: any;
    onStatusChange: (status: string, extra?: { tracking_number?: string; carrier?: string; notes?: string }) => void;
    saving: boolean;
}) {
    const currentIdx = FULFILLMENT_PIPELINE.indexOf(order.fulfillment_status);
    const [trackingNum, setTrackingNum] = useState(order.tracking_number || "");
    const [carrier, setCarrier] = useState(order.carrier || "nova_poshta");
    const [notes, setNotes] = useState(order.notes || "");
    const [showTrackingInput, setShowTrackingInput] = useState(false);

    const nextStatus = currentIdx >= 0 && currentIdx < FULFILLMENT_PIPELINE.length - 1
        ? FULFILLMENT_PIPELINE[currentIdx + 1]
        : null;

    const inputCls = "w-full bg-white border border-zinc-200 px-3 py-2 text-[12px] font-sans text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-700 rounded";
    const selectCls = `${inputCls} cursor-pointer`;

    const handleAdvance = () => {
        if (!nextStatus) return;
        if (nextStatus === "shipped") {
            setShowTrackingInput(true);
            return;
        }
        onStatusChange(nextStatus, { notes: notes || undefined });
    };

    const handleConfirmShip = () => {
        onStatusChange("shipped", {
            tracking_number: trackingNum || undefined,
            carrier: carrier || undefined,
            notes: notes || undefined,
        });
        setShowTrackingInput(false);
    };

    return (
        <div className="space-y-5">
            <div>
                <AdminLabel text="Fulfillment Pipeline" />
                {/* Status rail */}
                <div className="flex gap-1 mb-4 flex-wrap">
                    {FULFILLMENT_PIPELINE.map((s, idx) => {
                        const cfg = FULFILLMENT_STATUS_CONFIG[s];
                        const isCurrent = s === order.fulfillment_status;
                        const isPast = idx < currentIdx;
                        return (
                            <button
                                key={s}
                                onClick={() => {
                                    if (s === "shipped") { setShowTrackingInput(true); return; }
                                    onStatusChange(s, { notes: notes || undefined });
                                }}
                                disabled={saving}
                                title={cfg.label}
                                className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider border transition-all ${
                                    isCurrent
                                        ? "shadow-md scale-105"
                                        : "opacity-60 hover:opacity-100"
                                }`}
                                style={{
                                    backgroundColor: isCurrent ? cfg.bg : isPast ? "#f1f5f9" : "#fff",
                                    borderColor: isCurrent ? cfg.border : "#e2e8f0",
                                    color: isCurrent ? cfg.text : isPast ? "#94a3b8" : "#cbd5e1",
                                }}>
                                {cfg.icon} {cfg.label}
                            </button>
                        );
                    })}
                </div>

                {/* Cancel button */}
                {order.fulfillment_status !== "cancelled" && order.fulfillment_status !== "delivered" && (
                    <button
                        onClick={() => onStatusChange("cancelled")}
                        disabled={saving}
                        className="text-[9px] uppercase tracking-widest font-bold text-red-300 hover:text-red-600 transition-colors">
                        Cancel Order
                    </button>
                )}
            </div>

            {/* Next Step Quick Action */}
            {nextStatus && !showTrackingInput && (
                <button
                    onClick={handleAdvance}
                    disabled={saving}
                    className="w-full py-3 bg-zinc-900 text-white text-[10px] font-bold uppercase tracking-[0.2em] rounded hover:bg-black transition-all shadow-md hover:shadow-lg disabled:opacity-50">
                    {saving ? "Updating..." : `→ Advance to: ${FULFILLMENT_STATUS_CONFIG[nextStatus]?.label}`}
                </button>
            )}

            {/* Shipping details panel (shown when advancing to 'shipped') */}
            {showTrackingInput && (
                <div className="p-4 bg-white border border-zinc-200 rounded space-y-3">
                    <AdminLabel text="Shipping Details" />
                    <select
                        value={carrier}
                        onChange={e => setCarrier(e.target.value)}
                        className={selectCls}>
                        {CARRIERS.map(c => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                        <option value="">Other / Manual</option>
                    </select>
                    <input
                        value={trackingNum}
                        onChange={e => setTrackingNum(e.target.value)}
                        placeholder="Tracking / TTN number"
                        className={inputCls}
                    />
                    <div className="flex gap-2">
                        <button
                            onClick={handleConfirmShip}
                            disabled={saving}
                            className="flex-1 py-2.5 bg-green-700 text-white text-[10px] font-bold uppercase tracking-widest rounded hover:bg-green-800 transition-all">
                            {saving ? "Saving..." : "🚀 Mark as Shipped"}
                        </button>
                        <button
                            onClick={() => setShowTrackingInput(false)}
                            className="px-4 py-2.5 border border-zinc-200 text-zinc-400 text-[10px] font-bold rounded hover:bg-zinc-50">
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Tracking info display (when already shipped) */}
            {order.fulfillment_status === "shipped" && order.tracking_number && (
                <div className="p-3 bg-green-50 border border-green-200 rounded">
                    <AdminLabel text="Tracking Info" />
                    <p className="text-[11px] text-zinc-700 font-medium">
                        {CARRIERS.find(c => c.value === order.carrier)?.label || order.carrier}
                        {" · "}
                        <span className="font-mono font-bold">{order.tracking_number}</span>
                    </p>
                    {order.tracking_url && (
                        <a
                            href={order.tracking_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-green-700 underline hover:text-green-900 mt-1 inline-block">
                            Track Parcel →
                        </a>
                    )}
                </div>
            )}

            {/* Admin Notes */}
            <div>
                <AdminLabel text="Internal Notes (not visible to customer)" />
                <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="e.g. Fragile — bubble wrap. Packed 4 May."
                    rows={2}
                    className={inputCls}
                />
            </div>
        </div>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function OrdersTab() {
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [filterType, setFilterType] = useState<"payment" | "fulfillment">("fulfillment");
    const [statusFilter, setStatusFilter] = useState<string>("all");

    const [isEditing, setIsEditing] = useState<number | null>(null);
    const [editData, setEditData] = useState<any>(null);
    const [saving, setSaving] = useState(false);
    const [fulfillmentSaving, setFulfillmentSaving] = useState<number | null>(null);

    const fetchOrders = async () => {
        try {
            const res = await apiFetch(`${getApiUrl()}/orders`);
            if (res.ok) {
                const data = await res.json();
                setOrders(data);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchOrders(); }, []);

    const handleFulfillmentChange = async (
        orderId: number,
        status: string,
        extra?: { tracking_number?: string; carrier?: string; notes?: string }
    ) => {
        setFulfillmentSaving(orderId);
        try {
            const body: any = { fulfillment_status: status };
            if (extra?.tracking_number) body.tracking_number = extra.tracking_number;
            if (extra?.carrier) body.carrier = extra.carrier;
            if (extra?.notes) body.notes = extra.notes;

            const res = await apiFetch(`${getApiUrl()}/orders/${orderId}/fulfillment`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (res.ok) {
                await fetchOrders();
            }
        } catch (e) {
            console.error(e);
        } finally {
            setFulfillmentSaving(null);
        }
    };

    const handlePatch = async () => {
        if (!editData) return;
        setSaving(true);
        try {
            const res = await apiFetch(`${getApiUrl()}/orders/${editData.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(editData),
            });
            if (res.ok) {
                await fetchOrders();
                setIsEditing(null);
                setEditData(null);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setSaving(false);
        }
    };

    const cancelEditing = () => { setIsEditing(null); setEditData(null); };

    const handleDelete = async (id: number) => {
        if (!confirm("Permanently delete this order? This cannot be undone.")) return;
        try {
            await apiFetch(`${getApiUrl()}/orders/${id}`, { method: "DELETE" });
            setOrders(orders.filter(o => o.id !== id));
            if (expandedId === id) setExpandedId(null);
        } catch (e) {
            console.error(e);
        }
    };

    const sortedOrders = [...orders].sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const filteredOrders = statusFilter === "all"
        ? sortedOrders
        : sortedOrders.filter(o =>
            filterType === "payment"
                ? o.payment_status === statusFilter
                : o.fulfillment_status === statusFilter
        );

    const inputClasses = "w-full bg-zinc-50 border border-zinc-200 p-2.5 text-sm font-sans text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-800 transition-all rounded";

    // Stats
    const paidCount = orders.filter(o => o.payment_status === "paid" || o.payment_status === "mock_paid").length;
    const shippedCount = orders.filter(o => o.fulfillment_status === "shipped" || o.fulfillment_status === "delivered").length;
    const pendingFulfillment = orders.filter(o => ["confirmed", "print_ordered", "print_received", "packaging"].includes(o.fulfillment_status)).length;

    if (loading) return (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-12 h-12 border-2 border-zinc-200 border-t-zinc-800 rounded-full animate-spin" />
            <p className="font-sans text-[11px] uppercase tracking-[0.2em] text-zinc-400">Loading Order Registry</p>
        </div>
    );

    return (
        <div className="max-w-6xl mx-auto py-8 px-4 font-sans text-zinc-900 min-h-screen">
            <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&display=swap'); .font-serif { font-family: 'DM Serif Display', serif; }`}</style>

            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start gap-6 border-b border-zinc-200 pb-8 mb-8">
                <div>
                    <h1 className="text-5xl font-serif text-zinc-900 leading-tight mb-2">Orders</h1>
                    <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-zinc-400">
                        {orders.length} total · {paidCount} paid · {pendingFulfillment} in progress · {shippedCount} shipped
                    </p>
                </div>

                {/* Filter controls */}
                <div className="flex flex-col gap-3">
                    <div className="flex gap-2">
                        <button
                            onClick={() => { setFilterType("fulfillment"); setStatusFilter("all"); }}
                            className={`px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-full border transition-all ${filterType === "fulfillment" ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-400 border-zinc-200 hover:border-zinc-400"}`}>
                            Fulfillment
                        </button>
                        <button
                            onClick={() => { setFilterType("payment"); setStatusFilter("all"); }}
                            className={`px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-full border transition-all ${filterType === "payment" ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-400 border-zinc-200 hover:border-zinc-400"}`}>
                            Payment
                        </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                        <button
                            onClick={() => setStatusFilter("all")}
                            className={`px-3 py-1 text-[9px] font-bold uppercase tracking-widest rounded border transition-all ${statusFilter === "all" ? "bg-zinc-800 text-white border-zinc-800" : "bg-white text-zinc-400 border-zinc-200 hover:border-zinc-400"}`}>
                            All
                        </button>
                        {(filterType === "fulfillment" ? Object.keys(FULFILLMENT_STATUS_CONFIG) : Object.keys(PAYMENT_STATUS_CONFIG)).map(st => (
                            <button
                                key={st}
                                onClick={() => setStatusFilter(st)}
                                className={`px-3 py-1 text-[9px] font-bold uppercase tracking-widest rounded border transition-all ${statusFilter === st ? "bg-zinc-800 text-white border-zinc-800" : "bg-white text-zinc-400 border-zinc-200 hover:border-zinc-400"}`}>
                                {filterType === "fulfillment" ? FULFILLMENT_STATUS_CONFIG[st]?.label : PAYMENT_STATUS_CONFIG[st]?.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Order List */}
            <div className="space-y-4">
                {filteredOrders.length === 0 ? (
                    <div className="py-24 text-center bg-white border border-zinc-100 rounded-md">
                        <p className="font-serif italic text-zinc-400 text-xl">No orders match this filter.</p>
                    </div>
                ) : (
                    filteredOrders.map(order => {
                        const isExpanded = expandedId === order.id;
                        const isThisEditing = isEditing === order.id;
                        const isFulfillmentSaving = fulfillmentSaving === order.id;
                        const firstItem = order.items?.[0];
                        const thumbnail = firstItem?.artwork?.images?.[0];

                        return (
                            <div key={order.id}
                                className={`bg-white border transition-all duration-300 overflow-hidden ${isExpanded ? "border-zinc-300 shadow-xl ring-1 ring-zinc-100" : "border-zinc-100 shadow-sm hover:border-zinc-200 hover:shadow-md"}`}>

                                {/* Summary Row */}
                                <button
                                    onClick={() => setExpandedId(isExpanded ? null : order.id)}
                                    className="w-full px-6 py-5 flex flex-col md:flex-row items-center gap-5 text-left">

                                    {/* Thumbnail */}
                                    <div className="relative w-12 h-12 flex-shrink-0">
                                        {thumbnail ? (
                                            <img
                                                src={getImageUrl(thumbnail, "thumb")}
                                                className="w-full h-full object-cover rounded-full border border-zinc-100 shadow-sm"
                                                alt=""
                                            />
                                        ) : (
                                            <div className="w-full h-full bg-zinc-100 rounded-full flex items-center justify-center font-mono text-[10px] text-zinc-400">Ø</div>
                                        )}
                                        {order.items?.length > 1 && (
                                            <span className="absolute -bottom-1 -right-1 bg-zinc-900 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full ring-2 ring-white">
                                                +{order.items.length - 1}
                                            </span>
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                            <span className="font-mono text-[9px] text-zinc-400">#{order.id}</span>
                                            <PaymentBadge status={order.payment_status} />
                                            <FulfillmentBadge status={order.fulfillment_status || "pending"} />
                                        </div>
                                        <h3 className="font-serif text-xl text-zinc-900 truncate">
                                            {order.first_name} {order.last_name}
                                        </h3>
                                        <p className="text-[9px] uppercase tracking-[0.1em] text-zinc-400 font-bold mt-0.5">
                                            {order.items?.map((it: any) => it.artwork?.title || "Artwork").join(" · ")}
                                        </p>
                                    </div>

                                    {/* Right side */}
                                    <div className="flex items-center gap-8">
                                        <div className="text-right hidden lg:block">
                                            <p className="text-[9px] uppercase tracking-widest text-zinc-400 font-bold mb-0.5">Date</p>
                                            <p className="text-[11px] text-zinc-600 font-medium">
                                                {new Date(order.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                                            </p>
                                        </div>
                                        <div className="text-right min-w-[90px]">
                                            <p className="text-[9px] uppercase tracking-widest text-zinc-400 font-bold mb-0.5">Total</p>
                                            <p className="text-xl font-bold text-zinc-900">${order.total_price}</p>
                                        </div>
                                        <div className={`transition-transform duration-300 text-zinc-300 ${isExpanded ? "rotate-180" : ""}`}>
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                                <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        </div>
                                    </div>
                                </button>

                                {/* Expanded Detail */}
                                {isExpanded && (
                                    <div className="px-6 py-8 bg-zinc-50/60 border-t border-zinc-100">
                                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">

                                            {/* Column 1: Customer + Items */}
                                            <div className="space-y-8">
                                                <div>
                                                    <AdminLabel text="Customer" />
                                                    {isThisEditing ? (
                                                        <div className="space-y-2">
                                                            <div className="grid grid-cols-2 gap-2">
                                                                <input className={inputClasses} value={editData.first_name || ""} onChange={e => setEditData({ ...editData, first_name: e.target.value })} placeholder="First Name" />
                                                                <input className={inputClasses} value={editData.last_name || ""} onChange={e => setEditData({ ...editData, last_name: e.target.value })} placeholder="Last Name" />
                                                            </div>
                                                            <input className={inputClasses} value={editData.email || ""} onChange={e => setEditData({ ...editData, email: e.target.value })} placeholder="Email" />
                                                            <input className={inputClasses} value={editData.phone || ""} onChange={e => setEditData({ ...editData, phone: e.target.value })} placeholder="Phone" />
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-0.5">
                                                            <p className="font-serif text-lg text-zinc-900">{order.first_name} {order.last_name}</p>
                                                            <p className="text-xs text-zinc-500">{order.email}</p>
                                                            <p className="text-xs text-zinc-400">{order.phone}</p>
                                                        </div>
                                                    )}
                                                </div>

                                                <div>
                                                    <AdminLabel text="Items Ordered" />
                                                    <div className="space-y-2">
                                                        {(order.items || []).map((item: any, idx: number) => (
                                                            <div key={idx} className="flex gap-3 p-3 bg-white border border-zinc-100 rounded">
                                                                {item.artwork?.images?.[0] && (
                                                                    <img
                                                                        src={getImageUrl(item.artwork.images[0], "thumb")}
                                                                        className="w-10 h-10 object-cover rounded border border-zinc-50 flex-shrink-0"
                                                                        alt=""
                                                                    />
                                                                )}
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="text-[12px] font-bold text-zinc-900 truncate">{item.artwork?.title || "Untitled"}</p>
                                                                    <p className="text-[9px] text-zinc-400 uppercase tracking-wider">
                                                                        {item.edition_type === "original" ? "Original" : "Print"}
                                                                        {item.size ? ` · ${item.size}` : ""}
                                                                        {item.finish ? ` · ${item.finish}` : ""}
                                                                    </p>
                                                                </div>
                                                                <p className="text-[12px] font-bold text-zinc-900 flex-shrink-0">${item.price}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                <div>
                                                    <AdminLabel text="Shipping Address" />
                                                    {isThisEditing ? (
                                                        <div className="space-y-2">
                                                            <input className={inputClasses} value={editData.shipping_address_line1 || ""} onChange={e => setEditData({ ...editData, shipping_address_line1: e.target.value })} placeholder="Street" />
                                                            <input className={inputClasses} value={editData.shipping_address_line2 || ""} onChange={e => setEditData({ ...editData, shipping_address_line2: e.target.value })} placeholder="Apt / Suite" />
                                                            <div className="grid grid-cols-2 gap-2">
                                                                <input className={inputClasses} value={editData.shipping_city || ""} onChange={e => setEditData({ ...editData, shipping_city: e.target.value })} placeholder="City" />
                                                                <input className={inputClasses} value={editData.shipping_postal_code || ""} onChange={e => setEditData({ ...editData, shipping_postal_code: e.target.value })} placeholder="Postal" />
                                                            </div>
                                                            <input className={inputClasses} value={editData.shipping_country || ""} onChange={e => setEditData({ ...editData, shipping_country: e.target.value })} placeholder="Country" />
                                                        </div>
                                                    ) : (
                                                        <div className="text-[12px] text-zinc-600 space-y-0.5">
                                                            {order.shipping_address_line1 ? (
                                                                <>
                                                                    <p className="text-zinc-800 font-medium">{order.shipping_address_line1}</p>
                                                                    {order.shipping_address_line2 && <p className="text-zinc-500">{order.shipping_address_line2}</p>}
                                                                    <p>{order.shipping_city}{order.shipping_postal_code ? `, ${order.shipping_postal_code}` : ""}</p>
                                                                    <p className="uppercase text-[9px] tracking-widest text-zinc-400 font-bold pt-0.5">
                                                                        {order.shipping_country} {order.shipping_country_code ? `(${order.shipping_country_code})` : ""}
                                                                    </p>
                                                                    {order.shipping_notes && (
                                                                        <div className="mt-3 p-3 bg-white border border-zinc-100 rounded italic text-zinc-500 text-[11px]">
                                                                            "{order.shipping_notes}"
                                                                        </div>
                                                                    )}
                                                                </>
                                                            ) : (
                                                                <p className="italic text-zinc-300">No shipping address.</p>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Column 2: Fulfillment Pipeline + Timeline */}
                                            <div className="space-y-8">
                                                <FulfillmentPipeline
                                                    order={order}
                                                    onStatusChange={(status, extra) => handleFulfillmentChange(order.id, status, extra)}
                                                    saving={isFulfillmentSaving}
                                                />
                                                <OrderTimeline order={order} />
                                            </div>

                                            {/* Column 3: Payment + Actions */}
                                            <div className="space-y-8">
                                                <div>
                                                    <AdminLabel text="Payment Status" />
                                                    <select
                                                        value={isThisEditing ? editData.payment_status : order.payment_status}
                                                        onChange={e => isThisEditing ? setEditData({ ...editData, payment_status: e.target.value }) : null}
                                                        disabled={!isThisEditing}
                                                        className={`w-full bg-white border border-zinc-200 text-[10px] font-bold uppercase tracking-widest px-4 py-3 rounded appearance-none ${!isThisEditing ? "opacity-60 cursor-default" : "cursor-pointer hover:border-zinc-400 focus:ring-1 focus:ring-zinc-800"}`}>
                                                        <option value="pending">Pending</option>
                                                        <option value="awaiting_payment">Awaiting Payment</option>
                                                        <option value="paid">Paid</option>
                                                        <option value="mock_paid">Mock Paid</option>
                                                        <option value="failed">Failed</option>
                                                        <option value="refunded">Refunded</option>
                                                        <option value="hold">Hold</option>
                                                    </select>
                                                </div>

                                                {order.invoice_id && (
                                                    <div>
                                                        <AdminLabel text="Monobank Invoice ID" />
                                                        <p className="font-mono text-[10px] text-zinc-400 bg-zinc-100 p-2 rounded truncate">{order.invoice_id}</p>
                                                        {order.payment_url && (
                                                            <a href={order.payment_url} target="_blank" rel="noopener noreferrer"
                                                                className="text-[10px] text-zinc-500 underline hover:text-zinc-800 mt-1 inline-block">
                                                                Payment URL →
                                                            </a>
                                                        )}
                                                    </div>
                                                )}

                                                {order.promo_code && (
                                                    <div>
                                                        <AdminLabel text="Promo Code" />
                                                        <p className="font-mono text-sm text-zinc-700">{order.promo_code}</p>
                                                    </div>
                                                )}

                                                {order.discovery_source && (
                                                    <div>
                                                        <AdminLabel text="Discovery Source" />
                                                        <p className="text-[12px] text-zinc-600">{order.discovery_source}</p>
                                                    </div>
                                                )}

                                                {/* Edit / Delete Actions */}
                                                <div className="pt-6 border-t border-zinc-200 space-y-3">
                                                    {isThisEditing ? (
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <button
                                                                onClick={handlePatch}
                                                                disabled={saving}
                                                                className="bg-zinc-900 text-white font-bold text-[10px] uppercase tracking-[0.2em] py-3 rounded shadow hover:bg-black transition-all">
                                                                {saving ? "Saving..." : "Save Changes"}
                                                            </button>
                                                            <button
                                                                onClick={cancelEditing}
                                                                className="bg-white border border-zinc-200 text-zinc-400 font-bold text-[10px] uppercase tracking-[0.2em] py-3 rounded hover:bg-zinc-50">
                                                                Cancel
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <button
                                                                onClick={() => { setEditData({ ...order }); setIsEditing(order.id); }}
                                                                className="w-full bg-zinc-900 text-white font-bold text-[10px] uppercase tracking-[0.2em] py-3 rounded shadow hover:shadow-lg hover:bg-black transition-all">
                                                                Edit Order Data
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(order.id)}
                                                                className="w-full text-zinc-300 hover:text-red-700 font-bold text-[9px] uppercase tracking-[0.2em] py-1.5 transition-colors">
                                                                Delete Permanently
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
