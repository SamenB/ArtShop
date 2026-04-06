"use client";
// LabelsTab — unified tab for Collections + Medium tags + General tags
import { useState, useEffect } from "react";
import { getApiUrl, apiFetch } from "@/utils";

interface Collection { id: number; title: string; }
interface Tag { id: number; title: string; category?: string | null; }

// ── Mini inline-add form ──────────────────────────────────────────────────────
function AddItemRow({
    placeholder,
    onAdd,
}: {
    placeholder: string;
    onAdd: (title: string) => Promise<void>;
}) {
    const [title, setTitle] = useState("");
    const [saving, setSaving] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;
        setSaving(true);
        await onAdd(title.trim());
        setTitle("");
        setSaving(false);
    };

    return (
        <form onSubmit={submit} className="flex gap-2 mt-3">
            <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={placeholder}
                className="flex-1 min-w-0 bg-black border border-white/15 px-3 py-2 text-sm focus:outline-none focus:border-white/40 text-white rounded-sm"
            />
            <button
                disabled={saving || !title.trim()}
                className="px-4 py-2 bg-white/10 text-white uppercase font-mono text-[10px] tracking-widest hover:bg-white/20 transition-colors disabled:opacity-40 rounded-sm whitespace-nowrap"
            >
                {saving ? "Adding…" : "+ Add"}
            </button>
        </form>
    );
}

// ── Tag chip ──────────────────────────────────────────────────────────────────
function TagChip({ label, onDelete }: { label: string; onDelete: () => void }) {
    return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-white/15 rounded-full text-[11px] font-mono text-zinc-300 bg-white/3 group">
            {label}
            <button
                onClick={onDelete}
                title="Delete"
                className="text-zinc-600 hover:text-red-400 transition-colors leading-none"
            >×</button>
        </span>
    );
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({
    title,
    accent,
    description,
    children,
}: {
    title: string;
    accent: string;
    description: string;
    children: React.ReactNode;
}) {
    return (
        <div className="border border-white/8 rounded-lg p-6 bg-white/2">
            <div className="flex items-center gap-3 mb-1">
                <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: accent }} />
                <h3 className="font-mono text-xs uppercase tracking-widest text-white">{title}</h3>
            </div>
            <p className="font-mono text-[10px] text-zinc-600 mb-4 pl-5">{description}</p>
            {children}
        </div>
    );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function LabelsTab() {
    const [collections, setCollections] = useState<Collection[]>([]);
    const [mediumTags, setMediumTags] = useState<Tag[]>([]);
    const [generalTags, setGeneralTags] = useState<Tag[]>([]);
    const [loading, setLoading] = useState(true);

    const apiUrl = getApiUrl();

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [collRes, medRes, genRes] = await Promise.all([
                apiFetch(`${apiUrl}/collections`),
                apiFetch(`${apiUrl}/tags?category=medium`),
                apiFetch(`${apiUrl}/tags?category=general`),
            ]);
            if (collRes.ok) setCollections(await collRes.json());
            if (medRes.ok) setMediumTags(await medRes.json());
            if (genRes.ok) setGeneralTags(await genRes.json());
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchAll(); }, []);

    // Collections CRUD
    const addCollection = async (title: string) => {
        const res = await apiFetch(`${apiUrl}/collections`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title }),
        });
        if (res.ok) fetchAll();
        else { const e = await res.json(); alert(e.detail || "Failed"); }
    };
    const deleteCollection = async (id: number) => {
        if (!confirm("Delete this collection?")) return;
        await apiFetch(`${apiUrl}/collections/${id}`, { method: "DELETE" });
        setCollections(c => c.filter(x => x.id !== id));
    };

    // Tag CRUD (medium / general)
    const addTag = async (title: string, category: string) => {
        const res = await apiFetch(`${apiUrl}/tags`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, category }),
        });
        if (res.ok) fetchAll();
        else { const e = await res.json(); alert(e.detail || "Failed"); }
    };
    const deleteTag = async (id: number, title: string) => {
        // Fetch usage count first — professional UX: informed confirmation
        let usageMsg = "";
        try {
            const r = await apiFetch(`${apiUrl}/tags/${id}/usage`);
            if (r.ok) {
                const data = await r.json();
                const n = data.artwork_count;
                usageMsg = n > 0
                    ? `\n\n⚠️ This tag is currently used by ${n} artwork${n > 1 ? "s" : ""}. It will be removed from ${n > 1 ? "all of them" : "it"}.`
                    : "\n\nThis tag is not linked to any artworks.";
            }
        } catch { /* ignore, still allow delete */ }

        if (!confirm(`Delete tag "${title}"?${usageMsg}`)) return;
        await apiFetch(`${apiUrl}/tags/${id}`, { method: "DELETE" });
        fetchAll();
    };

    if (loading) return (
        <div className="text-zinc-500 font-mono text-sm tracking-widest animate-pulse">Loading labels…</div>
    );

    return (
        <div className="max-w-3xl space-y-6">
            <div className="mb-2">
                <h2 className="text-2xl font-serif italic">Labels & Tags</h2>
                <p className="text-zinc-600 font-mono text-xs mt-1 tracking-wide">
                    Manage all classifiers used across artworks and shop filters.
                </p>
            </div>

            {/* 1. Collections */}
            <Section
                title="Collections"
                accent="#6B9AC4"
                description="Group artworks into named collections. Artworks are assigned a collection in the artwork editor."
            >
                <div className="flex flex-wrap gap-2 min-h-[32px]">
                    {collections.map(c => (
                        <TagChip key={c.id} label={c.title} onDelete={() => deleteCollection(c.id)} />
                    ))}
                    {collections.length === 0 && (
                        <span className="text-zinc-700 font-mono text-[11px] italic">No collections yet</span>
                    )}
                </div>
                <AddItemRow placeholder="e.g. Landscapes, Portraits, Sketches…" onAdd={addCollection} />
            </Section>

            {/* 2. Medium / Materials */}
            <Section
                title="Medium / Materials"
                accent="#A47CC4"
                description="Materials or techniques (Oil, Charcoal, Watercolour…). These appear in the Shop filter and artwork editor."
            >
                <div className="flex flex-wrap gap-2 min-h-[32px]">
                    {mediumTags.map(t => (
                        <TagChip key={t.id} label={t.title} onDelete={() => deleteTag(t.id, t.title)} />
                    ))}
                    {mediumTags.length === 0 && (
                        <span className="text-zinc-700 font-mono text-[11px] italic">No medium tags yet</span>
                    )}
                </div>
                <AddItemRow placeholder="e.g. Oil on canvas, Charcoal, Acrylic…" onAdd={t => addTag(t, "medium")} />
            </Section>

            {/* 3. General Tags */}
            <Section
                title="General Tags"
                accent="#6BB87A"
                description="Free-form tags for any other categorisation. Useful for search and future filters."
            >
                <div className="flex flex-wrap gap-2 min-h-[32px]">
                    {generalTags.map(t => (
                        <TagChip key={t.id} label={t.title} onDelete={() => deleteTag(t.id, t.title)} />
                    ))}
                    {generalTags.length === 0 && (
                        <span className="text-zinc-700 font-mono text-[11px] italic">No general tags yet</span>
                    )}
                </div>
                <AddItemRow placeholder="e.g. Abstract, Figurative, Nature…" onAdd={t => addTag(t, "general")} />
            </Section>
        </div>
    );
}
