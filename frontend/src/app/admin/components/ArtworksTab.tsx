"use client";

import { useEffect, useState } from "react";

import { apiFetch, getApiUrl } from "@/utils";

import SimpleArtworkCropperModal from "./SimpleArtworkCropperModal";
import { ArtworkBasicsForm } from "./artworks/ArtworkBasicsForm";
import { ArtworkGrid } from "./artworks/ArtworkGrid";
import { ArtworkMediaForm } from "./artworks/ArtworkMediaForm";
import { ArtworkOfferingsForm } from "./artworks/ArtworkOfferingsForm";
import { ArtworkPipelineForm } from "./artworks/ArtworkPipelineForm";
import {
    AspectRatio,
    Artwork,
    ArtworkFormState,
    ArtworkPrintWorkflowPayload,
    DragItem,
    Label,
    LabelCategory,
} from "./artworks/types";
import { StatusBadge } from "./artworks/ui";
import {
    buildFormPayload,
    createDefaultFormState,
    currentYear,
    extractCanvasWrapSelectionFromOverrides,
    hasCanvasOfferings,
    hasMissingPrintRatio,
    hasOfferingValidationIssues,
    hasPrintOfferings,
    resolveImageUrl,
    uploadFormDataWithProgress,
    WORKFLOW_STEP_ORDER,
} from "./artworks/utils";

