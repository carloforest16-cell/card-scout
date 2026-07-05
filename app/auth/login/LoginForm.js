"use client";

import { createClient } from "@/lib/supabase/client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Chemin email+mot de passe réservé au dev/preview pour permettre à un
// agent (ou un humain) de vérifier les pages authentifiées sans passer par
// Google OAuth, qui ne peut pas être automatisé. JAMAIS actif en prod.
const TEST_LOGIN_ENABLED = process.env.NEXT_PUBLIC_ALLOW_TEST_LOGIN === "1";

export function LoginForm() {
  const [loading, setLoading] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testPassword, setTestPassword] = useState("");
  const [testError, setTestError] = useState(null);
  const router = useRouter();

  function resolveNextUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("next") || "/dashboard";
  }

  async function signInWithGoogle() {
    setLoading(true);
    const supabase = createClient();
    const next = new URLSearchParams(window.location.search).get("next");
    const callbackUrl = next
      ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
      : `${window.location.origin}/auth/callback`;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl,
      },
    });
  }

  async function signInWithTestPassword(e) {
    e.preventDefault();
    setTestError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });
    setLoading(false);
    if (error) {
      setTestError(error.message);
      return;
    }
    router.push(resolveNextUrl());
    router.refresh();
  }

  return (
    <div className="auth-actions">
      <button
        className="auth-btn-google"
        onClick={signInWithGoogle}
        disabled={loading}
        type="button"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        {loading ? "Redirection…" : "Continuer avec Google"}
      </button>

      {TEST_LOGIN_ENABLED && (
        <form className="auth-test-login" onSubmit={signInWithTestPassword}>
          <p className="auth-test-login-label">Connexion de test (dev uniquement)</p>
          <input
            type="email"
            placeholder="email de test"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            autoComplete="username"
            required
          />
          <input
            type="password"
            placeholder="mot de passe"
            value={testPassword}
            onChange={(e) => setTestPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <button type="submit" disabled={loading}>
            {loading ? "Connexion…" : "Se connecter (test)"}
          </button>
          {testError && <p className="auth-error">{testError}</p>}
        </form>
      )}
    </div>
  );
}
