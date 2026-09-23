import "../cinematic.css";
import "./pulse.css";
import PulseClient from "./PulseClient";

export const metadata = { title: "Pulse du marché" };

export default function PulsePage() {
  return <PulseClient />;
}
