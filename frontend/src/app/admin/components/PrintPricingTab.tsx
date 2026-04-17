"use client";

import { useState, useEffect } from "react";
import { getApiUrl, apiFetch } from "@/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type PrintType = "canvas" | "canvas_limited" | "paper" | "paper_limited";

const PRINT_TYPE_LABELS: Record<PrintType, string> = {
    canvas: "Canvas Print",
    canvas_limited: "Canvas Print — Limited Edition",
    paper: "Paper Print",
    paper_limited: "Paper Print — Limited Edition",
};

const PRINT_TYPE_COLORS: Record<PrintType, string> = {
    canvas: "#4B6FA5",
    canvas_limited: "#7B5E8A",
    paper: "#5A855A",
    paper_limited: "#A0704E",
};

interface PricingRow {
    id: number;
    print_type: PrintType;
    size_label: string;
    price: number;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AddRowForm({
    printType,
    onAdd,
}: {
    printType: PrintType;
    onAdd: (row: PricingRow) => void;
}) {
    const [sizeLabel, setSizeLabel] = useState("");
    const [price, setPrice] = useState("");
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!sizeLabel.trim() || !price || Number(price) <= 0) return;

        setSaving(true);
        try {
            const res = await apiFetch(`${getApiUrl()}/print-pricing`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ print_type: printType, size_label: sizeLabel.trim(), price: Number(price) }),
            });
            if (res.ok) {
                const created: PricingRow = await res.json();
                onAdd(created);
                setSizeLabel("");
                setPrice("");
            } else {
                alert("Failed to add row");
            }
        } catch {
            alert("Network error");
        } finally {
            setSaving(false);
        }
    };

    const inp = "bg-white border border-gray-200 rounded-md px-3 py-2 text-sm text-[#31323E] focus:outline-none focus:border-[#31323E] focus:ring-1 focus:ring-black placeholder-gray-400 transition-all";

    return (
        <form onSubmit={handleSubmit} className="flex gap-3 items-end mt-3">
            <div className="flex-1">
                <label className="block text-[10px] uppercase font-mono text-zinc-500 tracking-widest mb-1">Size Label</label>
                <input
                    value={sizeLabel}
                    onChange={e => setSizeLabel(e.target.value)}
                    className={inp}
                    placeholder='e.g. "30×40 cm"'
                    style={{ width: "100%" }}
                />
            </div>
            <div style={{ width: "110px" }}>
                <label className="block text-[10px] uppercase font-mono text-zinc-500 tracking-widest mb-1">Price ($)</label>
                <input
                    type="number"
                    min={1}
                    value={price}
                    onChange={e => setPrice(e.target.value)}
                    className={inp}
                    style={{ width: "100%" }}
                />
            </div>
            <button
                type="submit"
                disabled={saving || !sizeLabel.trim() || !price}
                className="px-4 py-2 bg-[#31323E] text-white rounded-md font-mono text-xs uppercase tracking-widest disabled:opacity-40 hover:bg-[#434455] transition-colors whitespace-nowrap"
            >
                {saving ? "..." : "+ Add"}
            </button>
        </form>
    );
}

