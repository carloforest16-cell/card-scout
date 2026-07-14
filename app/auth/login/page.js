import Link from "next/link";
import { BellRing, Mail, Wallet } from "lucide-react";

import "./auth.css";

import { LoginForm } from "./LoginForm";

export const metadata = { title: "Connexion" };

const ACCOUNT_BENEFITS = [
  {
    Icon: Wallet,
    title: "Ton Vault",
    desc: "Suis la valeur de ta collection en temps réel.",
  },
  {
    Icon: BellRing,
    title: "Alertes de prix",
    desc: "Sois prévenu dès qu'une carte de tes joueurs bouge.",
  },
  {
    Icon: Mail,
    title: "Digest quotidien",
    desc: "Les meilleurs deals du jour, directement par email.",
  },
];

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const error = params?.error;
  return (
    <main className="auth-page">
      <div className="auth-card">
        <Link href="/" className="auth-logo">
          Card <span>Metrics</span>
        </Link>
        <h1 className="auth-title">Crée ton compte gratuit</h1>
        <p className="auth-subtitle">
          Card Metrics reste 100% gratuit. Un compte débloque le suivi de ta collection.
        </p>

        <ul className="auth-benefits">
          {ACCOUNT_BENEFITS.map(({ Icon, title, desc }) => (
            <li key={title} className="auth-benefit">
              <span className="auth-benefit__icon" aria-hidden>
                <Icon size={18} />
              </span>
              <span className="auth-benefit__text">
                <strong>{title}</strong>
                <span>{desc}</span>
              </span>
            </li>
          ))}
        </ul>

        {error && (
          <p className="auth-error">Une erreur est survenue. Réessaie.</p>
        )}
        <LoginForm />
        <p className="auth-terms">
          En te connectant, tu acceptes les conditions d&apos;utilisation de Card Metrics.
        </p>
      </div>
    </main>
  );
}
