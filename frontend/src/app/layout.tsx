// layout.tsx — the ROOT layout of the entire app.
// Every page in /src/app/** is wrapped by this file.
// Think of it as the "shell" of the website:
// Navbar and Footer live here → they appear on EVERY page automatically.
//
// This is a Server Component (no "use client") — it runs on the server.
// Server Components are great for layout because they:
// 1. Never re-render on client = better performance
// 2. Can access server-side data directly
// 3. Are better for SEO (HTML is sent pre-rendered)

import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ClientProviders from "@/components/ClientProviders";
import CartDrawer from "@/components/CartDrawer";
import ImagePreloader from "@/components/ImagePreloader";

// Metadata is a Next.js feature for SEO.
// These values appear in the browser tab and Google search results.
// Next.js automatically injects them as <title> and <meta> tags in <head>.
export const metadata: Metadata = {
  title: {
    // %s will be replaced by page-specific titles
    // e.g. "Gallery | Samen Bondarenko Gallery" for the gallery page
    template: "%s | Samen Bondarenko Gallery",
    default: "Samen Bondarenko Gallery — Original Paintings & Fine Art Prints",
  },
  description:
    "Discover and collect original paintings and fine art prints. Each piece is a unique window into a world of color and emotion.",
  keywords: ["art", "paintings", "prints", "gallery", "original art", "fine art"],
  // Open Graph = metadata for social media previews (Facebook, Twitter, etc.)
  openGraph: {
    type: "website",
    siteName: "Samen Bondarenko Gallery",
    locale: "en_US",
  },
  icons: {
    icon: '/sb-icon.svg?v=4',
    apple: '/sb-icon.svg?v=4',
  },
};

// RootLayout wraps every page.
// {children} = the actual page content (e.g. Home, Gallery, About...)
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // lang="en" helps screen readers and search engines understand language
    // suppressHydrationWarning prevents a React warning caused by
    // browser extensions that modify the DOM (very common on Chrome)
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ClientProviders>
          {/*
          min-h-screen + flex column = ensures Footer sticks to the bottom
          even when page content is short (e.g. a sparse About page)
        */}
          <div
            style={{
              minHeight: "100vh",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Navbar appears at the top of EVERY page */}
            <Navbar />

            {/* Main content — this is where each page renders */}
            <main style={{ flex: 1 }}>
              {children}
            </main>

            {/* Footer appears at the bottom of EVERY page */}
            <Footer />
            <CartDrawer />
            <ImagePreloader />
          </div>
        </ClientProviders>
      </body>
    </html>
  );
}
