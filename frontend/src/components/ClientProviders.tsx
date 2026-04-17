"use client";

/**
 * Client-Side Context Provider Aggregator.
 * React Server Components (like layout.tsx) cannot directly instantiate React Context Providers.
 * This boundary component wraps the application tree with all necessary interactive and stateful contexts.
 */

import { PreferencesProvider } from "@/context/PreferencesContext";
import { UserProvider } from "@/context/UserContext";
import { CartProvider } from "@/context/CartContext";
import { GoogleOAuthProvider } from "@react-oauth/google";
import PostHogProvider from "@/components/PostHogProvider";
import { type ReactNode } from "react";

/**
 * Wraps children nodes with the global Google OAuth, user preferences, cart state, and user authentication contexts.
 * PostHogProvider is outermost so analytics is available in all child contexts.
 * @param children The React node tree representing the application content.
 */
export default function ClientProviders({ children }: { children: ReactNode }) {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "YOUR_GOOGLE_CLIENT_ID";
    return (
        <PostHogProvider>
            <GoogleOAuthProvider clientId={clientId}>
                <PreferencesProvider>
                    <CartProvider>
                        <UserProvider>
                            {children}
                        </UserProvider>
                    </CartProvider>
                </PreferencesProvider>
            </GoogleOAuthProvider>
        </PostHogProvider>
    );
}

