"use client";

/**
 * Context provider for managing user authentication state.
 * Handles fetching current user profiles, managing loading states, 
 * and providing logout functionality.
 */
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { getApiUrl, apiFetch } from "@/utils";

/** Represents the authenticated user's profile data. */
export interface User {
    id: number;
    username: string;
    email: string;
    is_admin: boolean;
}

/** Definition of the user context state and available actions. */
interface UserContextType {
    user: User | null;
    loading: boolean;
    refreshUser: () => Promise<void>;
    logout: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

/**
 * High-level provider component that wraps the application to provide user state.
 */
export const UserProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    /**
     * Refetches the current user's profile.
     * Uses apiFetch which automatically attempts a token refresh on 401 errors.
     */
    const refreshUser = useCallback(async () => {
        try {
            // apiFetch handles silent token refreshing automatically if the initial request fails.
            const resp = await apiFetch(`${getApiUrl()}/auth/me`);
            if (resp.ok) {
                setUser(await resp.json());
            } else {
                // If the response is still not OK after refresh attempts, the user is unauthenticated.
                setUser(null);
            }
        } catch {
            // Treat network errors as unauthenticated states for security.
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Performs a server-side logout and clears the local authenticated state.
     */
    const logout = useCallback(async () => {
        try {
            await fetch(`${getApiUrl()}/auth/logout`, {
                method: "POST",
                credentials: "include",
            });
        } catch {
            // Clear local state even if the network request fails to ensure UI consistency.
        }
        setUser(null);
    }, []);

    // Initial load: determine authentication status on mount.
    useEffect(() => {
        refreshUser();
    }, [refreshUser]);

    return (
        <UserContext.Provider value={{ user, loading, refreshUser, logout }}>
            {children}
        </UserContext.Provider>
    );
};

/**
 * Hook to access the current user's state and authentication actions.
 * Must be used within a UserProvider.
 */
export const useUser = () => {
    const context = useContext(UserContext);
    if (context === undefined) {
        throw new Error("useUser must be used within a UserProvider");
    }
    return context;
};
