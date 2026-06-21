import "../cinematic.css";
import "./digest.css";

import DigestClient from "./DigestClient";

export const metadata = {
  title: "Digest quotidien — Card Metrics",
  description: "Chaque matin à 8h : la meilleure enchère du jour, les 2 hottest deals, et le top score réévalué. Email court, 1 click → action.",
};

export default function DigestPage() {
  return <DigestClient />;
}
