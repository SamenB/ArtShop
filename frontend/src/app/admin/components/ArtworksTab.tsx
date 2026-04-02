"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { getApiUrl, getImageUrl } from "@/utils";
import SimpleArtworkCropperModal from "./SimpleArtworkCropperModal";

interface ArtworkImage { thumb: string; medium: string; original: string; }
type ImageEntry = string | ArtworkImage;

interface Artwork {
    id: number;
    title: string;
    original_price: number;
    images?: ImageEntry[];
    description?: string;
    has_prints?: boolean;
    orientation?: string;
    base_print_price?: number;
    collection_id?: number | null;
    tags?: { id: number; title: string; category?: string }[];
}

interface Collection { id: number; title: string; }
interface Tag { id: number; title: string; category?: string; }

const STATUS_OPTIONS = [
    { value: "available", label: "Available" },
    { value: "sold", label: "Sold" },
    { value: "reserved", label: "Reserved" },
    { value: "not_for_sale", label: "Not for Sale" },
    { value: "on_exhibition", label: "On Exhibition" },
    { value: "archived", label: "Archived" },
    { value: "digital", label: "Digital" },
];

// ── Drag-and-drop image grid ──────────────────────────────────────────────────
interface DragItem {
    type: "existing" | "new";
    url: string;           // preview URL (existing = resolved, new = object URL)
    existingData?: ImageEntry;
    file?: File;
}

function ImageReorderGrid({
    items,
    onReorder,
    onRemove,
    onAddFiles,
    onCropClick,
    maxItems = 10,
}: {
    items: DragItem[];
    onReorder: (next: DragItem[]) => void;
    onRemove: (idx: number) => void;
    onAddFiles: (files: File[]) => void;
    onCropClick?: (idx: number) => void;
    maxItems?: number;
}) {
    const dragIdx = useRef<number | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleDragStart = (idx: number) => { dragIdx.current = idx; };
    const handleDrop = (idx: number) => {
        if (dragIdx.current === null || dragIdx.current === idx) return;
        const next = [...items];
        const [moved] = next.splice(dragIdx.current, 1);
        next.splice(idx, 0, moved);
        onReorder(next);
        dragIdx.current = null;
    };

    return (
        <div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "12px" }}>
                {items.map((item, i) => (
                    <div
                        key={i}
                        draggable
                        onDragStart={() => handleDragStart(i)}
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => handleDrop(i)}
                        style={{
                            position: "relative", width: "100px", height: "100px",
                            border: "1px solid rgba(255,255,255,0.2)", borderRadius: "3px",
                            overflow: "hidden", cursor: "grab", flexShrink: 0,
                            boxShadow: i === 0 ? "0 0 0 2px #EAE5D9" : "none",
                            transition: "box-shadow 0.2s",
                        }}
                    >
                        <img src={item.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
                        {/* Cover badge */}
                        {i === 0 && (
                            <div style={{ position: "absolute", top: 0, left: 0, backgroundColor: "rgba(234,229,217,0.9)", color: "#111", fontSize: "8px", padding: "2px 5px", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                Cover
                            </div>
                        )}
                        {/* Index badge */}
                        {i > 0 && (
                            <div style={{ position: "absolute", top: 0, left: 0, backgroundColor: "rgba(0,0,0,0.5)", color: "#fff", fontSize: "8px", padding: "2px 5px", fontFamily: "var(--font-mono)" }}>
                                #{i + 1}
                            </div>
                        )}
                        {/* Remove button */}
                        <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(i); }}
                            style={{ position: "absolute", top: "3px", right: "3px", width: "18px", height: "18px", borderRadius: "50%", backgroundColor: "rgba(200,50,50,0.85)", border: "none", color: "#fff", fontSize: "10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}
                            title="Remove"
                        >×</button>
                        {/* Crop button (only for new uploads) */}
                        {item.type === "new" && onCropClick && (
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); e.preventDefault(); onCropClick(i); }}
                                style={{ position: "absolute", bottom: "3px", right: "3px", width: "18px", height: "18px", borderRadius: "50%", backgroundColor: "rgba(50,150,250,0.85)", border: "none", color: "#fff", fontSize: "10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}
                                title="Crop Image"
                            >◩</button>
                        )}
                    </div>
                ))}

                {/* Add more button */}
                {items.length < maxItems && (
                    <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); inputRef.current?.click(); }}
                        style={{ width: "100px", height: "100px", border: "1px dashed rgba(255,255,255,0.25)", borderRadius: "3px", backgroundColor: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.4)", fontSize: "2rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "border-color 0.2s, color 0.2s" }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.5)"; e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)"; e.currentTarget.style.color = "rgba(255,255,255,0.4)"; }}
                    >+</button>
                )}
                <input ref={inputRef} type="file" multiple accept="image/*" style={{ display: "none" }}
                    onClick={(e) => { (e.target as HTMLInputElement).value = ""; }}
                    onChange={e => {
                        const files = Array.from(e.target.files || []).slice(0, maxItems - items.length);
                        if (files.length > 0) onAddFiles(files);
                        (e.target as HTMLInputElement).value = ""; // Also clear here just in case
                    }}
                />
            </div>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "rgba(255,255,255,0.3)", marginTop: "8px", letterSpacing: "0.05em" }}>
                Drag to reorder · First image is cover · Up to {maxItems} photos
            </p>
        </div>
    );
}

