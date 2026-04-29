"use client";

import { useCallback, useEffect, useState } from "react";
import { getApiUrl, apiFetch, apiJson } from "@/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Category { id: number; title: string; accent_color?: string; }
interface Tag { id: number; title: string; category_id?: number | null; }

// ─── Color palette for auto-assigned category accents ─────────────────────────

const ACCENTS = ["#3b82f6", "#a855f7", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];

// ─── Shared Input Styles ──────────────────────────────────────────────────────

const inp = "w-full border border-[#31323E]/15 rounded-lg px-3.5 py-2.5 text-sm text-[#31323E] font-medium bg-white focus:outline-none focus:border-[#31323E]/50 focus:ring-2 focus:ring-[#31323E]/10 placeholder-[#31323E]/30 transition-all shadow-sm";

// ─── Subcomponents ────────────────────────────────────────────────────────────

function AddTagRow({ placeholder, onAdd }: { placeholder: string; onAdd: (title: string) => Promise<void> }) {
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
        <form onSubmit={submit} className="flex gap-2 mt-3">
            <input
                type="text"
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder={placeholder}
                className={inp}
            />
            <button
                disabled={busy || !value.trim()}
                className="px-4 py-2.5 bg-[#31323E] text-white rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-[#434455] transition-all disabled:opacity-40 shadow-sm whitespace-nowrap"
            >
                {busy ? "…" : "+ Add Tag"}
            </button>
        </form>
    );
}

function TagChip({ label, onDelete }: { label: string; onDelete: () => void }) {
    return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-[#31323E]/12 rounded-full text-xs font-semibold text-[#31323E] bg-white hover:bg-[#31323E]/5 hover:border-[#31323E]/25 transition-all group shadow-sm">
            {label}
            <button
                onClick={onDelete}
                type="button"
                title="Remove tag"
                className="text-[#31323E]/30 group-hover:text-red-500 transition-colors leading-none"
            >
                ×
            </button>
        </span>
    );
}