function PricingSection({
    printType,
    rows,
    onRowAdded,
    onRowDeleted,
    onRowUpdated,
}: {
    printType: PrintType;
    rows: PricingRow[];
    onRowAdded: (row: PricingRow) => void;
    onRowDeleted: (id: number) => void;
    onRowUpdated: (row: PricingRow) => void;
}) {
    const color = PRINT_TYPE_COLORS[printType];
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editSize, setEditSize] = useState("");
    const [editPrice, setEditPrice] = useState("");

    const handleStartEdit = (row: PricingRow) => {
        setEditingId(row.id);
        setEditSize(row.size_label);
        setEditPrice(String(row.price));
    };

    const handleSaveEdit = async (id: number) => {
        if (!editSize.trim() || !editPrice || Number(editPrice) <= 0) return;
        try {
            const res = await apiFetch(`${getApiUrl()}/print-pricing/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ size_label: editSize.trim(), price: Number(editPrice) }),
            });
            if (res.ok) {
                const updated: PricingRow = await res.json();
                onRowUpdated(updated);
                setEditingId(null);
            }
        } catch { /**/ }
    };

    const handleDelete = async (id: number) => {
        if (!confirm("Delete this pricing entry?")) return;
        const res = await apiFetch(`${getApiUrl()}/print-pricing/${id}`, { method: "DELETE" });
        if (res.ok || res.status === 204) onRowDeleted(id);
    };

    const inp = "bg-white border border-gray-200 rounded-md px-2 py-1 text-sm text-[#31323E] focus:outline-none focus:border-[#31323E]";

    return (
        <div className="border border-gray-100 rounded-xl overflow-hidden shadow-sm mb-6">
            {/* Section header */}
            <div className="flex items-center gap-3 px-6 py-4" style={{ backgroundColor: color + "10", borderBottom: `2px solid ${color}30` }}>
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                <h3 className="font-serif italic text-lg text-[#31323E]">{PRINT_TYPE_LABELS[printType]}</h3>
                <span className="ml-auto font-mono text-xs text-zinc-400 uppercase tracking-widest">{rows.length} size{rows.length !== 1 ? "s" : ""}</span>
            </div>

            {/* Rows table */}
            <div className="bg-white">
                {rows.length === 0 ? (
                    <p className="px-6 py-4 text-zinc-400 font-mono text-xs italic">No pricing defined yet. Add sizes below.</p>
                ) : (
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-gray-50">
                                <th className="text-left px-6 py-2 font-mono text-[10px] uppercase tracking-widest text-zinc-400">Size</th>
                                <th className="text-left px-6 py-2 font-mono text-[10px] uppercase tracking-widest text-zinc-400">Price</th>
                                <th className="px-6 py-2" />
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(row => (
                                <tr key={row.id} className="border-b border-gray-50 last:border-none group hover:bg-zinc-50 transition-colors">
                                    <td className="px-6 py-3">
                                        {editingId === row.id ? (
                                            <input value={editSize} onChange={e => setEditSize(e.target.value)} className={inp} style={{ width: "140px" }} />
                                        ) : (
                                            <span className="text-sm text-[#31323E] font-medium">{row.size_label}</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-3">
                                        {editingId === row.id ? (
                                            <input type="number" min={1} value={editPrice} onChange={e => setEditPrice(e.target.value)} className={inp} style={{ width: "80px" }} />
                                        ) : (
                                            <span className="font-mono text-sm font-semibold text-[#31323E]">${row.price}</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-3">
                                        <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                            {editingId === row.id ? (
                                                <>
                                                    <button onClick={() => handleSaveEdit(row.id)} className="px-3 py-1 bg-[#31323E] text-white rounded font-mono text-xs hover:bg-[#434455]">Save</button>
                                                    <button onClick={() => setEditingId(null)} className="px-3 py-1 bg-gray-100 text-gray-600 rounded font-mono text-xs hover:bg-gray-200">Cancel</button>
                                                </>
                                            ) : (
                                                <>
                                                    <button onClick={() => handleStartEdit(row)} className="px-3 py-1 bg-zinc-100 text-[#31323E] rounded font-mono text-xs hover:bg-zinc-200">Edit</button>
                                                    <button onClick={() => handleDelete(row.id)} className="px-3 py-1 bg-red-50 text-red-500 rounded font-mono text-xs hover:bg-red-100">Delete</button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                <div className="px-6 pb-5 pt-2 border-t border-gray-50">
                    <AddRowForm printType={printType} onAdd={onRowAdded} />
                </div>
            </div>
        </div>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PrintPricingTab() {
    const [rows, setRows] = useState<PricingRow[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchPricing = async () => {
        setLoading(true);
        try {
            const res = await apiFetch(`${getApiUrl()}/print-pricing`);
            if (res.ok) {
                const data = await res.json();
                setRows(data);
            }
        } catch { /**/ } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchPricing(); }, []);

    const handleAdded = (row: PricingRow) => setRows(prev => [...prev, row]);
    const handleDeleted = (id: number) => setRows(prev => prev.filter(r => r.id !== id));
    const handleUpdated = (updated: PricingRow) =>
        setRows(prev => prev.map(r => r.id === updated.id ? updated : r));

    const rowsByType = (type: PrintType) =>
        rows.filter(r => r.print_type === type).sort((a, b) => a.price - b.price);

    if (loading) return <div className="text-zinc-500 font-mono text-sm tracking-widest animate-pulse">Loading pricing grid...</div>;

    return (
        <div className="space-y-2 text-[#31323E]">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h2 className="text-3xl font-serif italic text-[#31323E]">Print Pricing</h2>
                    <p className="text-zinc-500 font-mono text-xs uppercase tracking-widest mt-1">
                        Size → price grid applied to all artworks with the corresponding print type enabled
                    </p>
                </div>
                <div className="bg-zinc-50 border border-zinc-200 rounded-xl px-5 py-3 text-center">
                    <div className="font-mono text-2xl font-bold text-[#31323E]">{rows.length}</div>
                    <div className="font-mono text-[10px] text-zinc-400 uppercase tracking-widest">Total entries</div>
                </div>
            </div>

            {(["canvas", "canvas_limited", "paper", "paper_limited"] as PrintType[]).map(type => (
                <PricingSection
                    key={type}
                    printType={type}
                    rows={rowsByType(type)}
                    onRowAdded={handleAdded}
                    onRowDeleted={handleDeleted}
                    onRowUpdated={handleUpdated}
                />
            ))}
        </div>
    );
}
