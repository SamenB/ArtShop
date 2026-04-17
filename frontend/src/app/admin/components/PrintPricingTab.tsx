"use client";

/**
 * Print Pricing Tab
 *
 * Redesigned with the Aspect Ratio taxonomy:
 *  ● Left sidebar: list of aspect ratio categories (create / reorder / delete)
 *  ● Right panel: pricing grid for the selected ratio, split by print type (4 columns)
 *
 * Data flow:
 *  GET  /print-pricing/aspect-ratios/with-pricing  → full tree
 *  POST /print-pricing/aspect-ratios               → create ratio
 *  PUT  /print-pricing/aspect-ratios/:id           → update ratio
 *  DEL  /print-pricing/aspect-ratios/:id           → delete ratio + cascade
 *  POST /print-pricing                              → add pricing row
 *  PUT  /print-pricing/:id                         → update row
 *  DEL  /print-pricing/:id                         → delete row
 */

import { useState, useEffect } from "react";
import { getApiUrl, apiFetch } from "@/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PricingRow {
    id: number;
    aspect_ratio_id: number;
    print_type: string;
    size_label: string;
    price: number;
}

interface AspectRatio {
    id: number;
    label: string;
    description: string | null;
    sort_order: number;
    pricing_rows: PricingRow[];
}

