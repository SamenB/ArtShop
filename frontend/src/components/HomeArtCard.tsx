"use client";

/**
 * Homepage Artwork Display Card.
 * Renders an abstract container that dynamically frames artwork based on its physical properties (orientation, gradient).
 */

import React, { useRef, useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { artworkUrl, getImageUrl } from "@/utils";

const STATUS: Record<string, { label: string; color: string }> = {
  available: { label: "AVAILABLE", color: "#6DB87E" },
  sold: { label: "SOLD", color: "#C0392B" },
  reserved: { label: "RESERVED", color: "#D4A017" },
  not_for_sale: { label: "NOT FOR SALE", color: "#999" },
  on_exhibition: { label: "ON EXHIBITION", color: "#2980B9" },
  archived: { label: "ARCHIVED", color: "#7f8c8d" },
  digital: { label: "DIGITAL", color: "#8E44AD" },
};

interface Props {
  work: any;
  zoneH?: number;
}

export default function HomeArtCard({ work, zoneH = 380 }: Props) {
  const ori = (work.orientation || "vertical").toLowerCase();
  const isHorizontal = ori === "horizontal";
  const isSquare = ori === "square";
  const imgSrc = work.images?.[0] ? getImageUrl(work.images[0], "original") : "";

  const containerRef = useRef<HTMLDivElement>(null);
  const [textPad, setTextPad] = useState(0);
  const [emptyBottom, setEmptyBottom] = useState(0);

  const recalc = useCallback(() => {
    const c = containerRef.current;
    if (!c) return;
    const inner = c.querySelector(".art-card-inner") as HTMLElement;
    if (!inner) return;
    if (inner.tagName === "IMG") {
      const img = inner as HTMLImageElement;
      if (!img.complete || !img.naturalWidth) return;
    }
    setTextPad(Math.max(0, (c.clientWidth - inner.offsetWidth) / 2));
    setEmptyBottom(Math.max(0, (c.clientHeight - inner.offsetHeight) / 2));
  }, []);

  useEffect(() => {
    recalc();
    window.addEventListener("resize", recalc);
    return () => window.removeEventListener("resize", recalc);
  }, [recalc]);

  useEffect(() => {
    requestAnimationFrame(recalc);
  }, [zoneH, recalc]);

  return (
    <Link
      href={artworkUrl(work.slug || work.id)}
      className="art-card"
      style={{
        display: "flex",
        flexDirection: "column",
        textDecoration: "none",
        color: "inherit",
        width: "100%",
      }}
    >
      <div
        ref={containerRef}
        className="art-card-container"
        style={{
          width: "100%",
          height: `${zoneH}px`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={work.title}
            className="art-card-inner"
            onLoad={recalc}
            style={{
              display: "block",
              maxWidth: isHorizontal || isSquare ? "78%" : "80%",
              maxHeight: isHorizontal ? `${zoneH * 0.78}px` : `${zoneH * 0.90}px`,
              width: "auto",
              height: "auto",
              borderRadius: "1px",
              alignSelf: "center",
              flexShrink: 0,
              boxShadow: "2px 10px 28px rgba(28,25,22,0.72), 0 3px 8px rgba(28,25,22,0.40)",
            }}
          />
        ) : (
          <div
            className="art-card-inner"
            style={{
              width: isHorizontal || isSquare ? "78%" : "55%",
              height: isHorizontal ? "55%" : "85%",
              backgroundImage: `linear-gradient(160deg, ${work.gradientFrom} 0%, ${work.gradientTo} 100%)`,
              borderRadius: "1px",
              alignSelf: "center",
              flexShrink: 0,
              boxShadow: "2px 10px 28px rgba(28,25,22,0.72), 0 3px 8px rgba(28,25,22,0.40)",
            }}
          />
        )}
      </div>

      {/* Title & Status — aligned to painting's left vertical edge */}
      <div
        style={{
          marginTop: `-${emptyBottom}px`,
          paddingTop: "0.7rem",
          paddingLeft: `${textPad}px`,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: "0.15rem"
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "1.05rem",
            fontWeight: 500,
            fontStyle: "italic",
            color: "#666",
            margin: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            lineHeight: 1.35,
          }}
        >
          {work.title}
        </p>
        <p style={{
          fontFamily: "var(--font-sans)",
          fontSize: "0.76rem",
          fontWeight: 300,
          color: "#aaa",
          margin: 0,
          lineHeight: 1.4,
          letterSpacing: "0.01em",
        }}>
          Original
          {work.original_status && STATUS[work.original_status] && (
            <> — <span style={{ fontWeight: 700, color: STATUS[work.original_status].color, opacity: 0.9, letterSpacing: "0.03em" }}>{STATUS[work.original_status].label}</span></>
          )}
        </p>
      </div>
    </Link>
  );
}
