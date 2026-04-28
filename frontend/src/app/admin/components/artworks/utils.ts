import { getApiUrl, getImageUrl } from "@/utils";
import { ArtworkFormState, ImageEntry } from "./types";

export const STATUS_OPTIONS = [
    { value: "available", label: "Available" },
    { value: "sold", label: "Sold" },
    { value: "reserved", label: "Reserved" },
    { value: "not_for_sale", label: "Not for Sale" },
    { value: "on_exhibition", label: "On Exhibition" },
    { value: "archived", label: "Archived" },
    { value: "digital", label: "Digital" },
];

export const PRINT_CATEGORY_LABELS: Record<string, string> = {
    paperPrintRolled: "Rolled paper prints",
    paperPrintBoxFramed: "Framed paper prints",
    canvasRolled: "Rolled canvas",
    canvasStretched: "Stretched canvas",
    canvasClassicFrame: "Classic framed canvas",
    canvasFloatingFrame: "Floating framed canvas",
};

export const CANVAS_WRAP_OPTIONS = [
    { value: "White", label: "White" },
    { value: "Black", label: "Black" },
    { value: "ImageWrap", label: "Image Wrap" },
    { value: "MirrorWrap", label: "Mirror Wrap" },
] as const;

export const INPUT_CLASS =
    "w-full bg-white border border-[#31323E]/15 rounded-xl px-3.5 py-2.5 text-sm font-medium text-[#31323E] focus:outline-none focus:border-[#31323E]/45 focus:ring-2 focus:ring-[#31323E]/10 transition-all";

export const currentYear = new Date().getFullYear();

export function createDefaultFormState(): ArtworkFormState {
    return {
        title: "",
        description: "",
        year: currentYear,
        width_cm: "",
        height_cm: "",
        original_price: 1000,
        has_original: false,
        has_canvas_print: false,
        has_canvas_print_limited: false,
        has_paper_print: false,
        has_paper_print_limited: false,
        canvas_print_limited_quantity: "",
        paper_print_limited_quantity: "",
        white_border_pct: 5,
        print_aspect_ratio_id: null,
        orientation: "Horizontal",
        labels: [],
        original_status: "available",
        print_quality_url: "",
        print_profile_overrides: null,
        canvas_wrap_style: "",
        show_in_gallery: true,
        show_in_shop: true,
    };
}

export function resolveImageUrl(img: ImageEntry, prefer: "thumb" | "medium" | "original" = "thumb"): string {
    if (typeof img === "string") {
        return img.startsWith("http") ? img : `${getApiUrl().replace("/api", "")}${img}`;
    }
    return getImageUrl(img, prefer) || "";
}

export function hasPrintOfferings(formData: ArtworkFormState): boolean {
    if (!formData.show_in_shop) {
        return false;
    }
    return Boolean(
        formData.has_canvas_print ||
            formData.has_canvas_print_limited ||
            formData.has_paper_print ||
            formData.has_paper_print_limited
    );
}

export function hasCanvasOfferings(formData: ArtworkFormState): boolean {
    return Boolean(formData.has_canvas_print || formData.has_canvas_print_limited);
}

export function hasMissingPrintRatio(formData: ArtworkFormState): boolean {
    return hasPrintOfferings(formData) && !formData.print_aspect_ratio_id;
}

export function hasOfferingValidationIssues(formData: ArtworkFormState): boolean {
    return Boolean(
        (formData.has_canvas_print_limited &&
            !Number(formData.canvas_print_limited_quantity || 0)) ||
            (hasCanvasOfferings(formData) && !formData.canvas_wrap_style) ||
            (formData.has_paper_print_limited &&
                !Number(formData.paper_print_limited_quantity || 0))
    );
}

export function extractCanvasWrapSelectionFromOverrides(
    overrides: Record<string, unknown> | null | undefined
): string {
    if (!overrides || typeof overrides !== "object") {
        return "";
    }
    for (const categoryId of ["canvasStretched", "canvasClassicFrame", "canvasFloatingFrame"]) {
        const categoryOverride = overrides[categoryId];
        if (!categoryOverride || typeof categoryOverride !== "object") {
            continue;
        }
        const recommendedDefaults = (categoryOverride as Record<string, unknown>).recommended_defaults;
        if (!recommendedDefaults || typeof recommendedDefaults !== "object") {
            continue;
        }
        const wrap = (recommendedDefaults as Record<string, unknown>).wrap;
        if (typeof wrap === "string") {
            return wrap;
        }
    }
    return "";
}

