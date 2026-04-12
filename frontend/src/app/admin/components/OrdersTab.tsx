"use client";

/**
 * Orders Management Tab.
 * Allows administrators to view the full history of orders with expandable details,
 * including customer info, items, shipping address, and manual status updates.
 */

import { useState, useEffect } from "react";
import { getApiUrl, apiFetch } from "@/utils";

/** Represents an item within an order. */
interface OrderItem {
    id: number;
    artwork_id: number;
    order_id: number;
    edition_type: string;
    finish: string;
    size: string | null;
    price: number;
}

/** Represents a full order record with all details. */
interface Order {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    total_price: number;
    payment_status: string;
    created_at: string;
    invoice_id: string | null;
    shipping_country: string | null;
    shipping_country_code: string | null;
    shipping_state: string | null;
    shipping_city: string | null;
    shipping_address_line1: string | null;
    shipping_address_line2: string | null;
    shipping_postal_code: string | null;
    shipping_phone: string | null;
    shipping_notes: string | null;
    promo_code: string | null;
    newsletter_opt_in: boolean;
    discovery_source: string | null;
    items: OrderItem[];
}

/** Status badge color mapping. */
const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
    paid: { bg: "rgba(34,197,94,0.15)", text: "#22c55e", label: "Paid" },
    pending: { bg: "rgba(250,204,21,0.15)", text: "#eab308", label: "Pending" },
    awaiting_payment: { bg: "rgba(250,204,21,0.15)", text: "#eab308", label: "Awaiting" },
    processing: { bg: "rgba(96,165,250,0.15)", text: "#60a5fa", label: "Processing" },
    failed: { bg: "rgba(239,68,68,0.15)", text: "#ef4444", label: "Failed" },
    refunded: { bg: "rgba(168,85,247,0.15)", text: "#a855f7", label: "Refunded" },
    mock_paid: { bg: "rgba(34,197,94,0.15)", text: "#22c55e", label: "Mock Paid" },
    hold: { bg: "rgba(96,165,250,0.15)", text: "#60a5fa", label: "On Hold" },
};

function StatusBadge({ status }: { status: string }) {
    const config = STATUS_COLORS[status] || { bg: "rgba(255,255,255,0.1)", text: "#999", label: status };
    return (
        <span style={{
            display: "inline-block",
            padding: "0.2rem 0.55rem",
            borderRadius: "999px",
            fontSize: "0.6rem",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            backgroundColor: config.bg,
            color: config.text,
            whiteSpace: "nowrap",
            fontFamily: "monospace",
        }}>
            {config.label}
        </span>
    );
}

/**
 * Main component for the Orders tab in the admin dashboard.
 */
