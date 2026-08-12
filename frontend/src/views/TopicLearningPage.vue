<template>
  <div class="tl-shell">
    <div class="tl-aurora tl-aurora--cyan" aria-hidden="true"></div>
    <div class="tl-aurora tl-aurora--violet" aria-hidden="true"></div>

    <div class="tl-content">
      <button class="tl-back" type="button" @click="$emit('back')">
        ← Back to Study Hub
      </button>

      <div v-if="loading" class="tl-skeleton">Loading topic…</div>

      <div v-else-if="!topic" class="tl-empty">
        <h2>Topic not found</h2>
        <p>This topic may have been removed or doesn’t belong to your goals.</p>
        <button class="tl-btn tl-btn--primary" type="button" @click="$emit('back')">
          Back to Study Hub
        </button>
      </div>

      <template v-else>
        <header class="tl-header">
          <div>
            <span class="tl-eyebrow">{{ goal?.title || 'Study Hub' }}</span>
            <h1>{{ topic.title }}</h1>
            <p class="tl-meta">
              <span v-if="topic.subject">{{ topic.subject }}</span>
              <span v-if="topic.category"> · {{ topic.category }}</span>
              <span v-if="topic.difficulty"> · {{ topic.difficulty }}</span>
              <span class="tl-dot">·</span>
              <span class="tl-status" :data-status="topic.status">{{ statusLabel(topic.status) }}</span>
              <span v-if="topic.nextRevisionAt">
                · Next revision {{ formatDate(topic.nextRevisionAt) }}
              </span>
            </p>
          </div>
          <div class="tl-header-actions">
            <button class="tl-btn tl-btn--ghost" type="button"
              :disabled="pendingAction || topic.status === 'weak'"
              @click="setStatus('weak')">
              Mark weak
            </button>
            <button class="tl-btn tl-btn--primary" type="button"
              :disabled="pendingAction || topic.status === 'completed'"
              @click="completeTopic">
              {{ topic.status === 'completed' ? 'Completed' : 'Mark completed' }}
            </button>
          </div>
        </header>

        <nav class="tl-tabs" role="tablist">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            class="tl-tab"
            :class="{ active: activeTab === tab.id }"
            role="tab"
            :aria-selected="activeTab === tab.id"
            type="button"
            @click="activeTab = tab.id"
          >
            {{ tab.label }}
            <span v-if="tab.count" class="tl-tab-count">{{ tab.count }}</span>
          </button>
        </nav>

        <!-- ── Learn tab ─────────────────────────────────────────── -->
        <section v-if="activeTab === 'learn'" class="tl-section">
          <header class="tl-section-head">
            <div>
              <h3>Learn</h3>
              <p>OrionAI-generated lesson, adapted to this topic.</p>
            </div>
            <button class="tl-btn tl-btn--ghost tl-btn--sm" type="button"
              :disabled="lessonLoading"
              @click="generateLesson">
              {{ lesson ? 'Regenerate lesson' : 'Generate OrionAI lesson' }}
            </button>
          </header>

          <div v-if="lessonLoading" class="tl-skeleton-block">
            OrionAI is drafting your lesson…
          </div>

          <div v-else-if="!lesson" class="tl-empty-block">
            <strong>No lesson generated yet.</strong>
            <p>
              Click <em>Generate OrionAI lesson</em> to get a beginner-friendly explanation
              tailored to this topic, your goal, and your level.
            </p>
          </div>

          <div v-else class="tl-lesson">
            <p class="tl-label">OrionAI-generated lesson</p>
            <h4 v-if="lesson.title">{{ lesson.title }}</h4>

            <article v-if="lesson.introduction" class="tl-lesson-block">
              <h5>Before you begin</h5>
              <p v-for="(para, i) in splitParagraphs(lesson.introduction)" :key="i">
                {{ para }}
              </p>
            </article>

            <article v-if="lesson.explanation" class="tl-lesson-block">
              <h5>Deep explanation</h5>
              <p v-for="(para, i) in splitParagraphs(lesson.explanation)" :key="i">
                {{ para }}
              </p>
            </article>

            <article v-if="lesson.whyItMatters" class="tl-lesson-block">
              <h5>Why this matters</h5>
              <p>{{ lesson.whyItMatters }}</p>
            </article>

            <article v-if="lesson.prerequisites?.length" class="tl-lesson-block">
              <h5>Prerequisites</h5>
              <ul>
                <li v-for="(item, i) in lesson.prerequisites" :key="i">{{ item }}</li>
              </ul>
            </article>

            <article v-if="lesson.keyPoints?.length" class="tl-lesson-block">
              <h5>Key ideas</h5>
              <ul>
                <li v-for="(item, i) in lesson.keyPoints" :key="i">{{ item }}</li>
              </ul>
            </article>

            <article v-if="lesson.examples?.length" class="tl-lesson-block">
              <h5>Examples</h5>
              <ul>
                <li v-for="(item, i) in lesson.examples" :key="i">{{ item }}</li>
              </ul>
            </article>

            <article v-if="lesson.commonMistakes?.length" class="tl-lesson-block">
              <h5>Common mistakes</h5>
              <ul>
                <li v-for="(item, i) in lesson.commonMistakes" :key="i">{{ item }}</li>
              </ul>
            </article>

            <article v-if="lesson.importantTerms?.length" class="tl-lesson-block">
              <h5>Important terms</h5>
              <dl class="tl-term-list">
                <template v-for="(term, i) in lesson.importantTerms" :key="i">
                  <dt>{{ term.term }}</dt>
                  <dd>{{ term.meaning }}</dd>
                </template>
              </dl>
            </article>

            <article v-if="lesson.practicalUseCases?.length" class="tl-lesson-block">
              <h5>Where this is used</h5>
              <ul>
                <li v-for="(item, i) in lesson.practicalUseCases" :key="i">{{ item }}</li>
              </ul>
            </article>

            <article v-if="lesson.practicalExercise" class="tl-lesson-block">
              <h5>Practice task</h5>
              <p v-for="(para, i) in splitParagraphs(lesson.practicalExercise)" :key="i">
                {{ para }}
              </p>
            </article>

            <article v-if="lesson.quickRecap" class="tl-lesson-block">
              <h5>Quick recap</h5>
              <p v-for="(para, i) in splitParagraphs(lesson.quickRecap)" :key="i">
                {{ para }}
              </p>
            </article>

            <article v-if="lesson.revisionNotes?.length" class="tl-lesson-block">
              <h5>Quick revision notes</h5>
              <ul>
                <li v-for="(item, i) in lesson.revisionNotes" :key="i">{{ item }}</li>
              </ul>
              <button class="tl-link tl-link--sm" type="button"
                :disabled="savingNoteFromLesson"
                @click="saveLessonRevisionToNotes">
                Save these to my notes
              </button>
            </article>
          </div>
        </section>

        <!-- ── Materials tab ─────────────────────────────────────── -->
        <section v-else-if="activeTab === 'materials'" class="tl-section">
          <header class="tl-section-head">
            <div>
              <h3>Materials</h3>
              <p>Attach your own notes, links, and documents to this topic.</p>
            </div>
            <button class="tl-btn tl-btn--ghost tl-btn--sm" type="button" @click="openMaterialForm">
              Add material
            </button>
          </header>

          <div v-if="materialForm.open" class="tl-card">
            <div class="tl-field-row">
              <label class="tl-field">
                <span>Type</span>
                <select v-model="materialForm.type">
                  <option value="upload">Upload file</option>
                  <option value="note">Note</option>
                  <option value="link">Link</option>
                  <option value="video">Video link</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label class="tl-field">
                <span>Title</span>
                <input v-model="materialForm.title" type="text" placeholder="What is this?" />
              </label>
            </div>
            <label v-if="materialForm.type === 'link' || materialForm.type === 'video'" class="tl-field">
              <span>URL</span>
              <input v-model="materialForm.url" type="url" placeholder="https://…" />
            </label>
            <label v-else-if="materialForm.type === 'upload'" class="tl-field">
              <span>File</span>
              <input type="file" accept=".pdf,.doc,.docx,.txt,.md,.markdown,.csv,.xlsx,.png,.jpg,.jpeg" @change="onMaterialFileChange" />
            </label>
            <label v-else class="tl-field">
              <span>Content</span>
              <textarea v-model="materialForm.contentText" rows="4"
                placeholder="Paste notes, summaries, or anything useful for this topic."></textarea>
            </label>
            <p v-if="materialForm.error" class="tl-form-error">{{ materialForm.error }}</p>
            <p v-if="materialForm.uploadProgress > 0 && materialForm.uploadProgress < 100" class="tl-muted">
              Uploading {{ materialForm.uploadProgress }}%
            </p>
            <div class="tl-form-actions">
              <button class="tl-btn tl-btn--ghost tl-btn--sm" type="button" @click="closeMaterialForm">
                Cancel
              </button>
              <button class="tl-btn tl-btn--primary tl-btn--sm" type="button"
                :disabled="materialForm.saving"
                @click="saveMaterial">
                {{ materialForm.saving ? 'Saving…' : 'Save material' }}
              </button>
            </div>
          </div>

          <div v-if="!materials.length && !materialForm.open" class="tl-empty-block">
            <strong>No materials added yet.</strong>
            <p>Add your notes, links, or documents to study this topic with your own sources.</p>
          </div>

          <ul v-if="materials.length" class="tl-list">
            <li v-for="m in materials" :key="m._id" class="tl-list-row">
              <div class="tl-list-row-main">
                <span class="tl-type-tag" :data-type="m.type">{{ m.type }}</span>
                <h4>{{ m.title }}</h4>
                <p v-if="m.url" class="tl-list-row-meta">
                  <a :href="m.url" target="_blank" rel="noopener noreferrer">{{ m.url }}</a>
                </p>
                <p v-else-if="m.contentText" class="tl-list-row-meta">
                  {{ truncate(m.contentText, 160) }}
                </p>
                <p class="tl-list-row-time">Added {{ formatDate(m.createdAt) }}</p>
                <p v-if="m.processingStatus" class="tl-list-row-time">
                  Status: {{ m.processingStatus }}<span v-if="m.processingError"> · {{ m.processingError }}</span>
                </p>
              </div>
              <div class="tl-list-row-actions">
                <a v-if="m.url" class="tl-link tl-link--sm" :href="m.url"
                  target="_blank" rel="noopener noreferrer">Open</a>
                <button v-if="m.processingStatus === 'failed'" class="tl-link tl-link--sm" type="button"
                  @click="retryMaterial(m)">Retry</button>
                <button class="tl-link tl-link--sm tl-link--muted" type="button"
                  @click="archiveMaterial(m)">Archive</button>
                <button class="tl-link tl-link--sm tl-link--danger" type="button"
                  @click="deleteMaterial(m)">Delete</button>
              </div>
            </li>
          </ul>
        </section>

        <!-- ── Practice tab ─────────────────────────────────────── -->
        <section v-else-if="activeTab === 'practice'" class="tl-section">
          <header class="tl-section-head">
            <div>
              <h3>Practice</h3>
              <p>Topic-aware practice questions. Question type adapts to the topic.</p>
            </div>
            <div class="tl-section-actions">
              <select v-model="practiceDifficulty" class="tl-select tl-select--sm">
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
              <button class="tl-btn tl-btn--ghost tl-btn--sm" type="button"
                :disabled="questionsLoading"
                @click="generateQuestions">
                {{ questions.length ? 'Generate more' : 'Generate questions' }}
              </button>
            </div>
          </header>

          <div v-if="questionsLoading" class="tl-skeleton-block">
            OrionAI is preparing practice questions…
          </div>

          <div v-else-if="!questions.length" class="tl-empty-block">
            <strong>No practice questions yet.</strong>
            <p>Generate a set tailored to this topic and your level.</p>
          </div>

          <ul v-else class="tl-list">
            <li v-for="(q, idx) in questions" :key="q._id" class="tl-q-card">
              <header class="tl-q-head">
                <span class="tl-q-index">Q{{ idx + 1 }}</span>
                <span class="tl-type-tag" :data-type="q.type">{{ q.type }}</span>
                <span class="tl-q-diff" :data-diff="q.difficulty">{{ q.difficulty }}</span>
              </header>
              <p class="tl-q-text">{{ q.question }}</p>

              <div v-if="q.options?.length" class="tl-q-options">
                <button
                  v-for="opt in q.options"
                  :key="opt"
                  type="button"
                  class="tl-q-option"
                  :class="{
                    'tl-q-option--chosen': q._uiAnswer === opt,
                    'tl-q-option--correct': q._uiRevealed && opt === q.correctAnswer,
                    'tl-q-option--wrong': q._uiRevealed && q._uiAnswer === opt && opt !== q.correctAnswer,
                  }"
                  @click="setQuestionAnswer(q, opt)"
                >
                  {{ opt }}
                </button>
              </div>
              <input
                v-else
                v-model="q._uiAnswer"
                type="text"
                class="tl-input"
                placeholder="Your answer (optional)"
              />

              <div class="tl-q-actions">
                <button class="tl-btn tl-btn--ghost tl-btn--sm" type="button"
                  @click="revealAnswer(q)">
                  Check answer
                </button>
                <button class="tl-link tl-link--sm tl-link--muted" type="button"
                  @click="toggleQuestionWeak(q)">
                  {{ q.userMarkedWeak ? 'Unmark weak' : 'Mark weak' }}
                </button>
              </div>

              <div v-if="q._uiRevealed" class="tl-q-reveal">
                <p v-if="q.correctAnswer">
                  <strong>Correct answer:</strong> {{ q.correctAnswer }}
                </p>
                <p v-if="q.explanation">{{ q.explanation }}</p>
                <p v-if="!q.correctAnswer && !q.explanation" class="tl-muted">
                  No explanation provided.
                </p>
              </div>
            </li>
          </ul>
        </section>

        <!-- ── Flashcards tab ───────────────────────────────────── -->
        <section v-else-if="activeTab === 'flashcards'" class="tl-section">
          <header class="tl-section-head">
            <div>
              <h3>Flashcards</h3>
              <p>Short cards generated from this topic for quick review.</p>
            </div>
            <button class="tl-btn tl-btn--ghost tl-btn--sm" type="button"
              :disabled="flashcardsLoading"
              @click="generateFlashcards">
              {{ flashcards.length ? 'Generate more' : 'Generate flashcards' }}
            </button>
          </header>

          <transition name="tl-fade">
            <p v-if="flashFeedback.text" class="tl-flash-feedback" role="status">
              {{ flashFeedback.text }}
            </p>
          </transition>

          <div v-if="flashcardsLoading" class="tl-skeleton-block">
            OrionAI is preparing your flashcards…
          </div>

          <div v-else-if="!flashcards.length" class="tl-empty-block">
            <strong>No flashcards yet.</strong>
            <p>Generate a set to review the most important ideas in this topic.</p>
          </div>

          <div v-else class="tl-flash-grid">
            <article
              v-for="card in flashcards"
              :key="card._id"
              class="tl-flash-card"
              :class="{
                'tl-flash-card--flipped': card._uiFlipped,
                'tl-flash-card--known': card.status === 'known',
                'tl-flash-card--weak': card.status === 'weak',
              }"
              @click="card._uiFlipped = !card._uiFlipped"
            >
              <span class="tl-flash-face">
                {{ card._uiFlipped ? card.back : card.front }}
              </span>
              <footer class="tl-flash-foot" @click.stop>
                <span class="tl-flash-side">
                  {{ card._uiFlipped ? 'Back' : 'Front' }} · {{ card.status }}
                  <span v-if="card.nextReviewAt" class="tl-flash-next">
                    · review {{ formatDate(card.nextReviewAt) }}
                  </span>
                </span>
                <div class="tl-flash-actions">
                  <button class="tl-link tl-link--sm" type="button"
                    title="You know this card. Schedule it further out."
                    @click.stop="markFlashcard(card, 'known')">Known</button>
                  <button class="tl-link tl-link--sm tl-link--muted" type="button"
                    title="Show this card again tomorrow."
                    @click.stop="markFlashcard(card, 'learning')">Review later</button>
                  <button class="tl-link tl-link--sm tl-link--warning" type="button"
                    title="You don't recall this. Show it sooner."
                    @click.stop="markFlashcard(card, 'weak')">Mark weak</button>
                </div>
              </footer>
            </article>
          </div>
        </section>

        <!-- ── Doubt chat tab ───────────────────────────────────── -->
        <section v-else-if="activeTab === 'doubt'" class="tl-section">
          <header class="tl-section-head">
            <div>
              <h3>Doubt chat</h3>
              <p>Ask anything about this topic using general knowledge or selected material context.</p>
            </div>
            <button v-if="doubtMessages.length" class="tl-link tl-link--sm tl-link--muted"
              type="button" @click="doubtMessages = []">
              Clear chat
            </button>
          </header>

          <div v-if="!doubtMessages.length && !doubtLoading" class="tl-empty-block">
            <strong>Ask any doubt about this topic.</strong>
            <p>Examples: “Explain this simply.” · “Give one more example.” · “Why is my answer wrong?”</p>
          </div>
          <div v-if="materials.length" class="tl-card tl-context-card">
            <label class="tl-field">
              <span>Answer context</span>
              <select v-model="doubtContextMode">
                <option value="topic">This topic</option>
                <option value="selected">Selected materials</option>
                <option value="goal">All materials in this goal</option>
                <option value="general">General OrionAI knowledge</option>
                <option value="materials_only">Selected materials only</option>
              </select>
            </label>
            <div v-if="doubtContextMode === 'selected' || doubtContextMode === 'materials_only'" class="tl-material-checks">
              <label v-for="m in materials" :key="m._id">
                <input v-model="selectedMaterialIds" type="checkbox" :value="m._id" />
                <span>{{ m.title }}</span>
              </label>
            </div>
          </div>

          <ul v-if="doubtMessages.length" class="tl-chat">
            <li v-for="(msg, i) in doubtMessages" :key="i"
              class="tl-chat-msg" :class="`tl-chat-msg--${msg.role}`">
              <div class="tl-chat-bubble">
                <span v-if="msg.role === 'assistant' && msg.answerType" class="tl-chat-badge">
                  {{ msg.answerType }}
                </span>
                <p v-for="(para, j) in splitParagraphs(msg.content)" :key="j">{{ para }}</p>
                <p
                  v-if="msg.role === 'assistant' && msg.materialNote"
                  class="tl-chat-source"
                >
                  {{ msg.materialNote }}
                </p>
                <button
                  v-if="msg.role === 'assistant' && msg.followup"
                  type="button"
                  class="tl-chat-followup"
                  :disabled="doubtLoading"
                  @click="sendFollowup(msg.followup)"
                >
                  <span class="tl-chat-followup-label">Follow-up</span>
                  <span class="tl-chat-followup-text">{{ msg.followup }}</span>
                </button>
              </div>
            </li>
            <li v-if="doubtLoading" class="tl-chat-msg tl-chat-msg--assistant">
              <div class="tl-chat-bubble tl-chat-bubble--loading">
                OrionAI is thinking…
              </div>
            </li>
          </ul>

          <form class="tl-chat-form" @submit.prevent="sendDoubt()">
            <input
              v-model="doubtInput"
              type="text"
              class="tl-input"
              placeholder="Ask a question about this topic…"
              :disabled="doubtLoading"
            />
            <button class="tl-btn tl-btn--primary tl-btn--sm" type="submit"
              :disabled="doubtLoading || !doubtInput.trim()">
              Send
            </button>
          </form>
        </section>

        <!-- ── Notes tab ────────────────────────────────────────── -->
        <section v-else-if="activeTab === 'notes'" class="tl-section">
          <header class="tl-section-head">
            <div>
              <h3>Notes</h3>
              <p>Save your own notes for this topic.</p>
            </div>
          </header>

          <div class="tl-card">
            <textarea
              v-model="newNoteContent"
              rows="3"
              class="tl-input tl-input--textarea"
              placeholder="Write a quick note for this topic…"
            ></textarea>
            <div class="tl-form-actions">
              <button class="tl-btn tl-btn--primary tl-btn--sm" type="button"
                :disabled="!newNoteContent.trim() || noteSaving"
                @click="saveNote">
                {{ noteSaving ? 'Saving…' : 'Save note' }}
              </button>
            </div>
          </div>

          <div v-if="!notes.length" class="tl-empty-block">
            <strong>No notes yet.</strong>
            <p>Notes you save will appear here for quick recall later.</p>
          </div>

          <ul v-else class="tl-list">
            <li v-for="note in notes" :key="note._id" class="tl-list-row tl-note-row">
              <div class="tl-list-row-main">
                <span class="tl-type-tag" :data-type="note.source">{{ note.source }}</span>
                <p class="tl-note-content">{{ note.content }}</p>
                <p class="tl-list-row-time">{{ formatDate(note.createdAt) }}</p>
              </div>
              <div class="tl-list-row-actions">
                <button class="tl-link tl-link--sm tl-link--danger" type="button"
                  @click="deleteNote(note)">Delete</button>
              </div>
            </li>
          </ul>
        </section>

        <!-- ── Progress tab ─────────────────────────────────────── -->
        <section v-else-if="activeTab === 'progress'" class="tl-section">
          <header class="tl-section-head">
            <div>
              <h3>Progress</h3>
              <p>Where you are with this topic.</p>
            </div>
          </header>
          <div class="tl-progress-grid">
            <article class="tl-progress-stat">
              <span class="tl-stat-label">Status</span>
              <strong>{{ statusLabel(topic.status) }}</strong>
            </article>
            <article class="tl-progress-stat">
              <span class="tl-stat-label">Lesson</span>
              <strong>{{ lesson ? 'Generated' : 'Not generated' }}</strong>
            </article>
            <article class="tl-progress-stat">
              <span class="tl-stat-label">Materials</span>
              <strong>{{ materials.length }}</strong>
            </article>
            <article class="tl-progress-stat">
              <span class="tl-stat-label">Practice questions</span>
              <strong>{{ questions.length }}</strong>
            </article>
            <article class="tl-progress-stat">
              <span class="tl-stat-label">Flashcards</span>
              <strong>{{ flashcards.length }}</strong>
            </article>
            <article class="tl-progress-stat">
              <span class="tl-stat-label">Notes</span>
              <strong>{{ notes.length }}</strong>
            </article>
            <article class="tl-progress-stat">
              <span class="tl-stat-label">Last studied</span>
              <strong>{{ topic.lastStudiedAt ? formatDate(topic.lastStudiedAt) : '—' }}</strong>
            </article>
            <article class="tl-progress-stat">
              <span class="tl-stat-label">Next revision</span>
              <strong>{{ topic.nextRevisionAt ? formatDate(topic.nextRevisionAt) : '—' }}</strong>
            </article>
          </div>
          <div class="tl-card tl-memory-card">
            <header class="tl-section-head tl-section-head--compact">
              <div>
                <h3>Learning Memory</h3>
                <p>Scoped notes OrionAI remembers for this topic.</p>
              </div>
              <button v-if="memories.length" class="tl-link tl-link--sm tl-link--muted" type="button"
                @click="clearMemory">Clear</button>
            </header>
            <div v-if="!memories.length" class="tl-empty-block">
              <strong>No saved learning memory yet.</strong>
            </div>
            <ul v-else class="tl-list">
              <li v-for="memory in memories" :key="memory._id" class="tl-list-row">
                <div class="tl-list-row-main">
                  <span class="tl-type-tag">{{ memory.memoryType }}</span>
                  <p class="tl-note-content">{{ memory.content }}</p>
                  <p class="tl-list-row-time">{{ memory.sourceType }}</p>
                </div>
                <button class="tl-link tl-link--sm tl-link--danger" type="button"
                  @click="deleteMemory(memory)">Remove</button>
              </li>
            </ul>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { studyAPI } from '../services/api'

