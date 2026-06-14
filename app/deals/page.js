import { Suspense } from "react";
import "../cinematic.css";
import "./deals.css";

import DealFinderClient from "./DealFinderClient";

export default function DealsPage() {
  return (
    <Suspense>
      <DealFinderClient />
    </Suspense>
  );
}