export default function OrdersTab() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>("all");

    /** Fetches the latest list of orders from the API backend. */
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

    useEffect(() => {
        fetchOrders();
    }, []);

    /** Updates the status of an existing order manually. */
    const updateStatus = async (id: number, newStatus: string) => {
        try {
            const res = await apiFetch(`${getApiUrl()}/orders/${id}/status`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ payment_status: newStatus }),
            });
            if (res.ok) {
                setOrders(orders.map(o => o.id === id ? { ...o, payment_status: newStatus } : o));
            } else {
                alert("Failed to update status");
            }
        } catch (e) {
            console.error(e);
        }
    };

    if (loading) return <div className="text-zinc-500 font-mono text-sm tracking-widest animate-pulse">Loading orders...</div>;

    const sortedOrders = [...orders].sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const filteredOrders = statusFilter === "all"
        ? sortedOrders
        : sortedOrders.filter(o => o.payment_status === statusFilter);

    // Gather unique statuses for filter
    const allStatuses = [...new Set(orders.map(o => o.payment_status))];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-serif italic">Orders</h2>
                    <p className="font-mono text-xs text-zinc-500 mt-1">{orders.length} total orders</p>
                </div>

                {/* Status filter */}
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        onClick={() => setStatusFilter("all")}
                        className={`px-3 py-1 text-[10px] font-mono uppercase tracking-widest rounded-full transition-all ${statusFilter === "all" ? "bg-white text-black" : "bg-white/5 text-zinc-400 hover:bg-white/10"}`}
                    >
                        All
                    </button>
                    {allStatuses.map(st => (
                        <button
                            key={st}
                            onClick={() => setStatusFilter(st)}
                            className={`px-3 py-1 text-[10px] font-mono uppercase tracking-widest rounded-full transition-all ${statusFilter === st ? "bg-white text-black" : "bg-white/5 text-zinc-400 hover:bg-white/10"}`}
                        >
                            {st}
                        </button>
                    ))}
                </div>
            </div>

            {/* Orders List */}
            {filteredOrders.length === 0 ? (
                <div className="text-zinc-500 font-mono text-xs py-8 text-center">No orders found.</div>
            ) : (
                <div className="grid grid-cols-1 gap-3">
                    {filteredOrders.map(order => {
                        const isExpanded = expandedId === order.id;
                        return (
                            <div key={order.id} className="border border-white/10 bg-white/[0.03] rounded-lg overflow-hidden transition-all hover:border-white/15">
                                {/* Order Row */}
                                <button
                                    onClick={() => setExpandedId(isExpanded ? null : order.id)}
                                    className="w-full p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-left"
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap mb-1">
                                            <p className="font-mono text-xs text-zinc-500 tracking-widest uppercase">
                                                #{order.id}
                                            </p>
                                            <StatusBadge status={order.payment_status} />
                                            {order.promo_code && (
                                                <span className="text-[10px] font-mono text-amber-400/70 bg-amber-400/10 px-2 py-0.5 rounded-full">
                                                    🏷️ {order.promo_code}
                                                </span>
                                            )}
                                        </div>
                                        <p className="font-sans text-sm text-zinc-200">
                                            {order.first_name} {order.last_name}
                                            <span className="text-zinc-500 ml-2 text-xs">{order.email}</span>
                                        </p>
                                        <p className="font-mono text-[10px] text-zinc-600 mt-0.5">
                                            {new Date(order.created_at).toLocaleString()}
                                            {order.items && ` · ${order.items.length} item${order.items.length !== 1 ? "s" : ""}`}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-4 shrink-0">
                                        <p className="font-serif italic text-xl text-[#EAE5D9]">${order.total_price}</p>
                                        <span
                                            className="text-zinc-500 text-xs transition-transform"
                                            style={{ transform: isExpanded ? "rotate(180deg)" : "none" }}
                                        >
                                            ▼
                                        </span>
                                    </div>
                                </button>

                                {/* Expanded Details */}
                                {isExpanded && (
                                    <div className="border-t border-white/5 p-5 grid grid-cols-1 md:grid-cols-2 gap-6" style={{ animation: "fadeIn 0.2s ease" }}>
                                        {/* Left: Customer + Items */}
                                        <div className="space-y-4">
                                            {/* Contact Info */}
                                            <div>
                                                <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mb-2">Customer</p>
                                                <div className="space-y-1 text-sm text-zinc-300 font-sans">
                                                    <p>{order.first_name} {order.last_name}</p>
                                                    <p className="text-zinc-400">{order.email}</p>
                                                    <p className="text-zinc-400">{order.phone}</p>
                                                </div>
                                            </div>

                                            {/* Items */}
                                            {order.items && order.items.length > 0 && (
                                                <div>
                                                    <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mb-2">Items</p>
                                                    <div className="space-y-1.5">
                                                        {order.items.map((item, idx) => (
                                                            <div key={idx} className="flex justify-between items-center py-1.5 border-b border-white/5 last:border-0 text-sm">
                                                                <div>
                                                                    <p className="text-zinc-200 font-sans">
                                                                        Artwork #{item.artwork_id}
                                                                    </p>
                                                                    <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider">
                                                                        {item.edition_type}
                                                                        {item.size && ` · ${item.size}`}
                                                                        {item.finish && ` · ${item.finish}`}
                                                                    </p>
                                                                </div>
                                                                <p className="text-zinc-300 font-medium">${item.price}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Right: Shipping + Actions */}
                                        <div className="space-y-4">
                                            {/* Shipping Address */}
                                            {order.shipping_address_line1 && (
                                                <div>
                                                    <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mb-2">Shipping Address</p>
                                                    <div className="space-y-0.5 text-sm text-zinc-400 font-sans">
                                                        <p>{order.shipping_address_line1}</p>
                                                        {order.shipping_address_line2 && <p>{order.shipping_address_line2}</p>}
                                                        <p>
                                                            {[order.shipping_city, order.shipping_state, order.shipping_postal_code]
                                                                .filter(Boolean).join(", ")}
                                                        </p>
                                                        <p>{order.shipping_country}</p>
                                                        {order.shipping_phone && (
                                                            <p className="text-zinc-500 text-xs mt-1">📞 {order.shipping_phone}</p>
                                                        )}
                                                        {order.shipping_notes && (
                                                            <p className="text-zinc-500 text-xs mt-1 italic">📝 {order.shipping_notes}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Meta */}
                                            <div className="space-y-2">
                                                {order.invoice_id && (
                                                    <div>
                                                        <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Monobank Invoice</p>
                                                        <p className="font-mono text-xs text-zinc-400">{order.invoice_id}</p>
                                                    </div>
                                                )}

                                                {order.discovery_source && (
                                                    <div>
                                                        <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Discovery</p>
                                                        <p className="font-sans text-xs text-zinc-400">{order.discovery_source}</p>
                                                    </div>
                                                )}

                                                {order.newsletter_opt_in && (
                                                    <p className="font-mono text-[10px] text-zinc-500">📧 Newsletter subscriber</p>
                                                )}
                                            </div>

                                            {/* Status update */}
                                            <div>
                                                <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mb-2">Update Status</p>
                                                <select
                                                    value={order.payment_status}
                                                    onChange={(e) => updateStatus(order.id, e.target.value)}
                                                    className="w-full bg-[#111111] border border-white/20 text-xs font-mono uppercase tracking-widest p-2.5 rounded-lg focus:outline-none focus:border-white/40 text-zinc-200"
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
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
