import React from "react";

export const inputBase: React.CSSProperties = {
    paddingTop: "0.85rem",
    paddingBottom: "0.85rem",
    paddingLeft: "1rem",
    paddingRight: "1rem",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(17,17,17,0.18)",
    borderRadius: "8px",
    fontFamily: "var(--font-sans)",
    fontSize: "0.9rem",
    backgroundColor: "#fff",
    width: "100%",
    outline: "none",
    transition: "border-color 0.2s, box-shadow 0.2s",
};

export const inputFocus: React.CSSProperties = {
    borderColor: "#ec4899",
    boxShadow: "0 0 0 3px rgba(236,72,153,0.10)",
};

export const labelStyle: React.CSSProperties = {
    fontFamily: "var(--font-sans)",
    fontSize: "0.75rem",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#555",
    marginBottom: "0.35rem",
    display: "block",
};

export const errorStyle: React.CSSProperties = {
    fontFamily: "var(--font-sans)",
    fontSize: "0.75rem",
    color: "#E53E3E",
    marginTop: "0.25rem",
};

export const sectionTitle: React.CSSProperties = {
    fontFamily: "var(--font-serif)",
    fontSize: "1.5rem",
    fontWeight: 500,
    fontStyle: "italic",
    marginBottom: "1.5rem",
};

export const validCheckStyle: React.CSSProperties = {
    position: "absolute",
    right: "12px",
    top: "50%",
    transform: "translateY(-50%)",
    color: "#22c55e",
    fontSize: "1rem",
    fontWeight: 700,
    lineHeight: 1,
    pointerEvents: "none",
    animation: "fadeIn 0.3s ease",
};
