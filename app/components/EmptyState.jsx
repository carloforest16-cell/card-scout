// État vide réutilisable (tâche 6.5) — icône + titre + explication de la
// valeur + une action concrète. Reprend les tokens visuels de l'état vide du
// Vault (app/portfolio/PortfolioClient.js), déjà le plus abouti du site.
export default function EmptyState({ icon, title, description, action, className = "" }) {
  return (
    <div className={`es-empty ${className}`.trim()}>
      {icon && (
        <div className="es-empty__icon" aria-hidden>
          {icon}
        </div>
      )}
      {title && <h2 className="es-empty__title">{title}</h2>}
      {description && <p className="es-empty__sub">{description}</p>}
      {action && <div className="es-empty__action">{action}</div>}
    </div>
  );
}