const props = defineProps({
  topicId: { type: String, required: true },
})

defineEmits(['back'])

const STATUS_LABELS = Object.freeze({
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  weak: 'Weak',
  revision_due: 'Revision due',
})

const tabs = computed(() => [
  { id: 'learn', label: 'Learn' },
  {
    id: 'materials',
    label: 'Materials',
    count: materials.value.length || null,
  },
  {
    id: 'practice',
    label: 'Practice',
    count: questions.value.length || null,
  },
  {
    id: 'flashcards',
    label: 'Flashcards',
    count: flashcards.value.length || null,
  },
  { id: 'doubt', label: 'Doubt chat' },
  { id: 'notes', label: 'Notes', count: notes.value.length || null },
  { id: 'progress', label: 'Progress' },
])

const TAB_IDS = ['learn', 'materials', 'practice', 'flashcards', 'doubt', 'notes', 'progress']

function tabFromUrl() {
  if (typeof window === 'undefined') return 'learn'
  const tab = new URLSearchParams(window.location.search).get('tab')
  return TAB_IDS.includes(tab) ? tab : 'learn'
}

const activeTab = ref(tabFromUrl())
const topic = ref(null)
const goal = ref(null)
const lesson = ref(null)
const materials = ref([])
const questions = ref([])
const flashcards = ref([])
const notes = ref([])
const memories = ref([])

