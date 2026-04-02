"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { artworkUrl, getImageUrl } from "@/utils";

interface Props {
  work: any;
  zoneH?: number;
}

export default function HomeArtCard({ work, zoneH = 380 }: Props) {
  const ori = (work.orientation || "vertical").toLowerCase();
  const isHorizontal = ori === "horizontal";
  const isSquare = ori === "square";
  const imgSrc = work.images?.[0] ? getImageUrl(work.images[0], "original") : "";

  /* ref-based text alignment to painting’s left edge */
  const containerRef = useRef<HTMLDivElement>(null);
  const [textPad, setTextPad] = useState(0);

  const recalc = useCallback(() => {
    const c = containerRef.current;
    if (!c) return;
    const img = c.querySelector("img");
    if (!img || !img.complete || !img.naturalWidth) return;
    setTextPad(Math.max(0, (c.clientWidth - img.clientWidth) / 2));
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

      {/* Title only — aligned to painting's left vertical edge */}
      <div
        style={{
          paddingTop: "0.7rem",
          paddingLeft: `${textPad}px`,
          flexShrink: 0,
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "1.05rem",
            fontWeight: 400,
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
      </div>
    </Link>
  );
}
