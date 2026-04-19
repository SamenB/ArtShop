"use client";

/**
 * Context provider for managing the shopping cart state.
 * Handles item addition, removal, quantity updates, and persistent 
 * storage across browser sessions using localStorage.
 */
import { createContext, useContext, useState, useEffect, ReactNode, useMemo } from "react";

/** Supported types of items that can be added to the cart. */
export type CartItemType = "original" | "print";

/** Represents a single item entry in the shopping cart. */
export interface CartItem {
    /** Unique identifier for the cart line item (usually artwork slug + variant). */
    id: string;
    /** The unique slug of the artwork. */
    slug: string;
    /** Display title of the artwork. */
    title: string;
    /** Type of edition: 'original' (one-of-a-kind) or 'print'. */
    type: CartItemType;
    /** CSS gradient start color for placeholder/background. */
    imageGradientFrom: string;
    /** CSS gradient end color for placeholder/background. */
    imageGradientTo: string;
    /** Actual artwork thumbnail URL for display in cart/checkout. */
    imageUrl?: string;
    /** Current unit price of the item. */
    price: number;
    /** Number of units in the cart. */
    quantity: number;
    /** Optional finish selection for prints (e.g., 'Framed'). */
    finish?: string;
    /** Optional size selection for prints (e.g., '30 × 40 cm'). */
    size?: string;
    /** Prodigi SKU for the selected variant. */
    prodigi_sku?: string;
    /** Prodigi print attributes (like frame color or wrap border). */
    prodigi_attributes?: Record<string, string>;
    /** Selected shipping method for the item (e.g., Standard, Express). */
    prodigi_shipping_method?: string;
    /** Prodigi wholesale item cost. */
    prodigi_wholesale_eur?: number;
    /** Prodigi shipping cost. */
    prodigi_shipping_eur?: number;
    /** Prodigi total retail price (wholesale * markup + shipping pass-through). */
    prodigi_retail_eur?: number;
}

/** Definition of the cart context state and available mutators. */
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

/**
 * High-level provider component that manages cart persistence and state updates.
 */
export function CartProvider({ children }: { children: ReactNode }) {
    const [items, setItems] = useState<CartItem[]>([]);
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [loaded, setLoaded] = useState(false);

    // Synchronize state with local storage on initial mount.
    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                setItems(JSON.parse(saved));
            }
        } catch {
            // Silently ignore corrupted or inaccessible storage data.
        }
        setLoaded(true);
    }, []);

    // Persist state changes back to local storage.
    useEffect(() => {
        if (!loaded) return;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        } catch {
            // Silently ignore storage quota or permission errors.
        }
    }, [items, loaded]);

    /**
     * Adds a new item to the cart or increments its quantity if it already exists.
     * Automatically triggers the cart visibility overlay.
     */
    const addItem = (newItem: Omit<CartItem, "quantity">) => {
        setItems(prev => {
            const existingIndex = prev.findIndex(item => item.id === newItem.id);
            if (existingIndex >= 0) {
                const clone = [...prev];
                // For prints, we allow incrementing. 
                // Note: Logic for 'originals' uniqueness is handled in updateQuantity.
                clone[existingIndex].quantity += 1;
                return clone;
            } else {
                return [...prev, { ...newItem, quantity: 1 }];
            }
        });
        setIsCartOpen(true);
    };

    /** Removes an item completely from the cart by its unique ID. */
    const removeItem = (id: string) => {
        setItems(prev => prev.filter(item => item.id !== id));
    };

    /**
     * Updates the quantity of a specific item.
     * Prevents quantity < 1 and enforces single-unit limits for "original" artworks.
     */
    const updateQuantity = (id: string, delta: number) => {
        setItems(prev => prev.map(item => {
            if (item.id === id) {
                const newQ = Math.max(1, item.quantity + delta);
                // Original artworks can only ever have a quantity of 1.
                const isOriginal = item.type === "original";
                return { ...item, quantity: isOriginal ? 1 : newQ };
            }
            return item;
        }));
    };

    /** Clears all items from the cart. */
    const clearCart = () => {
        setItems([]);
    };

    /** Derived total number of units in the cart. */
    const cartCount = useMemo(() => {
        return items.reduce((sum, item) => sum + item.quantity, 0);
    }, [items]);

    /** Derived total currency value of all items in the cart. */
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

/**
 * Hook to access shopping cart state and manipulation methods.
 * Throws an error if used outside of a CartProvider context.
 */
export function useCart() {
    const ctx = useContext(CartContext);
    if (!ctx) throw new Error("useCart must be used within CartProvider");
    return ctx;
}
