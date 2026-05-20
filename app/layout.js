import "./globals.css";

export const metadata = {
  title: "Card Scout",
  description: "Recherche de joueurs NHL et stats récentes pour repérer les cartes sous-évaluées.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
