import { computed, ref } from "vue";
import { store, setModuleContext } from "../stores/app";
import { googleDocsAPI } from "../services/api";

function htmlToPlainText(html = "") {
  if (typeof window === "undefined") return String(html || "");
  const parser = new DOMParser();
  const doc = parser.parseFromString(html || "", "text/html");
  return doc.body?.textContent?.replace(/\s+/g, " ").trim() || "";
}

function downloadBlob(blob, filename) {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

function extensionForFormat(format) {
  return {
    pdf: "pdf",
    docx: "docx",
    markdown: "md",
    txt: "txt",
  }[format] || format;
}

export function useGoogleDocs() {
  const documents = ref([]);
  const loading = ref(false);
  const documentLoading = ref(false);
  const currentDocument = ref(null);
  const documentTitle = ref("");
  const editorHtml = ref("");
  const outline = ref([]);
  const saveState = ref("idle");
  const saveError = ref("");
  const aiLoading = ref(false);
  const exportLoading = ref(false);
  const selectionText = ref("");
  const currentSectionText = ref("");
  const zoom = ref(100);

  let saveTimer = null;
  let hydrating = false;

  const plainText = computed(() => htmlToPlainText(editorHtml.value));
  const wordCount = computed(() => {
    if (!plainText.value) return 0;
    return plainText.value.split(/\s+/).filter(Boolean).length;
  });
  const characterCount = computed(() => plainText.value.length);
  const saveLabel = computed(() => {
    if (saveState.value === "saving") return "Saving...";
    if (saveState.value === "saved") return "Saved";
    if (saveState.value === "error") return "Save failed";
    if (saveState.value === "dirty") return "Unsaved changes";
    return "Ready";
  });

  function clearSaveTimer() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
  }

  async function loadDocuments(limit = 16) {
    loading.value = true;
    try {
      const { data } = await googleDocsAPI.list(limit);
      documents.value = data.documents || [];
      return documents.value;
    } finally {
      loading.value = false;
    }
  }

  function applyWorkspace(workspace) {
    hydrating = true;
    currentDocument.value = workspace;
    documentTitle.value = workspace?.title || "Untitled document";
    editorHtml.value = workspace?.content || "<p><br /></p>";
    outline.value = Array.isArray(workspace?.outline) ? workspace.outline : [];
    saveState.value = "saved";
    saveError.value = "";
    requestAnimationFrame(() => {
      hydrating = false;
    });
  }

  async function openDocument(documentId) {
    if (!documentId) return null;

    documentLoading.value = true;
    saveError.value = "";
    try {
      const { data } = await googleDocsAPI.get(documentId);
      applyWorkspace(data);
      if (
        store.moduleContext?.module !== "google_docs" ||
        store.moduleContext?.documentId !== (data.documentId || documentId)
      ) {
        setModuleContext({
          ...(store.moduleContext || {}),
          module: "google_docs",
          documentId: data.documentId || documentId,
        });
      }
      return data;
    } finally {
      documentLoading.value = false;
    }
  }

  async function createDocument(title = "Untitled document") {
    documentLoading.value = true;
    saveError.value = "";
    try {
      const { data } = await googleDocsAPI.create({ title });
      applyWorkspace(data);

      const summary = {
        documentId: data.documentId,
        title: data.title,
        modifiedTime: data.lastSyncedAt,
        webViewUrl: data.webViewUrl,
        iconUrl: data.iconUrl,
        permissions: data.permissions || null,
      };

      documents.value = [
        summary,
        ...documents.value.filter((doc) => doc.documentId !== data.documentId),
      ];

      setModuleContext({
        ...(store.moduleContext || {}),
        module: "google_docs",
        documentId: data.documentId,
      });
      return data;
    } finally {
      documentLoading.value = false;
    }
  }

  async function loadInitialDocument() {
    const context =
      store.moduleContext?.module === "google_docs" ? store.moduleContext : null;
    const targetId = context?.documentId || null;
    const list = await loadDocuments();

    if (targetId) {
      return openDocument(targetId);
    }

    if (list.length) {
      return openDocument(list[0].documentId);
    }

    currentDocument.value = null;
    documentTitle.value = "";
    editorHtml.value = "";
    outline.value = [];
    saveState.value = "idle";
    return null;
  }

  function updateEditorHtml(nextHtml) {
    editorHtml.value = nextHtml;
    if (!hydrating && currentDocument.value) {
      saveState.value = "dirty";
      scheduleSave();
    }
  }

  function updateTitle(nextTitle) {
    documentTitle.value = nextTitle;
    if (!hydrating && currentDocument.value) {
      saveState.value = "dirty";
      scheduleSave();
    }
  }

  function updateOutline(nextOutline) {
    outline.value = Array.isArray(nextOutline) ? nextOutline : [];
  }

  function updateSelectionContext(payload = {}) {
    selectionText.value = payload.selectionText || "";
    currentSectionText.value = payload.currentSectionText || "";
  }

  async function saveDocumentNow() {
    if (!currentDocument.value) return null;

    clearSaveTimer();
    saveState.value = "saving";
    saveError.value = "";

    try {
      const payload = {
        content: editorHtml.value,
      };
      if (currentDocument.value?.permissions?.canRename !== false) {
        payload.title = documentTitle.value;
      }
      const { data } = await googleDocsAPI.update(
        currentDocument.value.documentId,
        payload
      );

      currentDocument.value = {
        ...currentDocument.value,
        ...data,
        title: data.title || documentTitle.value,
      };

      const listIndex = documents.value.findIndex(
        (doc) => doc.documentId === currentDocument.value.documentId
      );
      if (listIndex !== -1) {
        documents.value[listIndex] = {
          ...documents.value[listIndex],
          title: currentDocument.value.title,
          modifiedTime: currentDocument.value.lastSyncedAt,
          permissions: data.permissions || documents.value[listIndex].permissions || null,
        };
      }

      saveState.value = "saved";
      return data;
    } catch (error) {
      saveState.value = "error";
      saveError.value =
        error.response?.data?.error || error.message || "Failed to save";
      throw error;
    }
  }

  async function renameDocument(documentId, title) {
    const nextTitle = String(title || "").trim();
    if (!documentId || !nextTitle) return null;

    const { data } = await googleDocsAPI.update(documentId, { title: nextTitle });
    const listIndex = documents.value.findIndex((doc) => doc.documentId === documentId);

    if (listIndex !== -1) {
      documents.value[listIndex] = {
        ...documents.value[listIndex],
        title: data.title || nextTitle,
        modifiedTime: data.lastSyncedAt || documents.value[listIndex].modifiedTime,
        permissions: data.permissions || documents.value[listIndex].permissions || null,
      };
    }

    if (currentDocument.value?.documentId === documentId) {
      currentDocument.value = {
        ...currentDocument.value,
        ...data,
        title: data.title || nextTitle,
      };
      documentTitle.value = data.title || nextTitle;
      saveState.value = "saved";
      saveError.value = "";
    }

    return data;
  }

  async function deleteDocument(documentId) {
    if (!documentId) return null;
    const { data } = await googleDocsAPI.delete(documentId);
    const nextDocuments = documents.value.filter((doc) => doc.documentId !== documentId);
    documents.value = nextDocuments;

    if (currentDocument.value?.documentId === documentId) {
      currentDocument.value = null;
      documentTitle.value = "";
      editorHtml.value = "";
      outline.value = [];
      saveState.value = "idle";
      saveError.value = "";

      if (nextDocuments.length) {
        await openDocument(nextDocuments[0].documentId);
      } else {
        setModuleContext({
          ...(store.moduleContext || {}),
          module: "google_docs",
          documentId: "",
        });
      }
    }

    return data;
  }

  function scheduleSave() {
    clearSaveTimer();
    saveTimer = setTimeout(() => {
      saveDocumentNow().catch(() => {});
    }, 900);
  }

  async function refreshCurrentDocument() {
    if (!currentDocument.value?.documentId) return null;
    return openDocument(currentDocument.value.documentId);
  }

  async function runAiAction({ action, question = "", ...extra } = {}) {
    if (!currentDocument.value?.documentId) return null;

    aiLoading.value = true;
    try {
      const { data } = await googleDocsAPI.ai(currentDocument.value.documentId, {
        action,
        question,
        scope: "google_docs",
        selectionText: selectionText.value,
        currentSectionText: currentSectionText.value,
        documentText: plainText.value,
        documentOutline: outline.value,
        ...extra,
      });
      return data;
    } finally {
      aiLoading.value = false;
    }
  }

  async function shareCurrentDocument(payload = {}) {
    if (!currentDocument.value?.documentId) return null;
    const { data } = await googleDocsAPI.share(currentDocument.value.documentId, payload);
    return data;
  }

  async function exportCurrentDocument(format = "pdf") {
    if (!currentDocument.value?.documentId) return;

    exportLoading.value = true;
    try {
      const response = await googleDocsAPI.export(currentDocument.value.documentId, {
        format,
      });
      const filename = `${
        (documentTitle.value || "orion-document").replace(/[\\/:*?"<>|]+/g, "-")
      }.${extensionForFormat(format)}`;
      downloadBlob(response.data, filename);
    } finally {
      exportLoading.value = false;
    }
  }

  function setZoom(nextZoom) {
    zoom.value = Math.min(140, Math.max(70, Number(nextZoom) || 100));
  }

  function openDocumentInGoogle() {
    if (!currentDocument.value?.documentId || typeof window === "undefined") return;
    const href =
      currentDocument.value.webViewUrl ||
      `https://docs.google.com/document/d/${currentDocument.value.documentId}/edit`;
    window.open(href, "_blank", "noopener,noreferrer");
  }

  return {
    documents,
    loading,
    documentLoading,
    currentDocument,
    documentTitle,
    editorHtml,
    outline,
    plainText,
    wordCount,
    characterCount,
    saveState,
    saveLabel,
    saveError,
    aiLoading,
    exportLoading,
    zoom,
    selectionText,
    currentSectionText,
    loadDocuments,
    loadInitialDocument,
    openDocument,
    createDocument,
    updateEditorHtml,
    updateTitle,
    updateOutline,
    updateSelectionContext,
    renameDocument,
    deleteDocument,
    saveDocumentNow,
    refreshCurrentDocument,
    runAiAction,
    shareCurrentDocument,
    exportCurrentDocument,
    setZoom,
    openDocumentInGoogle,
  };
}
