import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/app/App";
import { bootstrapDemoRecording } from "@/shared/demo/demoRecordingBootstrap";
import { ensureStoresHydrated } from "@/shared/store/ensureStoresHydrated";
import "./index.css";

async function bootstrap() {
  bootstrapDemoRecording();
  await ensureStoresHydrated();

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void bootstrap();
