"use client";

/**
 * Standardized Google Login Button component.
 * Wraps the GoogleLogin component from @react-oauth/google to provide
 * a consistent authentication experience across the application.
 */
import React, { useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { getApiUrl } from "@/utils";
import { useUser } from "@/context/UserContext";

interface GoogleLoginButtonProps {
    /** Optional callback triggered after successful authentication and user state refresh. */
    onSuccess?: () => void;
    /** Optional styling for the button container. */
    containerStyle?: React.CSSProperties;
}

export default function GoogleLoginButton({ onSuccess, containerStyle }: GoogleLoginButtonProps) {
    const { refreshUser } = useUser();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");

    /**
     * Verifies the Google credential via the backend.
     * @param credentialResponse The response from Google containing the ID token.
     */
    const handleGoogleSuccess = async (credentialResponse: any) => {
        setError("");
        setIsLoading(true);
        try {
            const res = await fetch(`${getApiUrl()}/auth/google`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: credentialResponse.credential }),
                credentials: "include",
            });
            if (res.ok) {
                await refreshUser();
                onSuccess?.();
            } else {
                setError("Google authentication failed");
            }
        } catch {
            setError("Google authentication failed");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div 
            style={{ 
                width: "100%", 
                display: "flex", 
                flexDirection: "column",
                alignItems: "center",
                gap: "0.5rem",
                ...containerStyle 
            }}
        >
            <div style={{ opacity: isLoading ? 0.6 : 1, transition: "opacity 0.2s" }}>
                <GoogleLogin
                    onSuccess={handleGoogleSuccess}
                    onError={() => setError("Google authentication failed")}
                    theme="outline"
                    shape="pill"
                    text="continue_with"
                    width="100%"
                />
            </div>
            {error && (
                <span style={{ fontSize: "0.75rem", color: "#E53E3E", fontFamily: "var(--font-sans)" }}>
                    {error}
                </span>
            )}
        </div>
    );
}
