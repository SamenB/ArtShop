"use client";

import { useState, useEffect } from "react";
import { getApiUrl, apiFetch } from "@/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Category { id: number; title: string; accent_color?: string; }
interface Tag      { id: number; title: string; category_id?: number | null; }



// ─── Subcomponents ────────────────────────────────────────────────────────────

function AddTagRow({
    placeholder,
    onAdd,
}: {
    placeholder: string;
    onAdd: (title: string) => Promise<void>;
}) {
    const [value, setValue] = useState("");
    const [busy, setBusy] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!value.trim()) return;
        setBusy(true);
        await onAdd(value.trim());
        setValue("");
        setBusy(false);
    };

    return (
        <form onSubmit={submit} className="flex gap-2 mt-4">
            <input
                type="text"
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder={placeholder}
                className="flex-1 min-w-0 bg-white border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#31323E] focus:ring-1 focus:ring-black text-[#31323E] rounded-md shadow-sm placeholder-gray-400 transition-all text-[13px]"
            />
            <button
                disabled={busy || !value.trim()}
                className="px-5 py-2.5 bg-[#31323E] text-white font-sans text-xs font-bold tracking-wider hover:bg-[#434455] transition-all disabled:opacity-40 rounded-md shadow-sm whitespace-nowrap uppercase"
            >
                {busy ? "Adding…" : "+ Add Tag"}
            </button>
        </form>
    );
}

function TagChip({ label, onDelete }: { label: string; onDelete: () => void }) {
    return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-full text-xs font-sans text-gray-800 font-semibold bg-gray-50 hover:bg-gray-100 hover:border-gray-300 transition-all group">
            {label}
            <button
                onClick={onDelete}
                type="button"
                title="Remove tag"
                className="text-zinc-400 group-hover:text-red-500 transition-colors leading-none ml-1 pb-px"
            >
                ×
            </button>
        </span>
    );
}

function CategoryCard({
    title,
    accent,
    onDelete,
    deleteLabel = "Delete Category",
    children,
}: {
    title: string;
    accent: string;
    onDelete?: () => void;
    deleteLabel?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="border border-gray-200 rounded-xl p-6 bg-white shadow-sm hover:border-gray-300 transition-colors relative group">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                    <span
                        className="inline-block w-2.5 h-2.5 rounded-full ring-2 ring-offset-1 flex-shrink-0"
                        style={{ backgroundColor: accent }}
                    />
                    <h3 className="font-sans text-sm uppercase font-bold tracking-wider text-[#31323E]">
                        {title}
                    </h3>
                </div>
                {onDelete && (
                    <button
                        onClick={onDelete}
                        className="text-red-500 bg-red-50 hover:bg-red-500 hover:text-white px-2 py-1 rounded text-[10px] font-sans font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-all shadow-sm"
                    >
                        {deleteLabel}
                    </button>
                )}
            </div>
            {children}
        </div>
    );
}

// ─── Color palette for auto-assigned category accents ─────────────────────────

const ACCENTS = ["#3b82f6", "#a855f7", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];

// ─── Main component ───────────────────────────────────────────────────────────

