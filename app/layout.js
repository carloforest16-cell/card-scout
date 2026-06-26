import "./globals.css";
import "./app-nav.css";
import { Bebas_Neue, DM_Sans, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { ToastProvider } from "./components/Toast";
import BottomNav from "./components/BottomNav";
import Footer from "./components/Footer";
import NavProgress from "./components/NavProgress";
import { PreferencesProvider } from "./components/PreferencesContext";
import PreferencesModal from "./components/PreferencesModal";

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

export const viewport = {
  themeColor: "#00D4FF",
  width: "device-width",
  initialScale: 1,
};

export const metadata = {
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Card Metrics",
  },
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
      "https://cardmetrics.io"
  ),
  title: {
    default: "Card Metrics — Trouve les meilleures cartes NHL",
    template: "%s | Card Metrics",
  },
  description: "Analyse les prix eBay en temps réel, repère les cartes NHL sous-évaluées et prends de meilleures décisions d'investissement.",
  keywords: ["hockey cards", "cartes hockey", "NHL", "eBay", "investissement", "Young Guns", "PSA", "Card Metrics"],
  authors: [{ name: "Card Metrics" }],
  openGraph: {
    type: "website",
    siteName: "Card Metrics",
    title: "Card Metrics — Intelligence pour cartes NHL",
    description: "Analyse eBay en temps réel · Scores d'investissement IA · Trouvez les meilleures deals.",
    images: [{ url: "/og-default.png", width: 1200, height: 630, alt: "Card Metrics" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Card Metrics — Intelligence pour cartes NHL",
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
      <body>
        <PreferencesProvider>
          <PreferencesModal />
          <ToastProvider>
            <NavProgress />
            {children}
            <Footer />
            <BottomNav />
          </ToastProvider>
        </PreferencesProvider>
      </body>
    </html>
  );
}
