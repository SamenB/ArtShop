"use client";
import { useState, useEffect } from "react";
import { getApiUrl } from "@/utils";

interface Tag {
    id: number;
    title: string;
}

export default function TagsTab() {
    const [tags, setTags] = useState<Tag[]>([]);
    const [loading, setLoading] = useState(true);
    const [newTitle, setNewTitle] = useState("");
    const [saving, setSaving] = useState(false);

    const fetchTags = async () => {
        try {
            const res = await fetch(`${getApiUrl()}/tags`, { credentials: "include" });
            if (res.ok) {
                const data = await res.json();
                setTags(data);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTags();
    }, []);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTitle.trim()) return;
        setSaving(true);
        const apiUrl = getApiUrl();
        try {
            const res = await fetch(`${apiUrl}/tags`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: newTitle }),
                credentials: "include"
            });
            if (res.ok) {
                setNewTitle("");
                fetchTags();
            } else {
                const err = await res.json();
                alert(err.detail || "Failed to create tag");
            }
        } catch (e: any) {
            console.error("Tag create error:", e);
            alert(`Failed to create tag: ${e.message}`);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm("Delete this tag? Note: Artworks connected to this tag will simply lose the tag reference.")) return;
        try {
            const res = await fetch(`${getApiUrl()}/tags/${id}`, { 
                method: "DELETE", 
                credentials: "include" 
            });
            if (res.ok) {
                setTags(tags.filter(t => t.id !== id));
            } else {
                alert("Delete failed");
            }
        } catch (e) {
            console.error(e);
        }
    };

    if (loading) return <div className="text-zinc-500 font-mono text-sm tracking-widest animate-pulse">Loading tags...</div>;

    return (
        <div className="max-w-4xl space-y-8">
            <h2 className="text-2xl font-serif italic mb-6">Manage Tags</h2>

            <form onSubmit={handleCreate} className="flex gap-3">
                <input 
                    type="text" 
                    value={newTitle} 
                    onChange={e => setNewTitle(e.target.value)} 
                    placeholder="New Tag Title (e.g. Abstract, Portrait)" 
                    className="flex-1 bg-black border border-white/20 p-3 text-sm focus:outline-none focus:border-white/50 text-white"
                />
                <button 
                    disabled={saving}
                    className="px-6 py-2 bg-[#EAE5D9] text-[#111111] uppercase font-mono text-xs hover:bg-white transition-colors disabled:opacity-50"
                >
                    {saving ? "Creating..." : "Add Tag"}
                </button>
            </form>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {tags.map(t => (
                    <div key={t.id} className="p-4 border border-white/10 bg-white/5 flex justify-between items-center group">
                        <span className="font-mono text-sm tracking-wide">{t.title}</span>
                        <button 
                            onClick={() => handleDelete(t.id)}
                            className="text-red-500 text-[10px] font-mono uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity hover:underline"
                        >
                            Delete
                        </button>
                    </div>
                ))}
            </div>

            {tags.length === 0 && (
                <p className="text-zinc-600 font-mono text-sm italic">No tags created yet.</p>
            )}
        </div>
    );
}