// ── Tag multi-select ──────────────────────────────────────────────────────────
function TagMultiSelect({ tags, selected, onChange, placeholder }: {
    tags: Tag[];
    selected: number[];
    onChange: (ids: number[]) => void;
    placeholder: string;
}) {
    const toggle = (id: number) =>
        onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]);

    return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {tags.map(t => {
                const active = selected.includes(t.id);
                return (
                    <button key={t.id} type="button" onClick={() => toggle(t.id)}
                        style={{
                            padding: "4px 10px", borderRadius: "20px",
                            border: `1px solid ${active ? "#EAE5D9" : "rgba(255,255,255,0.2)"}`,
                            backgroundColor: active ? "rgba(234,229,217,0.15)" : "transparent",
                            color: active ? "#EAE5D9" : "rgba(255,255,255,0.45)",
                            fontFamily: "var(--font-sans)", fontSize: "0.72rem",
                            cursor: "pointer", transition: "all 0.15s",
                        }}>
                        {t.title}
                    </button>
                );
            })}
            {tags.length === 0 && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: "rgba(255,255,255,0.3)", fontStyle: "italic" }}>
                    {placeholder}
                </span>
            )}
        </div>
    );
}

// ── Internal Components ─────────────────────────────────────────────────────

function FieldLabel({ text, required = false, valid = true }: { text: string; required?: boolean; valid?: boolean }) {
    return (
        <div className="flex items-center gap-2 mb-2">
            <div className={`w-2 h-2 rounded-full shrink-0 ${valid ? "bg-green-500" : "bg-orange-500"}`} />
            <label className="block text-[10px] uppercase font-mono text-zinc-500 tracking-widest">
                {text} {required && "*"}
            </label>
        </div>
    );
}

