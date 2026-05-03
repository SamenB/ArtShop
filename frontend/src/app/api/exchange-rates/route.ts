import { NextResponse } from "next/server";

type SupportedCurrency = "USD" | "UAH";

type ExchangeRatesPayload = {
    rates: Record<SupportedCurrency, number>;
    fetchedAt: string;
    source: "live" | "memory-cache" | "fallback";
};

const DEFAULT_RATES: Record<SupportedCurrency, number> = {
    USD: 1,
    UAH: 39.5,
};

const CACHE_TTL_MS = 1000 * 60 * 60 * 6;

let cachedPayload: ExchangeRatesPayload | null = null;

async function fetchLiveRates(): Promise<ExchangeRatesPayload> {
    const response = await fetch("https://api.exchangerate-api.com/v4/latest/USD", {
        headers: {
            Accept: "application/json",
        },
        signal: AbortSignal.timeout(4000),
        cache: "no-store",
    });

    if (!response.ok) {
        throw new Error(`Rate provider returned ${response.status}`);
    }

    const data = await response.json();
    const uahRate = Number(data?.rates?.UAH);

    if (!Number.isFinite(uahRate) || uahRate <= 0) {
        throw new Error("Rate provider returned an invalid UAH rate");
    }

    return {
        rates: {
            USD: 1,
            UAH: uahRate,
        },
        fetchedAt: new Date().toISOString(),
        source: "live",
    };
}

export async function GET() {
    const now = Date.now();

    if (cachedPayload) {
        const cachedAge = now - Date.parse(cachedPayload.fetchedAt);
        if (cachedAge < CACHE_TTL_MS) {
            return NextResponse.json({
                ...cachedPayload,
                source: "memory-cache",
            });
        }
    }

    try {
        const livePayload = await fetchLiveRates();
        cachedPayload = livePayload;
        return NextResponse.json(livePayload);
    } catch (error) {
        console.warn("Exchange rate refresh failed, serving fallback rates.", error);
        return NextResponse.json({
            rates: DEFAULT_RATES,
            fetchedAt: new Date().toISOString(),
            source: "fallback",
        });
    }
}
