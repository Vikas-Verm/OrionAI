# Study & Learning Implementation Prompt

Date: 2026-08-05

## User Command

Read `/Users/apple/Downloads/Study & Learning.docx` completely and implement the Study & Learning module requirements from the document. Treat **starting a lesson** and **completing real learning work** differently, otherwise users can build fake streaks by repeatedly opening topics.

Follow-up corrections from the user:

1. When a user selects a goal such as DSA, starts studying, and then presses Back to Study Hub, the hub must keep DSA selected instead of resetting to the first created active goal.
2. A completed topic must be removed from the visible Today’s Study Plan tab.
3. Implement the missing Study & Learning features/endpoints from the DOCX, including consistency graph, material upload, search/filter goals/topics, learning memory, grounded doubt answers, and pre-topic review.

## Implemented Scope

- Study goals CRUD with archive support, selected-goal persistence, search, and progress stats.
- Study topics CRUD with archive support, duplicate prevention, search/filter by status/difficulty/text, tags, description, and bulk save for AI-suggested topics.
- Today’s plan generation with structured plan items and item states: `planned`, `started`, `completed`, `skipped`, and `moved`.
- Start-topic endpoint that records a topic/session item as started only.
- Completion endpoints that count real learning work only after completion of a topic, plan item, revision, practice answer, flashcard review, note creation, or pre-topic review.
- Completed, skipped, and moved plan items are hidden from the visible Today’s Study Plan while preserved in session history.
- Move-to-tomorrow behavior uses structured plan items and avoids duplicate future entries.
- Consistency graph and summary backed by `StudyActivity`, with timezone-aware date keys and idempotent activity keys.
- Material management endpoints for list/get/create/update/delete/archive, upload, retry processing, and recent materials in Study Hub.
- Upload validation for size/type, private local storage keys, public response sanitization, extraction for text/markdown/csv/PDF/DOCX/XLSX, and explicit failure states for unsupported extraction.
- Topic learning page material upload UI, processing status, retry, archive/delete, and material context selection for doubt answers.
- Lessons can incorporate notes, weak-memory entries, recent pre-topic review results, and selected material context.
- Topic doubt chat can answer with selected topic/goal/user-material context and returns source metadata.
- Practice answer checking records real activity and creates weak-area memory when an answer is wrong.
- Flashcard review records real activity and creates weak-area memory on weak status.
- Notes support source material links and pinned notes; note creation records real activity.
- Revision completion records real activity, supports result state, and weak revisions reschedule sooner.
- Learning memory endpoints list/remove/clear topic memory.
- Pre-topic review endpoints recommend/generate/answer/complete/skip a quick review before starting a topic, using prior topic notes, flashcards, practice, and lessons.
- Study Hub UI now includes goal search, topic filters, recent materials, consistency heatmap, quick pre-topic review modal, and selected-goal persistence.
- Topic Learning UI now includes material upload, material-grounded doubt context, learning memory review/removal, answer checking, and URL tab persistence.

## Important Rule

Opening a topic, viewing a lesson, uploading a file, or generating content is not completion. Streaks and completed minutes must be based only on explicit completed learning work or answered/reviewed/created study activity.

## Verification

- Backend syntax checks pass for changed Study & Learning models, services, controller, and routes.
- Frontend production build passes.
- Focused backend tests pass for study plan completion safety, consistency date/streak logic, material upload validation, and existing Study AI normalization.

## Follow-up Prompt: 2026-08-05

User reported enhancements and bugs:

1. Add an X button to close the **Quick Review** tab/modal.
2. Fix `Generate plan error: No matching document found for id "6a7313c5e0c61f54792894e8" version 29 modifiedPaths "plannedItems, plannedTopicIds, minutesPlanned"`.
3. Fix Add material file opening/upload flow.
4. Make the "OrionAI-generated lesson" in the Learn tab more accurate, detailed, and deep.
5. From now on, every user prompt must be added to `prompt.md`, along with the files updated.

Files updated for this follow-up:

- `frontend/src/views/StudyHubPage.vue`
- `frontend/src/views/TopicLearningPage.vue`
- `frontend/src/App.vue`
- `frontend/src/services/api.js`
- `backend/services/studyPlanService.js`
- `backend/services/studyAIService.js`
- `prompt.md`

## Matrix Follow-up Prompt: 2026-08-12

User reported that the WhatsApp and Signal Matrix connection issue still blocks
the release. Fix only the WhatsApp and Signal Matrix QR/connect/disconnect
flow, test it before final changes, and keep this handoff file updated.

### Changes Made

- `backend/services/bridgeProvisioningLogin.js`
  - Cancels active provisioning QR sessions through the official
    `/v3/login/cancel/{login_id}` API.
  - Aborts a running QR long-poll immediately during cancel/disconnect.
  - Uses a 60-second remote logout timeout and then confirms with `whoami`
    that all bridge logins are gone before reporting success.
- `backend/services/whatsappMatrixService.js`
  - Resumes `logging_in` or `pending_qr` states after a backend restart, so
    the page produces a fresh live QR instead of remaining stuck.
  - Refuses a fresh/forced connection if the old bridge account is still
    linked.
- `backend/services/signalMatrixService.js`
  - Applies the same restart recovery and verified fresh-connect behavior.
- `backend/routes/whatsappRoutes.js`
  - Removes an integration only after WhatsApp bridge logout is verified.
- `backend/routes/signalRoutes.js`
  - Removes an integration only after Signal bridge logout is verified.
- `backend/tests/bridgeProvisioningLogin.test.js`
  - Covers verified logout and fail-closed behavior.
- `backend/tests/whatsappMatrixService.test.js`
  - Covers restart-resumable WhatsApp QR states.
- `backend/tests/signalMatrixService.test.js`
  - Covers restart-resumable Signal QR states.

### Verification

- Matrix-focused backend suite: 73 passed, 0 failed.
- Syntax checks and `git diff --check` passed.
- Live isolated bridge probes confirmed both official QR start/cancel endpoints.
- A live persisted Signal `logging_in` record progressed to `pending_qr` with
  a QR image; the probe was cancelled without linking an account.
- Existing WhatsApp bridge session remained connected during the Signal probe.
