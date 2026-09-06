import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./app.js";
import { applyNativeChrome } from "./lib/native.js";
import "./styles.css";

void applyNativeChrome();

const container = document.getElementById("root");
if (!container) throw new Error("Élément racine introuvable");

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