const loading = ref(true)
const pendingAction = ref(false)
const lessonLoading = ref(false)
const questionsLoading = ref(false)
const flashcardsLoading = ref(false)
const savingNoteFromLesson = ref(false)

const practiceDifficulty = ref('medium')

const materialForm = reactive({
  open: false,
  saving: false,
  type: 'note',
  title: '',
  url: '',
  contentText: '',
  file: null,
  uploadProgress: 0,
  error: '',
})

const newNoteContent = ref('')
const noteSaving = ref(false)

const doubtMessages = ref([])
const doubtInput = ref('')
const doubtLoading = ref(false)
const doubtContextMode = ref('topic')
const selectedMaterialIds = ref([])

const flashFeedback = ref({ cardId: '', text: '' })
let flashFeedbackTimer = null

function statusLabel(value) {
  return STATUS_LABELS[value] || value || ''
}
function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  })
}
function truncate(text, max = 120) {
  if (typeof text !== 'string') return ''
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}
function splitParagraphs(value) {
  if (typeof value !== 'string') return []
  return value
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
}

function decorateQuestion(q) {
  return {
    ...q,
    _uiAnswer: q.userAnswer || '',
    _uiRevealed: false,
  }
}
function decorateFlashcard(card) {
  return { ...card, _uiFlipped: false }
}

