import "./globals.css";
import { Bebas_Neue, DM_Sans, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { ToastProvider } from "./components/Toast";

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
  title: "Card Scout",
  description: "Recherche de joueurs NHL et stats récentes pour repérer les cartes sous-évaluées.",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="fr"
      className={`${bebas.variable} ${dmSans.variable} ${jetbrains.variable} ${spaceGrotesk.variable}`}
    >
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
