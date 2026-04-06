/**
 * Root Layout for the ArtShop frontend.
 * This server component serves as the global application shell, 
 * providing the HTML structure, global navigation (Navbar/Footer), 
 * and context providers (ClientProviders) for all pages.
 */

import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ClientProviders from "@/components/ClientProviders";
import CartDrawer from "@/components/CartDrawer";
import ImagePreloader from "@/components/ImagePreloader";

/**
 * Global SEO metadata configuration.
 * Defines the application title template, default description, 
 * social media previews (Open Graph), and branding icons.
 */
export const metadata: Metadata = {
  title: {
    // Page-specific titles are suffixed with the gallery name.
    template: "%s | Samen Bondarenko Gallery",
    default: "Samen Bondarenko Gallery — Original Paintings & Fine Art Prints",
  },
  description:
    "Explore and acquire original oil paintings and high-quality fine art prints. Experience a world defined by vibrant colors and raw emotion.",
  keywords: ["art", "painter", "gallery", "original paintings", "fine art prints", "collection"],
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

/**
 * Primary layout component that wraps every page in the application.
 * Handles the high-level flexbox structure to ensure the footer is always bottom-aligned.
 * 
 * @param children - The active page component to be rendered within the main content area.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ClientProviders>
          {/* Main flex container to manage sticky footer behavior. */}
          <div
            style={{
              minHeight: "100vh",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Global navigation menu visible on all routes. */}
            <Navbar />

            {/* Main content slot for routed components. */}
            <main style={{ flex: 1 }}>
              {children}
            </main>

            {/* Global footer and persistent overlays (Cart, Preloading). */}
            <Footer />
            <CartDrawer />
            <ImagePreloader />
          </div>
        </ClientProviders>
      </body>
    </html>
  );
}
