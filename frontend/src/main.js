import { createApp } from "vue";
import "./composables/useTheme";
import App from "./App.vue";
import "./styles/main.css";
import "highlight.js/styles/github-dark.css";

createApp(App).mount("#app");