export default function ArtworksTab() {
    const [artworks, setArtworks] = useState<Artwork[]>([]);
    const [categories, setCategories] = useState<LabelCategory[]>([]);
    const [labels, setLabels] = useState<Label[]>([]);
    const [aspectRatios, setAspectRatios] = useState<AspectRatio[]>([]);
    const [loading, setLoading] = useState(true);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [savingArtwork, setSavingArtwork] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [imageItems, setImageItems] = useState<DragItem[]>([]);
    const [cropImageIndex, setCropImageIndex] = useState<number | null>(null);
    const [workflowData, setWorkflowData] = useState<ArtworkPrintWorkflowPayload | null>(null);
    const [workflowLoading, setWorkflowLoading] = useState(false);
    const [workflowError, setWorkflowError] = useState<string | null>(null);
    const [editingWhiteBorder, setEditingWhiteBorder] = useState(false);
    const [whiteBorderDraft, setWhiteBorderDraft] = useState("");
    const [assetUploadingSlot, setAssetUploadingSlot] = useState<string | null>(null);
    const [assetUploadProgress, setAssetUploadProgress] = useState<Record<string, number>>({});
    const [notice, setNotice] = useState<string | null>(null);
    const [payloadRefreshLoading, setPayloadRefreshLoading] = useState(false);
    const [payloadRefreshMessage, setPayloadRefreshMessage] = useState<string | null>(null);
    const [payloadRefreshError, setPayloadRefreshError] = useState<string | null>(null);
    const [activeStep, setActiveStep] =
        useState<(typeof WORKFLOW_STEP_ORDER)[number]["id"]>("basics");
    const [formData, setFormData] = useState<ArtworkFormState>(createDefaultFormState());

    const fetchData = async () => {
        setLoading(true);
        try {
            const [artworksRes, categoriesRes, labelsRes, ratiosRes] = await Promise.all([
                apiFetch(`${getApiUrl()}/artworks/admin/list?limit=200`),
                apiFetch(`${getApiUrl()}/labels/categories`),
                apiFetch(`${getApiUrl()}/labels`),
                apiFetch(`${getApiUrl()}/print-pricing/aspect-ratios`),
            ]);

            if (artworksRes.ok) {
                setArtworks(await artworksRes.json());
            }
            if (categoriesRes.ok) {
                setCategories(await categoriesRes.json());
            }
            if (labelsRes.ok) {
                setLabels(await labelsRes.json());
            }
            if (ratiosRes.ok) {
                setAspectRatios(await ratiosRes.json());
            }
        } catch (error) {
            console.error("Failed to fetch artwork admin data", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchWorkflow = async (artworkId: number) => {
        setWorkflowLoading(true);
        setWorkflowError(null);
        try {
            const response = await apiFetch(`${getApiUrl()}/artworks/${artworkId}/print-workflow?t=${Date.now()}`);
            if (!response.ok) {
                throw new Error(`Workflow request failed with ${response.status}`);
            }
            setWorkflowData((await response.json()) as ArtworkPrintWorkflowPayload);
        } catch (error) {
            console.error(error);
            setWorkflowData(null);
            setWorkflowError("Could not load print workflow yet.");
        } finally {
            setWorkflowLoading(false);
        }
    };

    const refreshArtworkPayloads = async () => {
        setPayloadRefreshLoading(true);
        setPayloadRefreshMessage(null);
        setPayloadRefreshError(null);
        try {
            const response = await apiFetch(`${getApiUrl()}/v1/admin/prodigi/refresh-artwork-payloads`, {
                method: "POST",
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(
                    payload.detail || payload.message || "Could not refresh artwork payloads."
                );
            }

            await fetchData();
            if (editingId) {
                await fetchWorkflow(editingId);
            }

            const bakeId = payload?.bake?.id;
            const materializedCount = payload?.artwork_storefront_materialization?.materialized_count;
            const deletedKeys = payload?.cache_clear?.deleted_keys;
            const summaryParts = [
                "Payloads refreshed.",
                typeof bakeId === "number" ? `Bake #${bakeId}.` : null,
                typeof materializedCount === "number"
                    ? `${materializedCount} artwork payloads rebuilt.`
                    : null,
                typeof deletedKeys === "number" ? `${deletedKeys} cache keys cleared.` : null,
            ].filter(Boolean);
            setPayloadRefreshMessage(summaryParts.join(" "));
        } catch (error) {
            console.error(error);
            setPayloadRefreshError(
                error instanceof Error ? error.message : "Could not refresh artwork payloads."
            );
        } finally {
            setPayloadRefreshLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const resetEditor = () => {
        setFormData(createDefaultFormState());
        setImageItems([]);
        setEditingId(null);
        setWorkflowData(null);
        setWorkflowError(null);
        setNotice(null);
        setActiveStep("basics");
        setIsFormOpen(false);
    };

    const openNewEditor = () => {
        setFormData(createDefaultFormState());
        setImageItems([]);
        setEditingId(null);
        setWorkflowData(null);
        setWorkflowError(null);
        setNotice(null);
        setActiveStep("basics");
        setIsFormOpen(true);
        window.requestAnimationFrame(() => {
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
    };

    const handleSaveCrop = async (croppedBlob: Blob) => {
        if (cropImageIndex === null) {
            return;
        }
        const file = new File([croppedBlob], `cropped-${Date.now()}.webp`, {
            type: "image/webp",
        });
        setImageItems((previous) => {
            const next = [...previous];
            next[cropImageIndex] = {
                type: "new",
                url: URL.createObjectURL(file),
                file,
            };
            return next;
        });
        setCropImageIndex(null);
    };

    const saveArtwork = async () => {
        if (!formData.title.trim()) {
            window.alert("Title is required.");
            return null;
        }

        if (hasPrintOfferings(formData) && !formData.print_aspect_ratio_id) {
            window.alert("Please choose a print aspect ratio in the Basics section before enabling print offerings.");
            return null;
        }

        if (hasCanvasOfferings(formData) && !formData.canvas_wrap_style) {
            window.alert("Please choose a canvas wrap in Offerings before saving canvas prints.");
            return null;
        }

        if (formData.has_original && formData.original_status === "available") {
            const originalPrice = Number(formData.original_price || 0);
            if (originalPrice <= 0) {
                window.alert("Original price must be greater than zero when the original is sellable.");
                return null;
            }
        }

        setSavingArtwork(true);
        setNotice(null);

        try {
            const payload = buildFormPayload(formData);
            const method = editingId ? "PUT" : "POST";
            const url = editingId
                ? `${getApiUrl()}/artworks/${editingId}`
                : `${getApiUrl()}/artworks`;

            const response = await apiFetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorPayload = await response.json().catch(() => ({}));
                window.alert(`Save failed: ${response.status} ${JSON.stringify(errorPayload)}`);
                return null;
            }

            const data = await response.json();
            const targetId = editingId || data.data?.id;
            if (!targetId) {
                throw new Error("Artwork ID was not returned after save.");
            }

            if (editingId) {
                const existingOrdered = imageItems
                    .filter((item) => item.type === "existing")
                    .map((item) => item.existingData);
                await apiFetch(`${getApiUrl()}/artworks/${editingId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ images: existingOrdered }),
                });
            }

            const newFiles = imageItems
                .filter((item) => item.type === "new" && item.file)
                .map((item) => item.file as File);
            if (newFiles.length > 0) {
                const body = new FormData();
                newFiles.forEach((file) => body.append("files", file));
                await apiFetch(`${getApiUrl()}/artworks/${targetId}/images`, {
                    method: "POST",
                    body,
                });
            }

            setEditingId(targetId);
            setIsFormOpen(true);
            setNotice(
                editingId
                    ? "Artwork updated. Draft state and print workflow were refreshed."
                    : "Artwork draft created. You can continue through the print workflow now."
            );

            await fetchData();

            if (hasPrintOfferings(formData)) {
                await fetchWorkflow(targetId);
                if (!editingId) {
                    setActiveStep(formData.print_aspect_ratio_id ? "pipeline" : "basics");
                }
            } else {
                setWorkflowData(null);
            }

            return targetId;
        } catch (error) {
            console.error(error);
            window.alert("Network error while saving the artwork.");
            return null;
        } finally {
            setSavingArtwork(false);
        }
    };

    const handleEditClick = async (artwork: Artwork) => {
        setNotice(null);
        setWorkflowError(null);

        try {
            const response = await apiFetch(`${getApiUrl()}/artworks/${artwork.id}`);
            if (!response.ok) {
                throw new Error(`Artwork request failed with ${response.status}`);
            }
            const full = (await response.json()) as Artwork;
            setFormData({
                title: full.title || "",
                description: full.description || "",
                year: full.year || currentYear,
                width_cm: full.width_cm || "",
                height_cm: full.height_cm || "",
                original_price: full.original_price || "",
                has_original: Boolean(full.has_original),
                has_canvas_print: Boolean(full.has_canvas_print),
                has_canvas_print_limited: Boolean(full.has_canvas_print_limited),
                has_paper_print: Boolean(full.has_paper_print),
                has_paper_print_limited: Boolean(full.has_paper_print_limited),
                canvas_print_limited_quantity: full.canvas_print_limited_quantity || "",
                paper_print_limited_quantity: full.paper_print_limited_quantity || "",
                white_border_pct: full.white_border_pct ?? 5,
                print_aspect_ratio_id: full.print_aspect_ratio_id || null,
                orientation: full.orientation || "Horizontal",
                labels: (full.labels || []).map((label) => label.id),
                original_status: full.original_status || "available",
                print_quality_url: full.print_quality_url || "",
                print_profile_overrides: (full.print_profile_overrides as Record<string, unknown> | null) || null,
                canvas_wrap_style: extractCanvasWrapSelectionFromOverrides(
                    full.print_profile_overrides as Record<string, unknown> | null
                ),
            });
            setImageItems(
                (full.images || []).map((image) => ({
                    type: "existing" as const,
                    url: resolveImageUrl(image),
                    existingData: image,
                }))
            );
            setEditingId(full.id);
            setIsFormOpen(true);
            setActiveStep("basics");
            window.requestAnimationFrame(() => {
                window.scrollTo({ top: 0, behavior: "smooth" });
            });

            if (
                full.has_canvas_print ||
                full.has_canvas_print_limited ||
                full.has_paper_print ||
                full.has_paper_print_limited
            ) {
                await fetchWorkflow(full.id);
            } else {
                setWorkflowData(null);
            }
        } catch (error) {
            console.error(error);
            window.alert("Error loading artwork details.");
        }
    };

    const handleDelete = async (artworkId: number) => {
        if (!window.confirm("Delete this artwork?")) {
            return;
        }

        const response = await apiFetch(`${getApiUrl()}/artworks/${artworkId}`, {
            method: "DELETE",
        });
        if (!response.ok) {
            window.alert("Delete failed.");
            return;
        }

        setArtworks((previous) => previous.filter((artwork) => artwork.id !== artworkId));
        if (editingId === artworkId) {
            resetEditor();
        }
    };

    const uploadMasterAsset = async (slotId: string, assetRole: string, file: File) => {
        if (!editingId) {
            return;
        }

        if (assetRole === "master" && hasCanvasOfferings(formData) && !formData.canvas_wrap_style) {
            setWorkflowError("Choose a canvas wrap and save the artwork draft before uploading the master.");
            return;
        }

        setAssetUploadingSlot(slotId);
        setAssetUploadProgress((previous) => ({ ...previous, [slotId]: 0 }));
        setWorkflowError(null);

        try {
            const body = new FormData();
            body.append("file", file);
            body.append("asset_role", assetRole);
            body.append("category_id", slotId);

            const payload = await uploadFormDataWithProgress<{
                generated_assets?: unknown[];
                derivatives_scheduled?: boolean;
            }>(`${getApiUrl()}/artworks/${editingId}/print-assets`, body, (progress) => {
                setAssetUploadProgress((previous) => ({ ...previous, [slotId]: progress }));
            });
            await fetchWorkflow(editingId);
            const generatedCount = Array.isArray(payload.generated_assets)
                ? payload.generated_assets.length
                : 0;
            setNotice(
                payload.derivatives_scheduled
                    ? `Master uploaded for ${slotId}. Provider-ready files are being generated in the background.`
                    : generatedCount > 0
                    ? `Master uploaded for ${slotId}. ${generatedCount} derivatives generated automatically.`
                    : `Master uploaded for ${slotId}.`
            );
            if (payload.derivatives_scheduled) {
                window.setTimeout(() => {
                    void fetchWorkflow(editingId);
                }, 2500);
            }
        } catch (error) {
            console.error(error);
            setWorkflowError(error instanceof Error ? error.message : "Upload failed.");
        } finally {
            setAssetUploadingSlot(null);
            window.setTimeout(() => {
                setAssetUploadProgress((previous) => {
                    const next = { ...previous };
                    delete next[slotId];
                    return next;
                });
            }, 800);
        }
    };

    const deleteMasterAsset = async (assetId: number) => {
        if (!editingId) {
            return;
        }
        const response = await apiFetch(`${getApiUrl()}/artworks/${editingId}/print-assets/${assetId}`, {
            method: "DELETE",
        });
        if (!response.ok) {
            window.alert("Could not delete asset.");
            return;
        }
        await fetchWorkflow(editingId);
        await fetchData();
    };

    const stepStatusMap: Record<(typeof WORKFLOW_STEP_ORDER)[number]["id"], string> = {
        basics: !formData.title.trim()
            ? "blocked"
            : hasMissingPrintRatio(formData)
            ? "attention"
            : "ready",
        offerings: hasOfferingValidationIssues(formData) ? "attention" : "ready",
        pipeline: !hasPrintOfferings(formData)
            ? "ready"
            : hasMissingPrintRatio(formData)
            ? "blocked"
            : editingId
            ? workflowData
                ? workflowData.overall_status === "ready"
                    ? "ready"
                    : workflowData.overall_status === "blocked"
                    ? "blocked"
                    : "attention"
                : "attention"
            : "attention",
        media: imageItems.length > 0 ? "ready" : "attention",
    };

    const headerReadiness = hasPrintOfferings(formData)
        ? hasMissingPrintRatio(formData)
            ? { status: "blocked", message: "Choose a print aspect ratio in Basics." }
            : workflowData?.readiness_summary || null
        : null;

    if (loading) {
        return (
            <div className="flex items-center gap-3 py-10">
                <div className="w-5 h-5 border-2 border-[#31323E]/20 border-t-[#31323E] rounded-full animate-spin" />
                <span className="text-sm font-semibold text-[#31323E]/50 uppercase tracking-[0.14em]">
                    Loading artworks
                </span>
            </div>
        );
    }

    return (
        <div className="space-y-8 text-[#31323E]">
            <div className="flex flex-wrap justify-between items-start gap-4 pb-6 border-b border-[#31323E]/8">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-[#31323E] mb-1">
                        Artwork Workbench
                    </h2>
                    <p className="text-sm text-[#31323E]/50 font-medium">
                        {artworks.length} artworks in one editor
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={() => void refreshArtworkPayloads()}
                        disabled={payloadRefreshLoading}
                        className="px-5 py-2.5 rounded-xl border border-[#31323E]/15 bg-white text-[#31323E] text-sm font-bold uppercase tracking-[0.14em] disabled:opacity-50"
                    >
                        {payloadRefreshLoading ? "Refreshing..." : "Refresh Payloads"}
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            if (isFormOpen) {
                                resetEditor();
                            } else {
                                openNewEditor();
                            }
                        }}
                        className={`px-5 py-2.5 rounded-xl text-sm font-bold uppercase tracking-[0.14em] transition-colors ${
                            isFormOpen
                                ? "bg-[#31323E]/10 text-[#31323E] border border-[#31323E]/15"
                                : "bg-[#31323E] text-white hover:bg-[#434455]"
                        }`}
                    >
                        {isFormOpen ? "Close Editor" : "New Artwork"}
                    </button>
                </div>
            </div>

            {payloadRefreshMessage ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                    {payloadRefreshMessage}
                </div>
            ) : null}

            {payloadRefreshError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                    {payloadRefreshError}
                </div>
            ) : null}

            {isFormOpen ? (
                <div className="bg-[#FCFBF8] border border-[#31323E]/10 rounded-[28px] shadow-sm overflow-hidden">
                    <div className="px-8 py-6 border-b border-[#31323E]/8 bg-white">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <h3 className="text-xl font-bold text-[#31323E]">
                                    {editingId ? "Edit Artwork" : "Create Artwork Draft"}
                                </h3>
                                <p className="text-sm font-medium text-[#31323E]/45 mt-1">
                                    Set the artwork, then upload the production masters only where needed.
                                </p>
                            </div>

                            {headerReadiness ? (
                                <div className="text-right">
                                    <StatusBadge
                                        status={headerReadiness.status}
                                        label={headerReadiness.message}
                                    />
                                </div>
                            ) : null}
                        </div>

                        <div className="grid grid-cols-2 xl:grid-cols-5 gap-3 mt-6">
                            {WORKFLOW_STEP_ORDER.map((step) => (
                                <button
                                    key={step.id}
                                    type="button"
                                    onClick={() => setActiveStep(step.id)}
                                    className={`relative flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border text-left transition-colors ${
                                        activeStep === step.id
                                            ? "bg-white border-[#31323E] shadow-[0_2px_12px_rgba(49,50,62,0.08)] z-10"
                                            : "bg-[#31323E]/3 border-[#31323E]/10 hover:bg-[#31323E]/6"
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div
                                            className={`w-2 h-2 rounded-full ${
                                                stepStatusMap[step.id] === "ready"
                                                    ? "bg-emerald-400"
                                                    : stepStatusMap[step.id] === "attention"
                                                    ? "bg-amber-400"
                                                    : "bg-rose-400"
                                            }`}
                                        />
                                        <span
                                            className={`text-[11px] font-bold uppercase tracking-[0.14em] ${
                                                activeStep === step.id
                                                    ? "text-[#31323E]"
                                                    : "text-[#31323E]/60"
                                            }`}
                                        >
                                            {step.label}
                                        </span>
                                    </div>
                                    {activeStep === step.id ? (
                                        <div className="w-1.5 h-1.5 rounded-full bg-[#31323E]" />
                                    ) : null}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="px-8 py-8 bg-white/50">
                        {notice ? (
                            <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                                {notice}
                            </div>
                        ) : null}

                        {activeStep === "basics" ? (
                            <ArtworkBasicsForm formData={formData} setFormData={setFormData} aspectRatios={aspectRatios} />
                        ) : null}

                        {activeStep === "offerings" ? (
                            <ArtworkOfferingsForm 
                                formData={formData} 
                                setFormData={setFormData} 
                                editingWhiteBorder={editingWhiteBorder} 
                                setEditingWhiteBorder={setEditingWhiteBorder} 
                                whiteBorderDraft={whiteBorderDraft} 
                                setWhiteBorderDraft={setWhiteBorderDraft} 
                            />
                        ) : null}

                        {activeStep === "pipeline" ? (
                            <ArtworkPipelineForm
                                formData={formData}
                                editingId={editingId}
                                workflowData={workflowData}
                                workflowLoading={workflowLoading}
                                workflowError={workflowError}
                                assetUploadingSlot={assetUploadingSlot}
                                assetUploadProgress={assetUploadProgress}
                                uploadMasterAsset={uploadMasterAsset}
                                deleteMasterAsset={deleteMasterAsset}
                            />
                        ) : null}

                        {activeStep === "media" ? (
                            <ArtworkMediaForm
                                formData={formData}
                                setFormData={setFormData}
                                categories={categories}
                                labels={labels}
                                imageItems={imageItems}
                                setImageItems={setImageItems}
                                setCropImageIndex={setCropImageIndex}
                            />
                        ) : null}
                    </div>

                    <div className="px-8 py-5 border-t border-[#31323E]/8 bg-[#FCFBF8] flex items-center justify-end gap-3 sticky bottom-0 z-20">
                        <span className="text-xs font-semibold text-[#31323E]/45 mr-3">
                            {editingId ? "Editing existing artwork" : "Creating new artwork"}
                        </span>
                        <button
                            type="button"
                            onClick={resetEditor}
                            className="px-5 py-2.5 rounded-xl border border-[#31323E]/15 bg-white text-[#31323E] text-sm font-bold uppercase tracking-[0.14em]"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={() => void saveArtwork()}
                            disabled={savingArtwork}
                            className="px-6 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-bold uppercase tracking-[0.14em] shadow-sm hover:bg-emerald-600 disabled:opacity-50"
                        >
                            {savingArtwork ? "Saving..." : "Save Draft & Calculate Requirements"}
                        </button>
                    </div>
                </div>
            ) : null}

            <ArtworkGrid artworks={artworks} handleEditClick={handleEditClick} handleDelete={handleDelete} />

            <SimpleArtworkCropperModal
                isOpen={cropImageIndex !== null}
                imageSrc={cropImageIndex !== null ? imageItems[cropImageIndex]?.url || "" : ""}
                onClose={() => setCropImageIndex(null)}
                onSaveCrop={(blob) => handleSaveCrop(blob)}
            />
        </div>
    );
}
