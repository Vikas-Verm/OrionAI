// MOVE exportChatPDF method from App.vue methods

import html2pdf from "html2pdf.js";

export async function exportChatPDF(messages, sessionTitle) {
  const content = document.createElement("div");
  content.style.cssText =
    "font-family:-apple-system,sans-serif;padding:40px;color:#1a1a1a;max-width:800px;";
  content.innerHTML = `
    <div style="border-bottom:2px solid #6366f1;padding-bottom:16px;margin-bottom:24px;">
      <h1 style="margin:0;font-size:20px;">🔭 OrionAI</h1>
      <p style="margin:4px 0 0;color:#666;font-size:13px;">
        ${sessionTitle} · Exported ${new Date().toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}
      </p>
    </div>
    ${messages
      .map(
        (m) => `
      <div style="margin-bottom:20px;">
        <div style="font-size:11px;font-weight:600;color:${
          m.role === "user" ? "#6366f1" : "#666"
        };text-transform:uppercase;margin-bottom:6px;">
          ${m.role === "user" ? "👤 You" : "🔭 OrionAI"}
        </div>
        <div style="background:${
          m.role === "user" ? "#f0f4ff" : "#f8f8f8"
        };border-radius:8px;padding:12px 16px;font-size:13px;line-height:1.7;white-space:pre-wrap;">
          ${m.content.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
        </div>
      </div>`
      )
      .join("")}`;

  await html2pdf()
    .set({
      margin: [10, 10],
      filename: `${sessionTitle.replace(/[^a-z0-9]/gi, "_")}_${Date.now()}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    })
    .from(content)
    .save();
}