async function loadTopicLearning() {
  if (!props.topicId) return
  loading.value = true
  try {
    const { data } = await studyAPI.getTopicLearning(props.topicId)
    topic.value = data?.topic || null
    goal.value = data?.goal || null
    if (goal.value?._id && typeof window !== 'undefined') {
      window.localStorage.setItem('orion.study.activeGoalId', goal.value._id)
    }
    lesson.value = data?.lesson || null
    materials.value = Array.isArray(data?.materials) ? data.materials : []
    questions.value = Array.isArray(data?.questions)
      ? data.questions.map(decorateQuestion)
      : []
    flashcards.value = Array.isArray(data?.flashcards)
      ? data.flashcards.map(decorateFlashcard)
      : []
    notes.value = Array.isArray(data?.notes) ? data.notes : []
    await loadMemory()
    if (shouldOpenMaterialFormFromUrl()) {
      activeTab.value = 'materials'
      openMaterialForm('upload')
      clearOpenMaterialParam()
    }
  } catch (err) {
    console.error('Load topic learning failed', err)
    topic.value = null
  } finally {
    loading.value = false
  }
}

function shouldOpenMaterialFormFromUrl() {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('openMaterial') === '1'
}

function clearOpenMaterialParam() {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.searchParams.delete('openMaterial')
  window.history.replaceState({}, '', `${url.pathname}${url.search}`)
}

async function loadMemory() {
  if (!props.topicId) return
  try {
    const { data } = await studyAPI.getTopicMemory(props.topicId)
    memories.value = Array.isArray(data?.memories) ? data.memories : []
  } catch {
    memories.value = []
  }
}

async function setStatus(status) {
  if (!topic.value) return
  pendingAction.value = true
  try {
    const { data } = await studyAPI.updateTopic(topic.value._id, { status })
    if (data?.topic) topic.value = data.topic
  } catch (err) {
    console.error('Set status failed', err)
  } finally {
    pendingAction.value = false
  }
}

async function completeTopic() {
  if (!topic.value) return
  pendingAction.value = true
  try {
    const { data } = await studyAPI.completeTopic(topic.value._id)
    if (data?.topic) topic.value = data.topic
  } catch (err) {
    console.error('Complete topic failed', err)
  } finally {
    pendingAction.value = false
  }
}

