"use client";

import { useState } from "react";

import AppNav from "../AppNav";
import Atmosphere from "../components/Atmosphere";
import Reveal from "../components/Reveal";
import ScrollProgress from "../components/ScrollProgress";

export default function DigestClient() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState({ loading: false, success: false, error: null });

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setState({ loading: true, success: false, error: null });
    try {
      const r = await fetch("/api/digest/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const body = await r.json().catch(() => null);
      if (!body?.ok) {
        setState({ loading: false, success: false, error: body?.error ?? "Erreur" });
        return;
      }
      setState({ loading: false, success: true, error: null });
      setEmail("");
    } catch {
      setState({ loading: false, success: false, error: "Erreur réseau" });
    }
  }

  return (
    <div className="dg-page cinematic">
      <ScrollProgress />
      <Atmosphere />

      <div className="dg-rail">
        <div className="dg-rail__inner">
          <AppNav active={null} />
        </div>
      </div>

      <main className="dg-main">
        <Reveal as="header" className="dg-hero">
          <p className="cn-eyebrow dg-hero__eyebrow">
            <span className="cn-eyebrow__dot" aria-hidden />
            EMAIL · QUOTIDIEN · 8H
          </p>
          <h1 className="cn-h1 dg-hero__title">
            <span className="cn-h1__ice">Le marché bouge.</span> Toi aussi.
          </h1>
          <p className="cn-body dg-hero__sub">
            Chaque matin à 8h, un email court avec l&apos;enchère qui finit bientôt,
            les 2 hottest deals du moment, et le joueur dont le score vient d&apos;être réévalué.
            Pas de spam. Pas de bullshit. Un click → action.
          </p>
        </Reveal>

        <Reveal index={1}>
          <form onSubmit={handleSubmit} className="dg-form">
            <label htmlFor="dg-email" className="cn-label dg-form__label">
              TON EMAIL
            </label>
            <div className="dg-form__row">
              <input
                id="dg-email"
                type="email"
                inputMode="email"
                className="dg-form__input"
                placeholder="toi@exemple.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                aria-label="Adresse email pour le digest quotidien"
              />
              <button
                type="submit"
                className="dg-form__btn"
                disabled={state.loading || !email.trim()}
              >
                {state.loading ? "ENVOI…" : "M'ABONNER →"}
              </button>
            </div>
            {state.error ? (
              <p className="dg-form__error" role="alert">⨯ {state.error}</p>
            ) : null}
            {state.success ? (
              <p className="dg-form__success" role="status">
                ✓ Inscription confirmée. Premier digest demain matin à 8h.
              </p>
            ) : null}
          </form>
        </Reveal>

        <Reveal index={2}>
          <section className="dg-perks">
            <div className="dg-perk">
              <p className="dg-perk__eyebrow">QUOI</p>
              <p className="dg-perk__text">
                3 cartes à regarder ce matin : la meilleure enchère, 2 deals chauds, le joueur du jour.
              </p>
            </div>
            <div className="dg-perk">
              <p className="dg-perk__eyebrow">QUAND</p>
              <p className="dg-perk__text">
                Chaque matin à 8h. Pas d&apos;email tard, pas d&apos;envois multiples.
              </p>
            </div>
            <div className="dg-perk">
              <p className="dg-perk__eyebrow">CONTRÔLE</p>
              <p className="dg-perk__text">
                Un lien de désabonnement dans chaque email. Un click et c&apos;est terminé.
              </p>
            </div>
          </section>
        </Reveal>
      </main>
    </div>
  );
}
