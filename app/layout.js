import "./globals.css";
import { Bebas_Neue, DM_Sans, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { ToastProvider } from "./components/Toast";
import BottomNav from "./components/BottomNav";
import Footer from "./components/Footer";
import NavProgress from "./components/NavProgress";

const bebas = Bebas_Neue({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-bebas",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-dm-sans",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-jetbrains",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-space",
});

export const metadata = {
  metadataBase: new URL("https://card-scout.vercel.app"),
  title: {
    default: "Card Scout — Trouve les meilleures cartes NHL",
    template: "%s | Card Scout",
  },
  description: "Analyse les prix eBay en temps réel, repère les cartes NHL sous-évaluées et prends de meilleures décisions d'investissement.",
  keywords: ["hockey cards", "cartes hockey", "NHL", "eBay", "investissement", "Young Guns", "PSA", "Card Scout"],
  authors: [{ name: "Card Scout" }],
  openGraph: {
    type: "website",
    siteName: "Card Scout",
    title: "Card Scout — Intelligence pour cartes NHL",
    description: "Analyse eBay en temps réel · Scores d'investissement IA · Trouvez les meilleures deals.",
    images: [{ url: "/og-default.png", width: 1200, height: 630, alt: "Card Scout" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Card Scout — Intelligence pour cartes NHL",
    description: "Analyse eBay en temps réel · Scores d'investissement IA",
    images: ["/og-default.png"],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="fr"
      className={`${bebas.variable} ${dmSans.variable} ${jetbrains.variable} ${spaceGrotesk.variable}`}
    >
      <head>
        {/* Preconnect to external origins for faster loading */}
        <link rel="preconnect" href="https://i.ebayimg.com" />
        <link rel="preconnect" href="https://assets.nhle.com" />
        <link rel="preconnect" href="https://cms.nhl.bamgrid.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://api.ebay.com" />
        <link rel="dns-prefetch" href="https://api-web.nhle.com" />
      </head>
      <body>
        <ToastProvider>
          <NavProgress />
          {children}
          <Footer />
          <BottomNav />
        </ToastProvider>
      </body>
    </html>
  );
}