// ── Lesson ────────────────────────────────────────────────────────────────
async function generateLesson() {
  if (!topic.value || lessonLoading.value) return
  lessonLoading.value = true
  try {
    const { data } = await studyAPI.generateLesson(topic.value._id, {
      useMaterials: materials.value.length > 0,
    })
    if (data?.lesson) {
      lesson.value = data.lesson
      // Server may bump topic to in_progress
      if (topic.value.status === 'not_started') {
        topic.value = { ...topic.value, status: 'in_progress' }
      }
    }
  } catch (err) {
    console.error('Generate lesson failed', err)
    alert(err?.response?.data?.error || 'Could not generate lesson. Try again.')
  } finally {
    lessonLoading.value = false
  }
}

async function saveLessonRevisionToNotes() {
  if (!lesson.value?.revisionNotes?.length || !topic.value) return
  savingNoteFromLesson.value = true
  try {
    const content = lesson.value.revisionNotes.map((n) => `• ${n}`).join('\n')
    const { data } = await studyAPI.createNote(topic.value._id, {
      content,
      source: 'ai_saved',
    })
    if (data?.note) notes.value.unshift(data.note)
  } catch (err) {
    console.error('Save lesson notes failed', err)
  } finally {
    savingNoteFromLesson.value = false
  }
}

// ── Materials ─────────────────────────────────────────────────────────────
function openMaterialForm(requestedType = 'note') {
  const type = typeof requestedType === 'string' ? requestedType : 'note'
  materialForm.open = true
  materialForm.type = type
  materialForm.title = ''
  materialForm.url = ''
  materialForm.contentText = ''
  materialForm.file = null
  materialForm.uploadProgress = 0
  materialForm.error = ''
}
function closeMaterialForm() {
  materialForm.open = false
  materialForm.error = ''
}
function onMaterialFileChange(event) {
  materialForm.file = event.target.files?.[0] || null
}
async function saveMaterial() {
  if (!topic.value) return
  materialForm.error = ''
  if (materialForm.type === 'upload') {
    if (!materialForm.file) {
      materialForm.error = 'Choose a file to upload.'
      return
    }
  } else if (
    materialForm.type === 'link' ||
    materialForm.type === 'video'
  ) {
    if (!materialForm.url.trim()) {
      materialForm.error = 'Add a URL for this link.'
      return
    }
  } else if (!materialForm.contentText.trim() && !materialForm.title.trim()) {
    materialForm.error = 'Add a title or some content.'
    return
  }
  materialForm.saving = true
  try {
    if (materialForm.type === 'upload') {
      const formData = new FormData()
      formData.append('file', materialForm.file)
      formData.append('topicId', topic.value._id)
      formData.append('goalId', goal.value?._id || topic.value.goalId || '')
      if (materialForm.title.trim()) formData.append('title', materialForm.title.trim())
      const { data } = await studyAPI.uploadMaterial(formData, (event) => {
        if (!event.total) return
        materialForm.uploadProgress = Math.round((event.loaded / event.total) * 100)
      })
      if (data?.material) materials.value.unshift(data.material)
      closeMaterialForm()
      return
    }
    const sourceApp =
      materialForm.type === 'link' || materialForm.type === 'video'
        ? 'web'
        : 'manual'
    const { data } = await studyAPI.createTopicMaterial(topic.value._id, {
      type: materialForm.type,
      title:
        materialForm.title.trim() ||
        (materialForm.url ? materialForm.url : 'Manual note'),
      url: materialForm.url.trim(),
      contentText: materialForm.contentText.trim(),
      sourceApp,
    })
    if (data?.material) materials.value.unshift(data.material)
    closeMaterialForm()
  } catch (err) {
    materialForm.error =
      err?.response?.data?.error || 'Could not save material.'
  } finally {
    materialForm.saving = false
  }
}
async function archiveMaterial(material) {
  try {
    const { data } = await studyAPI.updateMaterial(material._id, {
      status: 'archived',
    })
    if (data?.material) {
      materials.value = materials.value.filter((m) => m._id !== material._id)
    }
  } catch (err) {
    console.error('Archive material failed', err)
  }
}
async function retryMaterial(material) {
  try {
    const { data } = await studyAPI.retryMaterial(material._id)
    if (data?.material) {
      const idx = materials.value.findIndex((m) => m._id === material._id)
      if (idx >= 0) materials.value[idx] = data.material
    }
  } catch (err) {
    console.error('Retry material failed', err)
  }
}
async function deleteMaterial(material) {
  try {
    await studyAPI.deleteMaterial(material._id)
    materials.value = materials.value.filter((m) => m._id !== material._id)
  } catch (err) {
    console.error('Delete material failed', err)
  }
}

// ── Practice questions ────────────────────────────────────────────────────
async function generateQuestions() {
  if (!topic.value || questionsLoading.value) return
  questionsLoading.value = true
  try {
    const { data } = await studyAPI.generateQuestions(topic.value._id, {
      count: 5,
      difficulty: practiceDifficulty.value,
      questionType: 'auto',
    })
    const created = Array.isArray(data?.questions) ? data.questions : []
    questions.value = [...created.map(decorateQuestion), ...questions.value]
  } catch (err) {
    console.error('Generate questions failed', err)
    alert(err?.response?.data?.error || 'Could not generate questions.')
  } finally {
    questionsLoading.value = false
  }
}
function setQuestionAnswer(q, opt) {
  q._uiAnswer = opt
}
async function revealAnswer(q) {
  q._uiRevealed = true
  const isCorrect =
    q.correctAnswer && q._uiAnswer
      ? q._uiAnswer.trim().toLowerCase() ===
        q.correctAnswer.trim().toLowerCase()
      : null
  try {
    const { data } = q._uiAnswer
      ? await studyAPI.checkQuestion(q._id, { answer: q._uiAnswer })
      : await studyAPI.updateQuestion(q._id, {
          userAnswer: q._uiAnswer || '',
          answeredCorrectly: isCorrect,
        })
    if (data?.question) {
      Object.assign(q, decorateQuestion(data.question), { _uiRevealed: true })
    } else {
      q.userAnswer = q._uiAnswer
      q.answeredCorrectly = isCorrect
    }
  } catch (err) {
    console.error('Update question failed', err)
  }
}
async function toggleQuestionWeak(q) {
  try {
    const { data } = await studyAPI.updateQuestion(q._id, {
      userMarkedWeak: !q.userMarkedWeak,
    })
    if (data?.question) q.userMarkedWeak = data.question.userMarkedWeak
  } catch (err) {
    console.error('Toggle weak failed', err)
  }
}

