import { store } from "../stores/app";
import { filesAPI } from "../services/api";

export function useFiles() {
  async function handleFileSelect(file, type) {
    if (!file) return;
    const chipId = Date.now();
    store.attachments.push({ id: chipId, name: file.name, type, status: "uploading" });

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("sessionId", store.currentSessionId);

      const res = type === "pdf" ? await filesAPI.uploadPDF(fd) : await filesAPI.uploadCSV(fd);

      const chip = store.attachments.find((a) => a.id === chipId);
      if (chip) {
        chip.status = "ready";
        chip.fileId = res.data.fileId;
        chip.totalChunks = res.data.totalChunks;
      }
    } catch {
      store.attachments = store.attachments.filter((a) => a.id !== chipId);
    }
  }

  async function removeAttachment(index) {
    const chip = store.attachments[index];
    if (chip?.fileId) {
      await filesAPI.delete(chip.fileId, store.currentSessionId);
    }
    store.attachments.splice(index, 1);
  }

  function connectDatabase() {
    store.mode = "db";
    if (!store.attachments.find((a) => a.type === "db")) {
      store.attachments.push({
        id: Date.now(),
        name: "MongoDB",
        type: "db",
        status: "ready",
      });
    }
  }

  return { handleFileSelect, removeAttachment, connectDatabase };
}
