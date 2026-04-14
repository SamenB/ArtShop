"use client";

/**
 * Orders Management Tab — Premium Editorial Overhaul.
 * Features a high-fidelity light theme, visual artwork miniatures, 
 * and clear product type classification.
 */

import { useState, useEffect } from "react";
import { getApiUrl, apiFetch, getImageUrl } from "@/utils";

/** Premium status configuration with soft, readable colors. */
const STATUS_CONFIG: Record<string, { bg: string; border: string; text: string; label: string }> = {
    paid: { bg: "#f0fdf4", border: "#bcf0da", text: "#166534", label: "Paid" },
    pending: { bg: "#fffbeb", border: "#fde68a", text: "#92400e", label: "Pending" },
    awaiting_payment: { bg: "#fffbeb", border: "#fde68a", text: "#92400e", label: "Awaiting" },
    processing: { bg: "#eff6ff", border: "#bfdbfe", text: "#1e40af", label: "Processing" },
    failed: { bg: "#fef2f2", border: "#fecaca", text: "#991b1b", label: "Failed" },
    refunded: { bg: "#faf5ff", border: "#e9d5ff", text: "#6b21a8", label: "Refunded" },
    mock_paid: { bg: "#f0fdf4", border: "#bcf0da", text: "#166534", label: "Paid (MCK)" },
    hold: { bg: "#f8fafc", border: "#e2e8f0", text: "#475569", label: "On Hold" },
};

function StatusBadge({ status }: { status: string }) {
    const config = STATUS_CONFIG[status] || { bg: "#f8fafc", border: "#e2e8f0", text: "#64748b", label: status };
    return (
        <span className="inline-block px-3 py-1 rounded-sm text-[10px] font-sans font-bold uppercase tracking-widest border"
            style={{ backgroundColor: config.bg, borderColor: config.border, color: config.text }}>
            {config.label}
        </span>
    );
}

/** Determines the user-friendly product type label. */
const getProductTypeLabel = (item: any) => {
    if (item.edition_type === "original") return "Original Artwork";
    if (item.edition_type === "print") {
        const f = item.finish?.toLowerCase() || "";
        if (f.includes("canvas")) return "Canvas Print";
        if (f.includes("paper")) return "Fine Art Paper";
        return "Digital Print";
    }
    return item.edition_type || "Item";
};

/** Categorized label for editorial layout. */
function AdminLabel({ text }: { text: string }) {
    return (
        <p className="text-[10px] uppercase font-sans text-zinc-400 tracking-[0.2em] mb-2 font-bold leading-none">
            {text}
        </p>
    );
}

