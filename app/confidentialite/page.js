import "../cinematic.css";
import "../a-propos/a-propos.css";
import "../legal.css";

import Link from "next/link";

import AppNav from "../AppNav";
import Atmosphere from "../components/Atmosphere";
import { CONTACT_EMAIL, LEGAL_LAST_UPDATED, LEGAL_LOCATION } from "@/lib/legal";

export const metadata = {
  title: "Politique de confidentialité",
  description:
    "Quels renseignements Card Metrics collecte, pourquoi, avec qui ils sont partagés, combien de temps on les garde et comment exercer tes droits.",
};

function Block({ title, children }) {
  return (
    <section className="ap-block">
      <h2 className="cn-h2 ap-block__title">{title}</h2>
      {children}
    </section>
  );
}

export default function ConfidentialitePage() {
  const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;
  return (
    <div className="ap-page cinematic">
      <Atmosphere />
      <div className="ap-rail">
        <div className="ap-rail__inner">
          <AppNav active={null} />
        </div>
      </div>

      <main className="ap-main legal">
        <header className="ap-hero">
          <p className="cn-eyebrow ap-hero__eyebrow">
            <span className="cn-eyebrow__dot" aria-hidden />
            LÉGAL · CONFIDENTIALITÉ
          </p>
          <h1 className="cn-h1 ap-hero__title">
            Politique de <span className="cn-h1__ice">confidentialité</span>
          </h1>
          <p className="legal__updated">Dernière mise à jour : {LEGAL_LAST_UPDATED}</p>
        </header>

        <Block title="En bref">
          <ul className="legal__list">
            <li>Tu peux utiliser Card Metrics sans compte : on ne te demande alors aucun renseignement personnel.</li>
            <li>Si tu crées un compte ou t&apos;abonnes à un courriel, on garde seulement ce qu&apos;il faut pour que ça fonctionne.</li>
            <li>On ne vend pas tes renseignements et on ne fait pas de publicité ciblée.</li>
            <li>Tu peux télécharger ou supprimer toutes tes données à tout moment dans <Link href="/parametres">Paramètres</Link>.</li>
          </ul>
        </Block>

        <Block title="Qui est responsable">
          <p className="ap-block__text">
            Card Metrics est un projet indépendant exploité depuis {LEGAL_LOCATION}. La personne
            responsable de la protection des renseignements personnels est le fondateur de Card Metrics.
            Pour toute question ou demande : {mail}.
          </p>
        </Block>

        <Block title="Ce qu'on collecte">
          <ul className="legal__list">
            <li>
              <strong>Compte</strong> (si tu te connectes avec Google) : ton adresse courriel, ton nom et ta
              photo de profil Google, ainsi que la date de création du compte.
            </li>
            <li>
              <strong>Ce que tu entres</strong> : les cartes de ton Vault (prix et date d&apos;achat, notes),
              ta watchlist, tes alertes de prix et tes préférences.
            </li>
            <li>
              <strong>Courriels</strong> : l&apos;adresse que tu donnes pour le digest quotidien ou les picks
              hebdo, et l&apos;historique des courriels envoyés (bienvenue, alertes).
            </li>
            <li>
              <strong>Statistiques de visite</strong> : la page consultée, la page d&apos;où tu arrives et le
              type de navigateur. Nos statistiques n&apos;enregistrent pas ton adresse IP, et il n&apos;y a
              ni témoin publicitaire ni outil d&apos;analyse tiers.
            </li>
            <li>
              <strong>Clics vers eBay</strong> : l&apos;annonce cliquée et son prix, pour mesurer quels deals
              intéressent (liés à ton compte si tu es connecté).
            </li>
            <li>
              <strong>Témoins (cookies) et stockage du navigateur</strong> : uniquement ceux nécessaires à ta
              connexion et à tes réglages (devise, recherches récentes).
            </li>
          </ul>
        </Block>

        <Block title="Pourquoi">
          <p className="ap-block__text">
            Pour faire fonctionner ton compte et tes outils (Vault, watchlist, alertes), t&apos;envoyer les
            courriels que tu as demandés, protéger le service contre les abus et comprendre quelles pages
            sont utiles afin d&apos;améliorer le produit. Aucune décision te concernant n&apos;est prise de façon
            automatisée à partir de tes renseignements personnels : le Card Metrics Score porte sur des
            joueurs et des cartes, pas sur toi.
          </p>
        </Block>

        <Block title="Avec qui c'est partagé">
          <p className="ap-block__text">
            Seulement avec les fournisseurs qui font tourner le service, pour ce seul usage :
          </p>
          <ul className="legal__list">
            <li><strong>Supabase</strong> : base de données et connexion au compte.</li>
            <li><strong>Vercel</strong> : hébergement du site.</li>
            <li><strong>Resend</strong> : envoi des courriels.</li>
            <li><strong>Google</strong> : connexion « Continuer avec Google ».</li>
          </ul>
          <p className="ap-block__text">
            Ces fournisseurs peuvent héberger les données à l&apos;extérieur du Québec, notamment aux
            États-Unis. L&apos;IA qui rédige les analyses (DeepSeek) ne reçoit que des données de joueurs et
            d&apos;annonces eBay, jamais tes renseignements personnels. Quand tu cliques sur un lien eBay, eBay
            sait que tu viens de Card Metrics (programme d&apos;affiliation eBay Partner Network) ; ce
            qu&apos;eBay fait ensuite relève de sa propre politique.
          </p>
        </Block>

        <Block title="Combien de temps on les garde">
          <p className="ap-block__text">
            Tant que ton compte existe. Si tu le supprimes, tes données de compte, ton Vault, ta watchlist,
            tes alertes, tes notifications et ton abonnement aux courriels sont effacés ; tes clics vers
            eBay restent dans les statistiques mais sans lien avec toi. Un désabonnement d&apos;un courriel
            prend effet immédiatement.
          </p>
        </Block>

        <Block title="Tes droits">
          <p className="ap-block__text">
            Tu peux consulter, corriger ou supprimer tes renseignements, retirer ton consentement ou
            demander comment ils sont utilisés. Le plus simple : dans <Link href="/parametres">Paramètres</Link>,
            « Télécharger mes données » ou « Supprimer mon compte ». Pour toute autre demande, écris à{" "}
            {mail} : on répond dans un délai de 30 jours. Si tu n&apos;es pas satisfait de la réponse, tu peux
            t&apos;adresser à la Commission d&apos;accès à l&apos;information du Québec.
          </p>
        </Block>

        <Block title="Incidents de sécurité">
          <p className="ap-block__text">
            Si un incident de confidentialité présente un risque de préjudice sérieux, on te prévient, ainsi
            que la Commission d&apos;accès à l&apos;information, comme la loi l&apos;exige.
          </p>
        </Block>

        <Block title="Changements">
          <p className="ap-block__text">
            Si cette politique change de façon importante, la date en haut de la page est mise à jour et les
            personnes qui ont un compte sont prévenues par courriel.
          </p>
        </Block>

        <div className="ap-cta">
          <Link href="/conditions" className="cn-btn cn-btn--ghost">
            Conditions d&apos;utilisation →
          </Link>
        </div>
      </main>
    </div>
  );
}