// ── Flashcards ────────────────────────────────────────────────────────────
async function generateFlashcards() {
  if (!topic.value || flashcardsLoading.value) return
  flashcardsLoading.value = true
  try {
    const { data } = await studyAPI.generateFlashcards(topic.value._id, {
      count: 8,
    })
    const created = Array.isArray(data?.flashcards) ? data.flashcards : []
    flashcards.value = [...created.map(decorateFlashcard), ...flashcards.value]
  } catch (err) {
    console.error('Generate flashcards failed', err)
    alert(err?.response?.data?.error || 'Could not generate flashcards.')
  } finally {
    flashcardsLoading.value = false
  }
}
// Spaced-repetition delay (in days) per flashcard status.
function nextReviewIsoForStatus(status) {
  const daysByStatus = {
    known: 7,
    learning: 1, // "Review later" → show again tomorrow
    weak: 1, // weak surfaces sooner
  }
  const days = daysByStatus[status] ?? 1
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

function flashFeedbackForStatus(status) {
  switch (status) {
    case 'known': return 'Marked as known. We’ll bring it back in a week.'
    case 'learning': return 'We’ll show this card again tomorrow.'
    case 'weak': return 'Marked weak. We’ll show it again sooner.'
    default: return ''
  }
}

async function markFlashcard(card, status) {
  const nextReviewAt = nextReviewIsoForStatus(status)
  try {
    const { data } = await studyAPI.updateFlashcard(card._id, {
      status,
      nextReviewAt,
    })
    if (data?.flashcard) {
      const idx = flashcards.value.findIndex((c) => c._id === card._id)
      if (idx >= 0) {
        flashcards.value[idx] = {
          ...data.flashcard,
          _uiFlipped: false,
        }
      }
    }
    flashFeedback.value = {
      cardId: card._id,
      text: flashFeedbackForStatus(status),
    }
    if (flashFeedbackTimer) clearTimeout(flashFeedbackTimer)
    flashFeedbackTimer = setTimeout(() => {
      flashFeedback.value = { cardId: '', text: '' }
      flashFeedbackTimer = null
    }, 2400)
  } catch (err) {
    console.error('Mark flashcard failed', err)
  }
}

// ── Notes ─────────────────────────────────────────────────────────────────
async function saveNote() {
  if (!newNoteContent.value.trim() || !topic.value) return
  noteSaving.value = true
  try {
    const { data } = await studyAPI.createNote(topic.value._id, {
      content: newNoteContent.value.trim(),
      source: 'manual',
    })
    if (data?.note) notes.value.unshift(data.note)
    newNoteContent.value = ''
  } catch (err) {
    console.error('Save note failed', err)
  } finally {
    noteSaving.value = false
  }
}
async function deleteNote(note) {
  try {
    await studyAPI.deleteNote(note._id)
    notes.value = notes.value.filter((n) => n._id !== note._id)
  } catch (err) {
    console.error('Delete note failed', err)
  }
}

// ── Doubt chat ────────────────────────────────────────────────────────────
// Accepts: a clean object, a JSON string from the LLM, or plain prose.
// Returns: { answerType, content, materialNote, followup } for rendering.
function normalizeDoubtAnswer(payload) {
  const fallback = {
    answerType: 'OrionAI explanation',
    content: '',
    materialNote: '',
    followup: '',
  }

  // Structured object straight from the API.
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const explanation =
      typeof payload.explanation === 'string' ? payload.explanation.trim() : ''
    if (explanation || payload.followupSuggestion || payload.answerType) {
      const answerType =
        typeof payload.answerType === 'string' && payload.answerType.trim()
          ? payload.answerType.trim()
          : fallback.answerType
      const usedMaterial = payload.usedAttachedMaterial === true
      return {
        answerType,
        content: explanation,
        materialNote: usedMaterial
          ? 'Used your attached material for this answer.'
          : '',
        followup:
          typeof payload.followupSuggestion === 'string'
            ? payload.followupSuggestion.trim()
            : '',
      }
    }
  }

  // String — could be plain text or a JSON-stringified object.
  if (typeof payload === 'string') {
    const trimmed = payload.trim()
    if (!trimmed) return fallback
    const cleaned = trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()
    const looksJson = cleaned.startsWith('{') && cleaned.endsWith('}')
    if (looksJson) {
      try {
        return normalizeDoubtAnswer(JSON.parse(cleaned))
      } catch {
        // fall through to plain text
      }
    }
    return { ...fallback, content: cleaned }
  }

  return fallback
}

async function sendDoubt(rawQuestion) {
  const question = (typeof rawQuestion === 'string' ? rawQuestion : doubtInput.value).trim()
  if (!question || !topic.value || doubtLoading.value) return
  doubtInput.value = ''
  doubtMessages.value.push({ role: 'user', content: question })
  doubtLoading.value = true
  try {
    const history = doubtMessages.value
      .filter((m) => m.role === 'user' || m.content)
      .map((m) => ({ role: m.role, content: m.content }))
    const { data } = await studyAPI.topicDoubtChat(topic.value._id, {
      question,
      history,
      contextMode: doubtContextMode.value,
      materialIds: selectedMaterialIds.value,
    })
    // Prefer structured `answer` object; fall back to raw `reply` string.
    const normalized = normalizeDoubtAnswer(
      data?.answer && typeof data.answer === 'object' ? data.answer : data?.reply
    )
    if (!normalized.content) {
      normalized.content = data?.reply || 'OrionAI didn’t return an answer.'
    }
    doubtMessages.value.push({
      role: 'assistant',
      content: normalized.content,
      answerType: normalized.answerType,
      materialNote: data?.sources?.length
        ? `Sources: ${data.sources.map((s) => s.title).join(', ')}`
        : normalized.materialNote,
      followup: normalized.followup,
    })
  } catch (err) {
    console.error('Doubt chat failed', err)
    doubtMessages.value.push({
      role: 'assistant',
      content:
        err?.response?.data?.error ||
        'OrionAI couldn’t answer right now. Please try again.',
      answerType: 'OrionAI explanation',
      materialNote: '',
      followup: '',
    })
  } finally {
    doubtLoading.value = false
  }
}

function sendFollowup(text) {
  if (!text || doubtLoading.value) return
  sendDoubt(text)
}

async function deleteMemory(memory) {
  if (!topic.value || !memory?._id) return
  try {
    await studyAPI.deleteTopicMemory(topic.value._id, memory._id)
    memories.value = memories.value.filter((m) => m._id !== memory._id)
  } catch (err) {
    console.error('Delete memory failed', err)
  }
}

async function clearMemory() {
  if (!topic.value) return
  try {
    await studyAPI.clearTopicMemory(topic.value._id)
    memories.value = []
  } catch (err) {
    console.error('Clear memory failed', err)
  }
}

watch(() => props.topicId, () => {
  activeTab.value = tabFromUrl()
  doubtMessages.value = []
  loadTopicLearning()
})

watch(activeTab, (tab) => {
  if (typeof window === 'undefined' || !TAB_IDS.includes(tab)) return
  const url = new URL(window.location.href)
  url.searchParams.set('tab', tab)
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
})

onMounted(loadTopicLearning)
</script>

<style scoped>
.tl-shell {
  position: relative;
  flex: 1;
  min-height: 100%;
  overflow: auto;
  padding: 28px 32px 48px;
  color: var(--text-primary);
  background: var(--bg-base);
}
.tl-aurora {
  display: none;
}

