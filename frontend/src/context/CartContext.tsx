"use client";
import { createContext, useContext, useState, useEffect, ReactNode, useMemo } from "react";

export type CartItemType = "original" | "print";

export interface CartItem {
    id: string; // Unique ID for the cart item (e.g. slug-original or slug-print-size-finish)
    slug: string; // The artwork ID/slug
    title: string;
    type: CartItemType;
    imageGradientFrom: string;
    imageGradientTo: string;
    price: number;
    quantity: number;
    // Specifics
    finish?: string; // "Framed", "Rolled", etc.
    size?: string; // "30 × 40 cm", etc.
}

interface CartContextType {
    items: CartItem[];
    isCartOpen: boolean;
    setIsCartOpen: (open: boolean) => void;
    addItem: (item: Omit<CartItem, "quantity">) => void;
    removeItem: (id: string) => void;
    updateQuantity: (id: string, delta: number) => void;
    clearCart: () => void;
    cartCount: number;
    cartTotal: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const STORAGE_KEY = "artshop_cart";

export function CartProvider({ children }: { children: ReactNode }) {
    const [items, setItems] = useState<CartItem[]>([]);
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [loaded, setLoaded] = useState(false);

    // Load from local storage on mount
    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                setItems(JSON.parse(saved));
            }
        } catch {
            // Ignore corrupted local storage
        }
        setLoaded(true);
    }, []);

    // Save to local storage on change
    useEffect(() => {
        if (!loaded) return;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        } catch {
            // Ignore
        }
    }, [items, loaded]);

    const addItem = (newItem: Omit<CartItem, "quantity">) => {
        setItems(prev => {
            const existingIndex = prev.findIndex(item => item.id === newItem.id);
            if (existingIndex >= 0) {
                // If it's an original, maybe we shouldn't allow > 1 quantity, but let's keep it simple
                const clone = [...prev];
                clone[existingIndex].quantity += 1;
                return clone;
            } else {
                return [...prev, { ...newItem, quantity: 1 }];
            }
        });
        setIsCartOpen(true); // Auto open cart on add
    };

    const removeItem = (id: string) => {
        setItems(prev => prev.filter(item => item.id !== id));
    };

    const updateQuantity = (id: string, delta: number) => {
        setItems(prev => prev.map(item => {
            if (item.id === id) {
                const newQ = Math.max(1, item.quantity + delta);
                // Hard limit originals to 1? Optional logic.
                const isOriginal = item.type === "original";
                return { ...item, quantity: isOriginal ? 1 : newQ };
            }
            return item;
        }));
    };

    const clearCart = () => {
        setItems([]);
    };

    const cartCount = useMemo(() => {
        return items.reduce((sum, item) => sum + item.quantity, 0);
    }, [items]);

    const cartTotal = useMemo(() => {
        return items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    }, [items]);

    return (
        <CartContext.Provider value={{
            items,
            isCartOpen,
            setIsCartOpen,
            addItem,
            removeItem,
            updateQuantity,
            clearCart,
            cartCount,
            cartTotal
        }}>
            {children}
        </CartContext.Provider>
    );
}

export function useCart() {
    const ctx = useContext(CartContext);
    if (!ctx) throw new Error("useCart must be used within CartProvider");
    return ctx;
}
