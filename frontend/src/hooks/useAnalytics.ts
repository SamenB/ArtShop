/**
 * useAnalytics — Analytics Event Tracking Hook.
 *
 * A thin, typed wrapper around PostHog's capture() API.
 * Use this hook in any Client Component to fire analytics events without
 * importing posthog-js directly — keeping the rest of the codebase decoupled.
 *
 * Usage:
 *   const { track, identify, reset } = useAnalytics();
 *   track('artwork_viewed', { artwork_id: 5, title: 'Sunset' });
 *
 * Defined Events (add more as the product grows):
 *   - artwork_viewed        : User opens an artwork detail page
 *   - artwork_liked         : User clicks the like/heart button on an artwork
 *   - add_to_cart           : User adds an item to the shopping bag
 *   - remove_from_cart      : User removes an item from the shopping bag
 *   - checkout_started      : User clicks "Checkout" in the cart drawer
 *   - order_completed       : Payment confirmed, order placed
 *   - user_registered       : New account created
 *   - user_logged_in        : Existing user authenticated
 *   - user_logged_out       : User signed out
 *   - filter_applied        : User applied a filter in shop/gallery
 *   - search_performed      : User submitted a search query
 */

"use client";

import { usePostHog } from "posthog-js/react";
import { useCallback } from "react";

// ─── Typed Event Catalog ────────────────────────────────────────────────────

export type AnalyticsEvents = {
    // Artwork interactions
    artwork_viewed: { artwork_id: number; title: string; price?: number; slug?: string };
    artwork_liked: { artwork_id: number; title: string };
    artwork_unliked: { artwork_id: number; title: string };

    // Cart interactions
    add_to_cart: { artwork_id: number; title: string; price: number; type: "original" | "print"; size?: string; finish?: string };
    remove_from_cart: { artwork_id: number; title: string };
    checkout_started: { items_count: number; total: number; currency: string };

    // Order lifecycle
    order_completed: { order_id: number; total: number; items_count: number };

    // Auth
    user_registered: { method: "email" | "google" };
    user_logged_in: { method: "email" | "google" };
    user_logged_out: Record<string, never>;

    // Discovery
    filter_applied: { filter_type: string; value: string };
    search_performed: { query: string; results_count?: number };
};

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useAnalytics() {
    const posthog = usePostHog();

    /**
     * Track a named event with typed properties.
     * Safe to call even if PostHog is not initialized (no-op).
     */
    const track = useCallback(
        <K extends keyof AnalyticsEvents>(event: K, properties: AnalyticsEvents[K]) => {
            posthog?.capture(event, properties);
        },
        [posthog]
    );

    /**
     * Identify a user after login/registration.
     * Links all previous anonymous events to this user ID.
     *
     * @param userId  Unique backend user ID (use string for consistency)
     * @param traits  Additional user properties (email, username, is_admin)
     */
    const identify = useCallback(
        (userId: string | number, traits?: Record<string, unknown>) => {
            posthog?.identify(String(userId), traits);
        },
        [posthog]
    );

    /**
     * Reset the PostHog identity on logout.
     * Generates a new anonymous ID for the next session.
     */
    const reset = useCallback(() => {
        posthog?.reset();
    }, [posthog]);

    return { track, identify, reset };
}