// ── Section heading ───────────────────────────────────────────────────────────
function FormSection({ title }: { title: string }) {
    return (
        <div className="border-b border-zinc-700 pb-2 mb-4 mt-6">
            <span className="font-mono text-xs font-bold tracking-widest uppercase text-[#F7F3EC]">{title}</span>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ArtworksTab() {
    const [artworks, setArtworks] = useState<Artwork[]>([]);
    const [collections, setCollections] = useState<Collection[]>([]);
    const [mediumTags, setMediumTags] = useState<Tag[]>([]);
    const [loading, setLoading] = useState(true);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);

    // Image drag-and-drop state
    const [imageItems, setImageItems] = useState<DragItem[]>([]);
    
    // Cropper state
    const [cropImageIndex, setCropImageIndex] = useState<number | null>(null);

    const defaultForm = {
        title: "",
        description: "",
        materials: "",
        year: new Date().getFullYear(),
        width_cm: "" as string | number,
        height_cm: "" as string | number,
        original_price: 1000,
        has_prints: false,
        orientation: "Horizontal",
        base_print_price: 100,
        tags: [] as number[],
        collection_id: null as number | null,
        original_status: "available",
    };
    const [formData, setFormData] = useState<any>(defaultForm);

    const resolveImageUrl = useCallback((img: ImageEntry): string => {
        if (typeof img === "string") return img.startsWith("http") ? img : `${getApiUrl().replace("/api", "")}${img}`;
        return getImageUrl(img, "thumb") || "";
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [artRes, collRes, tagRes] = await Promise.all([
                fetch(`${getApiUrl()}/artworks?limit=100`, { credentials: "include" }),
                fetch(`${getApiUrl()}/collections`, { credentials: "include" }),
                fetch(`${getApiUrl()}/tags?category=medium`, { credentials: "include" }),
            ]);
            if (artRes.ok) { const d = await artRes.json(); setArtworks(d.items || d); }
            if (collRes.ok) { const d = await collRes.json(); setCollections(d); }
            if (tagRes.ok) { const d = await tagRes.json(); setMediumTags(d); }
        } catch (e) { console.error("Fetch error:", e); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchData(); }, []);

    const addFiles = (files: File[]) => {
        const newItems: DragItem[] = files.map(f => ({
            type: "new", url: URL.createObjectURL(f), file: f,
        }));
        setImageItems(prev => [...prev, ...newItems].slice(0, 10));
    };

    const removeImage = (idx: number) => setImageItems(prev => prev.filter((_, i) => i !== idx));

    const handleSaveCrop = async (croppedBlob: Blob) => {
        if (cropImageIndex === null) return;
        const newFile = new File([croppedBlob], `cropped-${Date.now()}.webp`, { type: "image/webp" });
        setImageItems(prev => {
            const next = [...prev];
            next[cropImageIndex] = {
                type: "new",
                url: URL.createObjectURL(newFile),
                file: newFile,
            };
            return next;
        });
        setCropImageIndex(null);
    };

    // ── Submit ────────────────────────────────────────────────────────────────
    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!formData.title?.trim()) return alert("Title is required.");
        if (formData.original_status === "available" && Number(formData.original_price) <= 0) return alert("Original Price is required and must be > 0 when status is Available.");
        if (formData.has_prints && Number(formData.base_print_price) <= 0) return alert("Base Print Price is required and must be > 0 when Prints are available.");
        if (imageItems.length === 0) return alert("At least one photo is required.");

        setUploading(true);
        const apiUrl = getApiUrl();
        const payload = { ...formData };
        if (payload.width_cm) payload.width_in = Number((parseFloat(payload.width_cm) * 0.393701).toFixed(2));
        if (payload.height_cm) payload.height_in = Number((parseFloat(payload.height_cm) * 0.393701).toFixed(2));

        // Conditionally nullify unused prices based on status toggles
        if (payload.original_status !== "available") payload.original_price = null;
        if (!payload.has_prints) payload.base_print_price = null;
        
        // Nullify dimensions if digital or empty
        if (payload.original_status === "digital") {
            payload.width_cm = null;
            payload.height_cm = null;
            payload.width_in = null;
            payload.height_in = null;
        } else {
            if (!payload.width_cm || payload.width_cm === "") {
                payload.width_cm = null;
                payload.width_in = null;
            }
            if (!payload.height_cm || payload.height_cm === "") {
                payload.height_cm = null;
                payload.height_in = null;
            }
        }

        const method = editingId ? "PUT" : "POST";
        const url = editingId ? `${apiUrl}/artworks/${editingId}` : `${apiUrl}/artworks`;

        try {
            const res = await fetch(url, {
                method, headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload), credentials: "include",
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                alert(`Save failed: ${res.status} ${JSON.stringify(err)}`);
                return;
            }

            const data = await res.json();
            const targetId = editingId || data.data?.id;

            // Step 1 (edit only): Save current state of existing images (removes + reordering).
            // This MUST happen BEFORE uploading new files, so Celery reads the correct base list.
            if (editingId) {
                const existingOrdered = imageItems
                    .filter(it => it.type === "existing")
                    .map(it => it.existingData!);
                // Always PATCH to apply removals/reordering (even if empty — that means all were removed)
                await fetch(`${apiUrl}/artworks/${editingId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ images: existingOrdered }),
                    credentials: "include",
                });
            }

            // Step 2: Upload new files. Celery will read the PATCH-updated DB and append to it.
            const newFiles = imageItems.filter(it => it.type === "new" && it.file).map(it => it.file!);
            if (newFiles.length > 0 && targetId) {
                const fd = new FormData();
                newFiles.forEach(f => fd.append("files", f));
                await fetch(`${apiUrl}/artworks/${targetId}/images`, { method: "POST", body: fd, credentials: "include" });
            }

            alert(`Artwork ${editingId ? "updated" : "created"}! Images processing in background.`);
            setIsFormOpen(false);
            setEditingId(null);
            setImageItems([]);
            setFormData({ ...defaultForm });
            fetchData();
        } catch (err: any) {
            alert(`Network error: ${err.message}`);
        } finally {
            setUploading(false);
        }
    };

    // ── Edit click ────────────────────────────────────────────────────────────
    const handleEditClick = async (art: Artwork) => {
        try {
            const res = await fetch(`${getApiUrl()}/artworks/${art.id}`, { credentials: "include" });
            if (!res.ok) return;
            const full = await res.json();
            setFormData({
                title: full.title || "",
                description: full.description || "",
                materials: full.materials || "",
                year: full.year || new Date().getFullYear(),
                width_cm: full.width_cm || "",
                height_cm: full.height_cm || "",
                original_price: full.original_price || 0,
                has_prints: full.has_prints || false,
                orientation: full.orientation || "Horizontal",
                base_print_price: full.base_print_price || 0,
                tags: (full.tags || []).map((t: any) => typeof t === "number" ? t : t.id),
                collection_id: full.collection_id || null,
                original_status: full.original_status || "available",
            });
            // Populate existing images for reorder
            const existing: DragItem[] = (full.images || []).map((img: ImageEntry) => ({
                type: "existing" as const,
                url: resolveImageUrl(img),
                existingData: img,
            }));
            setImageItems(existing);
            setEditingId(full.id);
            setIsFormOpen(true);
        } catch (e) {
            console.error(e);
            alert("Error loading artwork details.");
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm("Delete this artwork?")) return;
        const res = await fetch(`${getApiUrl()}/artworks/${id}`, { method: "DELETE", credentials: "include" });
        if (res.ok) setArtworks(artworks.filter(a => a.id !== id));
        else alert("Delete failed");
    };

    const inp = "w-full bg-black border border-white/20 p-3 text-sm focus:outline-none focus:border-white/50 text-white";

    if (loading) return <div className="text-zinc-500 font-mono text-sm tracking-widest animate-pulse">Loading admin data...</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-serif italic">Artworks ({artworks.length})</h2>
                <button
                    onClick={() => {
                        if (isFormOpen) { setIsFormOpen(false); setEditingId(null); setFormData({ ...defaultForm }); setImageItems([]); }
                        else setIsFormOpen(true);
                    }}
                    className="px-4 py-2 border border-[#EAE5D9] text-[#EAE5D9] uppercase font-mono text-xs hover:bg-[#EAE5D9] hover:text-[#111111] transition-colors"
                >
                    {isFormOpen ? "Cancel" : "Add New Artwork"}
                </button>
            </div>

            {isFormOpen && (
                <form onSubmit={handleCreate} className="p-6 border border-white/10 bg-[#151515] rounded-xl shadow-2xl space-y-6 mb-8">
                    {/* ── Identity ── */}
                    <div>
                        <FormSection title="Identity" />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-4">
                            <div>
                                <FieldLabel text="Title" required valid={formData.title?.trim().length > 0} />
                                <input required value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} className={inp} placeholder="Artwork title" />
                            </div>
                            <div>
                                <FieldLabel text="Year" valid={!!formData.year} />
                                <input type="number" value={formData.year} onChange={e => setFormData({ ...formData, year: Number(e.target.value) })} className={inp} />
                            </div>
                        </div>
                    </div>

                    {/* ── Classification ── */}
                    <div>
                        <FormSection title="Classification" />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-4">
                            <div>
                                <FieldLabel text="Collection" valid={!!formData.collection_id} />
                                <select value={formData.collection_id || ""} onChange={e => setFormData({ ...formData, collection_id: e.target.value ? Number(e.target.value) : null })} className={inp}>
                                    <option value="">Uncategorised</option>
                                    {collections.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                                </select>
                            </div>
                            <div>
                                <FieldLabel text="Orientation" valid={!!formData.orientation} />
                                <select value={formData.orientation} onChange={e => setFormData({ ...formData, orientation: e.target.value })} className={inp}>
                                    <option value="Horizontal">Horizontal</option>
                                    <option value="Vertical">Vertical</option>
                                    <option value="Square">Square</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* ── Original ── */}
                    <div>
                        <FormSection title="Original" />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-4">
                            <div>
                                <FieldLabel text="Status" required valid={!!formData.original_status} />
                                <select value={formData.original_status} onChange={e => setFormData({ ...formData, original_status: e.target.value })} className={inp}>
                                    {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                            </div>
                            {formData.original_status === "available" && (
                                <div>
                                    <FieldLabel text="Original Price ($)" required valid={Number(formData.original_price) > 0} />
                                    <input type="number" value={formData.original_price || ""} onChange={e => setFormData({ ...formData, original_price: Number(e.target.value) })} className={inp} />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── Prints ── */}
                    <div>
                        <FormSection title="Prints" />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-4 h-full">
                            <div className="flex flex-col justify-end">
                                <FieldLabel text="Prints Available" valid={true} />
                                <select value={formData.has_prints ? "yes" : "no"} onChange={e => setFormData({ ...formData, has_prints: e.target.value === "yes" })} className={inp}>
                                    <option value="yes">Available</option>
                                    <option value="no">Not Available</option>
                                </select>
                            </div>
                            {formData.has_prints && (
                                <div>
                                    <FieldLabel text="Base Print Price ($)" required valid={Number(formData.base_print_price) > 0} />
                                    <input type="number" value={formData.base_print_price || ""} onChange={e => setFormData({ ...formData, base_print_price: Number(e.target.value) })} className={inp} />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── Dimensions ── */}
                    {formData.original_status !== "digital" && (
                        <div>
                            <FormSection title="Dimensions (cm)" />
                            <div className="grid grid-cols-2 gap-6 mt-4">
                                <div>
                                    <FieldLabel text="Width" valid={!!formData.width_cm} />
                                    <input type="number" step="0.1" value={formData.width_cm} onChange={e => setFormData({ ...formData, width_cm: e.target.value })} className={inp} />
                                </div>
                                <div>
                                    <FieldLabel text="Height" valid={!!formData.height_cm} />
                                    <input type="number" step="0.1" value={formData.height_cm} onChange={e => setFormData({ ...formData, height_cm: e.target.value })} className={inp} />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Description ── */}
                    <div>
                        <FormSection title="Description" />
                        <div className="mt-4">
                            <FieldLabel text="Medium / Materials" valid={formData.tags?.length > 0} />
                            <TagMultiSelect
                                tags={mediumTags}
                                selected={formData.tags}
                                onChange={ids => setFormData({ ...formData, tags: ids })}
                                placeholder="No medium tags yet — create them in the Tags tab with category = medium"
                            />
                        </div>
                        <div className="mt-4">
                            <FieldLabel text="Description" valid={formData.description?.trim().length > 0} />
                            <textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} rows={4} className={inp} placeholder="Artwork description..." />
                        </div>
                    </div>

                    {/* ── Images ── */}
                    <div>
                        <FormSection title="Photos (up to 10)" />
                        <ImageReorderGrid
                            items={imageItems}
                            onReorder={setImageItems}
                            onRemove={removeImage}
                            onAddFiles={addFiles}
                            onCropClick={(idx) => setCropImageIndex(idx)}
                            maxItems={10}
                        />
                    </div>

                    <button type="submit" disabled={uploading} className="w-full bg-[#EAE5D9] text-[#111111] py-3 uppercase tracking-widest font-mono text-sm disabled:opacity-50 hover:bg-white transition-colors">
                        {uploading ? "Saving..." : editingId ? "Update Artwork" : "Create Artwork"}
                    </button>
                </form>
            )}

            <SimpleArtworkCropperModal
                isOpen={cropImageIndex !== null}
                imageSrc={cropImageIndex !== null && imageItems[cropImageIndex]?.url ? imageItems[cropImageIndex].url : ""}
                onClose={() => setCropImageIndex(null)}
                onSaveCrop={handleSaveCrop}
            />

            {/* Artwork grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
                {artworks.map(art => (
                    <div key={art.id} className="border border-white/10 p-4 relative group bg-white/5">
                        <div className="aspect-4/5 bg-zinc-900 mb-4 overflow-hidden rounded-sm relative">
                            {art.images && art.images.length > 0 ? (
                                <img src={getImageUrl(art.images[0], "thumb")} alt={art.title} className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-600 font-mono">No image</div>
                            )}
                        </div>
                        <h3 className="font-serif italic text-lg text-[#F7F3EC] truncate">{art.title}</h3>
                        <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mt-1">${art.original_price}</p>
                        <div className="absolute top-6 right-6 flex gap-2">
                            <button onClick={() => handleEditClick(art)} className="bg-blue-500/90 text-white text-[10px] font-mono px-3 py-1.5 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity rounded-sm hover:bg-blue-400">Edit</button>
                            <button onClick={() => handleDelete(art.id)} className="bg-red-500/90 text-white text-[10px] font-mono px-3 py-1.5 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity rounded-sm hover:bg-red-400">Delete</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
