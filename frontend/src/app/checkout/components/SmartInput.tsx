"use client";

import React, { useState } from "react";
import { errorStyle, inputBase, inputFocus, labelStyle, validCheckStyle } from "../styles";

export function SmartInput({
    label,
    error,
    required,
    valid,
    style,
    "data-error": dataError,
    ...props
}: {
    label: string;
    error?: string;
    required?: boolean;
    valid?: boolean;
    "data-error"?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) {
    const [focused, setFocused] = useState(false);
    const showCheck = valid && !error;
    return (
        <div style={{ display: "flex", flexDirection: "column", ...style }} data-error={dataError ? "true" : undefined}>
            <label style={labelStyle}>
                {label}
                {required && <span style={{ color: "#ec4899", marginLeft: "3px" }}>*</span>}
            </label>
            <div style={{ position: "relative" }}>
                <input
                    {...props}
                    required={required}
                    onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
                    onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
                    style={{
                        ...inputBase,
                        ...(focused ? inputFocus : {}),
                        ...(error ? { borderColor: "#E53E3E" } : {}),
                        ...(showCheck && !focused ? { borderColor: "#22c55e" } : {}),
                        ...(showCheck ? { paddingRight: "2.5rem" } : {}),
                    }}
                />
                {showCheck && <span style={validCheckStyle}>✓</span>}
            </div>
            {error && <span style={errorStyle}>{error}</span>}
        </div>
    );
}
