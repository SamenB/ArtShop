"use client";

/**
 * Context provider for managing the shopping cart state.
 * Handles item addition, removal, quantity updates, and persistent
 * storage across browser sessions using localStorage.
 */
import { createContext, useContext, useMemo, useState, useSyncExternalStore } from "react";

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
    /** Optional size selection for prints (e.g., '30 x 40 cm'). */
    size?: string;
    /** Explicit backend edition type for checkout/order creation. */
    edition_type?:
        | "original"
        | "canvas_print"
        | "canvas_print_limited"
        | "paper_print"
        | "paper_print_limited";
    /** Prodigi SKU for the selected variant. */
    prodigi_sku?: string;
    /** Normalized storefront category id for exact prepared asset resolution. */
    prodigi_category_id?: string;
    /** Raw storefront slot label used for exact derivative lookup. */
    prodigi_slot_size_label?: string;
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
const CART_UPDATED_EVENT = "artshop-cart-updated";
const EMPTY_CART: CartItem[] = [];

let cachedCartRaw: string | null = null;
let cachedCartSnapshot: CartItem[] = EMPTY_CART;

function readCartFromStorage(): CartItem[] {
    if (typeof window === "undefined") {
        return EMPTY_CART;
    }

    try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (!saved) {
            cachedCartRaw = null;
            cachedCartSnapshot = EMPTY_CART;
            return cachedCartSnapshot;
        }

        if (saved === cachedCartRaw) {
            return cachedCartSnapshot;
        }

        const parsed = JSON.parse(saved);
        cachedCartRaw = saved;
        cachedCartSnapshot = Array.isArray(parsed) ? parsed : EMPTY_CART;
        return cachedCartSnapshot;
    } catch {
        cachedCartRaw = null;
        cachedCartSnapshot = EMPTY_CART;
        return cachedCartSnapshot;
    }
}

function writeCartToStorage(items: CartItem[]): void {
    if (typeof window === "undefined") {
        return;
    }

    try {
        const serialized = JSON.stringify(items);
        window.localStorage.setItem(STORAGE_KEY, serialized);
        cachedCartRaw = serialized;
        cachedCartSnapshot = items.length ? items : EMPTY_CART;
    } catch {
        // Silently ignore storage quota or permission errors.
    }
}

function notifyCartUpdated(): void {
    if (typeof window === "undefined") {
        return;
    }

    window.dispatchEvent(new Event(CART_UPDATED_EVENT));
}

function subscribeCartStore(onStoreChange: () => void): () => void {
    if (typeof window === "undefined") {
        return () => {};
    }

    const handleStorage = (event: StorageEvent) => {
        if (!event.key || event.key === STORAGE_KEY) {
            onStoreChange();
        }
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(CART_UPDATED_EVENT, onStoreChange);

    return () => {
        window.removeEventListener("storage", handleStorage);
        window.removeEventListener(CART_UPDATED_EVENT, onStoreChange);
    };
}

function getCartServerSnapshot(): CartItem[] {
    return EMPTY_CART;
}

/**
 * High-level provider component that manages cart persistence and state updates.
 */
export function CartProvider({ children }: { children: React.ReactNode }) {
    const [isCartOpen, setIsCartOpen] = useState(false);
    const items = useSyncExternalStore(
        subscribeCartStore,
        readCartFromStorage,
        getCartServerSnapshot
    );

    /**
     * Adds a new item to the cart or increments its quantity if it already exists.
     * Automatically triggers the cart visibility overlay.
     */
    const addItem = (newItem: Omit<CartItem, "quantity">) => {
        const currentItems = readCartFromStorage();
        const existingIndex = currentItems.findIndex((item) => item.id === newItem.id);
        if (existingIndex >= 0) {
            const clone = [...currentItems];
            // For prints, we allow incrementing.
            // Note: Logic for 'originals' uniqueness is handled in updateQuantity.
            clone[existingIndex].quantity += 1;
            writeCartToStorage(clone);
        } else {
            writeCartToStorage([...currentItems, { ...newItem, quantity: 1 }]);
        }
        notifyCartUpdated();
        setIsCartOpen(true);
    };

    /** Removes an item completely from the cart by its unique ID. */
    const removeItem = (id: string) => {
        writeCartToStorage(readCartFromStorage().filter((item) => item.id !== id));
        notifyCartUpdated();
    };

    /**
     * Updates the quantity of a specific item.
     * Prevents quantity < 1 and enforces single-unit limits for "original" artworks.
     */
    const updateQuantity = (id: string, delta: number) => {
        writeCartToStorage(
            readCartFromStorage().map((item) => {
                if (item.id === id) {
                    const newQuantity = Math.max(1, item.quantity + delta);
                    const isOriginal = item.type === "original";
                    return { ...item, quantity: isOriginal ? 1 : newQuantity };
                }
                return item;
            })
        );
        notifyCartUpdated();
    };

    /** Clears all items from the cart. */
    const clearCart = () => {
        writeCartToStorage([]);
        notifyCartUpdated();
    };

    /** Derived total number of units in the cart. */
    const cartCount = useMemo(() => {
        return items.reduce((sum, item) => sum + item.quantity, 0);
    }, [items]);

    /** Derived total currency value of all items in the cart. */
    const cartTotal = useMemo(() => {
        return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    }, [items]);

    return (
        <CartContext.Provider
            value={{
                items,
                isCartOpen,
                setIsCartOpen,
                addItem,
                removeItem,
                updateQuantity,
                clearCart,
                cartCount,
                cartTotal,
            }}
        >
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
