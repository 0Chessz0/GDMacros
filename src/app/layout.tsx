import type { Metadata } from "next";
import "./globals.css";
import Background from "@/components/Background";
import Footer from "@/components/Footer";
import GoogleTranslate from "@/components/GoogleTranslate";
import PageTransition from "@/components/PageTransition";
import Navbar from "@/components/Navbar";
import { KEYWORDS, site } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    // The home page title leads with the search phrase rather than the brand,
    // because almost nobody searches for "GDMacros" yet.
    default: "Geometry Dash Macros | GDMacros",
    template: `%s | ${site.name}`,
  },
  description: site.description,
  keywords: KEYWORDS,
  applicationName: site.name,
  alternates: { canonical: "/" },
  openGraph: {
    title: "Geometry Dash Macros | GDMacros",
    description: site.description,
    url: "/",
    siteName: site.name,
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Geometry Dash Macros | GDMacros",
    description: site.description,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: { icon: "/favicon.svg" },
};

/**
 * Tells Google this is a site with an internal search, which is what earns the
 * sitelinks search box on a branded result.
 */
const siteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: site.name,
  alternateName: "Geometry Dash Macros",
  url: site.url,
  description: site.description,
  inLanguage: "en",
  potentialAction: {
    "@type": "SearchAction",
    target: { "@type": "EntryPoint", urlTemplate: `${site.url}/?q={search_term_string}` },
    "query-input": "required name=search_term_string",
  },
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd) }}
        />
      </head>
      <body className="flex min-h-dvh flex-col">
        <GoogleTranslate />
        <Background />
        <Navbar />
        <main className="flex-1">
          <PageTransition>{children}</PageTransition>
        </main>
        <Footer />
      </body>
    </html>
  );
}
