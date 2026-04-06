const ENV_API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export const getApiUrl = (serverHost?: string) => {
    // 1. If we are in the browser (CSR)
    if (typeof window !== "undefined") {
        // In production or behind proxy, we use relative /api
        if (process.env.NODE_ENV === "production") {
            return "/api"; 
        }
        // Local dev: connect to local FastAPI using same hostname to avoid cross-origin cookie drops for SameSite=Lax
        return `http://${window.location.hostname}:8000`;
    }

    // 2. If we are in SSR (Server-Side)
    // In production Docker, use the defined docker network URL (http://api:8000)
    if (process.env.NODE_ENV === "production") {
        return ENV_API_URL;
    }

    // Local SSR fallback
    if (serverHost) {
        const cleanHost = serverHost.split(':')[0];
        return `http://${cleanHost}:8000`;
    }
    return ENV_API_URL;
};

// ─── Silent Refresh Interceptor ──────────────────────────────────────────────
//
// apiFetch — замена нативному fetch.
// При получении 401 автоматически вызывает POST /auth/refresh (один раз),
// и повторяет исходный запрос. Если refresh не удался — возвращает 401.
//
// Конкурентность: если несколько запросов одновременно получают 401,
// refresh вызывается только один раз — остальные ждут результата.

let _refreshing = false;
let _refreshWaiters: Array<(ok: boolean) => void> = [];

async function _tryRefresh(): Promise<boolean> {
    if (_refreshing) {
        // Уже идёт refresh — ждём его результата
        return new Promise((resolve) => _refreshWaiters.push(resolve));
    }
    _refreshing = true;
    try {
        const res = await fetch(`${getApiUrl()}/auth/refresh`, {
            method: "POST",
            credentials: "include",
        });
        const ok = res.ok;
        _refreshWaiters.forEach((w) => w(ok));
        _refreshWaiters = [];
        return ok;
    } catch {
        _refreshWaiters.forEach((w) => w(false));
        _refreshWaiters = [];
        return false;
    } finally {
        _refreshing = false;
    }
}

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const opts: RequestInit = { credentials: "include", ...options };
    const response = await fetch(url, opts);

    if (response.status === 401) {
        const refreshed = await _tryRefresh();
        if (refreshed) {
            // Повторяем запрос с обновлёнными куками
            return fetch(url, opts);
        }
        // Refresh не удался — возвращаем оригинальный 401
        // UserContext поймает его и очистит состояние пользователя
    }

    return response;
}



export const getImageUrl = (
    image: string | { thumb?: string; medium?: string; original?: string } | null | undefined, 
    prefer: 'thumb' | 'medium' | 'original' = 'medium',
    serverHost?: string
) => {
    if (!image) return undefined;
    
    let path: string | undefined;
    if (typeof image === 'string') {
        path = image;
    } else {
        path = image[prefer] || image.medium || image.original || image.thumb;
    }

    if (!path) return undefined;
    // Always return relative path for static files so Next.js can proxy and cache HTML statically.
    if (path.startsWith("/static")) return path;
    
    if (!path.startsWith("/")) return path;
    return `${getApiUrl(serverHost)}${path}`;
};

/** Convert a title to a URL-safe slug */
export const slugify = (text: string): string =>
    text.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

/** Generate the canonical artwork URL: /artwork/{slug} */
export const artworkUrl = (slugOrId: string | number): string =>
    `/artwork/${slugOrId}`;

