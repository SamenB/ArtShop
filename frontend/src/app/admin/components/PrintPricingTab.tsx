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

const PRINT_TYPE_META: Record<PrintType, { color: string; bg: string; border: string; dot: string }> = {
    canvas:         { color: "#1E3A5F", bg: "#EFF4FB", border: "#C5D9EF", dot: "#4B6FA5" },
    canvas_limited: { color: "#4B1B6B", bg: "#F6F0FB", border: "#D9B8F0", dot: "#9B59D0" },
    paper:          { color: "#1A4F2E", bg: "#EFF8F2", border: "#B8DFC6", dot: "#3D9A61" },
    paper_limited:  { color: "#5C2800", bg: "#FBF2EC", border: "#F0CAAB", dot: "#C46A20" },
};

interface PricingRow {
    id: number;
    print_type: PrintType;
    size_label: string;
    price: number;
}

// ── Design Primitives ─────────────────────────────────────────────────────────

const sectionInputCls = "w-full border border-[#31323E]/15 rounded-lg px-3.5 py-2.5 text-sm text-[#31323E] font-medium bg-white focus:outline-none focus:border-[#31323E]/50 focus:ring-2 focus:ring-[#31323E]/10 placeholder-[#31323E]/30 transition-all";

// ── AddRowForm ────────────────────────────────────────────────────────────────

