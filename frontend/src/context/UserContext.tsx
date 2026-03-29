"use client";
import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";

export interface User {
    id: number;
    username: string;
    email: string;
    is_admin: boolean;
}

interface UserContextType {
    user: User | null;
    loading: boolean;
    refreshUser: () => Promise<void>;
    logout: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

import { getApiUrl } from "@/utils";

export const UserProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    const refreshUser = async () => {
        try {
            const resp = await fetch(`${getApiUrl()}/auth/me`, {
                credentials: "include" // always include cookies
            });
            if (resp.ok) {
                const data = await resp.json();
                setUser(data);
            } else {
                setUser(null);
            }
        } catch (e) {
            setUser(null);
        } finally {
            setLoading(false);
        }
    };

    const logout = async () => {
        await fetch(`${getApiUrl()}/auth/logout`, { method: "POST", credentials: "include" });
        setUser(null);
    };

    useEffect(() => {
        refreshUser();
    }, []);

    return (
        <UserContext.Provider value={{ user, loading, refreshUser, logout }}>
            {children}
        </UserContext.Provider>
    );
};

export const useUser = () => {
    const context = useContext(UserContext);
    if (context === undefined) {
        throw new Error("useUser must be used within a UserProvider");
    }
    return context;
};