export default function OrdersTab() {
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>("all");
    
    const [isEditing, setIsEditing] = useState<number | null>(null);
    const [editData, setEditData] = useState<any>(null);
    const [saving, setSaving] = useState(false);

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
                setOrders(orders.map(o => o.id === editData.id ? { ...editData } : o));
                setIsEditing(null);
                setEditData(null);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm("Confirm permanent deletion of this order record.")) return;
        try {
            const res = await apiFetch(`${getApiUrl()}/orders/${id}`, { method: "DELETE" });
            if (res.ok) {
                setOrders(orders.filter(o => o.id !== id));
                if (expandedId === id) setExpandedId(null);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const sortedOrders = [...orders].sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const filteredOrders = statusFilter === "all"
        ? sortedOrders
        : sortedOrders.filter(o => o.payment_status === statusFilter);

    const allStatuses = Array.from(new Set(orders.map(o => o.payment_status)));

    if (loading) return (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-12 h-12 border-2 border-zinc-200 border-t-zinc-800 rounded-full animate-spin" />
            <p className="font-sans text-[11px] uppercase tracking-[0.2em] text-zinc-400">Loading Order Records</p>
        </div>
    );

    const inputClasses = "w-full bg-zinc-50 border border-zinc-200 p-2.5 text-sm font-sans text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-800 transition-all rounded";

    return (
        <div className="max-w-6xl mx-auto py-8 px-4 font-sans text-zinc-900 bg-zinc-50 min-h-screen">
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&display=swap');
                .font-serif { font-family: 'DM Serif Display', serif; }
            `}</style>

            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-end gap-6 border-b border-zinc-200 pb-10 mb-10">
                <div className="space-y-2">
                    <h1 className="text-6xl font-serif text-zinc-900 leading-tight">Orders</h1>
                    <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-zinc-400">
                        {orders.length} Entries in Registry
                    </p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => setStatusFilter("all")}
                        className={`px-5 py-2 text-[10px] font-bold uppercase tracking-widest rounded transition-all border ${statusFilter === "all" ? "bg-zinc-900 text-white border-zinc-900 shadow-lg" : "bg-white text-zinc-400 border-zinc-200 hover:border-zinc-400"}`}
                    >
                        Total Archive
                    </button>
                    {allStatuses.map(st => (
                        <button
                            key={st}
                            onClick={() => setStatusFilter(st)}
                            className={`px-5 py-2 text-[10px] font-bold uppercase tracking-widest rounded transition-all border ${statusFilter === st ? "bg-zinc-900 text-white border-zinc-900 shadow-lg" : "bg-white text-zinc-400 border-zinc-200 hover:border-zinc-400"}`}
                        >
                            {st}
                        </button>
                    ))}
                </div>
            </div>

            {/* Order Ledger List */}
            <div className="space-y-6">
                {filteredOrders.length === 0 ? (
                    <div className="py-24 text-center bg-white border border-zinc-100 rounded-md shadow-sm">
                        <p className="font-serif italic text-zinc-400 text-xl">No current records match this criteria.</p>
                    </div>
                ) : (
                    filteredOrders.map(order => {
                        const isExpanded = expandedId === order.id;
                        const isThisEditing = isEditing === order.id;
                        const firstItem = order.items?.[0];
                        const thumbnail = firstItem?.artwork?.images?.[0];

                        return (
                            <div key={order.id} className={`bg-white border transition-all duration-300 overflow-hidden ${isExpanded ? "border-zinc-300 shadow-xl ring-1 ring-zinc-200" : "border-zinc-100 shadow-sm hover:border-zinc-200 hover:shadow-md"}`}>
                                {/* Summary Row */}
                                <button
                                    onClick={() => setExpandedId(isExpanded ? null : order.id)}
                                    className="w-full px-8 py-6 flex flex-col md:flex-row items-center gap-6 text-left"
                                >
                                    {/* Thumbnail Preview */}
                                    <div className="relative w-14 h-14 flex-shrink-0">
                                        {thumbnail ? (
                                            <img 
                                                src={getImageUrl(thumbnail, 'thumb')} 
                                                className="w-full h-full object-cover rounded-full border border-zinc-100 shadow-sm"
                                                alt=""
                                            />
                                        ) : (
                                            <div className="w-full h-full bg-zinc-100 rounded-full flex items-center justify-center font-mono text-[10px] text-zinc-400">
                                                Ø
                                            </div>
                                        )}
                                        {order.items?.length > 1 && (
                                            <span className="absolute -bottom-1 -right-1 bg-zinc-900 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full ring-2 ring-white">
                                                +{order.items.length - 1}
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3 mb-1">
                                            <span className="font-mono text-[10px] text-zinc-400 tracking-tighter">#{order.id}</span>
                                            <StatusBadge status={order.payment_status} />
                                        </div>
                                        <h3 className="font-serif text-2xl text-zinc-900 truncate">
                                            {order.first_name} {order.last_name}
                                        </h3>
                                        <p className="text-[10px] uppercase tracking-[0.1em] text-zinc-400 font-bold mt-1">
                                            {order.items?.map((it: any) => it.artwork?.title || "Artwork").join(" · ")}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-10">
                                        <div className="text-right hidden lg:block">
                                            <AdminLabel text="Acquisition Date" />
                                            <p className="font-sans text-[11px] text-zinc-600 font-medium">{new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                                        </div>
                                        <div className="text-right min-w-[100px]">
                                            <AdminLabel text="Transaction Total" />
                                            <p className="font-sans text-2xl font-bold text-zinc-900">${order.total_price}</p>
                                        </div>
                                        <div className={`transition-transform duration-500 text-zinc-300 ${isExpanded ? "rotate-180" : ""}`}>
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                                <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/>
                                            </svg>
                                        </div>
                                    </div>
                                </button>

                                {/* Detailed View */}
                                {isExpanded && (
                                    <div className="px-8 py-10 bg-zinc-50/50 border-t border-zinc-100 animate-in fade-in duration-500">
                                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-16">
                                            {/* Column 1: Client & Acquisition */}
                                            <div className="space-y-10">
                                                <div>
                                                    <AdminLabel text="Customer Profile" />
                                                    {isThisEditing ? (
                                                        <div className="space-y-3">
                                                            <div className="grid grid-cols-2 gap-2">
                                                                <input className={inputClasses} value={editData.first_name || ""} onChange={e => setEditData({...editData, first_name: e.target.value})} placeholder="First Name" />
                                                                <input className={inputClasses} value={editData.last_name || ""} onChange={e => setEditData({...editData, last_name: e.target.value})} placeholder="Last Name" />
                                                            </div>
                                                            <input className={inputClasses} value={editData.email || ""} onChange={e => setEditData({...editData, email: e.target.value})} placeholder="Email Address" />
                                                            <input className={inputClasses} value={editData.phone || ""} onChange={e => setEditData({...editData, phone: e.target.value})} placeholder="Phone Contact" />
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-1">
                                                            <p className="font-serif text-lg text-zinc-900">{order.first_name} {order.last_name}</p>
                                                            <p className="text-xs text-zinc-500 font-medium">{order.email}</p>
                                                            <p className="text-xs text-zinc-400 tracking-wide">{order.phone}</p>
                                                        </div>
                                                    )}
                                                </div>

                                                <div>
                                                    <AdminLabel text="Artwork Manifest" />
                                                    <div className="space-y-4">
                                                        {(order.items || []).map((item: any, idx: number) => (
                                                            <div key={idx} className="flex gap-4 p-3 bg-white border border-zinc-100 shadow-sm rounded-md">
                                                                <img 
                                                                    src={getImageUrl(item.artwork?.images?.[0], 'thumb')} 
                                                                    className="w-12 h-12 object-cover rounded-sm border border-zinc-50" 
                                                                    alt="" 
                                                                />
                                                                <div className="flex-1">
                                                                    <p className="text-[12px] font-bold text-zinc-900 leading-none mb-1">{item.artwork?.title || "Untitled"}</p>
                                                                    <div className="flex flex-wrap gap-2 items-center">
                                                                        <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 bg-zinc-100 text-zinc-600 font-bold rounded">
                                                                            {getProductTypeLabel(item)}
                                                                        </span>
                                                                        <span className="text-[9px] text-zinc-400 font-medium">
                                                                            {item.size} · {item.finish}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                                <p className="text-xs font-bold text-zinc-900">${item.price}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Column 2: Fulfillment */}
                                            <div className="space-y-10">
                                                <div>
                                                    <AdminLabel text="Delivery Destination" />
                                                    {isThisEditing ? (
                                                        <div className="space-y-3">
                                                            <input className={inputClasses} value={editData.shipping_address_line1 || ""} onChange={e => setEditData({...editData, shipping_address_line1: e.target.value})} placeholder="Street Address" />
                                                            <input className={inputClasses} value={editData.shipping_address_line2 || ""} onChange={e => setEditData({...editData, shipping_address_line2: e.target.value})} placeholder="Room / Suite" />
                                                            <div className="grid grid-cols-2 gap-2">
                                                                <input className={inputClasses} value={editData.shipping_city || ""} onChange={e => setEditData({...editData, shipping_city: e.target.value})} placeholder="City" />
                                                                <input className={inputClasses} value={editData.shipping_postal_code || ""} onChange={e => setEditData({...editData, shipping_postal_code: e.target.value})} placeholder="Postal Code" />
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-2">
                                                                <input className={inputClasses} value={editData.shipping_country || ""} onChange={e => setEditData({...editData, shipping_country: e.target.value})} placeholder="Country" />
                                                                <input className={inputClasses} value={editData.shipping_country_code || ""} onChange={e => setEditData({...editData, shipping_country_code: e.target.value})} placeholder="Code" maxLength={2} />
                                                            </div>
                                                            <textarea className={inputClasses} value={editData.shipping_notes || ""} onChange={e => setEditData({...editData, shipping_notes: e.target.value})} placeholder="Instructions for Courier" rows={3} />
                                                        </div>
                                                    ) : (
                                                        <div className="text-xs text-zinc-600 space-y-2 leading-relaxed font-medium">
                                                            {order.shipping_address_line1 ? (
                                                                <>
                                                                    <p className="text-zinc-900 text-sm whitespace-pre-wrap">{order.shipping_address_line1}</p>
                                                                    {order.shipping_address_line2 && <p className="text-zinc-500">{order.shipping_address_line2}</p>}
                                                                    <p>{order.shipping_city}, {order.shipping_postal_code}</p>
                                                                    <p className="uppercase tracking-[0.2em] text-[10px] text-zinc-400 font-bold pt-1">{order.shipping_country} ({order.shipping_country_code})</p>
                                                                    {order.shipping_notes && (
                                                                        <div className="mt-4 p-4 bg-white border border-zinc-100 rounded-sm italic text-zinc-500 shadow-sm">
                                                                            <p className="text-[10px] uppercase tracking-widest font-bold text-zinc-300 mb-2 not-italic">Logistics Note</p>
                                                                            "{order.shipping_notes}"
                                                                        </div>
                                                                    )}
                                                                </>
                                                            ) : (
                                                                <p className="italic text-zinc-300 select-none">No shipping data attached.</p>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Column 3: Audit & Control */}
                                            <div className="space-y-10">
                                                <div>
                                                    <AdminLabel text="Metadata Audit" />
                                                    <div className="space-y-6">
                                                        <div>
                                                            <p className="text-[9px] uppercase tracking-widest font-bold text-zinc-400 mb-2">Audit Status</p>
                                                            <select
                                                                value={isThisEditing ? editData.payment_status : order.payment_status}
                                                                onChange={(e) => isThisEditing ? setEditData({...editData, payment_status: e.target.value}) : null}
                                                                disabled={!isThisEditing}
                                                                className={`w-full bg-white border border-zinc-200 text-[10px] font-bold uppercase tracking-widest px-4 py-3 rounded appearance-none shadow-sm ${!isThisEditing ? "opacity-60 cursor-default" : "cursor-pointer hover:border-zinc-400 transition-all focus:ring-1 focus:ring-zinc-800"}`}
                                                            >
                                                                <option value="pending">Pending</option>
                                                                <option value="awaiting_payment">Awaiting Payment</option>
                                                                <option value="processing">Processing</option>
                                                                <option value="paid">Paid</option>
                                                                <option value="mock_paid">Mock Paid</option>
                                                                <option value="failed">Failed</option>
                                                                <option value="refunded">Refunded</option>
                                                                <option value="hold">Hold</option>
                                                            </select>
                                                        </div>

                                                        {order.promo_code && (
                                                            <div>
                                                                <p className="text-[9px] uppercase tracking-widest font-bold text-zinc-400">Marketing Code</p>
                                                                <p className="text-sm font-serif italic text-zinc-800 mt-1">{order.promo_code}</p>
                                                            </div>
                                                        )}

                                                        {(order.invoice_id || isThisEditing) && (
                                                            <div>
                                                                <p className="text-[9px] uppercase tracking-widest font-bold text-zinc-400">External ID</p>
                                                                {isThisEditing ? (
                                                                    <input className={inputClasses + " mt-2"} value={editData.invoice_id || ""} onChange={e => setEditData({...editData, invoice_id: e.target.value})} placeholder="Invoice Reference" />
                                                                ) : (
                                                                    <p className="font-mono text-[10px] text-zinc-400 mt-2 truncate bg-zinc-100 p-2 rounded">{order.invoice_id}</p>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="pt-10 border-t border-zinc-200 space-y-4">
                                                    {isThisEditing ? (
                                                        <div className="grid grid-cols-2 gap-3">
                                                            <button 
                                                                onClick={handlePatch}
                                                                className="bg-zinc-900 text-white font-bold text-[10px] uppercase tracking-[0.2em] py-4 rounded shadow-lg hover:bg-black transition-all"
                                                                disabled={saving}
                                                            >
                                                                {saving ? "Updating..." : "Persist Changes"}
                                                            </button>
                                                            <button 
                                                                onClick={cancelEditing}
                                                                className="bg-white border border-zinc-200 text-zinc-400 font-bold text-[10px] uppercase tracking-[0.2em] py-4 rounded hover:bg-zinc-50 transition-all"
                                                            >
                                                                Cancel
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <button 
                                                                onClick={() => { setEditData({...order}); setIsEditing(order.id); }}
                                                                className="w-full bg-zinc-900 text-white font-bold text-[10px] uppercase tracking-[0.2em] py-4 rounded shadow-lg hover:shadow-xl hover:bg-black transition-all"
                                                            >
                                                                Modify Metadata
                                                            </button>
                                                            <button 
                                                                onClick={() => handleDelete(order.id)}
                                                                className="w-full text-zinc-300 hover:text-red-800 font-bold text-[9px] uppercase tracking-[0.2em] py-2 transition-colors"
                                                            >
                                                                Expunge Record Permanently
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
