import { Product, SortKey } from "./types";
import { artworkUrl } from "@/utils";

export const getStorefrontSummary = (product: Product) => product.storefront_summary;

export const buildArtworkHref = (product: Product, countryCode?: string): string => {
    const href = artworkUrl(product.slug || product.id);
    const params = new URLSearchParams();
    const storefrontSummary = getStorefrontSummary(product);

    if (countryCode) {
        params.set("country", countryCode);
    }
    if (storefrontSummary?.default_medium) {
        params.set("view", storefrontSummary.default_medium);
    }

    return params.size > 0 ? `${href}?${params.toString()}` : href;
};

export const getLongestSide = (p: Product): number => Math.max(p.width_cm || 0, p.height_cm || 0);

export const getArea = (p: Product) => (p.width_cm || 0) * (p.height_cm || 0);

export const getOrientation = (p: Product): "horizontal" | "vertical" | "square" | null => {
    if (p.orientation) return p.orientation.toLowerCase() as any;
    if (!p.width_cm || !p.height_cm) return null;
    const ratio = p.width_cm / p.height_cm;
    if (ratio >= 1.1) return "horizontal";
    if (ratio <= 0.9) return "vertical";
    return "square";
};

export const getSizeCategory = (p: Product): "small" | "medium" | "large" | null => {
    const area = getArea(p);
    if (!area) return null;
    if (area < 900) return "small";
    if (area <= 3600) return "medium";
    return "large";
};

export function sortProducts(products: Product[], key: SortKey, globalPrintPrice: number) {
    const c = [...products];
    switch (key) {
        case "newest": c.sort((a, b) => b.id - a.id); break;
        case "price-low": c.sort((a, b) => ((a.original_price || a.base_print_price || globalPrintPrice) - (b.original_price || b.base_print_price || globalPrintPrice))); break;
        case "price-high": c.sort((a, b) => ((b.original_price || b.base_print_price || globalPrintPrice) - (a.original_price || a.base_print_price || globalPrintPrice))); break;
        case "size-small": c.sort((a, b) => getArea(a) - getArea(b)); break;
        case "size-large": c.sort((a, b) => getArea(b) - getArea(a)); break;
    }
    return c;
}
