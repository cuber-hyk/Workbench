import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { AppUpdateProvider } from "./contexts/AppUpdateContext";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppUpdateProvider>
      <App />
    </AppUpdateProvider>
  </React.StrictMode>
);
