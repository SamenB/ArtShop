"use client";
import { useState, useEffect } from "react";
import { getApiUrl, apiFetch } from "@/utils";

interface Collection {
    id: number;
    title: string;
}

export default function CollectionsTab() {
    const [collections, setCollections] = useState<Collection[]>([]);
    const [loading, setLoading] = useState(true);
    const [newTitle, setNewTitle] = useState("");
    const [saving, setSaving] = useState(false);

    const fetchCollections = async () => {
        try {
            const res = await apiFetch(`${getApiUrl()}/collections`);
            if (res.ok) {
                const data = await res.json();
                setCollections(data);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCollections();
    }, []);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTitle.trim()) return;
        setSaving(true);
        const apiUrl = getApiUrl();
        console.log(`Creating collection at ${apiUrl}/collections with title: ${newTitle}`);
        try {
            const res = await apiFetch(`${apiUrl}/collections`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: newTitle }),
            });
            if (res.ok) {
                setNewTitle("");
                fetchCollections();
            } else {
                const err = await res.json();
                alert(err.detail || "Failed to create collection");
            }
        } catch (e: any) {
            console.error("Collection create error:", e);
            alert(`Failed to create collection: ${e.message}. \nThis is often a networking issue. \nTarget URL: ${apiUrl}/collections`);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm("Delete this collection? Note: Artworks in this collection will remain but their collection reference might be broken.")) return;
        try {
            const res = await apiFetch(`${getApiUrl()}/collections/${id}`, { 
                method: "DELETE", 
            });
            if (res.ok) {
                setCollections(collections.filter(c => c.id !== id));
            } else {
                alert("Delete failed");
            }
        } catch (e) {
            console.error(e);
        }
    };

    if (loading) return <div className="text-zinc-500 font-mono text-sm tracking-widest animate-pulse">Loading collections...</div>;

    return (
        <div className="max-w-4xl space-y-8">
            <h2 className="text-2xl font-serif italic mb-6">Manage Collections</h2>

            <form onSubmit={handleCreate} className="flex gap-3">
                <input 
                    type="text" 
                    value={newTitle} 
                    onChange={e => setNewTitle(e.target.value)} 
                    placeholder="New Collection Title (e.g. Scetches, Nature)" 
                    className="flex-1 bg-black border border-white/20 p-3 text-sm focus:outline-none focus:border-white/50 text-white"
                />
                <button 
                    disabled={saving}
                    className="px-6 py-2 bg-[#EAE5D9] text-[#111111] uppercase font-mono text-xs hover:bg-white transition-colors disabled:opacity-50"
                >
                    {saving ? "Creating..." : "Add Collection"}
                </button>
            </form>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {collections.map(c => (
                    <div key={c.id} className="p-4 border border-white/10 bg-white/5 flex justify-between items-center group">
                        <span className="font-mono text-sm tracking-wide">{c.title}</span>
                        <button 
                            onClick={() => handleDelete(c.id)}
                            className="text-red-500 text-[10px] font-mono uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity hover:underline"
                        >
                            Delete
                        </button>
                    </div>
                ))}
            </div>

            {collections.length === 0 && (
                <p className="text-zinc-600 font-mono text-sm italic">No collections created yet.</p>
            )}
        </div>
    );
}
