<template>
  <div v-if="docsSteps.length" class="gdocs-root">

    <div v-for="(step, idx) in docsSteps" :key="idx" class="gdocs-section">

      <!-- ── Header ───────────────────────────────────────────────────── -->
      <div class="gdocs-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" class="gdocs-header-icon">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke="#4285F4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <polyline points="14,2 14,8 20,8" stroke="#4285F4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <line x1="8" y1="13" x2="16" y2="13" stroke="#4285F4" stroke-width="2" stroke-linecap="round"/>
          <line x1="8" y1="17" x2="13" y2="17" stroke="#4285F4" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <span class="gdocs-header-title">{{ headerTitle(step) }}</span>
        <span v-if="docsList(step)?.length" class="gdocs-count-badge">
          {{ docsList(step).length }}
        </span>
      </div>

      <!-- ── Document list (list / search) ────────────────────────────── -->
      <div v-if="docsList(step)?.length" class="gdocs-cards">
        <div
          v-for="doc in docsList(step)"
          :key="doc.id"
          class="gdocs-card"
          @click="openInOrion(doc.id)"
        >
          <div class="gdocs-card-icon">📄</div>
          <div class="gdocs-card-body">
            <div class="gdocs-card-title">{{ doc.title }}</div>
            <div class="gdocs-card-meta">
              <span v-if="doc.ownerName">{{ doc.ownerName }}</span>
              <span v-if="doc.modifiedTime" class="gdocs-card-date">
                {{ formatDate(doc.modifiedTime) }}
              </span>
            </div>
          </div>
          <button class="gdocs-view-btn" @click.stop="openInOrion(doc.id)">
            View
          </button>
        </div>
      </div>

      <!-- ── Single doc view (get) ────────────────────────────────────── -->
      <div v-else-if="step.richGoogleDoc" class="gdocs-single">
        <div class="gdocs-single-title">{{ step.richGoogleDoc.title }}</div>
        <div v-if="step.richGoogleDoc.plainText" class="gdocs-single-preview">
          {{ truncate(step.richGoogleDoc.plainText, 500) }}
        </div>
        <button
          class="gdocs-open-btn"
          @click="openInOrion(step.richGoogleDoc.id)"
        >
          Open in Google Docs
        </button>
      </div>

      <!-- ── Share result ─────────────────────────────────────────────── -->
      <div v-else-if="step.richGoogleDocShare" class="gdocs-share-result">
        <div class="gdocs-share-title">{{ step.richGoogleDocShare.title }}</div>
        <div class="gdocs-share-list">
          <span
            v-for="s in step.richGoogleDocShare.sharedWith"
            :key="s.email"
            class="gdocs-share-chip"
          >
            {{ s.email }} ({{ s.role }})
          </span>
        </div>
      </div>

      <!-- ── Fallback summary ─────────────────────────────────────────── -->
      <div v-else-if="step.summary" class="gdocs-fallback">
        {{ step.summary }}
      </div>

    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  steps: Array,
  msg: Object,
})

const docsSteps = computed(() =>
  props.steps.filter(s => s.tool?.startsWith('google_docs_'))
)

function docsList(step) {
  return step.richGoogleDocs || step.result?.richGoogleDocs || null
}

function headerTitle(step) {
  const map = {
    google_docs_list: 'Recent Documents',
    google_docs_search: 'Search Results',
    google_docs_get: 'Document',
    google_docs_create: 'New Document',
    google_docs_update: 'Updated Document',
    google_docs_share: 'Shared Document',
    google_docs_delete: 'Deleted Document',
  }
  return map[step.tool] || 'Google Docs'
}

function openInOrion(documentId) {
  if (!documentId) return
  document.dispatchEvent(new CustomEvent('orion:open-module', {
    bubbles: true,
    detail: { module: 'google_docs', context: { documentId } },
  }))
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function truncate(text, max) {
  if (!text) return ''
  return text.length > max ? text.slice(0, max) + '…' : text
}
</script>

<style scoped>
.gdocs-root {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.gdocs-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.gdocs-header-icon {
  flex-shrink: 0;
}

.gdocs-header-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary, #e2e2f0);
}

.gdocs-count-badge {
  background: #4285f4;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 10px;
}

/* ── Card list ───────────────────────────────────────────────────────── */
.gdocs-cards {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.gdocs-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  cursor: pointer;
  transition: background 0.15s;
}

.gdocs-card:hover {
  background: rgba(255, 255, 255, 0.1);
}

.gdocs-card-icon {
  font-size: 20px;
  flex-shrink: 0;
}

.gdocs-card-body {
  flex: 1;
  min-width: 0;
}

.gdocs-card-title {
  font-weight: 500;
  font-size: 13px;
  color: var(--text-primary, #e2e2f0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gdocs-card-meta {
  display: flex;
  gap: 8px;
  font-size: 11px;
  color: var(--text-muted, #8e8ea0);
  margin-top: 2px;
}

.gdocs-view-btn {
  font-size: 11px;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 6px;
  border: none;
  background: rgba(66, 133, 244, 0.15);
  color: #6ab0ff;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s;
}

.gdocs-view-btn:hover {
  background: rgba(66, 133, 244, 0.3);
}

/* ── Single doc ──────────────────────────────────────────────────────── */
.gdocs-single {
  padding: 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
}

.gdocs-single-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary, #e2e2f0);
  margin-bottom: 8px;
}

.gdocs-single-preview {
  font-size: 12px;
  color: var(--text-muted, #8e8ea0);
  line-height: 1.5;
  white-space: pre-wrap;
  max-height: 200px;
  overflow-y: auto;
  margin-bottom: 10px;
}

.gdocs-open-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 8px;
  border: none;
  background: rgba(66, 133, 244, 0.15);
  color: #6ab0ff;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

.gdocs-open-btn:hover {
  background: rgba(66, 133, 244, 0.3);
}

/* ── Share result ────────────────────────────────────────────────────── */
.gdocs-share-result {
  padding: 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
}

.gdocs-share-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary, #e2e2f0);
  margin-bottom: 8px;
}

.gdocs-share-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.gdocs-share-chip {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 12px;
  background: rgba(66, 133, 244, 0.12);
  color: #6ab0ff;
}

/* ── Fallback ────────────────────────────────────────────────────────── */
.gdocs-fallback {
  font-size: 13px;
  color: var(--text-primary, #e2e2f0);
  padding: 8px 0;
}
</style>
