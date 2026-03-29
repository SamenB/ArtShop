"use client";
import { useState, useEffect } from "react";
import { getApiUrl, getImageUrl } from "@/utils";

interface ArtworkImage {
    thumb: string;
    medium: string;
    original: string;
}

interface Artwork {
    id: number;
    title: string;
    original_price: number;
    images?: (string | ArtworkImage)[];
    description?: string;
    is_display_only?: boolean;
    original_status?: string;
    year?: number;
    materials?: string;
    style?: string;
    width_cm?: number;
    height_cm?: number;
    depth_cm?: number;
    width_in?: number;
    height_in?: number;
    depth_in?: number;
    prints_total?: number;
    prints_available?: number;
    collection_id?: number | null;
}

interface Collection {
    id: number;
    title: string;
}

export default function ArtworksTab() {
    const [artworks, setArtworks] = useState<Artwork[]>([]);
    const [collections, setCollections] = useState<Collection[]>([]);
    const [loading, setLoading] = useState(true);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const defaultForm = {
        title: "",
        description: "",
        materials: "",
        style: "",
        year: new Date().getFullYear(),
        width_cm: "",
        height_cm: "",
        depth_cm: "",
        original_price: 1000,
        prints_total: 50,
        tags: [] as number[],
        collection_id: null as number | null,
        is_display_only: false,
        original_status: "available"
    };
    const [formData, setFormData] = useState<any>(defaultForm);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [previewUrls, setPreviewUrls] = useState<string[]>([]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [artRes, collRes] = await Promise.all([
                fetch(`${getApiUrl()}/artworks?limit=100`, { credentials: "include" }),
                fetch(`${getApiUrl()}/collections`, { credentials: "include" })
            ]);
            
            if (artRes.ok) {
                const data = await artRes.json();
                setArtworks(data.items || data);
            }
            
            if (collRes.ok) {
                const data = await collRes.json();
                setCollections(data);
            }
        } catch (e) {
            console.error("Fetch error:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleDelete = async (id: number) => {
        if (!confirm("Delete this artwork?")) return;
        try {
            const res = await fetch(`${getApiUrl()}/artworks/${id}`, { method: "DELETE", credentials: "include" });
            if (res.ok) {
                setArtworks(artworks.filter(a => a.id !== id));
            } else {
                alert("Delete failed");
            }
        } catch (e) {
            console.error(e);
            alert("Network error during delete");
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setUploading(true);
        const apiUrl = getApiUrl();
        
        // Calculate inches from cm
        const payload = { ...formData };
        if (payload.width_cm) payload.width_in = Number((parseFloat(payload.width_cm) * 0.393701).toFixed(2));
        if (payload.height_cm) payload.height_in = Number((parseFloat(payload.height_cm) * 0.393701).toFixed(2));
        if (payload.depth_cm) payload.depth_in = Number((parseFloat(payload.depth_cm) * 0.393701).toFixed(2));
        
        const method = editingId ? "PUT" : "POST";
        const url = editingId ? `${apiUrl}/artworks/${editingId}` : `${apiUrl}/artworks`;
        
        console.log(`Attempting to ${method} to ${url}`, payload);
        
        try {
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                credentials: "include"
            });
            
            if (res.ok) {
                const data = await res.json();
                const targetArtworkId = editingId ? editingId : data.data?.id;
                
                // Upload images if selected
                if (selectedFiles.length > 0 && targetArtworkId) {
                    const imgFormData = new FormData();
                    selectedFiles.forEach(file => {
                        imgFormData.append("files", file);
                    });
                    const imgRes = await fetch(`${getApiUrl()}/artworks/${targetArtworkId}/images`, {
                        method: "POST",
                        body: imgFormData,
                        credentials: "include"
                    });
                    
                    if (!imgRes.ok) {
                        console.error("Image upload failed");
                        alert("Artwork saved, but image upload failed.");
                    } else {
                        alert(`Artwork ${editingId ? 'updated' : 'created'}! Images are processing in the background.`);
                    }
                } else {
                    alert(`Artwork ${editingId ? 'updated' : 'created'}!`);
                }
                
                setIsFormOpen(false);
                setEditingId(null);
                setSelectedFiles([]);
                setPreviewUrls([]);
                setFormData({ ...defaultForm });
                fetchData();
            } else {
                const errData = await res.json().catch(() => ({}));
                console.error("Save failed:", res.status, errData);
                alert(`Save failed: ${res.status} ${JSON.stringify(errData)}`);
            }
        } catch (e: any) {
            console.error("Network error during save:", e);
            alert(`Network error: ${e.message}. Please check your connection to the server.`);
        } finally {
            setUploading(false);
        }
    };

    const handleEditClick = async (art: Artwork) => {
        try {
            // Fetch full details
            const res = await fetch(`${getApiUrl()}/artworks/${art.id}`, { credentials: "include" });
            if (res.ok) {
                const fullArt = await res.json();
                setFormData({
                    title: fullArt.title || "",
                    description: fullArt.description || "",
                    materials: fullArt.materials || "",
                    style: fullArt.style || "",
                    year: fullArt.year || new Date().getFullYear(),
                    width_cm: fullArt.width_cm || "",
                    height_cm: fullArt.height_cm || "",
                    depth_cm: fullArt.depth_cm || "",
                    original_price: fullArt.original_price || 0,
                    prints_total: fullArt.prints_total || 27,
                    tags: fullArt.tags ? fullArt.tags.map((t: any) => typeof t === 'number'? t : t.id) : [],
                    collection_id: fullArt.collection_id || null,
                    is_display_only: fullArt.is_display_only || false,
                    original_status: fullArt.original_status || "available"
                });
                setEditingId(fullArt.id);
                setIsFormOpen(true);
            }
        } catch (e) {
            console.error(e);
            alert("Error loading artwork details for editing.");
        }
    };

    if (loading) return <div className="text-zinc-500 font-mono text-sm tracking-widest animate-pulse">Loading admin data...</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-serif italic">Artworks ({artworks.length})</h2>
                <button 
                    onClick={() => {
                        if (isFormOpen) {
                            setIsFormOpen(false);
                            setEditingId(null);
                            setFormData({...defaultForm});
                        } else {
                            setIsFormOpen(true);
                        }
                    }}
                    className="px-4 py-2 border border-[#EAE5D9] text-[#EAE5D9] uppercase font-mono text-xs hover:bg-[#EAE5D9] hover:text-[#111111] transition-colors"
                >
                    {isFormOpen ? "Cancel" : "Add New Artwork"}
                </button>
            </div>

            {isFormOpen && (
                <form onSubmit={handleCreate} className="p-6 border border-white/10 bg-[#1A1A1A] rounded-sm space-y-6 mb-8">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs uppercase font-mono text-zinc-500 mb-2">Title</label>
                            <input required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full bg-black border border-white/20 p-3 text-sm focus:outline-none focus:border-white/50 text-white" placeholder="Artwork title" />
                        </div>
                        <div>
                            <label className="block text-xs uppercase font-mono text-zinc-500 mb-2">Collection</label>
                            <select 
                                value={formData.collection_id || ""} 
                                onChange={e => setFormData({...formData, collection_id: e.target.value ? Number(e.target.value) : null})}
                                className="w-full bg-black border border-white/20 p-3 text-sm focus:outline-none focus:border-white/50 text-white"
                            >
                                <option value="">Draft / Sketch (Default)</option>
                                {collections.map(c => (
                                    <option key={c.id} value={c.id}>{c.title}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs uppercase font-mono text-zinc-500 mb-2">Materials</label>
                            <input value={formData.materials} onChange={e => setFormData({...formData, materials: e.target.value})} className="w-full bg-black border border-white/20 p-3 text-sm focus:outline-none focus:border-white/50 text-white" />
                        </div>
                        <div>
                            <label className="block text-xs uppercase font-mono text-zinc-500 mb-2">Style</label>
                            <input value={formData.style} onChange={e => setFormData({...formData, style: e.target.value})} className="w-full bg-black border border-white/20 p-3 text-sm focus:outline-none focus:border-white/50 text-white" />
                        </div>
                        <div>
                            <label className="block text-xs uppercase font-mono text-zinc-500 mb-2">Year</label>
                            <input type="number" required value={formData.year} onChange={e => setFormData({...formData, year: Number(e.target.value)})} className="w-full bg-black border border-white/20 p-3 text-sm focus:outline-none focus:border-white/50 text-white" />
                        </div>
                        <div>
                            <label className="block text-xs uppercase font-mono text-zinc-500 mb-2">Original Price ($)</label>
                            <input type="number" required value={formData.original_price} onChange={e => setFormData({...formData, original_price: Number(e.target.value)})} className="w-full bg-black border border-white/20 p-3 text-sm focus:outline-none focus:border-white/50 text-white" />
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-6">
                        <div>
                            <label className="block text-xs uppercase font-mono text-zinc-500 mb-2">Width (cm)</label>
                            <input type="number" step="0.1" value={formData.width_cm} onChange={e => setFormData({...formData, width_cm: e.target.value})} className="w-full bg-black border border-white/20 p-3 text-sm focus:outline-none focus:border-white/50 text-white" />
                        </div>
                        <div>
                            <label className="block text-xs uppercase font-mono text-zinc-500 mb-2">Height (cm)</label>
                            <input type="number" step="0.1" value={formData.height_cm} onChange={e => setFormData({...formData, height_cm: e.target.value})} className="w-full bg-black border border-white/20 p-3 text-sm focus:outline-none focus:border-white/50 text-white" />
                        </div>
                        <div>
                            <label className="block text-xs uppercase font-mono text-zinc-500 mb-2">Depth (cm)</label>
                            <input type="number" step="0.1" value={formData.depth_cm} onChange={e => setFormData({...formData, depth_cm: e.target.value})} className="w-full bg-black border border-white/20 p-3 text-sm focus:outline-none focus:border-white/50 text-white" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs uppercase font-mono text-zinc-500 mb-2">Description (Optional)</label>
                        <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} rows={4} className="w-full bg-black border border-white/20 p-3 text-sm focus:outline-none focus:border-white/50 text-white" placeholder="Artwork description..." />
                    </div>
                    
                    <div>
                        <label className="block text-xs uppercase font-mono text-zinc-500 mb-2">Images (First is cover, up to 10)</label>
                        <input 
                            type="file" 
                            multiple 
                            accept="image/*" 
                            onChange={(e) => {
                                const files = Array.from(e.target.files || []).slice(0, 10);
                                setSelectedFiles(files);
                                
                                // Generate previews
                                const urls = files.map(file => URL.createObjectURL(file));
                                setPreviewUrls(urls);
                            }} 
                            className="block w-full text-sm text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-white/10 file:text-white hover:file:bg-white/20" 
                        />
                        
                        {previewUrls.length > 0 && (
                            <div className="flex gap-3 mt-4 overflow-x-auto pb-2 overflow-y-hidden">
                                {previewUrls.map((url, i) => (
                                    <div key={i} className="relative w-24 h-24 shrink-0 border border-white/20 rounded-sm">
                                        <img src={url} className="w-full h-full object-cover" alt="Preview" />
                                        <div className="absolute top-0 left-0 bg-black/60 text-[8px] px-1 text-white font-mono uppercase">
                                            {i === 0 ? "Cover" : `#${i+1}`}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    
                    <div className="pt-2">
                        <button type="submit" disabled={uploading} className="w-full bg-[#EAE5D9] text-[#111111] py-3 uppercase tracking-widest font-mono text-sm disabled:opacity-50 hover:bg-white transition-colors">
                            {uploading ? "Saving..." : "Save Artwork"}
                        </button>
                    </div>
                </form>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
                {artworks.map(art => (
                    <div key={art.id} className="border border-white/10 p-4 relative group bg-white/5">
                        <div className="aspect-4/5 bg-zinc-900 mb-4 overflow-hidden rounded-sm relative">
                            {art.images && art.images.length > 0 ? (
                                <img src={getImageUrl(art.images[0], 'thumb')} alt={art.title} className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-600 font-mono">Process...</div>
                            )}
                        </div>
                        <h3 className="font-serif italic text-lg text-[#F7F3EC] truncate">{art.title}</h3>
                        <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mt-1">${art.original_price}</p>
                        
                        <div className="absolute top-6 right-6 flex gap-2">
                            <button 
                                onClick={() => handleEditClick(art)}
                                className="bg-blue-500/90 text-white text-[10px] font-mono px-3 py-1.5 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity rounded-sm hover:bg-blue-400"
                            >
                                Edit
                            </button>
                            <button 
                                onClick={() => handleDelete(art.id)}
                                className="bg-red-500/90 text-white text-[10px] font-mono px-3 py-1.5 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity rounded-sm hover:bg-red-400"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
