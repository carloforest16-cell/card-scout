import Link from "next/link";

export default async function SearchPage({ searchParams }) {
  const params = await searchParams;
  const q = typeof params?.q === "string" ? params.q.trim() : "";

  return (
    <main className="search-page">
      <div className="search-page__inner">
        <p className="search-page__eyebrow">Card Metrics</p>
        <h1 className="search-page__title">Résultats</h1>
        {q ? (
          <p className="search-page__query">
            Recherche pour : <strong>{q}</strong>
          </p>
        ) : (
          <p className="search-page__empty">
            Aucun terme de recherche. Entre un nom de joueur sur l’accueil.
          </p>
        )}
        <Link className="search-page__back" href="/">
          ← Retour à l’accueil
        </Link>
      </div>
    </main>
  );
}
