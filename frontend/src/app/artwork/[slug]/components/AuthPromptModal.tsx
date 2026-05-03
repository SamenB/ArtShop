"use client";

import React from "react";
import GoogleLoginButton from "@/components/GoogleLoginButton";

export function AuthPromptModal({
    isOpen,
    onClose,
}: {
    isOpen: boolean;
    onClose: () => void;
}) {
    if (!isOpen) return null;

    return (
        <div
            onClick={onClose}
            style={{
                position: "fixed", inset: 0, zIndex: 9999,
                background: "rgba(10,10,10,0.65)",
                backdropFilter: "blur(6px)",
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "1rem",
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    background: "#fff",
                    borderRadius: "20px",
                    padding: "2.5rem 2rem",
                    maxWidth: "360px",
                    width: "100%",
                    textAlign: "center",
                    boxShadow: "0 32px 80px rgba(0,0,0,0.25), 0 4px 12px rgba(0,0,0,0.1)",
                }}
            >
                <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>♡</div>
                <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "1.5rem", fontWeight: 400, fontStyle: "italic", color: "#1a1a18", marginBottom: "0.5rem" }}>
                    Save to your collection
                </h2>
                <p style={{ fontFamily: "var(--font-sans)", fontSize: "0.85rem", color: "#777", lineHeight: 1.6, marginBottom: "1.75rem" }}>
                    Sign in to save artworks you love and revisit them anytime from your profile.
                </p>
                {/* Modern Google Authentication Button */}
                <GoogleLoginButton 
                    onSuccess={onClose} 
                    containerStyle={{ marginBottom: "1rem" }}
                />
                <button
                    onClick={onClose}
                    style={{ marginTop: "1rem", background: "none", border: "none", fontFamily: "var(--font-sans)", fontSize: "0.75rem", color: "#999", cursor: "pointer", letterSpacing: "0.05em" }}
                >
                    Continue browsing
                </button>
            </div>
        </div>
    );
}
