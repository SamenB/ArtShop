"use client";
import { useState, useEffect } from "react";
import { getApiUrl, apiFetch } from "@/utils";

interface Tag { id: number; title: string; category?: string | null; }

const CATEGORIES = [
    { value: "general", label: "General", color: "#6B7280" },
    { value: "medium",  label: "Medium (material)",  color: "#8B7CF6" },
];

export default function TagsTab() {
    const [tags, setTags] = useState<Tag[]>([]);
    const [loading, setLoading] = useState(true);
    const [newTitle, setNewTitle] = useState("");
    const [newCategory, setNewCategory] = useState<string>("general");
    const [saving, setSaving] = useState(false);

    const fetchTags = async () => {
        try {
            const res = await apiFetch(`${getApiUrl()}/tags`);
            if (res.ok) setTags(await res.json());
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchTags(); }, []);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTitle.trim()) return;
        setSaving(true);
        try {
            const res = await apiFetch(`${getApiUrl()}/tags`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: newTitle, category: newCategory }),
            });
            if (res.ok) { setNewTitle(""); fetchTags(); }
            else { const err = await res.json(); alert(err.detail || "Failed to create tag"); }
        } catch (e: any) { alert(`Failed: ${e.message}`); }
        finally { setSaving(false); }
    };

    const handleDelete = async (id: number) => {
        if (!confirm("Delete this tag? Artworks using it will simply lose the tag.")) return;
        const res = await apiFetch(`${getApiUrl()}/tags/${id}`, { method: "DELETE" });
        if (res.ok) setTags(tags.filter(t => t.id !== id));
        else alert("Delete failed");
    };

    const tagsByCategory = CATEGORIES.map(cat => ({
        ...cat,
        items: tags.filter(t => t.category === cat.value),
    }));
    const uncategorised = tags.filter(t => !t.category || !CATEGORIES.find(c => c.value === t.category));

    if (loading) return <div className="text-zinc-500 font-mono text-sm tracking-widest animate-pulse">Loading tags...</div>;

    return (
        <div className="max-w-4xl space-y-8">
            <h2 className="text-2xl font-serif italic mb-6">Manage Tags</h2>

            {/* Create form */}
            <form onSubmit={handleCreate} className="flex gap-3 flex-wrap">
                <input
                    type="text"
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    placeholder="Tag title (e.g. Oil, Watercolour, Abstract)"
                    className="flex-1 min-w-[200px] bg-black border border-white/20 p-3 text-sm focus:outline-none focus:border-white/50 text-white"
                />
                <select
                    value={newCategory}
                    onChange={e => setNewCategory(e.target.value)}
                    className="bg-black border border-white/20 p-3 text-sm focus:outline-none focus:border-white/50 text-white"
                >
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                <button disabled={saving} className="px-6 py-2 bg-[#EAE5D9] text-[#111111] uppercase font-mono text-xs hover:bg-white transition-colors disabled:opacity-50">
                    {saving ? "Creating..." : "Add Tag"}
                </button>
            </form>

            {/* Tags by category */}
            {tagsByCategory.map(cat => cat.items.length > 0 && (
                <div key={cat.value}>
                    <div className="flex items-center gap-3 mb-3">
                        <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: cat.color }}>{cat.label}</span>
                        <div className="flex-1 border-t border-white/8" />
                        <span className="font-mono text-[10px] text-zinc-600">{cat.items.length}</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {cat.items.map(t => (
                            <div key={t.id} className="p-3 border border-white/10 bg-white/5 flex justify-between items-center group rounded-sm">
                                <div>
                                    <span className="font-mono text-sm tracking-wide text-white">{t.title}</span>
                                    <span className="block font-mono text-[9px] uppercase tracking-wider mt-0.5" style={{ color: cat.color }}>{cat.label}</span>
                                </div>
                                <button onClick={() => handleDelete(t.id)} className="text-red-400 text-[10px] font-mono uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity hover:underline ml-2">Del</button>
                            </div>
                        ))}
                    </div>
                </div>
            ))}

            {/* Uncategorised / legacy */}
            {uncategorised.length > 0 && (
                <div>
                    <div className="flex items-center gap-3 mb-3">
                        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">Uncategorised</span>
                        <div className="flex-1 border-t border-white/8" />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {uncategorised.map(t => (
                            <div key={t.id} className="p-3 border border-white/10 bg-white/5 flex justify-between items-center group rounded-sm">
                                <span className="font-mono text-sm tracking-wide">{t.title}</span>
                                <button onClick={() => handleDelete(t.id)} className="text-red-400 text-[10px] font-mono uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity hover:underline ml-2">Del</button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {tags.length === 0 && (
                <p className="text-zinc-600 font-mono text-sm italic">No tags yet. Create a "Medium" tag like "Oil on canvas" or "Charcoal" to use in shop filters.</p>
            )}
        </div>
    );
}
