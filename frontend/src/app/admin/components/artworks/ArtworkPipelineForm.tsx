import { getApiUrl } from "@/utils";
import { ArtworkFormState, ArtworkPrintWorkflowPayload } from "./types";
import { FormSection, IssueList, StatusBadge } from "./ui";
import {
    formatInchesValue,
    formatPrintCategory,
    formatPxSize,
    getDerivativeStrategyLabel,
    hasCanvasOfferings,
    hasMissingPrintRatio,
    hasPrintOfferings,
} from "./utils";

interface ArtworkPipelineFormProps {
    formData: ArtworkFormState;
    editingId: number | null;
    workflowData: ArtworkPrintWorkflowPayload | null;
    workflowLoading: boolean;
    workflowError: string | null;
    assetUploadingSlot: string | null;
    assetUploadProgress: Record<string, number>;
    uploadMasterAsset: (slotId: string, assetRole: string, file: File) => Promise<void>;
    deleteMasterAsset: (assetId: number) => Promise<void>;
}

export function ArtworkPipelineForm({
    formData,
    editingId,
    workflowData,
    workflowLoading,
    workflowError,
    assetUploadingSlot,
    assetUploadProgress,
    uploadMasterAsset,
    deleteMasterAsset,
}: ArtworkPipelineFormProps) {
    return (
        <div className="space-y-6">
            <FormSection
                title="Print Pipeline"
                description="Upload only the production masters. Exact provider files are generated automatically."
            />

            {!formData.show_in_shop ? (
                <div className="rounded-2xl border border-dashed border-[#31323E]/18 bg-white px-4 py-4 text-sm font-medium text-[#31323E]/55">
                    Shop placement is off. Print masters and requirements are preserved, but
                    this pipeline is inactive until the artwork is shown in shop again.
                </div>
            ) : !hasPrintOfferings(formData) ? (
                <div className="rounded-2xl border border-dashed border-[#31323E]/18 bg-white px-4 py-4 text-sm font-medium text-[#31323E]/55">
                    Enable at least one print family in the Offerings step to unlock the
                    print pipeline.
                </div>
            ) : !formData.print_aspect_ratio_id ? (
                <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50 px-4 py-4 text-sm font-medium text-amber-700">
                    Choose a print aspect ratio in Basics first. The pipeline cannot calculate
                    required pixels or unlock master uploads without a normalized ratio family.
                </div>
            ) : !editingId ? (
                <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50 px-4 py-4 text-sm font-medium text-amber-700">
                    Save the artwork draft first. The pipeline will calculate size
                    requirements once saved.
                </div>
            ) : workflowLoading && !workflowData ? (
                <div className="flex items-center gap-3 py-6">
                    <div className="w-5 h-5 border-2 border-[#31323E]/20 border-t-[#31323E] rounded-full animate-spin" />
                    <span className="text-sm font-semibold text-[#31323E]/55">
                        Loading print pipeline
                    </span>
                </div>
            ) : workflowError && !workflowData ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm font-semibold text-rose-700">
                    {workflowError}
                </div>
            ) : workflowData ? (
                <>
                    <div className="flex items-center gap-3">
                        <StatusBadge status={workflowData.readiness_summary.status} />
                        <span className="text-sm font-semibold text-[#31323E]/70">
                            {workflowData.readiness_summary.message}
                        </span>
                        {workflowLoading ? (
                            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#31323E]/35">
                                Refreshing
                            </span>
                        ) : null}
                        {workflowError ? (
                            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-rose-500">
                                Refresh failed
                            </span>
                        ) : null}
                    </div>

                    <div className="space-y-4">
                        {workflowData.master_slots.map((slot) => {
                            const asset = slot.uploaded_asset;
                            const assetMeta = (asset?.file_metadata || {}) as Record<string, unknown>;
                            const assetUrl = asset?.file_url
                                ? `${getApiUrl().replace("/api", "")}${asset.file_url}`
                                : null;
                            const uploadSizeLabel =
                                formatPxSize(
                                    slot.export_guidance?.target_width_px ??
                                        slot.required_min_px?.width,
                                    slot.export_guidance?.target_height_px ??
                                        slot.required_min_px?.height
                                ) || "Size pending";
                            const isStrictRatioMaster =
                                slot.export_guidance?.mode === "strict_ratio_cover_master";
                            const uploadModeLabel = isStrictRatioMaster
                                ? `PNG · ${slot.export_guidance?.ratio_label || "Strict ratio"}`
                                : "PNG · Exact target";
                            const uploadProgress = assetUploadProgress[slot.slot_id];
                            const uploadNote = isStrictRatioMaster
                                ? "Upload one clean master. Each provider size is cover-fitted and cropped only if needed."
                                : "Upload the final exact artboard for this slot.";
                            const resultSummary = slot.derivative_plan
                                ? `${slot.derivative_plan.target_count} order-time target${
                                      slot.derivative_plan.target_count === 1 ? "" : "s"
                                  } covered by this master`
                                : "Exact Prodigi files are rendered only when an order is fulfilled";
                            const strategyLabel = getDerivativeStrategyLabel(
                                slot.derivative_plan?.strategy
                            );
                            const categoriesLabel = slot.covers_categories
                                .map((categoryId) => formatPrintCategory(categoryId))
                                .join(", ");
                            const derivesLabel =
                                slot.derives_categories &&
                                slot.derives_categories.length > 0
                                    ? slot.derives_categories
                                          .map((categoryId) =>
                                              formatPrintCategory(categoryId)
                                          )
                                          .join(", ")
                                    : null;
                            if (!slot.relevant) {
                                return (
                                    <div
                                        key={slot.slot_id}
                                        className="rounded-2xl border border-[#31323E]/8 bg-[#31323E]/3 px-5 py-4"
                                    >
                                        <div className="flex items-center gap-3">
                                            <p className="text-sm font-bold text-[#31323E]/40">
                                                {slot.label}
                                            </p>
                                            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#31323E]/35">
                                                Not required
                                            </span>
                                        </div>
                                        <p className="text-xs font-medium text-[#31323E]/35 mt-1">
                                            {slot.description}
                                        </p>
                                    </div>
                                );
                            }

                            return (
                                <div
                                    key={slot.slot_id}
                                    className={`rounded-2xl border px-5 py-5 ${
                                        slot.status === "ready"
                                            ? "border-emerald-200 bg-emerald-50/40"
                                            : slot.status === "blocked"
                                            ? "border-rose-200 bg-rose-50/40"
                                            : "border-amber-200 bg-amber-50/40"
                                    }`}
                                >
                                    <div className="flex flex-wrap items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3 flex-wrap">
                                                <p className="text-sm font-bold text-[#31323E]">
                                                    {slot.label}
                                                </p>
                                                <StatusBadge status={slot.status} />
                                            </div>
                                            <div className="flex flex-wrap gap-3 mt-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#31323E]/45">
                                                <span>
                                                    Covers {slot.covered_size_count} size
                                                    {slot.covered_size_count === 1 ? "" : "s"}
                                                </span>
                                                {slot.largest_size_label ? (
                                                    <span>Largest: {slot.largest_size_label}</span>
                                                ) : null}
                                                {slot.generated_derivatives_count > 0 ? (
                                                    <span>{slot.generated_derivatives_count} pre-generated</span>
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
                                        <div className="space-y-3">
                                            <div className="grid gap-3 sm:grid-cols-3">
                                                <div className="rounded-xl border border-[#31323E]/10 bg-white/90 px-3.5 py-3">
                                                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#31323E]/40">
                                                        Used For
                                                    </p>
                                                    <p className="mt-2 text-xs font-semibold leading-relaxed text-[#31323E]/72">
                                                        {categoriesLabel}
                                                    </p>
                                                    {derivesLabel ? (
                                                        <p className="mt-1 text-[11px] font-medium leading-relaxed text-[#31323E]/50">
                                                            Also derives: {derivesLabel}
                                                        </p>
                                                    ) : null}
                                                </div>

                                                <div className="rounded-xl border border-[#31323E]/10 bg-white/90 px-3.5 py-3">
                                                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#31323E]/40">
                                                        Result
                                                    </p>
                                                    <p className="mt-2 text-xs font-semibold leading-relaxed text-[#31323E]/72">
                                                        {resultSummary}
                                                    </p>
                                                    <p className="mt-1 text-[11px] font-medium leading-relaxed text-[#31323E]/50">
                                                        Rendered only for the ordered size before Prodigi submit.
                                                    </p>
                                                </div>

                                                <div className="rounded-xl border border-[#31323E]/10 bg-white/90 px-3.5 py-3">
                                                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#31323E]/40">
                                                        Covers
                                                    </p>
                                                    <p className="mt-2 text-xs font-semibold leading-relaxed text-[#31323E]/72">
                                                        {slot.covered_size_count} size
                                                        {slot.covered_size_count === 1 ? "" : "s"}
                                                        {slot.largest_size_label
                                                            ? ` · Largest ${slot.largest_size_label}`
                                                            : ""}
                                                    </p>
                                                    {slot.required_for_sizes.length > 0 ? (
                                                        <p className="mt-1 text-[11px] font-medium leading-relaxed text-[#31323E]/50">
                                                            {slot.required_for_sizes.join(", ")}
                                                        </p>
                                                    ) : null}
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap gap-2">
                                                {strategyLabel ? (
                                                    <span className="rounded-full border border-[#31323E]/10 bg-white px-2.5 py-1 text-[11px] font-semibold text-[#31323E]/62">
                                                        {strategyLabel}
                                                    </span>
                                                ) : null}
                                                {slot.slot_id === "master" &&
                                                hasCanvasOfferings(formData) &&
                                                formData.canvas_wrap_style ? (
                                                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                                                        Canvas wrap: {formData.canvas_wrap_style}
                                                    </span>
                                                ) : null}
                                            </div>

                                            {slot.required_min_px?.visible_art_width_px &&
                                            slot.required_min_px?.visible_art_height_px ? (
                                                <p className="text-[11px] font-medium leading-relaxed text-[#31323E]/48">
                                                    Visible art at 300 DPI:{" "}
                                                    {formatPxSize(
                                                        slot.required_min_px.visible_art_width_px,
                                                        slot.required_min_px.visible_art_height_px
                                                    )}
                                                    {slot.required_min_px.physical_width_in &&
                                                    slot.required_min_px.physical_height_in
                                                        ? ` · Product ${formatInchesValue(slot.required_min_px.physical_width_in)} x ${formatInchesValue(slot.required_min_px.physical_height_in)} in`
                                                        : ""}
                                                </p>
                                            ) : null}
                                        </div>

                                        <div className="rounded-2xl border border-[#31323E]/10 bg-white px-4 py-4">
                                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#31323E]/40">
                                                Upload This File
                                            </p>
                                            <p className="mt-2 text-2xl font-bold leading-none tracking-[-0.03em] text-[#31323E]">
                                                {uploadSizeLabel}
                                            </p>
                                            <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-700">
                                                {uploadModeLabel}
                                            </p>
                                            <p className="mt-2 text-xs font-medium leading-relaxed text-[#31323E]/58">
                                                {uploadNote}
                                            </p>
                                            {slot.export_guidance?.provider_target_differs_from_visible_art &&
                                            slot.export_guidance.full_file_ratio_diff_warning ? (
                                                <p className="mt-3 text-[11px] font-semibold leading-relaxed text-[#31323E]/48">
                                                    We fit this to Prodigi&apos;s exact target automatically
                                                    without stretch or white lines.
                                                </p>
                                            ) : null}
                                        </div>
                                    </div>

                                    {/* Upload / asset status */}
                                    <div className="mt-4 flex flex-wrap items-center gap-3">
                                        <label className="px-4 py-2 rounded-xl bg-[#31323E] text-white text-sm font-bold cursor-pointer hover:bg-[#31323E]/85 transition-colors">
                                            {assetUploadingSlot === slot.slot_id
                                                ? "Uploading..."
                                                : asset
                                                ? "Replace"
                                                : "Upload Master"}
                                            <input
                                                type="file"
                                                accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                                                className="hidden"
                                                disabled={assetUploadingSlot !== null}
                                                onChange={(event) => {
                                                    const file = event.target.files?.[0];
                                                    if (file) {
                                                        void uploadMasterAsset(
                                                            slot.slot_id,
                                                            slot.asset_role,
                                                            file
                                                        );
                                                    }
                                                    (event.target as HTMLInputElement).value = "";
                                                }}
                                            />
                                        </label>

                                        {assetUploadingSlot === slot.slot_id &&
                                        uploadProgress !== undefined ? (
                                            <div className="min-w-[220px] flex-1 max-w-sm">
                                                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.14em] text-[#31323E]/45">
                                                    <span>Uploading</span>
                                                    <span>{uploadProgress}%</span>
                                                </div>
                                                <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#31323E]/10">
                                                    <div
                                                        className="h-full rounded-full bg-emerald-500 transition-all duration-200"
                                                        style={{ width: `${uploadProgress}%` }}
                                                    />
                                                </div>
                                            </div>
                                        ) : null}

                                        {asset ? (
                                            <>
                                                <span className="text-xs font-medium text-[#31323E]/55">
                                                    {String(assetMeta.width_px || "?")} x {String(assetMeta.height_px || "?")} px
                                                </span>
                                                {slot.generated_derivatives_count > 0 ? (
                                                    <span className="text-xs font-medium text-emerald-700">
                                                        {slot.generated_derivatives_count} derivatives ready
                                                    </span>
                                                ) : null}
                                                {assetUrl ? (
                                                    <a
                                                        href={assetUrl}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="text-xs font-bold uppercase tracking-[0.14em] text-[#31323E] underline"
                                                    >
                                                        Open
                                                    </a>
                                                ) : null}
                                                <button
                                                    type="button"
                                                    onClick={() => void deleteMasterAsset(asset.id)}
                                                    className="text-xs font-bold uppercase tracking-[0.14em] text-rose-600"
                                                >
                                                    Remove
                                                </button>
                                            </>
                                        ) : null}
                                    </div>

                                    {/* Issues & warnings */}
                                    <div className="mt-3 space-y-2">
                                        <IssueList title="Issues" items={slot.issues} tone="danger" />
                                        <IssueList title="Warnings" items={slot.warnings} tone="warning" />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            ) : null}
        </div>
    );
}
