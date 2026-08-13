import type { Metadata } from "next";
import "./globals.css";
import Background from "@/components/Background";
import Footer from "@/components/Footer";
import GoogleTranslate from "@/components/GoogleTranslate";
import Navbar from "@/components/Navbar";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} | ${site.tagline}`,
    template: `%s | ${site.name}`,
  },
  description: site.description,
  openGraph: {
    title: site.name,
    description: site.description,
    url: site.url,
    siteName: site.name,
    type: "website",
  },
  twitter: { card: "summary_large_image", title: site.name, description: site.description },
  icons: { icon: "/favicon.svg" },
};

/**
 * Applies the saved theme before first paint so the page never flashes dark
 * for someone who chose light. Dark stays the default.
 */
const themeScript = `
(function(){
  try {
    var t = localStorage.getItem('gdm-theme');
    if (t === 'light' || t === 'dark') {
      document.documentElement.dataset.theme = t;
      document.documentElement.style.colorScheme = t;
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <GoogleTranslate />
        <Background />
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
