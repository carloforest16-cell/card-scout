"use client";

import { useState } from "react";

import Reveal from "../components/Reveal";
import { createClient } from "@/lib/supabase/client";

function Section({ eyebrow, title, children }) {
  return (
    <section className="prefs-section">
      <header className="prefs-section__head">
        <p className="cn-eyebrow"><span className="cn-eyebrow__dot" />{eyebrow}</p>
        <h2 className="prefs-section__title">{title}</h2>
      </header>
      <div className="prefs-section__body">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }) {
  return (
    <div className="prefs-row">
      <div className="prefs-row__text">
        <span className="prefs-row__label">{label}</span>
        {hint && <span className="prefs-row__hint">{hint}</span>}
      </div>
      <div className="prefs-row__control">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      className={`prefs-toggle ${checked ? "prefs-toggle--on" : ""}`}
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      aria-label={label}
    >
      <span className="prefs-toggle__knob" />
    </button>
  );
}

function Select({ value, options, onChange }) {
  return (
    <select className="prefs-select" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export default function ParametresClient({ email, createdAt, initialPreferences }) {
  const [prefs, setPrefs] = useState(initialPreferences);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  function update(patch) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    saveDebounced(next);
  }

  let saveTimer;
  function saveDebounced(next) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => save(next), 350);
  }

  async function save(next) {
    setSaving(true);
    try {
      const r = await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (r.ok) setSavedAt(new Date());
    } catch { /* */ } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  async function handleExport() {
    const r = await fetch("/api/account/export");
    if (!r.ok) return;
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `card-metrics-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const r = await fetch("/api/account/delete", { method: "DELETE" });
      if (r.ok) {
        window.location.href = "/?account=deleted";
      } else {
        setDeleting(false);
      }
    } catch {
      setDeleting(false);
    }
  }

  return (
    <>
      <Reveal as="header" className="prefs-hero">
        <p className="cn-eyebrow"><span className="cn-eyebrow__dot" />PARAMÈTRES</p>
        <h1 className="cn-h1 prefs-title">Préférences</h1>
        <p className="prefs-sub">
          Personnalise Card Metrics, gère tes notifications et tes données.
          {saving ? (
            <span className="prefs-sub__status"> · Enregistrement…</span>
          ) : savedAt ? (
            <span className="prefs-sub__status"> · Enregistré</span>
          ) : null}
        </p>
      </Reveal>

      <Reveal delay={0.1}>
        <Section eyebrow="COMPTE" title="Identité">
          <Row label="Email" hint="Adresse de connexion">
            <span className="prefs-readonly">{email}</span>
          </Row>
          {createdAt && (
            <Row label="Inscrit" hint="Date de création">
              <span className="prefs-readonly">
                {new Date(createdAt).toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" })}
              </span>
            </Row>
          )}
          <Row label="Session">
            <button type="button" className="prefs-btn prefs-btn--ghost" onClick={handleSignOut}>
              Se déconnecter
            </button>
          </Row>
        </Section>
      </Reveal>

      <Reveal delay={0.15}>
        <Section eyebrow="PRÉFÉRENCES" title="Marché">
          <Row label="Devise" hint="Affichage des prix">
            <Select
              value={prefs.currency}
              onChange={(v) => update({ currency: v })}
              options={[{ value: "CAD", label: "CAD ($)" }, { value: "USD", label: "USD ($)" }]}
            />
          </Row>
          <Row label="Marketplace eBay" hint="Source des annonces analysées">
            <Select
              value={prefs.marketplace}
              onChange={(v) => update({ marketplace: v })}
              options={[{ value: "EBAY_CA", label: "eBay Canada" }, { value: "EBAY_US", label: "eBay États-Unis" }]}
            />
          </Row>
          <Row label="Thème" hint="Apparence (à venir — sombre uniquement pour l'instant)">
            <Select
              value={prefs.theme}
              onChange={(v) => update({ theme: v })}
              options={[
                { value: "auto", label: "Automatique" },
                { value: "dark", label: "Sombre" },
                { value: "light", label: "Clair (bientôt)" },
              ]}
            />
          </Row>
          <Row label="Langue">
            <Select
              value={prefs.language}
              onChange={(v) => update({ language: v })}
              options={[{ value: "fr", label: "Français" }]}
            />
          </Row>
        </Section>
      </Reveal>

      <Reveal delay={0.2}>
        <Section eyebrow="NOTIFICATIONS" title="Emails">
          <Row label="Alertes prix" hint="Quand une carte passe sous ton seuil">
            <Toggle
              checked={prefs.notify_price_alerts}
              onChange={(v) => update({ notify_price_alerts: v })}
              label="Recevoir les alertes prix par email"
            />
          </Row>
          <Row label="Picks de la semaine" hint="Tous les lundis matin">
            <Toggle
              checked={prefs.notify_weekly_digest}
              onChange={(v) => update({ notify_weekly_digest: v })}
              label="Recevoir le résumé hebdo"
            />
          </Row>
          <Row label="Nouvelles opportunités" hint="Quand le Top 10 est rafraîchi">
            <Toggle
              checked={prefs.notify_opps}
              onChange={(v) => update({ notify_opps: v })}
              label="Recevoir les nouvelles opportunités"
            />
          </Row>
        </Section>
      </Reveal>

      <Reveal delay={0.25}>
        <Section eyebrow="DONNÉES" title="Tes informations">
          <Row label="Export complet" hint="Vault, watchlist, alertes au format JSON">
            <button type="button" className="prefs-btn" onClick={handleExport}>
              Télécharger mes données
            </button>
          </Row>
          <Row label="Supprimer mon compte" hint="Définitif · efface toutes tes données">
            {!confirmDelete ? (
              <button type="button" className="prefs-btn prefs-btn--danger" onClick={() => setConfirmDelete(true)}>
                Supprimer
              </button>
            ) : (
              <div className="prefs-confirm">
                <p>Es-tu sûr·e ? Cette action est irréversible.</p>
                <div className="prefs-confirm__actions">
                  <button type="button" className="prefs-btn prefs-btn--ghost" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                    Annuler
                  </button>
                  <button type="button" className="prefs-btn prefs-btn--danger" onClick={handleDelete} disabled={deleting}>
                    {deleting ? "Suppression…" : "Oui, supprimer"}
                  </button>
                </div>
              </div>
            )}
          </Row>
        </Section>
      </Reveal>
    </>
  );
}
