"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface CoverSlide {
  desktopUrl: string;
  mobileUrl: string;
}

interface HeroSlideshowProps {
  covers: CoverSlide[];
  kenBurnsEnabled?: boolean;
  slideDuration?: number; // seconds
}

/*
 * Ken Burns directions — subtle, cinematic camera movements.
 * Each slide gets a different motion to keep the experience varied.
 */
const KEN_BURNS_PRESETS = [
  { from: "scale(1.0) translate(0%, 0%)",          to: "scale(1.08) translate(-1%, -0.3%)" },
  { from: "scale(1.10) translate(-0.5%, -0.5%)",   to: "scale(1.02) translate(0.3%, 0.3%)" },
  { from: "scale(1.0) translate(0%, 0%)",          to: "scale(1.07) translate(0.5%, -0.8%)" },
  { from: "scale(1.08) translate(0.5%, 0.5%)",     to: "scale(1.0) translate(-0.3%, 0.3%)" },
  { from: "scale(1.0) translate(0%, 0%)",          to: "scale(1.06) translate(0%, -0.5%)" },
];

const CROSSFADE_DURATION = 2000;    // 2s crossfade
const INITIAL_FADE_DURATION = 500;  // 500ms — fast initial appearance
const KEN_BURNS_DURATION = 22000;   // 22s — very slow, cinematic

/**
 * Dual-layer slideshow: Layer A and Layer B alternate.
 * One layer is always fully visible while the other fades in on top.
 * When fade completes, the bottom layer updates its image (invisible, behind the top).
 * This eliminates any white flash between transitions.
 */
export default function HeroSlideshow({
  covers,
  kenBurnsEnabled = true,
  slideDuration = 15,
}: HeroSlideshowProps) {
  // Track which slide index each layer shows
  const [layerA, setLayerA] = useState(0);
  const [layerB, setLayerB] = useState(1 % covers.length);
  // Which layer is currently on top (visible): "A" or "B"
  const [activeLayer, setActiveLayer] = useState<"A" | "B">("A");
  // Whether we're in the middle of a crossfade
  const [fading, setFading] = useState(false);
  // Initial page-load fade
  const [mounted, setMounted] = useState(false);
  // Animation key counter to restart Ken Burns on each new slide
  const [animKeyA, setAnimKeyA] = useState(0);
  const [animKeyB, setAnimKeyB] = useState(1);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slideMs = slideDuration * 1000;
  const isSingle = covers.length <= 1;

  // Trigger initial fade-in
  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  const advance = useCallback(() => {
    if (isSingle) return;

    if (activeLayer === "A") {
      // A is visible. Load next image into B, then fade B in.
      const nextIdx = (layerA + 1) % covers.length;
      setLayerB(nextIdx);
      setAnimKeyB(prev => prev + 1);
      // Small delay for the image src to update before fading
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setFading(true);
          setActiveLayer("B");
        });
      });
    } else {
      // B is visible. Load next image into A, then fade A in.
      const nextIdx = (layerB + 1) % covers.length;
      setLayerA(nextIdx);
      setAnimKeyA(prev => prev + 1);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setFading(true);
          setActiveLayer("A");
        });
      });
    }
  }, [activeLayer, layerA, layerB, covers.length, isSingle]);

  // After crossfade completes, reset fading flag
  useEffect(() => {
    if (!fading) return;
    const t = setTimeout(() => setFading(false), CROSSFADE_DURATION);
    return () => clearTimeout(t);
  }, [fading, activeLayer]);

  // Auto-advance timer
  useEffect(() => {
    if (isSingle) return;
    timerRef.current = setTimeout(advance, slideMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [activeLayer, fading, advance, slideMs, isSingle]);

  const renderLayer = (
    slideIndex: number,
    isOnTop: boolean,
    animKey: number,
  ) => {
    const cover = covers[slideIndex];
    if (!cover) return null;

    const presetIdx = animKey % KEN_BURNS_PRESETS.length;

    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: isOnTop ? 2 : 1,
          opacity: isOnTop ? 1 : (fading ? 0 : 1),
          transition: `opacity ${CROSSFADE_DURATION}ms ease-in-out`,
        }}
      >
        <picture>
          {cover.mobileUrl && (
            <source media="(max-width: 768px)" srcSet={cover.mobileUrl} />
          )}
          <img
            key={animKey}
            src={cover.desktopUrl || cover.mobileUrl}
            alt=""
            fetchPriority={isOnTop ? "high" : "auto"}
            loading="eager"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              willChange: kenBurnsEnabled ? "transform" : undefined,
              animation: kenBurnsEnabled
                ? `kenBurns${presetIdx} ${KEN_BURNS_DURATION}ms ease-in-out both`
                : undefined,
            }}
            aria-hidden="true"
          />
        </picture>
      </div>
    );
  };

  const isAOnTop = activeLayer === "A";

  return (
    <>
      {kenBurnsEnabled && (
        <style>{`
          @keyframes kenBurns0 {
            from { transform: ${KEN_BURNS_PRESETS[0].from}; }
            to   { transform: ${KEN_BURNS_PRESETS[0].to}; }
          }
          @keyframes kenBurns1 {
            from { transform: ${KEN_BURNS_PRESETS[1].from}; }
            to   { transform: ${KEN_BURNS_PRESETS[1].to}; }
          }
          @keyframes kenBurns2 {
            from { transform: ${KEN_BURNS_PRESETS[2].from}; }
            to   { transform: ${KEN_BURNS_PRESETS[2].to}; }
          }
          @keyframes kenBurns3 {
            from { transform: ${KEN_BURNS_PRESETS[3].from}; }
            to   { transform: ${KEN_BURNS_PRESETS[3].to}; }
          }
          @keyframes kenBurns4 {
            from { transform: ${KEN_BURNS_PRESETS[4].from}; }
            to   { transform: ${KEN_BURNS_PRESETS[4].to}; }
          }
        `}</style>
      )}

      {/* Wrapper with initial fade-in */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: mounted ? 1 : 0,
          transition: `opacity ${INITIAL_FADE_DURATION}ms ease-out`,
        }}
      >
        {/* Layer A (bottom when B is active, top when A is active) */}
        {renderLayer(layerA, isAOnTop, animKeyA)}
        {/* Layer B */}
        {renderLayer(layerB, !isAOnTop, animKeyB)}
      </div>
    </>
  );
}
