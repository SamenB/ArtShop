"use client";

/**
 * Labels Management Tab.
 * Centralized interface for managing collections, medium-specific tags, and general tags.
 * Ensures consistent taxonomy across the entire artwork catalog.
 */

import { useState, useEffect } from "react";
import { getApiUrl, apiFetch } from "@/utils";

/** Represents a collection grouping for artworks. */
interface Collection { id: number; title: string; }

/** Represents a metadata tag for filtering and classification. */
interface Tag { id: number; title: string; category?: string | null; }

/**
 * Compact inline form for adding new taxonomy entries.
 */
function AddItemRow({
    placeholder,
    onAdd,
}: {
    /** Input placeholder text guiding the user on naming conventions. */
    placeholder: string;
    /** Async callback triggered upon submission of a valid, non-empty string. */
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
                {saving ? "Adding..." : "+ Add"}
            </button>
        </form>
    );
}

/**
 * Visual pill representation of a taxonomy entry, with a deletion control.
 */
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

/**
 * Structural wrapper for cohesive grouping of related taxonomy editors.
 */
function Section({
    title,
    accent,
    description,
    children,
}: {
    /** Heading of the taxonomy domain. */
    title: string;
    /** Hex color code for the visual bullet indicator. */
    accent: string;
    /** Clarifying text guiding the administrator on usage. */
    description: string;
    /** Child components (Chips and AddItemRow). */
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

/**
 * Main component governing the global labels configuration.
 */
export default function LabelsTab() {
    const [collections, setCollections] = useState<Collection[]>([]);
    const [mediumTags, setMediumTags] = useState<Tag[]>([]);
    const [generalTags, setGeneralTags] = useState<Tag[]>([]);
    const [loading, setLoading] = useState(true);

    const apiUrl = getApiUrl();

    /** Pulls all taxonomy datasets concurrently to build the interface state. */
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

    /** Adds a new curated collection domain. */
    const addCollection = async (title: string) => {
        const res = await apiFetch(`${apiUrl}/collections`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title }),
        });
        if (res.ok) fetchAll();
        else { const e = await res.json(); alert(e.detail || "Failed to add collection"); }
    };

    /** Obliterates a collection and cascades nullification to its artworks. */
    const deleteCollection = async (id: number) => {
        if (!confirm("Delete this collection? Artworks will lose this categorization.")) return;
        await apiFetch(`${apiUrl}/collections/${id}`, { method: "DELETE" });
        setCollections(c => c.filter(x => x.id !== id));
    };

    /** Persists a generalized or medium-specific tag. */
    const addTag = async (title: string, category: string) => {
        const res = await apiFetch(`${apiUrl}/tags`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, category }),
        });
        if (res.ok) fetchAll();
        else { const e = await res.json(); alert(e.detail || "Failed to add tag"); }
    };

    /** Removes a tag, providing intelligent prompts regarding active usage. */
    const deleteTag = async (id: number, title: string) => {
        let usageMsg = "";
        try {
            const r = await apiFetch(`${apiUrl}/tags/${id}/usage`);
            if (r.ok) {
                const data = await r.json();
                const n = data.artwork_count;
                usageMsg = n > 0
                    ? `\n\n⚠️ This tag is currently linked to ${n} artwork${n > 1 ? "s" : ""}. Proceeding will sever these links.`
                    : "\n\nThis tag is currently unused.";
            }
        } catch { /* Silent fail is acceptable; fallback to standard confirmation */ }

        if (!confirm(`Delete tag "${title}"?${usageMsg}`)) return;
        await apiFetch(`${apiUrl}/tags/${id}`, { method: "DELETE" });
        fetchAll();
    };

    if (loading) return (
        <div className="text-zinc-500 font-mono text-sm tracking-widest animate-pulse">Checking taxonomy dependencies...</div>
    );

    return (
        <div className="max-w-3xl space-y-6">
            <div className="mb-2">
                <h2 className="text-2xl font-serif italic">Labels & Tags</h2>
                <p className="text-zinc-600 font-mono text-xs mt-1 tracking-wide">
                    Manage the global taxonomy for artwork clarification and shop filtering.
                </p>
            </div>

            <Section
                title="Collections"
                accent="#6B9AC4"
                description="Primary structural series. Artworks are constrained to a single collection in the dashboard."
            >
                <div className="flex flex-wrap gap-2 min-h-[32px]">
                    {collections.map(c => (
                        <TagChip key={c.id} label={c.title} onDelete={() => deleteCollection(c.id)} />
                    ))}
                    {collections.length === 0 && (
                        <span className="text-zinc-700 font-mono text-[11px] italic">No collections registered</span>
                    )}
                </div>
                <AddItemRow placeholder="e.g. Exhibitions, Archive, Ongoing..." onAdd={addCollection} />
            </Section>

            <Section
                title="Medium / Materials"
                accent="#A47CC4"
                description="Physical classification tools (e.g., Oil, Watercolor). Vital for shop filtering algorithms."
            >
                <div className="flex flex-wrap gap-2 min-h-[32px]">
                    {mediumTags.map(t => (
                        <TagChip key={t.id} label={t.title} onDelete={() => deleteTag(t.id, t.title)} />
                    ))}
                    {mediumTags.length === 0 && (
                        <span className="text-zinc-700 font-mono text-[11px] italic">No medium tags registered</span>
                    )}
                </div>
                <AddItemRow placeholder="e.g. Oil on Canvas, Digital, Ceramics..." onAdd={t => addTag(t, "medium")} />
            </Section>

            <Section
                title="General Tags"
                accent="#6BB87A"
                description="Auxiliary search handles and thematic descriptors."
            >
                <div className="flex flex-wrap gap-2 min-h-[32px]">
                    {generalTags.map(t => (
                        <TagChip key={t.id} label={t.title} onDelete={() => deleteTag(t.id, t.title)} />
                    ))}
                    {generalTags.length === 0 && (
                        <span className="text-zinc-700 font-mono text-[11px] italic">No general tags registered</span>
                    )}
                </div>
                <AddItemRow placeholder="e.g. Surrealism, Monochromatic, Sketches..." onAdd={t => addTag(t, "general")} />
            </Section>
        </div>
    );
}