function AddRowForm({ printType, onAdd }: { printType: PrintType; onAdd: (row: PricingRow) => void }) {
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

    return (
        <form onSubmit={handleSubmit} className="flex gap-3 items-end pt-4 border-t border-[#31323E]/8 mt-4">
            <div className="flex-1">
                <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-[#31323E]/50 mb-1.5">Size Label</label>
                <input
                    value={sizeLabel}
                    onChange={e => setSizeLabel(e.target.value)}
                    className={sectionInputCls}
                    placeholder='e.g. "30×40 cm"'
                    style={{ width: "100%" }}
                />
            </div>
            <div style={{ width: "120px" }}>
                <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-[#31323E]/50 mb-1.5">Price ($)</label>
                <input
                    type="number"
                    min={1}
                    value={price}
                    onChange={e => setPrice(e.target.value)}
                    className={sectionInputCls}
                    style={{ width: "100%" }}
                />
            </div>
            <button
                type="submit"
                disabled={saving || !sizeLabel.trim() || !price}
                className="px-5 py-2.5 bg-[#31323E] text-white rounded-lg text-xs font-bold uppercase tracking-wider disabled:opacity-40 hover:bg-[#434455] transition-colors whitespace-nowrap shadow-sm"
            >
                {saving ? "Adding…" : "+ Add"}
            </button>
        </form>
    );
}

// ── PricingSection ────────────────────────────────────────────────────────────

function PricingSection({ printType, rows, onRowAdded, onRowDeleted, onRowUpdated }: {
    printType: PrintType;
    rows: PricingRow[];
    onRowAdded: (row: PricingRow) => void;
    onRowDeleted: (id: number) => void;
    onRowUpdated: (row: PricingRow) => void;
}) {
    const meta = PRINT_TYPE_META[printType];
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

    const editInputCls = "border border-[#31323E]/15 rounded-md px-2.5 py-1.5 text-sm text-[#31323E] focus:outline-none focus:border-[#31323E]/40 bg-white";

    return (
        <div className="rounded-xl overflow-hidden border border-[#31323E]/10 shadow-sm mb-5">
            {/* Section header */}
            <div
                className="flex items-center gap-3 px-6 py-4"
                style={{ backgroundColor: meta.bg, borderBottom: `1px solid ${meta.border}` }}
            >
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: meta.dot }} />
                <div>
                    <h3 className="font-bold text-sm tracking-wide" style={{ color: meta.color }}>
                        {PRINT_TYPE_LABELS[printType]}
                    </h3>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mt-0.5 opacity-60" style={{ color: meta.color }}>
                        {rows.length} size{rows.length !== 1 ? "s" : ""} configured
                    </p>
                </div>
                <span className="ml-auto font-bold text-2xl" style={{ color: meta.dot }}>{rows.length}</span>
            </div>

            {/* Rows table */}
            <div className="bg-white">
                {rows.length === 0 ? (
                    <p className="px-6 py-5 text-sm text-[#31323E]/40 font-medium italic">
                        No pricing defined yet — add a size below.
                    </p>
                ) : (
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-[#31323E]/6">
                                <th className="text-left px-6 py-2.5 text-[10px] font-bold uppercase tracking-[0.15em] text-[#31323E]/40">Size</th>
                                <th className="text-left px-6 py-2.5 text-[10px] font-bold uppercase tracking-[0.15em] text-[#31323E]/40">Price</th>
                                <th className="px-6 py-2.5" />
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(row => (
                                <tr key={row.id} className="border-b border-[#31323E]/5 last:border-none group hover:bg-[#31323E]/2 transition-colors">
                                    <td className="px-6 py-3.5">
                                        {editingId === row.id ? (
                                            <input value={editSize} onChange={e => setEditSize(e.target.value)} className={editInputCls} style={{ width: "160px" }} />
                                        ) : (
                                            <span className="text-sm font-semibold text-[#31323E]">{row.size_label}</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-3.5">
                                        {editingId === row.id ? (
                                            <input type="number" min={1} value={editPrice} onChange={e => setEditPrice(e.target.value)} className={editInputCls} style={{ width: "90px" }} />
                                        ) : (
                                            <span className="font-bold text-sm text-[#31323E]">${row.price}</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-3.5">
                                        <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                            {editingId === row.id ? (
                                                <>
                                                    <button onClick={() => handleSaveEdit(row.id)} className="px-3 py-1.5 bg-[#31323E] text-white rounded-md text-[10px] font-bold uppercase tracking-wider hover:bg-[#434455] transition-colors">Save</button>
                                                    <button onClick={() => setEditingId(null)} className="px-3 py-1.5 bg-[#31323E]/8 text-[#31323E] rounded-md text-[10px] font-bold uppercase tracking-wider hover:bg-[#31323E]/15 transition-colors">Cancel</button>
                                                </>
                                            ) : (
                                                <>
                                                    <button onClick={() => handleStartEdit(row)} className="px-3 py-1.5 bg-[#31323E]/8 text-[#31323E] rounded-md text-[10px] font-bold uppercase tracking-wider hover:bg-[#31323E]/15 transition-colors">Edit</button>
                                                    <button onClick={() => handleDelete(row.id)} className="px-3 py-1.5 bg-red-50 text-red-600 rounded-md text-[10px] font-bold uppercase tracking-wider hover:bg-red-100 transition-colors border border-red-100">Delete</button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                <div className="px-6 pb-5">
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

    if (loading) return (
        <div className="flex items-center gap-3 py-10">
            <div className="w-5 h-5 border-2 border-[#31323E]/20 border-t-[#31323E] rounded-full animate-spin" />
            <span className="text-sm font-semibold text-[#31323E]/50 uppercase tracking-wider">Loading pricing grid…</span>
        </div>
    );

    return (
        <div className="text-[#31323E]">
            {/* Page Header */}
            <div className="flex justify-between items-start mb-8 pb-6 border-b border-[#31323E]/8">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-[#31323E] mb-1">Print Pricing</h2>
                    <p className="text-sm text-[#31323E]/50 font-medium">
                        Size → price grid applied to all artworks with the corresponding print type enabled
                    </p>
                </div>
                <div className="bg-[#31323E] text-white rounded-xl px-5 py-3 text-center shadow-sm min-w-[80px]">
                    <div className="text-2xl font-bold leading-none">{rows.length}</div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-white/60 mt-1">Entries</div>
                </div>
            </div>

            <div className="space-y-0">
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
        </div>
    );
}
