import { ref } from "vue";

const STORAGE_KEY = "orionai-theme";
const theme = ref(localStorage.getItem(STORAGE_KEY) || "dark");

function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem(STORAGE_KEY, t);
  theme.value = t;
}

// Apply on load
applyTheme(theme.value);

export function useTheme() {
  function setTheme(t) {
    applyTheme(t);
  }

  return { theme, setTheme };
}
