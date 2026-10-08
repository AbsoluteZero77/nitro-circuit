import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/rajdhani/500.css";
import "@fontsource/rajdhani/600.css";
import "@fontsource/rajdhani/700.css";
import "@fontsource/share-tech-mono/400.css";
import "./styles.css";
import { NitroCircuit } from "./components/nitro-circuit";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <NitroCircuit />
  </StrictMode>,
);