export function mergeCanvasWrapIntoOverrides(
    existingOverrides: Record<string, unknown> | null | undefined,
    wrap: string
): Record<string, unknown> | null {
    const nextOverrides: Record<string, unknown> = { ...(existingOverrides || {}) };
    for (const categoryId of ["canvasStretched", "canvasClassicFrame", "canvasFloatingFrame"]) {
        const categoryOverride =
            nextOverrides[categoryId] && typeof nextOverrides[categoryId] === "object"
                ? { ...(nextOverrides[categoryId] as Record<string, unknown>) }
                : {};
        const recommendedDefaults =
            categoryOverride.recommended_defaults &&
            typeof categoryOverride.recommended_defaults === "object"
                ? { ...(categoryOverride.recommended_defaults as Record<string, unknown>) }
                : {};

        if (wrap) {
            recommendedDefaults.wrap = wrap;
            categoryOverride.recommended_defaults = recommendedDefaults;
            nextOverrides[categoryId] = categoryOverride;
            continue;
        }

        delete recommendedDefaults.wrap;
        if (Object.keys(recommendedDefaults).length > 0) {
            categoryOverride.recommended_defaults = recommendedDefaults;
        } else {
            delete categoryOverride.recommended_defaults;
        }

        if (Object.keys(categoryOverride).length > 0) {
            nextOverrides[categoryId] = categoryOverride;
        } else {
            delete nextOverrides[categoryId];
        }
    }
    return Object.keys(nextOverrides).length > 0 ? nextOverrides : null;
}

function toNumber(value: number | string | null | undefined, isFloat = false): number | null {
    if (value === "" || value === null || value === undefined) {
        return null;
    }
    const parsed = isFloat ? Number.parseFloat(String(value)) : Number.parseInt(String(value), 10);
    return Number.isNaN(parsed) ? null : parsed;
}

export function buildFormPayload(formData: ArtworkFormState) {
    const payload: Record<string, unknown> = {
        ...formData,
        original_price: toNumber(formData.original_price),
        year: toNumber(formData.year),
        width_cm: toNumber(formData.width_cm, true),
        height_cm: toNumber(formData.height_cm, true),
        canvas_print_limited_quantity: toNumber(formData.canvas_print_limited_quantity),
        paper_print_limited_quantity: toNumber(formData.paper_print_limited_quantity),
        print_aspect_ratio_id: formData.print_aspect_ratio_id,
        print_profile_overrides: mergeCanvasWrapIntoOverrides(
            formData.print_profile_overrides,
            hasCanvasOfferings(formData) ? formData.canvas_wrap_style : ""
        ),
    };

    if (payload.width_cm !== null) {
        payload.width_in = Number(((payload.width_cm as number) * 0.393701).toFixed(2));
    } else {
        payload.width_in = null;
    }

    if (payload.height_cm !== null) {
        payload.height_in = Number(((payload.height_cm as number) * 0.393701).toFixed(2));
    } else {
        payload.height_in = null;
    }

    if (!formData.has_original || formData.original_status !== "available") {
        payload.original_price = null;
    }

    if (formData.original_status === "digital") {
        payload.width_cm = null;
        payload.height_cm = null;
        payload.width_in = null;
        payload.height_in = null;
    }

    delete payload.canvas_wrap_style;
    delete payload.print_profile_overrides;
    payload.print_profile_overrides = mergeCanvasWrapIntoOverrides(
        formData.print_profile_overrides,
        hasCanvasOfferings(formData) ? formData.canvas_wrap_style : ""
    );

    return payload;
}

export function getStatusClasses(status: string): string {
    if (status === "ready") {
        return "bg-emerald-50 text-emerald-700 border border-emerald-200";
    }
    if (status === "blocked") {
        return "bg-rose-50 text-rose-700 border border-rose-200";
    }
    return "bg-amber-50 text-amber-700 border border-amber-200";
}

export function titleCase(value: string): string {
    return value
        .replace(/[_-]/g, " ")
        .split(" ")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

export function formatPrintCategory(categoryId: string): string {
    return PRINT_CATEGORY_LABELS[categoryId] || titleCase(categoryId);
}

export function formatInchesValue(value: number | null | undefined): string | null {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return null;
    }
    return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

export function formatPxSize(width: number | null | undefined, height: number | null | undefined): string | null {
    if (!width || !height) {
        return null;
    }
    return `${width} x ${height} px`;
}

export function uploadFormDataWithProgress<T>(
    url: string,
    body: FormData,
    onProgress: (progress: number) => void
): Promise<T> {
    return new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("POST", url);
        request.withCredentials = true;
        request.upload.onprogress = (event) => {
            if (!event.lengthComputable || event.total <= 0) {
                return;
            }
            onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
        };
        request.onload = () => {
            const responseText = request.responseText || "";
            let payload: Record<string, unknown> = {};
            try {
                payload = responseText ? JSON.parse(responseText) : {};
            } catch {
                payload = {};
            }
            if (request.status >= 200 && request.status < 300) {
                onProgress(100);
                resolve(payload as T);
                return;
            }
            reject(new Error(String(payload.detail || payload.message || `Upload failed (${request.status}).`)));
        };
        request.onerror = () => reject(new Error("Upload failed: connection was interrupted."));
        request.onabort = () => reject(new Error("Upload cancelled."));
        request.send(body);
    });
}

export function getDerivativeStrategyLabel(strategy: string | null | undefined): string | null {
    if (!strategy) {
        return null;
    }
    if (strategy === "exact_cover_crop") {
        return "Per-size cover fit + exact crop";
    }
    if (strategy === "exact_contain_pad") {
        return "Exact white artboards with centered fit";
    }
    if (strategy === "direct_resize") {
        return "Direct resize only";
    }
    return titleCase(strategy);
}