.tl-content {
  position: relative;
  z-index: 1;
  max-width: 1080px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.tl-back {
  background: none;
  border: none;
  color: var(--accent-hover);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  padding: 0;
  align-self: flex-start;
}
.tl-back:hover { text-decoration: underline; }

.tl-header {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-end;
  justify-content: space-between;
  border-radius: var(--radius-lg);
  padding: 22px 22px 18px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-surface);
  box-shadow: var(--shadow-sm);
}
.tl-eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 11px;
  font-weight: 600;
  color: rgba(79, 140, 255, 0.78);
}
.tl-header h1 {
  margin: 6px 0 0;
  font-size: clamp(22px, 2.4vw, 28px);
  font-weight: 500;
  letter-spacing: -0.01em;
  line-height: 1.2;
}
.tl-meta {
  margin: 6px 0 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 12.5px;
  color: var(--text-muted);
}
.tl-dot { color: var(--text-faint); }
.tl-status {
  text-transform: capitalize;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: var(--border-subtle);
  color: var(--text-secondary);
  font-size: 11px;
}
.tl-status[data-status="in_progress"] { background: rgba(79, 140, 255, 0.18); color: var(--accent-hover); }
.tl-status[data-status="completed"] { background: rgba(47, 211, 157, 0.18); color: #6fe0bc; }
.tl-status[data-status="weak"] { background: rgba(255, 107, 127, 0.16); color: #ff8ea1; }
.tl-status[data-status="revision_due"] { background: rgba(242, 184, 79, 0.16); color: #f6c577; }

.tl-header-actions { display: flex; flex-wrap: wrap; gap: 10px; }
.tl-btn {
  display: inline-flex;
  align-items: center;
  border-radius: var(--radius-sm);
  padding: 9px 16px;
  font: inherit;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
  white-space: nowrap;
}
.tl-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.tl-btn--sm { padding: 6px 12px; font-size: 12.5px; }
.tl-btn--ghost {
  background: var(--bg-surface);
  color: var(--text-secondary);
  border-color: var(--border-default);
}
.tl-btn--ghost:hover:not(:disabled) { color: var(--text-primary); border-color: rgba(79, 140, 255, 0.32); }
.tl-btn--primary {
  color: white;
  background: var(--accent);
  border-color: transparent;
}
.tl-btn--primary:hover:not(:disabled) { opacity: 0.9; }

.tl-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px;
  border-radius: var(--radius-sm);
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  width: fit-content;
  max-width: 100%;
}
.tl-tab {
  border: none;
  background: none;
  color: var(--text-muted);
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.tl-tab:hover { color: var(--text-primary); }
.tl-tab.active {
  background: rgba(79, 140, 255, 0.16);
  color: var(--accent-hover);
}
.tl-tab-count {
  font-size: 10.5px;
  padding: 1px 7px;
  border-radius: var(--radius-sm);
  background: rgba(79, 140, 255, 0.16);
  color: var(--accent-hover);
}

.tl-section {
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-subtle);
  background: var(--bg-surface);
  box-shadow: var(--shadow-sm);
  padding: 22px 22px 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.tl-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.tl-section-head h3 { margin: 0; font-size: 16px; font-weight: 600; }
.tl-section-head p { margin: 4px 0 0; font-size: 12.5px; color: var(--text-muted); max-width: 60ch; }
.tl-section-actions { display: inline-flex; gap: 8px; align-items: center; }

.tl-skeleton-block {
  padding: 30px 18px;
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid var(--border-subtle);
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}
.tl-empty-block {
  padding: 22px 18px;
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.025);
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.tl-empty-block strong { font-size: 14px; color: var(--text-primary); }
.tl-empty-block p { margin: 0; font-size: 13px; color: var(--text-muted); max-width: 56ch; }
.tl-empty-block em { font-style: normal; color: var(--accent-hover); }

.tl-label {
  display: inline-block;
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: rgba(79, 140, 255, 0.78);
  margin: 0 0 6px;
}

.tl-lesson {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.tl-lesson h4 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.tl-lesson-block {
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
  padding: 14px 16px;
}
.tl-lesson-block h5 {
  margin: 0 0 8px;
  font-size: 12.5px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--text-muted);
}
.tl-lesson-block p {
  margin: 0 0 8px;
  line-height: 1.6;
  font-size: 13.5px;
  color: var(--text-secondary);
}
.tl-lesson-block p:last-child { margin-bottom: 0; }
.tl-lesson-block ul {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.tl-lesson-block li {
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--text-secondary);
}
.tl-term-list { margin: 0; display: grid; grid-template-columns: 1fr; gap: 6px; }
.tl-term-list dt {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 13.5px;
}
.tl-term-list dd {
  margin: 0 0 6px;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}

/* Forms inside tabs */
.tl-card {
  padding: 14px 16px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: var(--bg-surface);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.tl-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 12.5px;
  color: var(--text-secondary);
}
.tl-field span { font-weight: 500; }
.tl-field-row {
  display: grid;
  grid-template-columns: 0.8fr 1.4fr;
  gap: 10px;
}
.tl-field input,
.tl-field select,
.tl-field textarea,
.tl-input {
  width: 100%;
  border-radius: 10px;
  border: 1px solid var(--border-default);
  background: var(--bg-surface);
  color: var(--text-primary);
  font: inherit;
  font-size: 13px;
  padding: 9px 12px;
  outline: none;
  resize: vertical;
  color-scheme: dark;
}
.tl-field input:focus,
.tl-field select:focus,
.tl-field textarea:focus,
.tl-input:focus {
  border-color: rgba(79, 140, 255, 0.42);
  box-shadow: 0 0 0 3px rgba(79, 140, 255, 0.1);
}
.tl-input--textarea { min-height: 60px; }
.tl-select {
  border-radius: 10px;
  border: 1px solid var(--border-default);
  background: var(--bg-surface);
  color: var(--text-primary);
  font: inherit;
  font-size: 13px;
  padding: 6px 10px;
  outline: none;
  color-scheme: dark;
}
.tl-select--sm { font-size: 12px; padding: 5px 10px; }
.tl-form-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.tl-form-error { margin: 0; color: #ff8ea1; font-size: 12.5px; }

/* Lists used by materials and notes */
.tl-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.tl-list-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 16px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
}
.tl-list-row-main { min-width: 0; flex: 1; }
.tl-list-row-main h4 {
  margin: 4px 0 0;
  font-size: 14px;
  font-weight: 600;
}
.tl-list-row-meta {
  margin: 4px 0 0;
  font-size: 12.5px;
  color: var(--text-muted);
  word-break: break-word;
}
.tl-list-row-meta a { color: var(--accent-hover); text-decoration: none; }
.tl-list-row-meta a:hover { text-decoration: underline; }
.tl-list-row-time {
  margin: 4px 0 0;
  font-size: 11px;
  color: var(--text-faint);
}
.tl-list-row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  justify-content: flex-end;
}
.tl-type-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: 10.5px;
  letter-spacing: 0.06em;
  background: var(--border-subtle);
  color: var(--text-secondary);
  text-transform: capitalize;
}
.tl-type-tag[data-type="link"],
.tl-type-tag[data-type="video"] { background: rgba(79, 140, 255, 0.16); color: var(--accent-hover); }
.tl-type-tag[data-type="note"],
.tl-type-tag[data-type="manual"] { background: rgba(79, 140, 255, 0.16); color: #b9b1ff; }
.tl-type-tag[data-type="ai_saved"] { background: rgba(47, 211, 157, 0.16); color: #6fe0bc; }
.tl-type-tag[data-type="generated_note"] { background: rgba(47, 211, 157, 0.16); color: #6fe0bc; }

/* Practice */
.tl-q-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
}
.tl-q-head { display: inline-flex; gap: 8px; align-items: center; }
.tl-q-index {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
}
.tl-q-diff {
  text-transform: capitalize;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: 10.5px;
  background: var(--border-subtle);
  color: var(--text-secondary);
}
.tl-q-diff[data-diff="easy"] { background: rgba(47, 211, 157, 0.14); color: #6fe0bc; }
.tl-q-diff[data-diff="hard"] { background: rgba(255, 107, 127, 0.14); color: #ff8ea1; }
.tl-q-text { margin: 0; font-size: 14px; line-height: 1.55; color: var(--text-primary); }
.tl-q-options { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.tl-q-option {
  text-align: left;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border-default);
  background: var(--bg-surface);
  color: var(--text-secondary);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease, color 120ms ease;
}
.tl-q-option:hover { color: var(--text-primary); border-color: rgba(79, 140, 255, 0.32); }
.tl-q-option--chosen { border-color: rgba(79, 140, 255, 0.45); color: var(--text-primary); }
.tl-q-option--correct {
  background: rgba(47, 211, 157, 0.16);
  border-color: rgba(47, 211, 157, 0.45);
  color: #6fe0bc;
}
.tl-q-option--wrong {
  background: rgba(255, 107, 127, 0.14);
  border-color: rgba(255, 107, 127, 0.42);
  color: #ff8ea1;
}
.tl-q-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.tl-q-reveal {
  border-radius: 10px;
  padding: 10px 12px;
  background: rgba(79, 140, 255, 0.08);
  border: 1px solid rgba(79, 140, 255, 0.18);
}
.tl-q-reveal p {
  margin: 0 0 6px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-secondary);
}
.tl-q-reveal p:last-child { margin-bottom: 0; }

/* Flashcards */
.tl-flash-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}
.tl-flash-card {
  position: relative;
  min-height: 150px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-default);
  background: var(--bg-surface);
  padding: 14px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  transition: border-color 120ms ease, transform 120ms ease;
}
.tl-flash-card:hover { border-color: rgba(79, 140, 255, 0.32); transform: translateY(-1px); }
.tl-flash-card--known { border-color: rgba(47, 211, 157, 0.4); }
.tl-flash-card--weak { border-color: rgba(255, 107, 127, 0.4); }
.tl-flash-face {
  display: block;
  font-size: 14px;
  line-height: 1.55;
  color: var(--text-primary);
}
.tl-flash-foot {
  margin-top: 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  flex-wrap: wrap;
}
.tl-flash-side {
  text-transform: uppercase;
  font-size: 10.5px;
  letter-spacing: 0.14em;
  color: var(--text-muted);
}
.tl-flash-next { text-transform: none; letter-spacing: 0; color: var(--text-faint); }
.tl-flash-actions { display: inline-flex; gap: 6px; flex-wrap: wrap; }
.tl-flash-feedback {
  margin: 0;
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(79, 140, 255, 0.1);
  border: 1px solid rgba(79, 140, 255, 0.28);
  color: var(--accent-hover);
  font-size: 12.5px;
}
.tl-fade-enter-active,
.tl-fade-leave-active { transition: opacity 160ms ease; }
.tl-fade-enter-from,
.tl-fade-leave-to { opacity: 0; }

/* Doubt chat */
.tl-chat {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 50vh;
  overflow: auto;
}
.tl-chat-msg { display: flex; }
.tl-chat-msg--user { justify-content: flex-end; }
.tl-chat-msg--assistant { justify-content: flex-start; }
.tl-chat-bubble {
  max-width: 78%;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--text-primary);
}
.tl-chat-msg--user .tl-chat-bubble {
  background: var(--accent);
  color: white;
  border-bottom-right-radius: 6px;
}
.tl-chat-msg--assistant .tl-chat-bubble {
  background: rgba(13, 22, 43, 0.85);
  border: 1px solid var(--border-default);
  border-bottom-left-radius: 6px;
}
.tl-chat-bubble p { margin: 0 0 8px; }
.tl-chat-bubble p:last-child { margin-bottom: 0; }
.tl-chat-badge {
  display: inline-block;
  margin-bottom: 8px;
  padding: 2px 9px;
  border-radius: var(--radius-sm);
  background: rgba(79, 140, 255, 0.16);
  color: var(--accent-hover);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.tl-chat-source {
  margin: 6px 0 0;
  padding-top: 6px;
  border-top: 1px solid var(--border-subtle);
  font-size: 11.5px;
  color: var(--text-muted);
  font-style: italic;
}
.tl-chat-followup {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px dashed rgba(79, 140, 255, 0.32);
  background: rgba(79, 140, 255, 0.06);
  color: var(--text-primary);
  font: inherit;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease;
}
.tl-chat-followup:hover:not(:disabled) {
  background: rgba(79, 140, 255, 0.12);
  border-color: rgba(79, 140, 255, 0.5);
}
.tl-chat-followup:disabled { opacity: 0.6; cursor: not-allowed; }
.tl-chat-followup-label {
  font-size: 10.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--accent-hover);
}
.tl-chat-followup-text {
  font-size: 13px;
  color: var(--text-secondary);
}
.tl-chat-bubble--loading { color: var(--text-muted); font-style: italic; }
.tl-chat-form { display: flex; gap: 8px; margin-top: 12px; }
.tl-chat-form .tl-input { flex: 1; }
.tl-context-card,
.tl-memory-card {
  margin-bottom: 12px;
}
.tl-material-checks {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 8px;
  margin-top: 8px;
}
.tl-material-checks label {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 12.5px;
  color: var(--text-secondary);
}
.tl-section-head--compact {
  margin-bottom: 10px;
}

/* Notes */
.tl-note-row .tl-note-content {
  margin: 6px 0 0;
  white-space: pre-wrap;
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--text-secondary);
}

