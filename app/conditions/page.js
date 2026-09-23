import "../cinematic.css";
import "../a-propos/a-propos.css";
import "../legal.css";

import Link from "next/link";

import AppNav from "../AppNav";
import Atmosphere from "../components/Atmosphere";
import { CONTACT_EMAIL, LEGAL_LAST_UPDATED, LEGAL_LOCATION } from "@/lib/legal";

export const metadata = {
  title: "Conditions d'utilisation",
  description:
    "Les règles d'utilisation de Card Metrics : service gratuit en bêta, information et non conseil financier, liens affiliés eBay, responsabilités.",
};

function Block({ title, children }) {
  return (
    <section className="ap-block">
      <h2 className="cn-h2 ap-block__title">{title}</h2>
      {children}
    </section>
  );
}

export default function ConditionsPage() {
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
            LÉGAL · CONDITIONS
          </p>
          <h1 className="cn-h1 ap-hero__title">
            Conditions <span className="cn-h1__ice">d&apos;utilisation</span>
          </h1>
          <p className="legal__updated">Dernière mise à jour : {LEGAL_LAST_UPDATED}</p>
        </header>

        <Block title="Le service">
          <p className="ap-block__text">
            Card Metrics est un outil gratuit d&apos;analyse du marché des cartes de hockey NHL, exploité
            depuis {LEGAL_LOCATION}. Il est en bêta : des fonctionnalités peuvent changer, être
            interrompues ou contenir des erreurs. En utilisant le site ou en créant un compte, tu acceptes
            ces conditions.
          </p>
        </Block>

        <Block title="De l'information, pas un conseil financier">
          <p className="ap-block__text">
            Le Card Metrics Score, les cotes, les verdicts (Acheter, Chercher mieux, Passer) et les analyses
            générées par l&apos;IA sont des indications calculées automatiquement à partir de données publiques.
            Ce ne sont ni des conseils financiers ni une garantie de prix ou de rendement. Le marché des
            cartes est volatil : chaque achat reste ta décision et ta responsabilité.
          </p>
        </Block>

        <Block title="Exactitude des données">
          <p className="ap-block__text">
            Les prix viennent d&apos;eBay et les statistiques de la LNH, via leurs services publics. Ils peuvent
            être incomplets, en retard ou erronés. Vérifie toujours l&apos;annonce sur eBay avant d&apos;acheter.
          </p>
        </Block>

        <Block title="Liens eBay et affiliation">
          <p className="ap-block__text">
            Les liens vers eBay peuvent être des liens affiliés (eBay Partner Network) : si tu achètes après
            un clic, Card Metrics peut recevoir une petite commission, sans frais pour toi. Card Metrics
            n&apos;achète ni ne vend de cartes et n&apos;est affilié ni à eBay, ni à la LNH, ni à l&apos;AJLNH.
            Les transactions se font uniquement entre toi et le vendeur, sur eBay, selon ses conditions.
          </p>
        </Block>

        <Block title="Ton compte">
          <p className="ap-block__text">
            Tu es responsable de ce qui se fait avec ton compte. Tu peux le supprimer à tout moment dans{" "}
            <Link href="/parametres">Paramètres</Link>. On peut suspendre un compte utilisé de façon abusive.
          </p>
        </Block>

        <Block title="Utilisation acceptable">
          <p className="ap-block__text">
            Pas d&apos;extraction automatisée massive du site, pas de tentative de contourner la sécurité ou de
            surcharger le service, pas d&apos;usage illégal.
          </p>
        </Block>

        <Block title="Responsabilité">
          <p className="ap-block__text">
            Le service est offert gratuitement, tel quel. Dans la mesure permise par la loi, Card Metrics
            n&apos;est pas responsable des pertes liées à un achat, à une vente ou à une décision prise à partir
            des informations du site.
          </p>
        </Block>

        <Block title="Droit applicable et changements">
          <p className="ap-block__text">
            Ces conditions sont régies par les lois du Québec et du Canada. Si elles changent, la date en
            haut de la page est mise à jour. Questions :{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </Block>

        <div className="ap-cta">
          <Link href="/confidentialite" className="cn-btn cn-btn--ghost">
            Politique de confidentialité →
          </Link>
        </div>
      </main>
    </div>
  );
}