function CategoryCard({ title, accent, onDelete, children }: {
    title: string;
    accent: string;
    onDelete?: () => void;
    children: React.ReactNode;
}) {
    return (
        <div className="border border-[#31323E]/10 rounded-xl bg-white shadow-sm hover:shadow-md transition-shadow relative group overflow-hidden">
            {/* Accent left bar */}
            <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ backgroundColor: accent }} />

            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 pl-7">
                <div className="flex items-center gap-2.5">
                    <span className="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: accent }} />
                    <div>
                        <h3 className="font-bold text-sm tracking-wide text-[#31323E]">{title}</h3>
                    </div>
                </div>
                {onDelete && (
                    <button
                        onClick={onDelete}
                        className="text-red-400 hover:text-white hover:bg-red-500 px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-all border border-red-200 hover:border-red-500"
                    >
                        Delete Category
                    </button>
                )}
            </div>

            {/* Tags area */}
            <div className="px-6 pb-5 pl-7 border-t border-[#31323E]/6">
                <div className="flex flex-wrap gap-2 mt-3 min-h-[32px]">
                    {children}
                </div>
            </div>
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function LabelsTab() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [tags, setTags] = useState<Tag[]>([]);
    const [loading, setLoading] = useState(true);
    const [newCatName, setNewCatName] = useState("");
    const [creatingCat, setCreatingCat] = useState(false);

    const api = getApiUrl();

    const reload = useCallback(async () => {
        setLoading(true);
        try {
            const [catR, tagR] = await Promise.all([
                apiFetch(`${api}/labels/categories`),
                apiFetch(`${api}/labels`),
            ]);
            if (catR.ok) setCategories(await apiJson(catR));
            if (tagR.ok) setTags(await apiJson(tagR));
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, [api]);

    useEffect(() => { reload(); }, [reload]);

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
        else {
            const e = await apiJson<{ detail?: string }>(res).catch(
                (): { detail?: string } => ({}),
            );
            alert(e.detail || "Failed to create category");
        }
    };

    const deleteCategory = async (id: number) => {
        if (!confirm("Delete this category? All tags inside it will also be removed from artworks.")) return;
        await apiFetch(`${api}/labels/categories/${id}`, { method: "DELETE" });
        reload();
    };

    const addTag = async (title: string, category_id: number) => {
        const res = await apiFetch(`${api}/labels`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, category_id }),
        });
        if (res.ok) reload();
        else {
            const e = await apiJson<{ detail?: string }>(res).catch(
                (): { detail?: string } => ({}),
            );
            alert(e.detail || "Failed to add tag");
        }
    };

    const deleteTag = async (id: number, title: string) => {
        let usageNote = "";
        try {
            const r = await apiFetch(`${api}/labels/${id}/usage`);
            if (r.ok) {
                const { artwork_count: n } = await apiJson<{ artwork_count: number }>(r);
                usageNote = n > 0
                    ? `\n\n⚠️ This tag is used by ${n} artwork${n > 1 ? "s" : ""}. All links will be removed.`
                    : "\n\nThis tag is not used by any artwork.";
            }
        } catch {}
        if (!confirm(`Remove tag "${title}"?${usageNote}`)) return;
        await apiFetch(`${api}/labels/${id}`, { method: "DELETE" });
        reload();
    };

    if (loading) return (
        <div className="flex items-center gap-3 py-10">
            <div className="w-5 h-5 border-2 border-[#31323E]/20 border-t-[#31323E] rounded-full animate-spin" />
            <span className="text-sm font-semibold text-[#31323E]/50 uppercase tracking-wider">Loading taxonomy…</span>
        </div>
    );

    return (
        <div className="max-w-3xl space-y-8 pb-12">

            {/* ── Page header ─────────────────────────────────────────────── */}
            <div className="pb-6 border-b border-[#31323E]/8">
                <h2 className="text-2xl font-bold tracking-tight text-[#31323E] mb-1">Labels & Categorization</h2>
                <p className="text-sm text-[#31323E]/50 font-medium">
                    Organize artworks with <span className="font-bold text-[#31323E]/70">Categories</span> (e.g. Medium, Style)
                    and <span className="font-bold text-[#31323E]/70">Tags</span> inside each one (e.g. Oil, Charcoal).
                </p>
            </div>

            {/* ── Stats ─────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#31323E] text-white rounded-xl p-5 shadow-sm">
                    <div className="text-3xl font-bold leading-none mb-1">{categories.length}</div>
                    <div className="text-sm font-semibold text-white/60 uppercase tracking-wider">Categories</div>
                </div>
                <div className="bg-white border border-[#31323E]/10 rounded-xl p-5 shadow-sm">
                    <div className="text-3xl font-bold text-[#31323E] leading-none mb-1">{tags.length}</div>
                    <div className="text-sm font-semibold text-[#31323E]/40 uppercase tracking-wider">Total Tags</div>
                </div>
            </div>

            {/* ── New Category ─────────────────────────────────────────────── */}
            <div className="bg-[#FAFAF9] border border-[#31323E]/10 rounded-xl p-6">
                <h3 className="text-sm font-bold uppercase tracking-wider text-[#31323E] mb-1">Create New Category</h3>
                <p className="text-xs text-[#31323E]/40 font-medium mb-4">A category groups related tags (e.g. &quot;Medium&quot;, &quot;Style&quot;, &quot;Mood&quot;)</p>
                <form onSubmit={createCategory} className="flex flex-col sm:flex-row gap-3">
                    <input
                        type="text"
                        value={newCatName}
                        onChange={e => setNewCatName(e.target.value)}
                        placeholder="e.g. Medium, Style, Materials, Mood…"
                        className={`${inp} flex-1`}
                    />
                    <button
                        disabled={creatingCat || !newCatName.trim()}
                        className="px-6 py-2.5 bg-[#31323E] text-white rounded-lg text-sm font-bold hover:bg-[#434455] transition-all disabled:opacity-40 shadow-sm whitespace-nowrap uppercase tracking-wider"
                    >
                        {creatingCat ? "Creating…" : "+ Create Category"}
                    </button>
                </form>
            </div>

            {/* ── Dynamic categories ─────────────────────────────────────── */}
            {categories.length === 0 ? (
                <div className="p-12 border border-dashed border-[#31323E]/15 rounded-xl bg-[#31323E]/2 text-center">
                    <div className="text-3xl mb-3 opacity-30">🏷</div>
                    <p className="text-sm font-semibold text-[#31323E]/40">No categories yet. Create your first one above.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {categories.map((cat, i) => {
                        const catTags = tags.filter(t => t.category_id === cat.id);
                        const accent = cat.accent_color || ACCENTS[i % ACCENTS.length];
                        return (
                            <CategoryCard
                                key={cat.id}
                                title={cat.title}
                                accent={accent}
                                onDelete={() => deleteCategory(cat.id)}
                            >
                                {catTags.map(t => (
                                    <TagChip key={t.id} label={t.title} onDelete={() => deleteTag(t.id, t.title)} />
                                ))}
                                {catTags.length === 0 && (
                                    <span className="text-xs text-[#31323E]/30 font-medium italic">No tags yet</span>
                                )}
                                <div className="w-full mt-2">
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
