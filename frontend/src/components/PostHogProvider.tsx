"use client";

/**
 * PostHog Analytics Provider.
 *
 * Initializes the PostHog SDK on the client side and automatically:
 * - Tracks page views on every route change (Next.js App Router compatible)
 * - Enables session recording to capture user interactions
 * - Enables autocapture for clicks, inputs, and form submissions
 *
 * This component must be placed inside a Client boundary (e.g., ClientProviders).
 * It uses `posthog-js/react` to expose PostHog via React context.
 */

import posthog from "posthog-js";
import { PostHogProvider as PHProvider, usePostHog } from "posthog-js/react";
import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY!;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";

/**
 * Inner component that tracks page views on route changes.
 * Must be wrapped in Suspense because it uses useSearchParams().
 */
function PageViewTracker() {
    const posthogClient = usePostHog();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const previousUrl = useRef<string>("");

    useEffect(() => {
        if (!posthogClient) return;

        const url = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : "");

        // Avoid duplicate events for the same URL (React Strict Mode double-mount)
        if (url === previousUrl.current) return;
        previousUrl.current = url;

        posthogClient.capture("$pageview", { $current_url: window.location.href });
    }, [pathname, searchParams, posthogClient]);

    return null;
}

/**
 * Root analytics provider. Initializes PostHog once per session.
 * Session recording and autocapture are enabled by default.
 */
export default function PostHogProvider({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        // Only initialize in production — prevents local dev traffic from
        // polluting the production analytics dashboard.
        if (typeof window === "undefined" || !POSTHOG_KEY || posthog.__loaded) return;
        if (process.env.NODE_ENV !== "production") return;

        posthog.init(POSTHOG_KEY, {
            api_host: POSTHOG_HOST,

            // --- Core Settings ---
            // Don't capture the initial page load — our PageViewTracker handles it
            capture_pageview: false,
            // Persist user identity across sessions
            persistence: "localStorage+cookie",

            // --- Session Recording ---
            session_recording: {
                // Record all sessions (set to a float 0-1 for sampling, e.g., 0.1 = 10%)
                sampleRate: 1,
                // Mask sensitive inputs (passwords, credit cards) automatically
                maskAllInputs: false,
                maskInputFn: (text, element) => {
                    // Mask password fields and anything named 'card'
                    if (
                        element?.getAttribute("type") === "password" ||
                        element?.getAttribute("name")?.includes("card")
                    ) {
                        return "*".repeat(text.length);
                    }
                    return text;
                },
            },

            // --- Autocapture ---
            // Automatically captures clicks, form submits, and changes
            autocapture: true,
        });
    }, []);

    return (
        <PHProvider client={posthog}>
            {/* Suspense boundary required because PageViewTracker uses useSearchParams */}
            <Suspense fallback={null}>
                <PageViewTracker />
            </Suspense>
            {children}
        </PHProvider>
    );
}
