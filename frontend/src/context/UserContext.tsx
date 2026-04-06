"use client";
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { getApiUrl, apiFetch } from "@/utils";

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

export const UserProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    const refreshUser = useCallback(async () => {
        try {
            // apiFetch автоматически попробует обновить токены при 401
            const resp = await apiFetch(`${getApiUrl()}/auth/me`);
            if (resp.ok) {
                setUser(await resp.json());
            } else {
                // 401 после неудачного refresh — пользователь не авторизован
                setUser(null);
            }
        } catch {
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, []);

    const logout = useCallback(async () => {
        try {
            await fetch(`${getApiUrl()}/auth/logout`, {
                method: "POST",
                credentials: "include",
            });
        } catch {
            // Даже при сетевой ошибке — очищаем локальное состояние
        }
        setUser(null);
    }, []);

    useEffect(() => {
        refreshUser();
    }, [refreshUser]);

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
