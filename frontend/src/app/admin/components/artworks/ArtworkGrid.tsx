import { Artwork } from "./types";
import { StatusBadge } from "./ui";
import { resolveImageUrl } from "./utils";

interface ArtworkGridProps {
    artworks: Artwork[];
    readinessRefreshing?: boolean;
    handleEditClick: (artwork: Artwork) => void;
    handleDelete: (artworkId: number) => void;
}

export function ArtworkGrid({
    artworks,
    readinessRefreshing = false,
    handleEditClick,
    handleDelete,
}: ArtworkGridProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {artworks.map((artwork) => {
                const readiness = artwork.print_readiness_summary;
                return (
                    <div
                        key={artwork.id}
                        className={`rounded-[24px] overflow-hidden border bg-white shadow-sm ${
                            readiness?.status === "blocked"
                                ? "border-rose-200"
                                : readiness?.status === "attention"
                                ? "border-amber-200"
                                : "border-[#31323E]/10"
                        }`}
                    >
                        <div className="aspect-[4/5] bg-[#31323E]/5 relative overflow-hidden">
                            {artwork.images && artwork.images.length > 0 ? (
                                <img
                                    src={resolveImageUrl(artwork.images[0], "medium")}
                                    alt={artwork.title}
                                    className="absolute inset-0 w-full h-full object-cover"
                                />
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold uppercase tracking-[0.14em] text-[#31323E]/35">
                                    No image
                                </div>
                            )}
                            <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/50 to-transparent flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => void handleEditClick(artwork)}
                                    className="flex-1 rounded-xl bg-white text-[#31323E] text-[11px] font-bold uppercase tracking-[0.14em] px-3 py-2"
                                >
                                    Edit
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void handleDelete(artwork.id)}
                                    className="flex-1 rounded-xl bg-rose-500 text-white text-[11px] font-bold uppercase tracking-[0.14em] px-3 py-2"
                                >
                                    Delete
                                </button>
                            </div>
                        </div>

                        <div className="px-4 py-4 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h3 className="text-base font-bold text-[#31323E] leading-tight">
                                        {artwork.title}
                                    </h3>
                                    <p className="text-sm font-semibold text-[#31323E]/45 mt-1">
                                        Original:{" "}
                                        {artwork.original_price ? `$${artwork.original_price}` : "not priced"}
                                    </p>
                                </div>
                                {readiness ? <StatusBadge status={readiness.status} /> : null}
                            </div>

                            {readiness ? (
                                <div className="rounded-2xl bg-[#31323E]/4 px-3.5 py-3">
                                    <p className="text-sm font-semibold text-[#31323E]">
                                        {readiness.message}
                                    </p>
                                    <div className="flex flex-wrap gap-3 mt-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#31323E]/45">
                                        <span>Ready slots: {readiness.ready_slots}</span>
                                        <span>Blocked slots: {readiness.blocked_slots}</span>
                                        <span>Attention slots: {readiness.attention_step_count}</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="rounded-2xl bg-[#31323E]/4 px-3.5 py-3 text-sm font-medium text-[#31323E]/55">
                                    {readinessRefreshing
                                        ? "Print-prep summary is loading."
                                        : "No print-prep summary yet."}
                                </div>
                            )}

                            <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#31323E]/45">
                                {artwork.show_in_gallery ? (
                                    <span className="rounded-full bg-[#31323E]/6 px-2.5 py-1">
                                        Gallery
                                    </span>
                                ) : null}
                                {artwork.show_in_shop ? (
                                    <span className="rounded-full bg-[#31323E]/6 px-2.5 py-1">
                                        Shop
                                    </span>
                                ) : null}
                                {artwork.has_paper_print || artwork.has_paper_print_limited ? (
                                    <span className="rounded-full bg-[#31323E]/6 px-2.5 py-1">
                                        Paper
                                    </span>
                                ) : null}
                                {artwork.has_canvas_print || artwork.has_canvas_print_limited ? (
                                    <span className="rounded-full bg-[#31323E]/6 px-2.5 py-1">
                                        Canvas
                                    </span>
                                ) : null}
                                {artwork.print_quality_url ? (
                                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
                                        Source linked
                                    </span>
                                ) : null}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
