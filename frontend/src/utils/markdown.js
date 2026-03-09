// MOVE THIS from App.vue <script> top section

import { marked } from "marked";
import hljs from "highlight.js";
import "highlight.js/styles/github-dark.css";

marked.setOptions({
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value;
    return hljs.highlightAuto(code).value;
  },
  breaks: true,
  gfm: true,
});

export function renderMarkdown(content) {
  if (!content) return "";
  const html = marked.parse(content);
  return html.replace(/<pre><code class="(.*?)">([\s\S]*?)<\/code><\/pre>/g, (_, lang, code) => {
    const language = lang.replace("language-", "") || "code";
    return `<div class="code-block">
        <div class="code-header">
          <span class="code-lang">${language}</span>
          <button class="copy-btn" onclick="copyCode(this)">Copy</button>
        </div>
        <pre><code class="${lang}">${code}</code></pre>
      </div>`;
  });
}
