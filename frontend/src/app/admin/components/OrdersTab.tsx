"use client";

/**
 * Orders Management Tab — Two-Phase Lifecycle Dashboard.
 *
 * Architecture:
 * - Phase 1: Payment (auto-managed by Monobank webhook)
 * - Phase 2: Fulfillment (unlocks after payment confirmed)
 * - Confirmed step is auto-set by the server on payment success
 * - All status changes require confirmation dialogs
 */

import { useState, useEffect } from "react";
import { getApiUrl, apiFetch, getImageUrl } from "@/utils";

// ── Constants ─────────────────────────────────────────────────────────────────

const PAYMENT_STATUSES = [
    { value: "pending",          label: "Pending",         bg: "#fafafa",  border: "#e4e4e7", text: "#71717a", icon: "○" },
    { value: "awaiting_payment", label: "Awaiting Bank",   bg: "#fefce8",  border: "#fde047", text: "#854d0e", icon: "⏳" },
    { value: "processing",       label: "Processing",      bg: "#eff6ff",  border: "#93c5fd", text: "#1d4ed8", icon: "↻" },
    { value: "hold",             label: "On Hold",         bg: "#f8fafc",  border: "#94a3b8", text: "#475569", icon: "⏸" },
    { value: "paid",             label: "Paid",            bg: "#f0fdf4",  border: "#22c55e", text: "#15803d", icon: "✓" },
    { value: "mock_paid",        label: "Mock Paid",       bg: "#f0fdf4",  border: "#86efac", text: "#15803d", icon: "✓" },
    { value: "failed",           label: "Failed",          bg: "#fef2f2",  border: "#fca5a5", text: "#991b1b", icon: "✗" },
    { value: "refunded",         label: "Refunded",        bg: "#faf5ff",  border: "#c4b5fd", text: "#6b21a8", icon: "↩" },
];

const PAYMENT_STATUS_MAP = Object.fromEntries(PAYMENT_STATUSES.map(s => [s.value, s]));

// Full pipeline including auto-confirmed checkpoint
const FULFILLMENT_STEPS = [
    { value: "confirmed",      label: "Confirmed",      icon: "✓",  auto: true,  desc: "Auto-set when payment received" },
    { value: "print_ordered",  label: "Print Ordered",  icon: "🖨", auto: false, desc: "Sent to print studio" },
    { value: "print_received", label: "Print Received", icon: "📦", auto: false, desc: "Artwork back from studio" },
    { value: "packaging",      label: "Packaging",      icon: "📦", auto: false, desc: "Preparing parcel" },
    { value: "shipped",        label: "Shipped",        icon: "🚀", auto: false, desc: "Dispatched with TTN" },
    { value: "delivered",      label: "Delivered",      icon: "✓",  auto: false, desc: "Received by buyer" },
];

const FULFILLMENT_STEP_VALUES = FULFILLMENT_STEPS.map(s => s.value);

const CARRIERS = [
    { value: "nova_poshta", label: "Nova Poshta" },
    { value: "ukrposhta",   label: "Ukrposhta" },
    { value: "dhl",         label: "DHL" },
    { value: "fedex",       label: "FedEx" },
    { value: "ups",         label: "UPS" },
    { value: "meest",       label: "Meest Express" },
];

const PAID_STATUSES = new Set(["paid", "mock_paid"]);

// ── Tiny helpers ──────────────────────────────────────────────────────────────

function SectionLabel({ text }: { text: string }) {
    return (
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-400 mb-3 leading-none">
            {text}
        </p>
    );
}

function PaymentBadge({ status, size = "sm" }: { status: string; size?: "sm" | "lg" }) {
    const cfg = PAYMENT_STATUS_MAP[status] || { bg: "#fafafa", border: "#e4e4e7", text: "#71717a", label: status, icon: "?" };
    const cls = size === "lg"
        ? "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider border-2"
        : "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest border";
    return (
        <span className={cls} style={{ backgroundColor: cfg.bg, borderColor: cfg.border, color: cfg.text }}>
            {cfg.icon} {cfg.label}
        </span>
    );
}

function FulfillmentBadge({ status }: { status: string }) {
    const step = FULFILLMENT_STEPS.find(s => s.value === status);
    const isCancelled = status === "cancelled";
    if (isCancelled) {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest border bg-red-50 border-red-200 text-red-600">
                ✗ Cancelled
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest border bg-zinc-50 border-zinc-200 text-zinc-600">
            {step?.icon || "○"} {step?.label || status}
        </span>
    );
}

// ── Phase 1: Payment ──────────────────────────────────────────────────────────