/* Progress */
.tl-progress-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}
.tl-progress-stat {
  padding: 14px;
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.tl-stat-label {
  text-transform: uppercase;
  font-size: 10.5px;
  letter-spacing: 0.16em;
  color: var(--text-muted);
}
.tl-progress-stat strong { font-size: 18px; font-weight: 600; }

/* Links */
.tl-link {
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  cursor: pointer;
  color: var(--accent-hover);
  text-decoration: none;
}
.tl-link:disabled { color: var(--text-faint); cursor: not-allowed; }
.tl-link:hover:not(:disabled) { text-decoration: underline; }
.tl-link--sm { font-size: 12px; }
.tl-link--muted { color: var(--text-muted); }
.tl-link--warning { color: #f6c577; }
.tl-link--danger { color: #ff8ea1; }
.tl-muted { color: var(--text-muted); }

.tl-skeleton, .tl-empty {
  padding: 28px;
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.025);
  text-align: center;
  color: var(--text-muted);
}
.tl-empty h2 { margin: 0 0 6px; color: var(--text-primary); font-size: 18px; }
.tl-empty p { margin: 0 0 16px; }

@media (max-width: 720px) {
  .tl-shell { padding: 22px 16px; }
  .tl-field-row { grid-template-columns: 1fr; }
  .tl-q-options { grid-template-columns: 1fr; }
}
</style>
