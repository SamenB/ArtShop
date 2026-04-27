/**
 * Frontend utility functions for API communication, image processing, and URL generation.
 * Includes a silent refresh interceptor for handling JWT token expiration.
 */

const ENV_API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

/**
 * Determines the base API URL based on the execution environment.
 * Handles both Client-Side Rendering (CSR) and Server-Side Rendering (SSR).
 */
export const getApiUrl = (serverHost?: string): string => {
    // 1. Browser context (Client-Side Rendering)
    if (typeof window !== "undefined") {
        // Always use the Next.js /api proxy in the browser — both dev and prod.
        // This avoids CORS issues and browser extension interference (VPN/AdBlock).
        // next.config.ts rewrites /api/* → backend (dev: localhost:8000, prod: container).
        return "/api";
    }

    // 2. Server context (Server-Side Rendering)
    // In production Docker environments, resolve via the container network ('api').
    if (process.env.NODE_ENV === "production") {
        return ENV_API_URL;
    }

    // Local SSR fallback: attempt to resolve host from request headers.
    if (serverHost) {
        const cleanHost = serverHost.split(':')[0];
        return `http://${cleanHost}:8000`;
    }
    return ENV_API_URL;
};

// ─── Silent Refresh Interceptor ──────────────────────────────────────────────
//
// handles automatic token renewal upon 401 Unauthorized responses.
// Prevents redundant refresh calls when multiple requests fail simultaneously.

let _refreshing = false;
let _refreshWaiters: Array<(ok: boolean) => void> = [];

/**
 * Internal helper to attempt a JWT refresh via a secure cookie.
 * Queue additional callers if a refresh is already in progress.
 */
async function _tryRefresh(): Promise<boolean> {
    if (_refreshing) {
        // A refresh operation is already underway; wait for its completion.
        return new Promise((resolve) => _refreshWaiters.push(resolve));
    }
    _refreshing = true;
    try {
        const res = await fetch(`${getApiUrl()}/auth/refresh`, {
            method: "POST",
            credentials: "include",
        });
        const ok = res.ok;
        
        // Notify all queued callers of the result.
        _refreshWaiters.forEach((w) => w(ok));
        _refreshWaiters = [];
        return ok;
    } catch {
        // Fail gracefully on network errors.
        _refreshWaiters.forEach((w) => w(false));
        _refreshWaiters = [];
        return false;
    } finally {
        _refreshing = false;
    }
}

/**
 * Wrapper for the native fetch API that automatically handles silent JWT refreshing.
 * If a request returns a 401, it attempts one refresh cycle before failing.
 */
export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const opts: RequestInit = { credentials: "include", ...options };
    const response = await fetch(url, opts);

    if (response.status === 401) {
        // Token might be expired; attempt a single background refresh cycle.
        const refreshed = await _tryRefresh();
        if (refreshed) {
            // Re-attempt the original request with the updated credentials.
            return fetch(url, opts);
        }
        // Refresh failed (or user is genuinely unauthorized); return original 401.
    }

    return response;
}

export async function apiJson<T = unknown>(response: Response): Promise<T> {
    const contentType = response.headers.get("content-type") || "";
    const isJson = contentType.toLowerCase().includes("application/json");
    const bodyText = await response.text().catch(() => "");
    const parseJsonBody = () => {
        try {
            return bodyText ? JSON.parse(bodyText) : null;
        } catch {
            return null;
        }
    };

    if (!response.ok) {
        const body = isJson ? parseJsonBody() : bodyText;
        const detail =
            body && typeof body === "object" && "detail" in body
                ? String((body as { detail?: unknown }).detail)
                : typeof body === "string" && body.trim()
                    ? body.trim()
                    : response.statusText;
        throw new Error(`API ${response.status}: ${detail}`);
    }

    if (!isJson) {
        throw new Error(`Expected JSON but received ${contentType || "unknown content"}: ${bodyText.slice(0, 80)}`);
    }

    const body = parseJsonBody();
    if (body === null) {
        throw new Error(`Invalid JSON response: ${bodyText.slice(0, 80)}`);
    }
    return body as T;
}

/**
 * Generates an absolute or relative image URL based on the image's structure.
 * Supports both static paths and variant-specific objects (thumb, medium, original).
 */
export const getImageUrl = (
    image: string | { thumb?: string; medium?: string; original?: string } | null | undefined, 
    prefer: 'thumb' | 'medium' | 'original' = 'medium',
    serverHost?: string
) : string | undefined => {
    if (!image) return undefined;
    
    let path: string | undefined;
    if (typeof image === 'string') {
        path = image;
    } else {
        // Fallback hierarchy: preferred -> medium -> original -> thumb.
        path = (image as any)[prefer] || image.medium || image.original || image.thumb;
    }

    if (!path) return undefined;
    
    // Relative paths for static assets are preferred for Next.js proxying.
    if (path.startsWith("/static")) return path;
    
    // Return path directly if it's already an absolute URL.
    if (!path.startsWith("/")) return path;
    
    // Prepend the determined API base URL.
    return `${getApiUrl(serverHost)}${path}`;
};

/** 
 * Converts a raw title string into a URL-friendly slug.
 */
export const slugify = (text: string): string =>
    text.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

/** 
 * Generates the canonical routing path for an artwork detail page.
 */
export const artworkUrl = (slugOrId: string | number): string =>
    `/artwork/${slugOrId}`;

