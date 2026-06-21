import Link from "next/link";

import "./auth.css";

import { LoginForm } from "./LoginForm";

export const metadata = { title: "Connexion — Card Metrics" };

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const error = params?.error;
  return (
    <main className="auth-page">
      <div className="auth-card">
        <Link href="/" className="auth-logo">
          Card <span>Scout</span>
        </Link>
        <h1 className="auth-title">Connexion</h1>
        <p className="auth-subtitle">Accède à ta watchlist et tes alertes prix.</p>
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
