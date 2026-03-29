const ENV_API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export const getApiUrl = (serverHost?: string) => {
    // 1. If we are in the browser (CSR)
    if (typeof window !== "undefined") {
        // In production or behind proxy, we use relative /api
        if (process.env.NODE_ENV === "production") {
            return "/api"; 
        }
        // Local dev: connect to local FastAPI
        const apiHost = window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname;
        return `http://${apiHost}:8000`;
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