const PRINT_TYPES: { key: string; label: string; color: string; badge: string }[] = [
    { key: "canvas",           label: "Canvas Print",                      color: "#DBEAFE", badge: "#1D4ED8" },
    { key: "canvas_limited",   label: "Canvas — Limited Edition",          color: "#EDE9FE", badge: "#6D28D9" },
    { key: "paper",            label: "Paper Print",                       color: "#D1FAE5", badge: "#065F46" },
    { key: "paper_limited",    label: "Paper — Limited Edition",           color: "#FEF3C7", badge: "#92400E" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const inputCls = "w-full border border-[#31323E]/15 rounded-lg px-3 py-2 text-sm text-[#31323E] bg-white font-medium focus:outline-none focus:border-[#31323E]/50 focus:ring-2 focus:ring-[#31323E]/10 placeholder-[#31323E]/30 transition-all";

function SectionLabel({ text }: { text: string }) {
    return (
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#31323E]/40 mb-2.5 leading-none">
            {text}
        </p>
    );
}

// ── Pricing Grid for one aspect ratio ─────────────────────────────────────────

function PricingGrid({
    ratio,
    onRefresh,
}: {
    ratio: AspectRatio;
    onRefresh: () => void;
}) {
    const [addingType, setAddingType] = useState<string | null>(null);
    const [newSize, setNewSize] = useState("");
    const [newPrice, setNewPrice] = useState("");
    const [editRowId, setEditRowId] = useState<number | null>(null);
    const [editSize, setEditSize] = useState("");
    const [editPrice, setEditPrice] = useState("");
    const [saving, setSaving] = useState(false);

    const rowsByType = (type: string) =>
        ratio.pricing_rows.filter(r => r.print_type === type).sort((a, b) => a.price - b.price);

    const handleAdd = async (type: string) => {
        if (!newSize.trim() || !newPrice) return;
        setSaving(true);
        try {
            const res = await apiFetch(`${getApiUrl()}/print-pricing`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    aspect_ratio_id: ratio.id,
                    print_type: type,
                    size_label: newSize.trim(),
                    price: parseInt(newPrice),
                }),
            });
            if (res.ok) {
                setNewSize("");
                setNewPrice("");
                setAddingType(null);
                onRefresh();
            }
        } finally { setSaving(false); }
    };

    const handleEditSave = async (rowId: number) => {
        setSaving(true);
        try {
            const body: any = {};
            if (editSize) body.size_label = editSize;
            if (editPrice) body.price = parseInt(editPrice);
            const res = await apiFetch(`${getApiUrl()}/print-pricing/${rowId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (res.ok) { setEditRowId(null); onRefresh(); }
        } finally { setSaving(false); }
    };

    const handleDelete = async (rowId: number) => {
        if (!window.confirm("Delete this pricing entry?")) return;
        await apiFetch(`${getApiUrl()}/print-pricing/${rowId}`, { method: "DELETE" });
        onRefresh();
    };

    return (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {PRINT_TYPES.map(pt => {
                const rows = rowsByType(pt.key);
                const isAddingThis = addingType === pt.key;
                return (
                    <div key={pt.key} className="rounded-xl border border-[#31323E]/10 overflow-hidden">
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-[#31323E]/8"
                            style={{ backgroundColor: pt.color }}>
                            <span className="text-[11px] font-bold" style={{ color: pt.badge }}>
                                {pt.label}
                            </span>
                            <span className="text-[10px] font-bold text-[#31323E]/40">
                                {rows.length} sizes
                            </span>
                        </div>

                        {/* Rows */}
                        <div className="p-3 space-y-1.5 bg-white">
                            {rows.length === 0 && !isAddingThis && (
                                <p className="text-[11px] text-[#31323E]/25 text-center py-3 font-medium italic">
                                    No sizes yet.
                                </p>
                            )}
                            {rows.map(row => (
                                <div key={row.id}>
                                    {editRowId === row.id ? (
                                        <div className="flex items-center gap-1.5 p-1.5 bg-[#F9F9F8] rounded-lg border border-[#31323E]/10">
                                            <input
                                                value={editSize}
                                                onChange={e => setEditSize(e.target.value)}
                                                placeholder={row.size_label}
                                                className="flex-1 min-w-0 border border-[#31323E]/15 rounded-md px-2 py-1.5 text-[11px] font-medium text-[#31323E] bg-white focus:outline-none focus:border-[#31323E]/40"
                                            />
                                            <input
                                                value={editPrice}
                                                onChange={e => setEditPrice(e.target.value)}
                                                placeholder={String(row.price)}
                                                type="number"
                                                className="w-16 border border-[#31323E]/15 rounded-md px-2 py-1.5 text-[11px] font-medium text-[#31323E] bg-white focus:outline-none focus:border-[#31323E]/40"
                                            />
                                            <button onClick={() => handleEditSave(row.id)} disabled={saving}
                                                className="px-2 py-1.5 bg-[#31323E] text-white text-[9px] font-bold rounded-md hover:bg-[#434455] transition-colors">
                                                ✓
                                            </button>
                                            <button onClick={() => setEditRowId(null)}
                                                className="px-2 py-1.5 bg-[#31323E]/5 text-[#31323E] text-[9px] font-bold rounded-md hover:bg-[#31323E]/10 transition-colors">
                                                ×
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[#31323E]/3 group transition-colors">
                                            <span className="flex-1 text-[12px] font-semibold text-[#31323E]">{row.size_label}</span>
                                            <span className="text-[12px] font-bold text-[#31323E]">${row.price}</span>
                                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => { setEditRowId(row.id); setEditSize(row.size_label); setEditPrice(String(row.price)); }}
                                                    className="px-2 py-1 rounded text-[9px] font-bold bg-[#31323E]/5 text-[#31323E] hover:bg-[#31323E]/15 transition-colors">
                                                    Edit
                                                </button>
                                                <button onClick={() => handleDelete(row.id)}
                                                    className="px-2 py-1 rounded text-[9px] font-bold bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 transition-colors">
                                                    Del
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}

                            {/* Add row inline */}
                            {isAddingThis ? (
                                <div className="flex items-center gap-1.5 p-2 bg-[#31323E]/3 rounded-lg border border-[#31323E]/10 mt-1">
                                    <input
                                        value={newSize}
                                        onChange={e => setNewSize(e.target.value)}
                                        placeholder='Size label (e.g. "40×50 cm")'
                                        className="flex-1 min-w-0 border border-[#31323E]/15 rounded-md px-2 py-1.5 text-[11px] font-medium text-[#31323E] bg-white focus:outline-none focus:border-[#31323E]/40"
                                        onKeyDown={e => e.key === "Enter" && handleAdd(pt.key)}
                                    />
                                    <span className="text-[#31323E]/40 text-sm font-bold">$</span>
                                    <input
                                        value={newPrice}
                                        onChange={e => setNewPrice(e.target.value)}
                                        placeholder="0"
                                        type="number"
                                        min="1"
                                        className="w-16 border border-[#31323E]/15 rounded-md px-2 py-1.5 text-[11px] font-medium text-[#31323E] bg-white focus:outline-none focus:border-[#31323E]/40"
                                        onKeyDown={e => e.key === "Enter" && handleAdd(pt.key)}
                                    />
                                    <button onClick={() => handleAdd(pt.key)} disabled={saving || !newSize.trim() || !newPrice}
                                        className="px-2.5 py-1.5 bg-[#31323E] text-white text-[9px] font-bold rounded-md hover:bg-[#434455] transition-colors disabled:opacity-40">
                                        Add
                                    </button>
                                    <button onClick={() => { setAddingType(null); setNewSize(""); setNewPrice(""); }}
                                        className="px-2 py-1.5 bg-[#31323E]/5 text-[#31323E] text-[9px] font-bold rounded-md hover:bg-[#31323E]/10 transition-colors">
                                        ×
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => { setAddingType(pt.key); setNewSize(""); setNewPrice(""); }}
                                    className="w-full py-2 mt-1 text-[10px] font-bold text-[#31323E]/30 hover:text-[#31323E] hover:bg-[#31323E]/5 rounded-lg transition-colors"
                                >
                                    + Add size
                                </button>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function PrintPricingTab() {
    const [ratios, setRatios] = useState<AspectRatio[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [addingRatio, setAddingRatio] = useState(false);
    const [newLabel, setNewLabel] = useState("");
    const [newDesc, setNewDesc] = useState("");
    const [editingRatioId, setEditingRatioId] = useState<number | null>(null);
    const [editLabel, setEditLabel] = useState("");
    const [editDesc, setEditDesc] = useState("");
    const [saving, setSaving] = useState(false);

    const fetchData = async () => {
        try {
            const res = await apiFetch(`${getApiUrl()}/print-pricing/aspect-ratios/with-pricing`);
            if (res.ok) {
                const data: AspectRatio[] = await res.json();
                setRatios(data);
                // Keep selection if ratio still exists
                if (data.length > 0 && (selectedId === null || !data.find(r => r.id === selectedId))) {
                    setSelectedId(data[0].id);
                }
            }
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchData(); }, []);

    const handleCreateRatio = async () => {
        if (!newLabel.trim()) return;
        setSaving(true);
        try {
            const res = await apiFetch(`${getApiUrl()}/print-pricing/aspect-ratios`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ label: newLabel.trim(), description: newDesc.trim() || null, sort_order: ratios.length }),
            });
            if (res.ok) {
                const created = await res.json();
                setNewLabel("");
                setNewDesc("");
                setAddingRatio(false);
                await fetchData();
                setSelectedId(created.id);
            }
        } finally { setSaving(false); }
    };

    const handleUpdateRatio = async (id: number) => {
        setSaving(true);
        try {
            await apiFetch(`${getApiUrl()}/print-pricing/aspect-ratios/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ label: editLabel.trim(), description: editDesc.trim() || null }),
            });
            setEditingRatioId(null);
            await fetchData();
        } finally { setSaving(false); }
    };

    const handleDeleteRatio = async (id: number) => {
        const ratio = ratios.find(r => r.id === id);
        if (!window.confirm(`Delete aspect ratio "${ratio?.label}"?\n\nAll ${ratio?.pricing_rows.length} pricing rows will be removed.`)) return;
        await apiFetch(`${getApiUrl()}/print-pricing/aspect-ratios/${id}`, { method: "DELETE" });
        if (selectedId === id) setSelectedId(null);
        await fetchData();
    };

    const selectedRatio = ratios.find(r => r.id === selectedId);

    if (loading) {
        return (
            <div className="flex items-center gap-3 py-12">
                <div className="w-5 h-5 border-2 border-[#31323E]/20 border-t-[#31323E] rounded-full animate-spin" />
                <span className="text-sm font-bold text-[#31323E]/40 uppercase tracking-wider">Loading pricing…</span>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto font-sans text-[#31323E]">
            {/* Header */}
            <div className="pb-8 mb-8 border-b border-[#31323E]/8">
                <h2 className="text-2xl font-bold tracking-tight mb-1">Print Pricing</h2>
                <p className="text-sm text-[#31323E]/50 font-medium">
                    Define aspect ratio groups and pricing grids for all four print types.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8 items-start">

                {/* ── Sidebar: Aspect Ratios ── */}
                <div className="space-y-2">
                    <SectionLabel text="Aspect Ratios" />

                    {ratios.length === 0 && !addingRatio && (
                        <div className="py-6 text-center rounded-xl border border-dashed border-[#31323E]/15 bg-[#31323E]/2">
                            <p className="text-xs font-semibold text-[#31323E]/30">No ratios yet.</p>
                        </div>
                    )}

                    {ratios.map(r => (
                        <div key={r.id}>
                            {editingRatioId === r.id ? (
                                <div className="p-3 bg-white border-2 border-[#31323E]/25 rounded-xl space-y-2">
                                    <input
                                        value={editLabel}
                                        onChange={e => setEditLabel(e.target.value)}
                                        className={inputCls}
                                        placeholder='e.g. "3:4"'
                                    />
                                    <input
                                        value={editDesc}
                                        onChange={e => setEditDesc(e.target.value)}
                                        className={inputCls}
                                        placeholder="Description (optional)"
                                    />
                                    <div className="flex gap-1.5">
                                        <button onClick={() => handleUpdateRatio(r.id)} disabled={saving || !editLabel.trim()}
                                            className="flex-1 py-2 bg-[#31323E] text-white text-[10px] font-bold uppercase tracking-wider rounded-lg hover:bg-[#434455] transition-colors disabled:opacity-40">
                                            Save
                                        </button>
                                        <button onClick={() => setEditingRatioId(null)}
                                            className="px-3 py-2 bg-[#31323E]/5 text-[#31323E] text-[10px] font-bold uppercase tracking-wider rounded-lg hover:bg-[#31323E]/10 transition-colors">
                                            ×
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div
                                    onClick={() => setSelectedId(r.id)}
                                    className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all group cursor-pointer ${
                                        selectedId === r.id
                                            ? "bg-[#31323E] border-[#31323E] text-white shadow-md"
                                            : "bg-white border-[#31323E]/10 text-[#31323E] hover:border-[#31323E]/30"
                                    }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <span className="text-sm font-bold">{r.label}</span>
                                            {r.description && (
                                                <p className={`text-[10px] mt-0.5 font-medium truncate ${selectedId === r.id ? "text-white/60" : "text-[#31323E]/40"}`}>
                                                    {r.description}
                                                </p>
                                            )}
                                            <p className={`text-[9px] mt-1 font-bold uppercase tracking-wider ${selectedId === r.id ? "text-white/40" : "text-[#31323E]/30"}`}>
                                                {r.pricing_rows.length} price entries
                                            </p>
                                        </div>
                                        <div className={`flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ${selectedId === r.id ? "opacity-100" : ""}`}>
                                            <button
                                                onClick={e => { e.stopPropagation(); setEditingRatioId(r.id); setEditLabel(r.label); setEditDesc(r.description || ""); }}
                                                className={`p-1 rounded-md text-[9px] font-bold transition-colors ${selectedId === r.id ? "text-white/60 hover:text-white hover:bg-white/10" : "text-[#31323E]/40 hover:text-[#31323E] hover:bg-[#31323E]/8"}`}
                                            >
                                                ✎
                                            </button>
                                            <button
                                                onClick={e => { e.stopPropagation(); handleDeleteRatio(r.id); }}
                                                className={`p-1 rounded-md text-[9px] font-bold transition-colors ${selectedId === r.id ? "text-white/60 hover:text-red-300 hover:bg-white/10" : "text-[#31323E]/30 hover:text-red-500 hover:bg-red-50"}`}
                                            >
                                                ×
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}

                    {/* Add ratio form */}
                    {addingRatio ? (
                        <div className="p-3 bg-white border-2 border-[#31323E]/20 rounded-xl space-y-2">
                            <input
                                value={newLabel}
                                onChange={e => setNewLabel(e.target.value)}
                                className={inputCls}
                                placeholder='Ratio label, e.g. "3:4"'
                                autoFocus
                                onKeyDown={e => e.key === "Enter" && handleCreateRatio()}
                            />
                            <input
                                value={newDesc}
                                onChange={e => setNewDesc(e.target.value)}
                                className={inputCls}
                                placeholder='Description (e.g. "Portrait — A4 family")'
                                onKeyDown={e => e.key === "Enter" && handleCreateRatio()}
                            />
                            <div className="flex gap-1.5">
                                <button onClick={handleCreateRatio} disabled={saving || !newLabel.trim()}
                                    className="flex-1 py-2 bg-[#31323E] text-white text-[10px] font-bold uppercase tracking-wider rounded-lg hover:bg-[#434455] transition-colors disabled:opacity-40">
                                    {saving ? "Creating…" : "Create"}
                                </button>
                                <button onClick={() => { setAddingRatio(false); setNewLabel(""); setNewDesc(""); }}
                                    className="px-3 py-2 bg-[#31323E]/5 text-[#31323E] text-[10px] font-bold uppercase tracking-wider rounded-lg hover:bg-[#31323E]/10 transition-colors">
                                    Cancel
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button
                            onClick={() => setAddingRatio(true)}
                            className="w-full py-2.5 border-2 border-dashed border-[#31323E]/15 rounded-xl text-[11px] font-bold uppercase tracking-wider text-[#31323E]/35 hover:text-[#31323E] hover:border-[#31323E]/30 transition-all"
                        >
                            + Add Ratio
                        </button>
                    )}
                </div>

                {/* ── Main Panel: Pricing Grid ── */}
                <div>
                    {!selectedRatio ? (
                        <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed border-[#31323E]/10 bg-[#31323E]/2">
                            <div className="text-5xl mb-4 opacity-20">📐</div>
                            <p className="text-sm font-semibold text-[#31323E]/30">
                                {ratios.length === 0 ? "Create an aspect ratio to get started." : "Select an aspect ratio from the left."}
                            </p>
                        </div>
                    ) : (
                        <div>
                            {/* Ratio header */}
                            <div className="flex items-start gap-4 mb-6">
                                <div>
                                    <h3 className="text-xl font-bold text-[#31323E]">{selectedRatio.label}</h3>
                                    {selectedRatio.description && (
                                        <p className="text-sm text-[#31323E]/50 font-medium mt-0.5">{selectedRatio.description}</p>
                                    )}
                                </div>
                                <div className="ml-auto text-right">
                                    <p className="text-[10px] uppercase tracking-wider font-bold text-[#31323E]/30">Total Entries</p>
                                    <p className="text-2xl font-bold text-[#31323E] leading-none mt-1">{selectedRatio.pricing_rows.length}</p>
                                </div>
                            </div>

                            <PricingGrid ratio={selectedRatio} onRefresh={fetchData} />
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}