function PaymentPhase({
    order,
    onPaymentOverride,
    overrideSaving,
}: {
    order: any;
    onPaymentOverride: (status: string) => void;
    overrideSaving: boolean;
}) {
    const [showOverride, setShowOverride] = useState(false);
    const [selectedStatus, setSelectedStatus] = useState(order.payment_status);

    const cfg = PAYMENT_STATUS_MAP[order.payment_status] || PAYMENT_STATUSES[0];
    const isPaid = PAID_STATUSES.has(order.payment_status);
    const isAwaitingOrProcessing = ["awaiting_payment", "processing", "hold"].includes(order.payment_status);

    return (
        <div className="space-y-4">
            {/* Status display */}
            <div
                className="p-4 rounded-xl border-2 flex items-start gap-4"
                style={{ backgroundColor: cfg.bg, borderColor: cfg.border }}
            >
                <span className="text-2xl flex-shrink-0 mt-0.5" style={{ color: cfg.text }}>
                    {cfg.icon}
                </span>
                <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm" style={{ color: cfg.text }}>{cfg.label}</p>
                    {isPaid && (
                        <p className="text-[11px] text-green-700 mt-0.5">Payment confirmed by Monobank ✓</p>
                    )}
                    {isAwaitingOrProcessing && (
                        <p className="text-[11px] text-amber-700 mt-0.5">Waiting for bank confirmation — server is listening</p>
                    )}
                    {order.payment_status === "failed" && (
                        <p className="text-[11px] text-red-700 mt-0.5">Payment declined — fulfillment auto-cancelled</p>
                    )}
                    {order.payment_status === "refunded" && (
                        <p className="text-[11px] text-purple-700 mt-0.5">Payment reversed — fulfillment auto-cancelled</p>
                    )}
                    {order.payment_status === "pending" && (
                        <p className="text-[11px] text-zinc-500 mt-0.5">Payment session not yet initiated</p>
                    )}
                </div>
                {/* Auto badge */}
                <span className="flex-shrink-0 text-[8px] uppercase tracking-wider font-bold bg-white/60 border border-current/20 px-1.5 py-0.5 rounded" style={{ color: cfg.text }}>
                    Auto
                </span>
            </div>

            {/* Invoice info */}
            {order.invoice_id && (
                <div className="bg-zinc-50 border border-zinc-100 rounded-lg p-3 space-y-1.5">
                    <p className="text-[9px] uppercase tracking-widest font-bold text-zinc-400">Monobank Invoice</p>
                    <p className="font-mono text-[10px] text-zinc-500 truncate">{order.invoice_id}</p>
                    {order.payment_url && (
                        <a
                            href={order.payment_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-blue-600 hover:text-blue-800 underline inline-flex items-center gap-1"
                        >
                            Payment URL →
                        </a>
                    )}
                </div>
            )}

            {/* Manual override — danger zone */}
            <div className="border border-amber-200 rounded-xl overflow-hidden">
                <button
                    onClick={() => setShowOverride(!showOverride)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-amber-50 hover:bg-amber-100 transition-colors"
                >
                    <div className="flex items-center gap-2">
                        <span className="text-amber-600 text-sm">⚠️</span>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-amber-700">
                            Manual Payment Override
                        </span>
                    </div>
                    <svg
                        width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        className={`text-amber-500 transition-transform ${showOverride ? "rotate-180" : ""}`}
                    >
                        <path d="M6 9l6 6 6-6" />
                    </svg>
                </button>

                {showOverride && (
                    <div className="px-4 pb-4 pt-3 bg-amber-50/50 space-y-3">
                        <div className="bg-amber-100 border border-amber-300 rounded-lg p-3">
                            <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider mb-1">⚠️ Not recommended</p>
                            <p className="text-[11px] text-amber-700 leading-relaxed">
                                Payment status is automatically managed by the Monobank webhook.
                                Manual changes may conflict with bank data. Only use this if payment was received outside the payment system (e.g. bank transfer, cash).
                            </p>
                        </div>
                        <div className="space-y-2">
                            <p className="text-[9px] uppercase tracking-wider font-bold text-zinc-500">Force Payment Status</p>
                            <div className="grid grid-cols-2 gap-1.5">
                                {PAYMENT_STATUSES.map(s => (
                                    <button
                                        key={s.value}
                                        onClick={() => setSelectedStatus(s.value)}
                                        className={`px-3 py-2 rounded-lg text-[9px] font-bold uppercase tracking-wider border-2 transition-all text-left flex items-center gap-1.5 ${
                                            selectedStatus === s.value
                                                ? "ring-2 ring-offset-1 ring-zinc-800"
                                                : "opacity-60 hover:opacity-100"
                                        }`}
                                        style={{
                                            backgroundColor: s.bg,
                                            borderColor: selectedStatus === s.value ? s.border : "#e4e4e7",
                                            color: s.text,
                                        }}
                                    >
                                        {s.icon} {s.label}
                                    </button>
                                ))}
                            </div>
                            <button
                                onClick={() => {
                                    if (selectedStatus === order.payment_status) return;
                                    if (!window.confirm(
                                        `⚠️ Force payment status to "${selectedStatus}"?\n\nThis overrides the Monobank webhook data. Only do this if you have received payment outside the system.`
                                    )) return;
                                    onPaymentOverride(selectedStatus);
                                    setShowOverride(false);
                                }}
                                disabled={overrideSaving || selectedStatus === order.payment_status}
                                className="w-full py-2.5 bg-amber-700 hover:bg-amber-800 text-white text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {overrideSaving ? "Saving..." : "Apply Override"}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Phase 2: Fulfillment ──────────────────────────────────────────────────────

function FulfillmentPhase({
    order,
    onStatusChange,
    saving,
}: {
    order: any;
    onStatusChange: (status: string, extra?: { tracking_number?: string; carrier?: string; notes?: string }) => void;
    saving: boolean;
}) {
    const [notes, setNotes] = useState(order.notes || "");
    const [trackingNum, setTrackingNum] = useState(order.tracking_number || "");
    const [carrier, setCarrier] = useState(order.carrier || "nova_poshta");
    const [showShipping, setShowShipping] = useState(false);

    const isPaid = PAID_STATUSES.has(order.payment_status);
    const isCancelled = order.fulfillment_status === "cancelled";
    const currentIdx = FULFILLMENT_STEP_VALUES.indexOf(order.fulfillment_status);
    const nextStep = currentIdx >= 0 && currentIdx < FULFILLMENT_STEP_VALUES.length - 1
        ? FULFILLMENT_STEPS[currentIdx + 1]
        : null;

    const inputCls = "w-full bg-white border border-zinc-200 px-3 py-2 text-[12px] font-sans text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-700 rounded-lg";
    const selectCls = `${inputCls} cursor-pointer`;

    const handleAdvance = () => {
        if (!nextStep) return;
        if (nextStep.value === "shipped") { setShowShipping(true); return; }
        if (!window.confirm(`Advance fulfillment to "${nextStep.label}"?`)) return;
        onStatusChange(nextStep.value, { notes: notes || undefined });
    };

    const handleConfirmShip = () => {
        if (!window.confirm(`Mark order as Shipped with carrier "${CARRIERS.find(c => c.value === carrier)?.label}"?`)) return;
        onStatusChange("shipped", {
            tracking_number: trackingNum || undefined,
            carrier: carrier || undefined,
            notes: notes || undefined,
        });
        setShowShipping(false);
    };

    // Not paid yet — locked
    if (!isPaid && !isCancelled) {
        return (
            <div className="rounded-xl border-2 border-dashed border-zinc-200 p-6 text-center">
                <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center mx-auto mb-3">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-400">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                </div>
                <p className="font-bold text-zinc-400 text-sm mb-1">Fulfillment Locked</p>
                <p className="text-[11px] text-zinc-300 leading-relaxed">
                    Awaiting payment confirmation.<br />
                    Will unlock automatically when Monobank confirms payment.
                </p>
            </div>
        );
    }

    // Cancelled
    if (isCancelled) {
        return (
            <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-center">
                <p className="text-red-500 text-sm font-bold mb-1">✗ Order Cancelled</p>
                <p className="text-[11px] text-red-400">
                    {order.payment_status === "failed" || order.payment_status === "refunded"
                        ? "Auto-cancelled due to payment failure. Original artwork released back to inventory."
                        : "This order has been cancelled."}
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-5">

            {/* Pipeline steps rail */}
            <div>
                <SectionLabel text="Fulfillment Steps" />
                <div className="space-y-1.5">
                    {FULFILLMENT_STEPS.map((step, idx) => {
                        const isCurrent = step.value === order.fulfillment_status;
                        const isPast = currentIdx > idx;
                        const isFuture = currentIdx < idx;
                        const isClickable = !step.auto && !saving;

                        return (
                            <button
                                key={step.value}
                                onClick={() => {
                                    if (!isClickable) return;
                                    if (step.value === "shipped") { setShowShipping(true); return; }
                                    if (!window.confirm(`Set fulfillment status to "${step.label}"?`)) return;
                                    onStatusChange(step.value, { notes: notes || undefined });
                                }}
                                disabled={saving || step.auto}
                                title={step.auto ? `Auto-set: ${step.desc}` : step.desc}
                                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border-2 text-left transition-all ${
                                    isCurrent
                                        ? "shadow-md"
                                        : isPast
                                        ? "opacity-80 hover:opacity-100"
                                        : "opacity-35 hover:opacity-60"
                                } ${isClickable && !isCurrent ? "cursor-pointer" : "cursor-default"}`}
                                style={{
                                    backgroundColor: isCurrent
                                        ? "#fff"
                                        : isPast ? "#f8fafc" : "#fff",
                                    borderColor: isCurrent
                                        ? "#1d1d1d"
                                        : isPast ? "#a1a1aa" : "#e4e4e7",
                                    color: isCurrent ? "#1d1d1d" : isPast ? "#52525b" : "#a1a1aa",
                                }}
                            >
                                {/* Step indicator */}
                                <span
                                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 border-2 ${
                                        isCurrent ? "bg-[#31323E] text-white border-[#31323E]"
                                        : isPast ? "bg-zinc-100 text-zinc-600 border-zinc-400"
                                        : "bg-white text-zinc-300 border-zinc-200"
                                    }`}
                                >
                                    {isPast ? "✓" : idx + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[12px] font-bold">{step.icon} {step.label}</span>
                                        {step.auto && (
                                            <span className="text-[8px] uppercase tracking-wider font-bold bg-blue-50 text-blue-500 border border-blue-200 px-1.5 py-0.5 rounded">
                                                Auto
                                            </span>
                                        )}
                                        {isCurrent && (
                                            <span className="text-[8px] uppercase tracking-wider font-bold bg-[#31323E] text-white px-1.5 py-0.5 rounded">
                                                Current
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-[10px] opacity-70 mt-0.5">{step.desc}</p>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Quick advance */}
            {nextStep && !showShipping && (
                <button
                    onClick={handleAdvance}
                    disabled={saving}
                    className="w-full py-3 bg-[#31323E] text-white text-[10px] font-bold uppercase tracking-[0.2em] rounded-lg hover:bg-[#31323E] transition-all shadow-md hover:shadow-lg disabled:opacity-50"
                >
                    {saving ? "Updating..." : `→ Advance to: ${nextStep.label}`}
                </button>
            )}

            {/* Shipping input panel */}
            {showShipping && (
                <div className="p-4 bg-white border-2 border-zinc-200 rounded-xl space-y-3">
                    <SectionLabel text="Shipping Details" />
                    <select value={carrier} onChange={e => setCarrier(e.target.value)} className={selectCls}>
                        {CARRIERS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
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
                            className="flex-1 py-2.5 bg-green-700 text-white text-[10px] font-bold uppercase tracking-widest rounded-lg hover:bg-green-800 transition-all"
                        >
                            {saving ? "Saving..." : "🚀 Mark as Shipped"}
                        </button>
                        <button
                            onClick={() => setShowShipping(false)}
                            className="px-4 py-2.5 border border-zinc-200 text-zinc-400 text-[10px] font-bold rounded-lg hover:bg-zinc-50"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Tracking info (when already shipped) */}
            {order.fulfillment_status === "shipped" && order.tracking_number && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-xl">
                    <SectionLabel text="Tracking Info" />
                    <p className="text-[12px] text-zinc-700 font-medium">
                        {CARRIERS.find(c => c.value === order.carrier)?.label || order.carrier}
                        {" · "}
                        <span className="font-mono font-bold">{order.tracking_number}</span>
                    </p>
                    {order.tracking_url && (
                        <a
                            href={order.tracking_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-green-700 underline hover:text-green-900 mt-1.5 inline-block"
                        >
                            Track Parcel →
                        </a>
                    )}
                </div>
            )}

            {/* Cancel order */}
            {order.fulfillment_status !== "delivered" && (
                <button
                    onClick={() => {
                        if (!window.confirm("Cancel this order? Original artworks will be returned to inventory.")) return;
                        onStatusChange("cancelled");
                    }}
                    disabled={saving}
                    className="w-full text-[9px] uppercase tracking-widest font-bold text-red-300 hover:text-red-600 transition-colors py-1"
                >
                    Cancel Order
                </button>
            )}

            {/* Admin notes */}
            <div>
                <SectionLabel text="Internal Notes (not visible to customer)" />
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

// ── Order Timeline ─────────────────────────────────────────────────────────────

function OrderTimeline({ order }: { order: any }) {
    const steps = [
        { key: "created_at",        label: "Order Placed",   icon: "🛒" },
        { key: "confirmed_at",      label: "Payment & Confirmed", icon: "✓" },
        { key: "print_ordered_at",  label: "Print Ordered",  icon: "🖨" },
        { key: "print_received_at", label: "Print Received", icon: "📦" },
        { key: "shipped_at",        label: "Shipped",        icon: "🚀" },
        { key: "delivered_at",      label: "Delivered",      icon: "🎨" },
    ];

    const activeSteps = steps.filter(s => order[s.key]);
    if (activeSteps.length === 0) return null;

    return (
        <div>
            <SectionLabel text="Order Timeline" />
            <div className="relative pl-6 space-y-4">
                {/* Vertical line */}
                <div className="absolute left-[9px] top-1 bottom-1 w-px bg-zinc-100" />
                {steps.map(step => {
                    const ts = order[step.key];
                    if (!ts) return null;
                    return (
                        <div key={step.key} className="relative flex items-start gap-3">
                            <div className="absolute -left-6 w-4 h-4 rounded-full bg-white border-2 border-zinc-300 flex items-center justify-center text-[8px] flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="text-[11px] font-bold text-zinc-800">{step.label}</p>
                                <p className="text-[10px] text-zinc-400 font-sans">
                                    {new Date(ts).toLocaleString("en-GB", {
                                        day: "2-digit", month: "short", year: "numeric",
                                        hour: "2-digit", minute: "2-digit",
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

// ── Main Component ────────────────────────────────────────────────────────────

export default function OrdersTab() {
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [mainTab, setMainTab] = useState<"active" | "completed" | "advanced">("active");
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [filterType, setFilterType] = useState<"payment" | "fulfillment">("fulfillment");
    const [statusFilter, setStatusFilter] = useState<string>("all");

    const [isEditing, setIsEditing] = useState<number | null>(null);
    const [editData, setEditData] = useState<any>(null);
    const [saving, setSaving] = useState(false);
    const [fulfillmentSaving, setFulfillmentSaving] = useState<number | null>(null);
    const [paymentSaving, setPaymentSaving] = useState<number | null>(null);

    const fetchOrders = async () => {
        try {
            const res = await apiFetch(`${getApiUrl()}/orders`);
            if (res.ok) setOrders(await res.json());
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchOrders(); }, []);

    // ── Handlers ──────────────────────────────────────────────────────────────

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
            if (res.ok) await fetchOrders();
        } catch (e) {
            console.error(e);
        } finally {
            setFulfillmentSaving(null);
        }
    };

    const handlePaymentOverride = async (orderId: number, payment_status: string) => {
        setPaymentSaving(orderId);
        try {
            const res = await apiFetch(`${getApiUrl()}/orders/${orderId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ payment_status }),
            });
            if (res.ok) await fetchOrders();
        } catch (e) {
            console.error("Payment override failed:", e);
        } finally {
            setPaymentSaving(null);
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
            if (res.ok) { await fetchOrders(); setIsEditing(null); setEditData(null); }
        } catch (e) {
            console.error(e);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm("Permanently delete this order? This cannot be undone.\n\nOriginal artworks will be returned to inventory.")) return;
        try {
            await apiFetch(`${getApiUrl()}/orders/${id}`, { method: "DELETE" });
            setOrders(orders.filter(o => o.id !== id));
            if (expandedId === id) setExpandedId(null);
        } catch (e) {
            console.error(e);
        }
    };

    // ── Filtering ─────────────────────────────────────────────────────────────

    const sortedOrders = [...orders].sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const filteredOrders = (() => {
        if (mainTab === "active") {
            return sortedOrders.filter(o => !["delivered", "cancelled"].includes(o.fulfillment_status));
        }
        if (mainTab === "completed") {
            return sortedOrders.filter(o => ["delivered", "cancelled"].includes(o.fulfillment_status));
        }
        if (statusFilter === "all") return sortedOrders;
        return sortedOrders.filter(o =>
            filterType === "payment"
                ? o.payment_status === statusFilter
                : o.fulfillment_status === statusFilter
        );
    })();

    const inputClasses = "w-full bg-zinc-50 border border-zinc-200 p-2.5 text-sm font-sans text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-800 transition-all rounded-lg";

    const paidCount = orders.filter(o => PAID_STATUSES.has(o.payment_status)).length;
    const shippedCount = orders.filter(o => ["shipped", "delivered"].includes(o.fulfillment_status)).length;
    const activeCount = orders.filter(o => !["delivered", "cancelled"].includes(o.fulfillment_status)).length;

    if (loading) return (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-10 h-10 border-2 border-zinc-200 border-t-zinc-800 rounded-full animate-spin" />
            <p className="font-sans text-[11px] uppercase tracking-[0.2em] text-zinc-400">Loading Orders</p>
        </div>
    );

    return (
        <div className="max-w-6xl mx-auto py-8 px-4 font-sans text-[#31323E] min-h-screen">

            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start gap-6 border-b border-zinc-200 pb-8 mb-8">
                <div>
                    <h1 className="text-4xl lg:text-5xl font-serif italic text-[#31323E] leading-tight mb-2">Orders</h1>
                    <p className="text-sm font-semibold uppercase tracking-wider text-gray-500">
                        {orders.length} total · {paidCount} paid · {activeCount} active · {shippedCount} shipped
                    </p>
                </div>

                {/* Filter controls */}
                <div className="flex flex-col gap-3 items-end">
                    <div className="flex bg-zinc-100 p-1.5 rounded-xl w-fit">
                        {(["active", "completed"] as const).map(tab => (
                            <button
                                key={tab}
                                onClick={() => { setMainTab(tab); setShowAdvanced(false); }}
                                className={`px-5 py-2 text-[11px] font-bold uppercase tracking-widest rounded-lg transition-all ${
                                    mainTab === tab ? "bg-white text-[#31323E] shadow-sm" : "text-zinc-500 hover:text-zinc-800"
                                }`}
                            >
                                {tab}
                                {tab === "active" && activeCount > 0 && (
                                    <span className="ml-1.5 bg-[#31323E] text-white text-[8px] px-1.5 py-0.5 rounded-full">
                                        {activeCount}
                                    </span>
                                )}
                            </button>
                        ))}
                        <button
                            onClick={() => { setMainTab("advanced"); setShowAdvanced(!showAdvanced); }}
                            className={`px-4 py-2 text-[11px] font-bold uppercase tracking-widest rounded-lg transition-all flex items-center gap-2 ${
                                mainTab === "advanced" ? "bg-[#31323E] text-white shadow-sm" : "text-zinc-500 hover:text-zinc-800"
                            }`}
                        >
                            Filters
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${showAdvanced ? "rotate-180" : ""}`}>
                                <path d="M6 9l6 6 6-6" />
                            </svg>
                        </button>
                    </div>

                    {mainTab === "advanced" && showAdvanced && (
                        <div className="flex flex-col gap-3 bg-white p-4 rounded-xl border border-zinc-200 shadow-sm">
                            <div className="flex gap-2">
                                {(["fulfillment", "payment"] as const).map(ft => (
                                    <button
                                        key={ft}
                                        onClick={() => { setFilterType(ft); setStatusFilter("all"); }}
                                        className={`px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-full border transition-all ${
                                            filterType === ft ? "bg-[#31323E] text-white border-[#31323E]" : "bg-white text-zinc-400 border-zinc-200 hover:border-zinc-400"
                                        }`}
                                    >
                                        {ft}
                                    </button>
                                ))}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                <button
                                    onClick={() => setStatusFilter("all")}
                                    className={`px-3 py-1 text-[9px] font-bold uppercase tracking-widest rounded border transition-all ${statusFilter === "all" ? "bg-zinc-800 text-white border-zinc-800" : "bg-white text-zinc-400 border-zinc-200 hover:border-zinc-400"}`}
                                >
                                    All
                                </button>
                                {(filterType === "fulfillment"
                                    ? [...FULFILLMENT_STEPS.map(s => s.value), "cancelled", "pending"]
                                    : PAYMENT_STATUSES.map(s => s.value)
                                ).map(st => (
                                    <button
                                        key={st}
                                        onClick={() => setStatusFilter(st)}
                                        className={`px-3 py-1 text-[9px] font-bold uppercase tracking-widest rounded border transition-all ${statusFilter === st ? "bg-zinc-800 text-white border-zinc-800" : "bg-white text-zinc-400 border-zinc-200 hover:border-zinc-400"}`}
                                    >
                                        {filterType === "fulfillment"
                                            ? (FULFILLMENT_STEPS.find(s => s.value === st)?.label || st)
                                            : (PAYMENT_STATUS_MAP[st]?.label || st)}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Order List */}
            <div className="space-y-3 bg-zinc-50/70 p-4 md:p-6 rounded-2xl border border-zinc-100/50">
                {filteredOrders.length === 0 ? (
                    <div className="py-24 text-center bg-white border border-zinc-100 rounded-xl">
                        <p className="font-sans font-medium text-zinc-400 text-sm">No orders match this filter.</p>
                    </div>
                ) : (
                    filteredOrders.map(order => {
                        const isExpanded = expandedId === order.id;
                        const isThisEditing = isEditing === order.id;
                        const isFulfillmentSaving = fulfillmentSaving === order.id;
                        const isPaymentSaving = paymentSaving === order.id;
                        const thumbnail = order.items?.[0]?.artwork?.images?.[0];

                        return (
                            <div
                                key={order.id}
                                className={`bg-white border transition-all duration-300 overflow-hidden rounded-xl ${
                                    isExpanded
                                        ? "border-zinc-300 shadow-xl ring-1 ring-zinc-100"
                                        : "border-zinc-100 shadow-sm hover:border-zinc-200 hover:shadow-md"
                                }`}
                            >
                                {/* Summary Row */}
                                <button
                                    onClick={() => setExpandedId(isExpanded ? null : order.id)}
                                    className="w-full px-5 py-4 flex flex-col md:flex-row items-center gap-4 text-left"
                                >
                                    {/* Thumbnail */}
                                    <div className="relative w-12 h-12 flex-shrink-0">
                                        {thumbnail ? (
                                            <img
                                                src={getImageUrl(thumbnail, "thumb")}
                                                className="w-full h-full object-cover rounded-lg border border-zinc-200 shadow-sm"
                                                alt=""
                                            />
                                        ) : (
                                            <div className="w-full h-full bg-zinc-100 rounded-lg flex items-center justify-center font-mono text-[10px] text-zinc-400">Ø</div>
                                        )}
                                        {order.items?.length > 1 && (
                                            <span className="absolute -bottom-1 -right-1 bg-[#31323E] text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow ring-2 ring-white">
                                                +{order.items.length - 1}
                                            </span>
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                                            <span className="font-mono font-bold text-[10px] text-zinc-400">#{order.id}</span>
                                            <PaymentBadge status={order.payment_status} />
                                            <FulfillmentBadge status={order.fulfillment_status || "pending"} />
                                        </div>
                                        <h3 className="font-sans font-bold text-lg text-[#31323E] truncate leading-tight">
                                            {order.first_name} {order.last_name}
                                        </h3>
                                        <p className="text-[9px] uppercase tracking-[0.1em] text-zinc-400 font-bold mt-0.5 truncate">
                                            {order.items?.map((it: any) => it.artwork?.title || "Artwork").join(" · ")}
                                        </p>
                                    </div>

                                    {/* Right side */}
                                    <div className="flex items-center gap-6">
                                        <div className="text-right hidden lg:block">
                                            <p className="text-[9px] uppercase tracking-wider text-zinc-400 font-bold mb-0.5">Date</p>
                                            <p className="text-[12px] text-zinc-700 font-medium">
                                                {new Date(order.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                                            </p>
                                        </div>
                                        <div className="text-right min-w-[80px]">
                                            <p className="text-[9px] uppercase tracking-wider text-zinc-400 font-bold mb-0.5">Total</p>
                                            <p className="text-xl font-bold text-[#31323E]">${order.total_price}</p>
                                        </div>
                                        <div className={`transition-transform duration-300 text-zinc-300 ${isExpanded ? "rotate-180" : ""}`}>
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                                <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        </div>
                                    </div>
                                </button>

                                {/* Expanded Detail */}
                                {isExpanded && (
                                    <div className="px-5 py-7 bg-zinc-50/50 border-t border-zinc-100">
                                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                                            {/* ── Col 1: Customer + Items + Shipping ── */}
                                            <div className="space-y-7">

                                                {/* Customer */}
                                                <div>
                                                    <SectionLabel text="Customer" />
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
                                                            <p className="font-sans font-bold text-base text-[#31323E]">{order.first_name} {order.last_name}</p>
                                                            <p className="text-xs text-zinc-500">{order.email}</p>
                                                            <p className="text-xs text-zinc-400">{order.phone}</p>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Items */}
                                                <div>
                                                    <SectionLabel text="Items Ordered" />
                                                    <div className="space-y-2">
                                                        {(order.items || []).map((item: any, idx: number) => (
                                                            <div key={idx} className="flex gap-3 p-3 bg-white border border-zinc-100 rounded-xl">
                                                                {item.artwork?.images?.[0] && (
                                                                    <img
                                                                        src={getImageUrl(item.artwork.images[0], "thumb")}
                                                                        className="w-12 h-12 object-cover rounded-lg border border-zinc-100 flex-shrink-0"
                                                                        alt=""
                                                                    />
                                                                )}
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="text-sm font-bold text-[#31323E] truncate">{item.artwork?.title || "Untitled"}</p>
                                                                    <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mt-0.5">
                                                                        {item.edition_type === "original" ? "Original" : "Print"}
                                                                        {item.size ? ` · ${item.size}` : ""}
                                                                        {item.finish ? ` · ${item.finish}` : ""}
                                                                    </p>
                                                                </div>
                                                                <p className="text-sm font-bold text-[#31323E] flex-shrink-0">${item.price}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Shipping Address */}
                                                <div>
                                                    <SectionLabel text="Shipping Address" />
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
                                                                        <div className="mt-2 p-2.5 bg-white border border-zinc-100 rounded-lg italic text-zinc-500 text-[11px]">
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

                                                {/* Discovery */}
                                                {order.discovery_source && (
                                                    <div>
                                                        <SectionLabel text="Discovery Source" />
                                                        <p className="text-[12px] text-zinc-600">{order.discovery_source}</p>
                                                    </div>
                                                )}
                                                {order.promo_code && (
                                                    <div>
                                                        <SectionLabel text="Promo Code" />
                                                        <p className="font-mono text-sm text-zinc-700">{order.promo_code}</p>
                                                    </div>
                                                )}
                                            </div>

                                            {/* ── Col 2: Payment Phase + Fulfillment Phase ── */}
                                            <div className="space-y-7">

                                                {/* Phase 1 — Payment */}
                                                <div>
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <span className="w-5 h-5 rounded-full bg-[#31323E] text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0">1</span>
                                                        <SectionLabel text="Payment Phase" />
                                                    </div>
                                                    <PaymentPhase
                                                        order={order}
                                                        onPaymentOverride={(status) => handlePaymentOverride(order.id, status)}
                                                        overrideSaving={isPaymentSaving}
                                                    />
                                                </div>

                                                {/* Divider */}
                                                <div className="flex items-center gap-3">
                                                    <div className="flex-1 h-px bg-zinc-100" />
                                                    <span className="text-[9px] uppercase tracking-widest text-zinc-300 font-bold flex-shrink-0">→</span>
                                                    <div className="flex-1 h-px bg-zinc-100" />
                                                </div>

                                                {/* Phase 2 — Fulfillment */}
                                                <div>
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <span className={`w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center flex-shrink-0 ${
                                                            PAID_STATUSES.has(order.payment_status)
                                                                ? "bg-[#31323E] text-white"
                                                                : "bg-zinc-200 text-zinc-400"
                                                        }`}>2</span>
                                                        <SectionLabel text="Fulfillment Phase" />
                                                    </div>
                                                    <FulfillmentPhase
                                                        order={order}
                                                        onStatusChange={(status, extra) => handleFulfillmentChange(order.id, status, extra)}
                                                        saving={isFulfillmentSaving}
                                                    />
                                                </div>
                                            </div>

                                            {/* ── Col 3: Timeline + Notes + Admin Actions ── */}
                                            <div className="space-y-7">

                                                <OrderTimeline order={order} />

                                                {/* Edit / Delete Actions */}
                                                <div className="pt-5 border-t border-zinc-200 space-y-3">
                                                    {isThisEditing ? (
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <button
                                                                onClick={handlePatch}
                                                                disabled={saving}
                                                                className="bg-[#31323E] text-white font-bold text-[10px] uppercase tracking-[0.2em] py-3 rounded-lg shadow hover:bg-[#31323E] transition-all disabled:opacity-50"
                                                            >
                                                                {saving ? "Saving..." : "Save Changes"}
                                                            </button>
                                                            <button
                                                                onClick={() => { setIsEditing(null); setEditData(null); }}
                                                                className="bg-white border border-zinc-200 text-zinc-500 font-bold text-[10px] uppercase tracking-[0.2em] py-3 rounded-lg hover:bg-zinc-50"
                                                            >
                                                                Cancel
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <button
                                                                onClick={() => { setEditData({ ...order }); setIsEditing(order.id); }}
                                                                className="w-full bg-[#31323E] text-white font-bold text-[10px] uppercase tracking-[0.2em] py-3 rounded-lg shadow hover:shadow-lg hover:bg-[#31323E] transition-all"
                                                            >
                                                                Edit Order Data
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(order.id)}
                                                                className="w-full bg-red-50 text-red-600 hover:bg-red-600 hover:text-white font-bold text-[10px] uppercase tracking-[0.2em] py-3 rounded-lg border border-red-200 hover:border-red-600 transition-all shadow-sm hover:shadow"
                                                            >
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
