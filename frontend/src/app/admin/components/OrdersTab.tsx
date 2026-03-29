"use client";
import { useState, useEffect } from "react";

import { getApiUrl } from "@/utils";

interface Order {
    id: number;
    email: string;
    total_price: number;
    payment_status: string;
    created_at: string;
}

export default function OrdersTab() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchOrders = async () => {
        try {
            const res = await fetch(`${getApiUrl()}/orders`, { credentials: "include" });
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

    const updateStatus = async (id: number, newStatus: string) => {
        try {
            const res = await fetch(`${getApiUrl()}/orders/${id}/status`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ payment_status: newStatus }),
                credentials: "include"
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

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-serif italic mb-6">Recent Orders</h2>
            {orders.length === 0 ? (
                <div className="text-zinc-500 font-mono text-xs">No orders found.</div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {orders.sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map(order => (
                        <div key={order.id} className="p-4 border border-white/10 bg-white/5 rounded-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div>
                                <p className="font-mono text-xs text-zinc-500 tracking-widest uppercase mb-1">Order #{order.id} • {new Date(order.created_at).toLocaleDateString()}</p>
                                <p className="font-sans text-sm">{order.email}</p>
                            </div>
                            <div className="flex items-center gap-6">
                                <p className="font-serif italic text-xl">${order.total_price}</p>
                                <select 
                                    value={order.payment_status}
                                    onChange={(e) => updateStatus(order.id, e.target.value)}
                                    className="bg-[#111111] border border-white/20 text-xs font-mono uppercase tracking-widest p-2 rounded-sm focus:outline-none"
                                >
                                    <option value="pending">Pending</option>
                                    <option value="paid">Paid</option>
                                    <option value="mock_paid">Mock Paid</option>
                                    <option value="failed">Failed</option>
                                    <option value="refunded">Refunded</option>
                                </select>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