export default function LabelsTab() {
    const [categories,   setCategories]   = useState<Category[]>([]);
    const [tags,         setTags]         = useState<Tag[]>([]);
    const [loading,      setLoading]      = useState(true);
    const [newCatName,   setNewCatName]   = useState("");
    const [creatingCat,  setCreatingCat]  = useState(false);

    const api = getApiUrl();

    // ── Fetch all data ──────────────────────────────────────────────────────
    const reload = async () => {
        setLoading(true);
        try {
            const [catR, tagR] = await Promise.all([
                apiFetch(`${api}/labels/categories`),
                apiFetch(`${api}/labels`),
            ]);
            if (catR.ok) setCategories(await catR.json());
            if (tagR.ok) setTags(await tagR.json());
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    useEffect(() => { reload(); }, []);

    // ── Category CRUD ───────────────────────────────────────────────────────
    const createCategory = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newCatName.trim()) return;
        setCreatingCat(true);
        const color = ACCENTS[categories.length % ACCENTS.length];
        const res = await apiFetch(`${api}/labels/categories`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: newCatName.trim(), accent_color: color }),
        });
        setCreatingCat(false);
        if (res.ok) { setNewCatName(""); reload(); }
        else { const e = await res.json(); alert(e.detail || "Failed to create category"); }
    };

    const deleteCategory = async (id: number) => {
        if (!confirm("Delete this category? All tags inside it will also be removed from artworks.")) return;
        await apiFetch(`${api}/labels/categories/${id}`, { method: "DELETE" });
        reload();
    };

    // ── Tag CRUD ────────────────────────────────────────────────────────────
    const addTag = async (title: string, category_id: number) => {
        const res = await apiFetch(`${api}/labels`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, category_id }),
        });
        if (res.ok) reload();
        else { const e = await res.json(); alert(e.detail || "Failed to add tag"); }
    };

    const deleteTag = async (id: number, title: string) => {
        // Fetch usage count first so the admin knows the impact
        let usageNote = "";
        try {
            const r = await apiFetch(`${api}/labels/${id}/usage`);
            if (r.ok) {
                const { artwork_count: n } = await r.json();
                usageNote = n > 0
                    ? `\n\n⚠️ This tag is used by ${n} artwork${n > 1 ? "s" : ""}. All links will be removed.`
                    : "\n\nThis tag is not used by any artwork.";
            }
        } catch {}
        if (!confirm(`Remove tag "${title}"?${usageNote}`)) return;
        await apiFetch(`${api}/labels/${id}`, { method: "DELETE" });
        reload();
    };



    // ── Render ──────────────────────────────────────────────────────────────
    if (loading) return (
        <div className="text-zinc-500 font-mono text-sm tracking-widest animate-pulse">
            Loading taxonomy…
        </div>
    );

    return (
        <div className="max-w-3xl space-y-6 pb-12">

            {/* ── Page header ─────────────────────────────────────────────── */}
            <div className="pb-4 border-b border-gray-100">
                <h2 className="text-3xl font-serif italic text-[#31323E]">Labels &amp; Categorization</h2>
                <p className="text-gray-500 font-sans text-sm mt-1.5 tracking-wide">
                    Organize artworks with <strong>Categories</strong> (e.g. Medium, Style, Collections)
                    and <strong>Tags</strong> inside each one (e.g. Oil, Charcoal, Figurative).
                </p>
            </div>

            {/* ── New Category ─────────────────────────────────────────────── */}
            <form
                onSubmit={createCategory}
                className="flex flex-col sm:flex-row sm:items-center gap-3 bg-[#31323E]/[0.03] border border-[#31323E]/10 rounded-xl px-6 py-5"
            >
                <div className="flex-1">
                    <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1">
                        New Category
                    </p>
                    <input
                        type="text"
                        value={newCatName}
                        onChange={e => setNewCatName(e.target.value)}
                        placeholder="e.g. Medium, Style, Materials, Mood…"
                        className="w-full bg-white border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#31323E] focus:ring-1 focus:ring-black text-[#31323E] rounded-md shadow-sm placeholder-gray-400 transition-all"
                    />
                </div>
                <button
                    disabled={creatingCat || !newCatName.trim()}
                    className="sm:mt-5 px-6 py-2.5 bg-[#31323E] text-white font-sans text-xs font-bold tracking-wider hover:bg-[#434455] transition-all disabled:opacity-40 rounded-md shadow-sm whitespace-nowrap uppercase"
                >
                    {creatingCat ? "Creating…" : "+ Create Category"}
                </button>
            </form>

            {/* ── Dynamic categories (Medium, Style, etc.) ─────────────────── */}
            {categories.length === 0 ? (
                <div className="p-10 border border-dashed border-gray-200 rounded-xl bg-gray-50/50 text-center">
                    <p className="text-sm font-sans text-gray-500">
                        No categories yet. Create your first one above.
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {categories.map((cat, i) => {
                        const catTags = tags.filter(t => t.category_id === cat.id);
                        return (
                            <CategoryCard
                                key={cat.id}
                                title={cat.title}
                                accent={cat.accent_color || ACCENTS[i % ACCENTS.length]}
                                onDelete={() => deleteCategory(cat.id)}
                            >
                                <div className="flex flex-wrap gap-2 min-h-[28px]">
                                    {catTags.map(t => (
                                        <TagChip
                                            key={t.id}
                                            label={t.title}
                                            onDelete={() => deleteTag(t.id, t.title)}
                                        />
                                    ))}
                                    {catTags.length === 0 && (
                                        <span className="text-zinc-400 font-mono text-[11px] italic">
                                            No tags yet
                                        </span>
                                    )}
                                </div>
                                <div className="mt-3 pt-3 border-t border-gray-100">
                                    <AddTagRow
                                        placeholder={`Add ${cat.title.toLowerCase()} tag…`}
                                        onAdd={title => addTag(title, cat.id)}
                                    />
                                </div>
                            </CategoryCard>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
