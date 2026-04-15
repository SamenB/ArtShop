"use client";

import { useState, useEffect } from "react";
import { getApiUrl, apiFetch } from "@/utils";

interface Collection { id: number; title: string; }
interface Tag { id: number; title: string; category?: string | null; }

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
        <form onSubmit={submit} className="flex gap-2 mt-4">
            <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={placeholder}
                className="flex-1 min-w-0 bg-white border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-black focus:ring-1 focus:ring-black text-black rounded-md shadow-sm placeholder-gray-400 transition-all text-[13px]"
            />
            <button
                disabled={saving || !title.trim()}
                className="px-5 py-2.5 bg-black text-white font-sans text-xs font-bold tracking-wider hover:bg-gray-800 transition-all disabled:opacity-40 rounded-md shadow-sm whitespace-nowrap uppercase"
            >
                {saving ? "Adding..." : "+ Add"}
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
                title="Delete"
                className="text-zinc-400 group-hover:text-red-500 transition-colors leading-none ml-1 pb-px"
            >×</button>
        </span>
    );
}

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
        <div className="border border-gray-200 rounded-xl p-6 bg-white shadow-sm hover:border-gray-300 transition-colors">
            <div className="flex items-center gap-3 mb-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full ring-2 ring-offset-1" style={{ backgroundColor: accent, ringColor: accent }} />
                <h3 className="font-sans text-sm uppercase font-bold tracking-wider text-black">{title}</h3>
            </div>
            <p className="font-sans text-xs text-gray-500 mb-5 pl-6 tracking-wide">{description}</p>
            <div className="pl-6">
                {children}
            </div>
        </div>
    );
}

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

    const addCollection = async (title: string) => {
        const res = await apiFetch(`${apiUrl}/collections`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title }),
        });
        if (res.ok) fetchAll();
        else { const e = await res.json(); alert(e.detail || "Failed to add collection"); }
    };

    const deleteCollection = async (id: number) => {
        if (!confirm("Delete this collection? Artworks will lose this categorization.")) return;
        await apiFetch(`${apiUrl}/collections/${id}`, { method: "DELETE" });
        setCollections(c => c.filter(x => x.id !== id));
    };

    const addTag = async (title: string, category: string) => {
        const res = await apiFetch(`${apiUrl}/tags`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, category }),
        });
        if (res.ok) fetchAll();
        else { const e = await res.json(); alert(e.detail || "Failed to add tag"); }
    };

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
        } catch { }

        if (!confirm(`Delete tag "${title}"?${usageMsg}`)) return;
        await apiFetch(`${apiUrl}/tags/${id}`, { method: "DELETE" });
        fetchAll();
    };

    if (loading) return (
        <div className="text-zinc-500 font-mono text-sm tracking-widest animate-pulse">Checking taxonomy dependencies...</div>
    );

    return (
        <div className="max-w-3xl space-y-8 pb-10">
            <div className="mb-6 pt-2 pb-4 border-b border-gray-100">
                <h2 className="text-3xl font-serif italic text-black">Labels & Tags</h2>
                <p className="text-gray-500 font-sans text-sm mt-2 tracking-wide font-medium">
                    Manage the global taxonomy for artwork clarification and shop filtering.
                </p>
            </div>

            <Section
                title="Collections"
                accent="#3b82f6"
                description="Primary structural series. Artworks are constrained to a single collection in the dashboard."
            >
                <div className="flex flex-wrap gap-2.5 min-h-[32px]">
                    {collections.map(c => (
                        <TagChip key={c.id} label={c.title} onDelete={() => deleteCollection(c.id)} />
                    ))}
                    {collections.length === 0 && (
                        <span className="text-zinc-400 font-mono text-[11px] italic mt-1">No collections registered</span>
                    )}
                </div>
                <div className="mt-4 border-t border-gray-100 pt-2">
                    <AddItemRow placeholder="e.g. Exhibitions, Archive, Ongoing..." onAdd={addCollection} />
                </div>
            </Section>

            <Section
                title="Medium / Materials"
                accent="#a855f7"
                description="Physical classification tools (e.g., Oil, Watercolor). Vital for shop filtering algorithms."
            >
                <div className="flex flex-wrap gap-2.5 min-h-[32px]">
                    {mediumTags.map(t => (
                        <TagChip key={t.id} label={t.title} onDelete={() => deleteTag(t.id, t.title)} />
                    ))}
                    {mediumTags.length === 0 && (
                        <span className="text-zinc-400 font-mono text-[11px] italic mt-1">No medium tags registered</span>
                    )}
                </div>
                <div className="mt-4 border-t border-gray-100 pt-2">
                    <AddItemRow placeholder="e.g. Oil on Canvas, Digital, Ceramics..." onAdd={t => addTag(t, "medium")} />
                </div>
            </Section>

            <Section
                title="General Tags"
                accent="#22c55e"
                description="Auxiliary search handles and thematic descriptors."
            >
                <div className="flex flex-wrap gap-2.5 min-h-[32px]">
                    {generalTags.map(t => (
                        <TagChip key={t.id} label={t.title} onDelete={() => deleteTag(t.id, t.title)} />
                    ))}
                    {generalTags.length === 0 && (
                        <span className="text-zinc-400 font-mono text-[11px] italic mt-1">No general tags registered</span>
                    )}
                </div>
                <div className="mt-4 border-t border-gray-100 pt-2">
                    <AddItemRow placeholder="e.g. Surrealism, Monochromatic, Sketches..." onAdd={t => addTag(t, "general")} />
                </div>
            </Section>
        </div>
    );
}
