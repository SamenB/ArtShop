"use client";
// ClientProviders — wrapper for all client-side providers.
// layout.tsx is a Server Component and cannot use "use client" providers directly.
// This component bridges the gap: layout.tsx renders <ClientProviders>,
// which is a Client Component that wraps children with all necessary providers.
//
// WHY separate file?
// In Next.js, the "use client" boundary works per-file.
// Server Components can import Client Components, but not the other way around.
// So we create this thin wrapper to hold all our client-side providers.

import { PreferencesProvider } from "@/context/PreferencesContext";
import { type ReactNode } from "react";

export default function ClientProviders({ children }: { children: ReactNode }) {
    return (
        <PreferencesProvider>
            {children}
        </PreferencesProvider>
    );
}
