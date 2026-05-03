"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const THUMB_R = 9;

export function DualRangeSlider({
    label, unit, globalMin, globalMax, valueMin, valueMax, onChange
}: {
    label: string; unit: string;
    globalMin: number; globalMax: number;
    valueMin: number; valueMax: number;
    onChange: (min: number, max: number) => void;
}) {
    const trackRef = useRef<HTMLDivElement>(null);
    const dragging = useRef<"min" | "max" | null>(null);

    const rMin = useRef(valueMin);
    const rMax = useRef(valueMax);
    const rGMin = useRef(globalMin);
    const rGMax = useRef(globalMax);
    const rOnChange = useRef(onChange);

    useEffect(() => { rMin.current = valueMin; }, [valueMin]);
    useEffect(() => { rMax.current = valueMax; }, [valueMax]);
    useEffect(() => { rGMin.current = globalMin; rGMax.current = globalMax; }, [globalMin, globalMax]);
    useEffect(() => { rOnChange.current = onChange; }, [onChange]);

    const valFromClientX = useCallback((clientX: number) => {
        const rect = trackRef.current!.getBoundingClientRect();
        const usable = rect.width - 2 * THUMB_R;
        const p = Math.max(0, Math.min(1, (clientX - rect.left - THUMB_R) / usable));
        return Math.round(rGMin.current + p * (rGMax.current - rGMin.current));
    }, []);

    const [localMin, setLocalMin] = useState(valueMin);
    const [localMax, setLocalMax] = useState(valueMax);
    const [isEditingMin, setIsEditingMin] = useState(false);
    const [isEditingMax, setIsEditingMax] = useState(false);

    const applyMin = useCallback((raw: number) => {
        const v = Math.max(rGMin.current, Math.min(raw, rMax.current - 1));
        setLocalMin(v); rOnChange.current(v, rMax.current);
    }, []);

    const applyMax = useCallback((raw: number) => {
        const v = Math.max(Math.min(raw, rGMax.current), rMin.current + 1);
        setLocalMax(v); rOnChange.current(rMin.current, v);
    }, []);

    const handleTrackPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        const val = valFromClientX(e.clientX);
        const which = Math.abs(val - rMin.current) <= Math.abs(val - rMax.current) ? "min" : "max";
        dragging.current = which;
        e.currentTarget.setPointerCapture(e.pointerId);
        if (which === "min") rOnChange.current(Math.max(rGMin.current, Math.min(val, rMax.current - 1)), rMax.current);
        else rOnChange.current(rMin.current, Math.max(Math.min(val, rGMax.current), rMin.current + 1));
    }, [valFromClientX]);

    const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (!dragging.current) return;
        e.preventDefault();
        const val = valFromClientX(e.clientX);
        if (dragging.current === "min")
            rOnChange.current(Math.max(rGMin.current, Math.min(val, rMax.current - 1)), rMax.current);
        else
            rOnChange.current(rMin.current, Math.max(Math.min(val, rGMax.current), rMin.current + 1));
    }, [valFromClientX]);

    const handlePointerUp = useCallback(() => { dragging.current = null; }, []);

    const range = globalMax - globalMin || 1;
    const pct = (v: number) => Math.max(0, Math.min(100, ((v - globalMin) / range) * 100));
    const isActive = valueMin > globalMin || valueMax < globalMax;

    const thumbBase: React.CSSProperties = {
        position: "absolute", top: "50%", width: `${THUMB_R * 2}px`, height: `${THUMB_R * 2}px`,
        backgroundColor: "#1a1a18", borderRadius: "50%", border: "2px solid #fff", boxShadow: "0 1px 4px rgba(0,0,0,0.28)",
        transform: "translate(-50%, -50%)", pointerEvents: "none", userSelect: "none", zIndex: 2,
    };
    const leftOf = (v: number) => `calc(${THUMB_R}px + (100% - ${THUMB_R * 2}px) * ${pct(v) / 100})`;

    return (
        <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "5px" }}>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.68rem", fontWeight: 600, letterSpacing: "0.09em", textTransform: "uppercase", color: "#555" }}>
                    {label}
                </span>
                {isActive && <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.65rem", color: "#888" }}>{valueMin}–{valueMax} {unit}</span>}
            </div>

            <div
                ref={trackRef}
                style={{ position: "relative", height: "28px", padding: `0 ${THUMB_R}px`, boxSizing: "border-box", cursor: "pointer", marginBottom: "8px", touchAction: "none", userSelect: "none" }}
                onPointerDown={handleTrackPointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
            >
                <div style={{ position: "absolute", top: "50%", left: `${THUMB_R}px`, right: `${THUMB_R}px`, height: "3px", backgroundColor: "rgba(26,26,24,0.1)", borderRadius: "2px", transform: "translateY(-50%)", pointerEvents: "none" }} />
                <div style={{ position: "absolute", top: "50%", left: leftOf(valueMin), right: `calc(${THUMB_R}px + (100% - ${THUMB_R * 2}px) * ${(100 - pct(valueMax)) / 100})`, height: "3px", backgroundColor: "#1a1a18", borderRadius: "2px", transform: "translateY(-50%)", pointerEvents: "none" }} />
                <div style={{ ...thumbBase, left: leftOf(valueMin) }} />
                <div style={{ ...thumbBase, left: leftOf(valueMax) }} />
            </div>
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "var(--font-sans)", fontSize: "0.6rem", color: "#bbb", marginBottom: "2px" }}>Min ({unit})</div>
                    <input
                        type="number" value={isEditingMin ? localMin : valueMin}
                        onChange={e => setLocalMin(Number(e.target.value))}
                        onFocus={() => { setIsEditingMin(true); }}
                        onBlur={() => { setIsEditingMin(false); applyMin(localMin); }}
                        onKeyDown={e => { if (e.key === "Enter") { applyMin(localMin); (e.target as HTMLInputElement).blur(); } }}
                        style={{ width: "100%", border: "1px solid rgba(26,26,24,0.18)", borderRadius: "3px", padding: "4px 5px", fontFamily: "var(--font-sans)", fontSize: "0.75rem", outline: "none", color: "#1a1a18" }}
                    />
                </div>
                <span style={{ color: "#ddd", fontSize: "0.7rem", marginTop: "14px" }}>–</span>
                <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "var(--font-sans)", fontSize: "0.6rem", color: "#bbb", marginBottom: "2px" }}>Max ({unit})</div>
                    <input
                        type="number" value={isEditingMax ? localMax : valueMax}
                        onChange={e => setLocalMax(Number(e.target.value))}
                        onFocus={() => { setIsEditingMax(true); }}
                        onBlur={() => { setIsEditingMax(false); applyMax(localMax); }}
                        onKeyDown={e => { if (e.key === "Enter") { applyMax(localMax); (e.target as HTMLInputElement).blur(); } }}
                        style={{ width: "100%", border: "1px solid rgba(26,26,24,0.18)", borderRadius: "3px", padding: "4px 5px", fontFamily: "var(--font-sans)", fontSize: "0.75rem", outline: "none", color: "#1a1a18" }}
                    />
                </div>
            </div>
        </div>
    );
}
