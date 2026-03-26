import { createApp } from "vue";
import * as Sentry from "@sentry/vue";
import "./composables/useTheme";
import App from "./App.vue";
import "./styles/main.css";
import "highlight.js/styles/github-dark.css";
import "./pwa";

const app = createApp(App);

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    app,
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE || 0.1),
  });
}

app.mount("#app");
