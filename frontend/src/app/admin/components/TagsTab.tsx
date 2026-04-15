"use client";

import { useState, useEffect } from "react";
import { getApiUrl, apiFetch } from "@/utils";

interface Tag { id: number; title: string; category?: string | null; }

const CATEGORIES = [
    { value: "general", label: "General", color: "#6b7280" }, // gray-500
    { value: "medium",  label: "Medium (material)",  color: "#8b5cf6" }, // violet-500
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
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
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
            if (res.ok) {
                setNewTitle("");
                fetchTags();
            } else {
                const err = await res.json();
                alert(err.detail || "Failed to create tag");
            }
        } catch (e: any) {
            alert(`Failed: ${e.message}`);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm("Delete this tag? Artworks using it will simply lose the tag.")) return;
        const res = await apiFetch(`${getApiUrl()}/tags/${id}`, { method: "DELETE" });
        if (res.ok) {
            setTags(tags.filter(t => t.id !== id));
        } else {
            alert("Delete failed");
        }
    };

    const tagsByCategory = CATEGORIES.map(cat => ({
        ...cat,
        items: tags.filter(t => t.category === cat.value),
    }));

    const uncategorised = tags.filter(t => !t.category || !CATEGORIES.find(c => c.value === t.category));

    if (loading) return <div className="text-zinc-500 font-mono text-sm tracking-widest animate-pulse">Loading tags...</div>;

    const inpClasses = "bg-white border border-gray-200 p-3 text-sm focus:outline-none focus:border-black focus:ring-1 focus:ring-black text-black rounded-lg shadow-sm placeholder-gray-400 font-sans transition-all";

    return (
        <div className="max-w-4xl space-y-10 pb-12">
            <div className="mb-6 pt-2 pb-4 border-b border-gray-100">
                <h2 className="text-3xl font-serif italic text-black">Manage Tags</h2>
                <p className="text-zinc-500 font-mono text-xs mt-2 tracking-wide font-medium">Create and manage taxonomy categories to organize artwork filtering.</p>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 shadow-sm">
                <form onSubmit={handleCreate} className="flex gap-4 flex-wrap md:flex-nowrap items-end">
                    <div className="flex-1 min-w-[200px]">
                        <label className="block text-[11px] font-bold font-sans tracking-wider uppercase text-zinc-500 mb-2">Tag Title</label>
                        <input
                            type="text"
                            value={newTitle}
                            onChange={e => setNewTitle(e.target.value)}
                            placeholder="e.g. Oil, Watercolour, Abstract"
                            className={`w-full ${inpClasses}`}
                        />
                    </div>
                    <div className="w-full md:w-48">
                        <label className="block text-[11px] font-bold font-sans tracking-wider uppercase text-zinc-500 mb-2">Category</label>
                        <select
                            value={newCategory}
                            onChange={e => setNewCategory(e.target.value)}
                            className={`w-full ${inpClasses} pr-8 cursor-pointer`}
                        >
                            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                    </div>
                    <button disabled={saving} className="h-[46px] px-8 bg-black text-white rounded-lg uppercase font-sans text-xs font-bold tracking-wider hover:bg-gray-800 transition-all disabled:opacity-50 shadow-sm whitespace-nowrap">
                        {saving ? "Creating..." : "Add Tag"}
                    </button>
                </form>
            </div>

            <div className="space-y-8">
                {tagsByCategory.map(cat => cat.items.length > 0 && (
                    <div key={cat.value} className="bg-white rounded-xl">
                        <div className="flex items-center gap-4 mb-4">
                            <span className="font-sans text-xs uppercase font-bold tracking-wider bg-gray-50 border border-gray-100 px-3 py-1 rounded" style={{ color: cat.color }}>
                                {cat.label}
                            </span>
                            <div className="flex-1 border-t border-gray-100" />
                            <span className="font-sans text-xs text-zinc-500 font-medium bg-gray-50 px-2 py-0.5 rounded">{cat.items.length} items</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
                            {cat.items.map(t => (
                                <div key={t.id} className="p-3.5 border border-gray-200 bg-white shadow-sm flex flex-col justify-between group rounded-xl hover:border-black transition-all">
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="font-sans text-sm font-semibold tracking-wide text-gray-800">{t.title}</span>
                                        <button onClick={() => handleDelete(t.id)} className="text-red-500 bg-red-50 hover:bg-red-500 hover:text-white px-2 py-1 rounded text-[10px] font-sans font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-all shadow-sm">Del</button>
                                    </div>
                                    <span className="block font-sans text-[10px] font-semibold uppercase tracking-wider" style={{ color: cat.color }}>{cat.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}

                {uncategorised.length > 0 && (
                    <div className="bg-white rounded-xl">
                        <div className="flex items-center gap-4 mb-4">
                            <span className="font-mono text-[11px] uppercase font-bold tracking-widest text-zinc-500 bg-gray-50 border border-gray-100 px-3 py-1 rounded">Uncategorised</span>
                            <div className="flex-1 border-t border-gray-100" />
                            <span className="font-mono text-[10px] text-zinc-400 font-bold bg-gray-50 px-2 py-0.5 rounded">{uncategorised.length} items</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
                            {uncategorised.map(t => (
                                <div key={t.id} className="p-3.5 border border-gray-200 bg-white flex justify-between items-center group rounded-xl hover:border-zinc-400 transition-all shadow-sm">
                                    <span className="font-mono text-[13px] font-semibold tracking-wide text-black">{t.title}</span>
                                    <button onClick={() => handleDelete(t.id)} className="text-red-500 bg-red-50 hover:bg-red-500 hover:text-white px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all">Del</button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {tags.length === 0 && (
                <div className="py-12 text-center border border-dashed border-gray-200 rounded-2xl bg-gray-50/50">
                    <p className="text-zinc-500 font-mono text-[13px] italic">No tags yet. Create a "Medium" tag like "Oil on canvas" or "Charcoal" to use in shop filters.</p>
                </div>
            )}
        </div>
    );
}
