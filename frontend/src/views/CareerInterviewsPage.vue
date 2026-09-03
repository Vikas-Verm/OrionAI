<template>
  <div class="career-shell">
    <header class="career-header">
      <button class="career-back" type="button" @click="$emit('close')">
        <span aria-hidden="true">←</span>
        Back to Workspace Briefing
      </button>
      <div class="career-title-row">
        <div>
          <span class="career-kicker">Career Hub</span>
          <h1>Build your career, prepare for interviews, and stay on top of every opportunity.</h1>
        </div>
        <div class="career-actions">
          <button class="career-btn" type="button" @click="openApplicationForm()">
            + Add application
          </button>
          <button class="career-btn" type="button" @click="openInterviewForm()">
            + Add interview
          </button>
          <button
            class="career-btn"
            type="button"
            @click="
              activeTab = 'documents';
              documentType = 'resume';
            "
          >
            Upload resume
          </button>
          <button
            class="career-btn career-btn--primary"
            type="button"
            @click="openJobImportForm()"
          >
            Add job
          </button>
        </div>
      </div>

      <div class="career-metrics">
        <article>
          <span>Active applications</span>
          <strong>{{ overview.counts.activeApplications || 0 }}</strong>
        </article>
        <article>
          <span>Upcoming interviews</span>
          <strong>{{ overview.counts.upcomingInterviews || 0 }}</strong>
        </article>
        <article>
          <span>Follow-ups due</span>
          <strong>{{ overview.counts.followUpsDue || 0 }}</strong>
        </article>
        <article>
          <span>Current primary resume</span>
          <strong>{{ overview.primaryResume?.title || "None" }}</strong>
        </article>
      </div>
    </header>

    <transition name="career-notice">
      <p v-if="notice.text" class="career-notice" :class="{ error: notice.type === 'error' }">
        {{ notice.text }}
      </p>
    </transition>

    <nav class="career-tabs" aria-label="Career sections">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        :class="{ active: activeTab === tab.id }"
        @click="selectTab(tab.id)"
      >
        {{ tab.label }}
      </button>
    </nav>

    <main class="career-main">
      <section v-if="activeTab === 'overview'" class="career-panel">
        <div class="career-panel-head">
          <div>
            <h2>Overview</h2>
            <p>Current actions across applications, follow-ups, suggestions, and offers.</p>
          </div>
          <button class="career-btn career-btn--primary" type="button" @click="openJobImportForm()">
            Add job
          </button>
        </div>
        <div class="overview-grid">
          <article class="career-card">
            <h3>Suggested next action</h3>
            <p>{{ suggestedNextAction }}</p>
          </article>
          <article class="career-card">
            <h3>Follow-ups</h3>
            <p>{{ followUps.length ? `${followUps.length} due` : "You’re caught up." }}</p>
          </article>
          <article class="career-card">
            <h3>Gmail suggestions</h3>
            <p>{{ emailSignals.length ? `${emailSignals.length} ready to review` : "No high-confidence suggestions loaded." }}</p>
          </article>
        </div>
      </section>

      <section v-if="activeTab === 'applications'" class="career-panel">
        <div class="career-panel-head">
          <div>
            <h2>Applications</h2>
            <p>Track real opportunities, rounds, documents, and next actions.</p>
          </div>
          <button
            class="career-btn career-btn--primary"
            type="button"
            @click="openApplicationForm()"
          >
            Add Application
          </button>
        </div>

        <div v-if="loading" class="career-empty">Loading applications...</div>
        <div v-else-if="!applications.length" class="career-empty">
          <strong>Track your first opportunity.</strong>
          <p>No fake demo records here. Add a real application when you are ready.</p>
        </div>
        <div v-else class="application-table">
          <article v-for="app in applications" :key="app._id" class="application-row">
            <div>
              <h3>{{ app.company }}</h3>
              <p>{{ app.role }}</p>
              <small
                >{{ app.source || "Manual" }}
                <span v-if="app.location">· {{ app.location }}</span></small
              >
            </div>
            <span class="status-pill" :data-status="app.status">{{ statusLabel(app.status) }}</span>
            <div class="row-meta">
              <span>Applied {{ formatDate(app.appliedAt) || "not set" }}</span>
              <span>Follow-up {{ formatDate(app.nextFollowUpAt) || "not set" }}</span>
              <span>Resume {{ documentTitle(app.resumeId) || "not set" }}</span>
            </div>
            <div class="row-actions">
              <button type="button" @click="selectedApplication = app">Open</button>
              <button type="button" @click="openApplicationForm(app)">Edit</button>
              <select
                :value="app.status"
                @change="changeApplicationStatus(app, $event.target.value)"
              >
                <option v-for="status in applicationStatuses" :key="status" :value="status">
                  {{ statusLabel(status) }}
                </option>
              </select>
              <button type="button" @click="openInterviewForm({ application: app })">
                Add interview
              </button>
              <button type="button" @click="draftFollowUp(app)">Add follow-up</button>
              <button type="button" @click="prepareApplication(app)">Prepare interview</button>
              <button type="button" @click="openApplicationForm(app, 'notes')">Add notes</button>
              <button type="button" @click="archiveApplication(app)">Archive</button>
            </div>
          </article>
        </div>
      </section>

      <section v-if="activeTab === 'interviews'" class="career-panel">
        <div class="career-panel-head">
          <div>
            <h2>Upcoming Interviews</h2>
            <p>Manual entries plus reviewable Calendar interview events.</p>
          </div>
          <button class="career-btn career-btn--primary" type="button" @click="openInterviewForm()">
            Add Interview
          </button>
        </div>
        <div v-if="!interviews.length" class="career-empty">No interviews scheduled.</div>
        <div v-else class="career-card-grid">
          <article v-for="interview in interviews" :key="interview._id" class="career-card">
            <div class="card-topline">
              <span class="status-pill" :data-status="interview.prepStatus">{{
                prepLabel(interview.prepStatus)
              }}</span>
              <span>{{ formatDateTime(interview.scheduledAt) }}</span>
            </div>
            <h3>{{ interview.company }}</h3>
            <p>{{ interview.role || "Role not linked" }}</p>
            <p>{{ roundLabel(interview.roundType) }} · {{ interview.durationMinutes || 60 }} min</p>
            <div class="row-actions">
              <button type="button" @click="prepareInterview(interview)">Prepare Interview</button>
              <button type="button" @click="startPractice(interview)">Practice Interview</button>
              <button
                v-if="interview.meetingUrl"
                type="button"
                @click="openExternal(interview.meetingUrl)"
              >
                Meeting link
              </button>
              <button type="button" @click="openInterviewForm({ interview })">Edit</button>
            </div>
          </article>
        </div>

        <div v-if="calendarSuggestions.length" class="career-subsection">
          <h3>Calendar interview events</h3>
          <p>Review before linking. OrionAI will not modify Calendar.</p>
          <article v-for="event in calendarSuggestions" :key="event.id" class="calendar-suggestion">
            <div>
              <strong>{{ event.title }}</strong>
              <span>{{ formatDateTime(event.scheduledAt) }}</span>
            </div>
            <select v-model="calendarLinks[event.id]">
              <option value="">Link to application...</option>
              <option v-for="app in applications" :key="app._id" :value="app._id">
                {{ app.company }} - {{ app.role }}
              </option>
            </select>
            <button type="button" @click="saveCalendarInterview(event)">Add interview</button>
          </article>
        </div>
      </section>

      <section v-if="activeTab === 'documents'" class="career-panel">
        <div class="career-panel-head">
          <div>
            <h2>Resume &amp; Documents</h2>
            <p>Private owner-scoped documents for preparation and matching.</p>
          </div>
        </div>
        <form class="inline-form" @submit.prevent="uploadDocument">
          <select v-model="documentType">
            <option value="resume">Resume</option>
            <option value="job_description">Job description</option>
            <option value="cover_letter">Cover letter</option>
            <option value="assignment">Assignment</option>
            <option value="offer_letter">Offer letter</option>
            <option value="interview_notes">Interview notes</option>
            <option value="other">Other</option>
          </select>
          <input v-model="uploadDocumentTitle" placeholder="Title optional" />
          <label class="file-input">
            <input
              type="file"
              accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              @change="onFileChange"
            />
            <span>{{ selectedFile?.name || "Choose PDF, DOCX, or TXT" }}</span>
          </label>
          <label class="check-row">
            <input v-model="makePrimary" type="checkbox" :disabled="documentType !== 'resume'" />
            Primary resume
          </label>
          <button class="career-btn career-btn--primary" type="submit" :disabled="uploading">
            {{ uploading ? "Uploading..." : "Upload" }}
          </button>
        </form>
        <div v-if="uploading" class="career-progress">
          <span :style="{ width: `${uploadProgress}%` }"></span>
        </div>
        <div class="drive-attach">
          <button
            class="career-btn"
            type="button"
            :disabled="driveLoading"
            @click="toggleDrivePanel"
          >
            {{ drivePanelOpen ? "Hide Google Drive" : "Add from Google Drive" }}
          </button>
          <div v-if="drivePanelOpen" class="drive-panel">
            <form class="inline-form drive-form" @submit.prevent="loadDriveFiles">
              <input v-model="driveQuery" placeholder="Search Drive files" />
              <select v-model="driveDocumentType">
                <option value="resume">Resume</option>
                <option value="job_description">Job description</option>
                <option value="cover_letter">Cover letter</option>
                <option value="assignment">Assignment</option>
                <option value="offer_letter">Offer letter</option>
                <option value="interview_notes">Interview notes</option>
                <option value="other">Other</option>
              </select>
              <button class="career-btn" type="submit" :disabled="driveLoading">
                {{ driveLoading ? "Loading Drive..." : "Search" }}
              </button>
            </form>
            <div v-if="driveError" class="career-empty error">{{ driveError }}</div>
            <div v-else-if="driveLoading" class="career-empty">Loading Google Drive files...</div>
            <div v-else-if="!driveFiles.length" class="career-empty">
              No suitable Drive files found.
            </div>
            <article v-for="file in driveFiles" :key="file.id" class="drive-file">
              <div>
                <strong>{{ file.name }}</strong>
                <small
                  >{{ fileLabel(file) }}
                  <span v-if="file.modifiedTime">· {{ formatDate(file.modifiedTime) }}</span></small
                >
              </div>
              <button
                type="button"
                :disabled="attachingDriveId === file.id || !file.supported"
                @click="attachDriveFile(file)"
              >
                {{ attachingDriveId === file.id ? "Attaching..." : "Attach" }}
              </button>
            </article>
          </div>
        </div>
        <div v-if="!documents.length" class="career-empty">
          <strong>Upload a resume to unlock resume-based interview preparation.</strong>
        </div>
        <div v-else class="career-card-grid">
          <article v-for="doc in documents" :key="doc._id" class="career-card">
            <div class="card-topline">
              <span class="status-pill">{{ typeLabel(doc.type) }}</span>
              <span class="status-pill" :data-status="doc.processingStatus">
                {{ doc.type === "resume" ? "Resume status" : "Status" }}:
                {{ documentStatusLabel(doc) }}
              </span>
            </div>
            <h3>{{ doc.title }}</h3>
            <p>{{ doc.originalFileName || "Manual document" }}</p>
            <p v-if="doc.processingStatus === 'failed'">
              {{ doc.processingError || "OrionAI could not read this file yet." }}
            </p>
            <p v-if="doc.isPrimary">Primary resume</p>
            <div class="row-actions">
              <button v-if="doc.canOpenFile" type="button" @click="openDocument(doc)">Open</button>
              <button v-else-if="doc.sourceUrl" type="button" @click="openExternal(doc.sourceUrl)">
                Open source
              </button>
              <button
                v-if="doc.type === 'resume' && !doc.isPrimary"
                type="button"
                @click="setPrimaryResume(doc)"
              >
                Use primary
              </button>
              <button type="button" @click="renameDocument(doc)">Rename</button>
              <button type="button" @click="deleteDocument(doc)">Archive</button>
            </div>
          </article>
        </div>
      </section>

      <section v-if="activeTab === 'resume-match'" class="career-panel career-section-stack" data-career-workspace="resume-match">
        <div class="career-panel-head">
          <div>
            <h2>Resume Match</h2>
            <p>Compare your real resume with a job description and see what to strengthen.</p>
          </div>
        </div>

        <div class="match-workflow">
          <section class="match-step">
            <span class="step-number">1</span>
            <div class="match-step__body">
              <label class="field-label">
                <span>Resume</span>
                <select v-model="matchResumeId" @change="clearMatchResult">
                  <option value="">Select a resume...</option>
                  <option v-for="doc in resumes" :key="doc._id" :value="doc._id">
                    {{ doc.title }}{{ doc.isPrimary ? " · Primary resume" : "" }} · {{ documentStatusLabel(doc) }}
                  </option>
                </select>
              </label>
              <p v-if="selectedMatchResume" class="match-meta">
                {{ selectedMatchResume.isPrimary ? "Primary resume · " : "" }}{{ documentStatusLabel(selectedMatchResume) }}
              </p>
              <div v-if="selectedMatchResume?.processingStatus === 'failed'" class="career-inline-note error">
                OrionAI couldn't read this resume. Try another file or upload it again.
                <button class="career-btn" type="button" @click="openDocumentsForResume">Upload resume</button>
              </div>
            </div>
          </section>

          <section class="match-step">
            <span class="step-number">2</span>
            <div class="match-step__body">
              <label class="field-label">
                <span>Application / Job description</span>
                <select v-model="matchApplicationId" @change="onMatchApplicationChange">
                  <option value="">Select an application...</option>
                  <option v-for="app in applications" :key="app._id" :value="app._id">
                    {{ app.company }} — {{ app.role }}
                  </option>
                </select>
              </label>
              <dl v-if="selectedMatchApplication" class="match-metadata">
                <div><dt>Company</dt><dd>{{ selectedMatchApplication.company }}</dd></div>
                <div><dt>Role</dt><dd>{{ selectedMatchApplication.role }}</dd></div>
                <div><dt>JD source</dt><dd>{{ selectedMatchJobDescription?.sourceApp ? statusLabel(selectedMatchJobDescription.sourceApp) : "Not linked" }}</dd></div>
                <div><dt>JD status</dt><dd>{{ selectedMatchJobDescription ? documentStatusLabel(selectedMatchJobDescription) : "Missing" }}</dd></div>
              </dl>
              <div v-if="selectedMatchApplication && !selectedMatchJobDescription" class="career-inline-note">
                <span>Add a job description to run Resume Match.</span>
                <button class="career-btn" type="button" @click="openJobDescriptionForMatch">Add Job Description</button>
              </div>
            </div>
          </section>

          <section class="match-step">
            <span class="step-number">3</span>
            <div class="match-step__body match-run">
              <button
                class="career-btn career-btn--primary"
                type="button"
                :disabled="!canRunResumeMatch"
                @click="runResumeMatch"
              >
                {{ matching ? "Analyzing resume and job description…" : "Run Resume Match" }}
              </button>
              <p v-if="matchDisabledReason" class="match-meta">{{ matchDisabledReason }}</p>
            </div>
          </section>
        </div>

        <div v-if="matching" class="career-loading" role="status">
          <span class="career-spinner" aria-hidden="true"></span>
          Analyzing resume and job description…
        </div>
        <div v-else-if="!matchResult" class="career-empty career-empty--compact">
          {{ canRunResumeMatch
            ? "Ready to compare the selected resume and job description."
            : "Select a ready resume and an application with a readable job description." }}
        </div>
        <div v-else class="match-results career-section-stack">
          <section class="match-summary">
            <span class="career-kicker">Match summary</span>
            <p>{{ matchResult.summary }}</p>
          </section>

          <section class="result-section">
            <div class="result-section__head"><h3>Strong Matches</h3><span>{{ matchResult.strongMatches?.length || 0 }}</span></div>
            <div class="result-list">
              <article v-for="(item, index) in visibleMatchItems('strongMatches')" :key="`${item.requirement}-${index}`" class="evidence-card">
                <h4>{{ item.requirement }}</h4>
                <div class="evidence-line"><span class="source-badge source-badge--jd">JD</span><p>{{ item.requirement }}</p></div>
                <div class="evidence-line"><span class="source-badge source-badge--resume">Resume</span><p>{{ item.resumeEvidence }}</p></div>
                <div class="evidence-line"><span class="source-badge source-badge--orion">OrionAI</span><p>{{ item.explanation }}</p></div>
              </article>
            </div>
            <button v-if="hasHiddenMatchItems('strongMatches')" class="text-action" type="button" @click="toggleMatchSection('strongMatches')">{{ matchExpanded.strongMatches ? "Show less" : "Show all" }}</button>
          </section>

          <section class="result-section">
            <div class="result-section__head"><h3>Partial Matches</h3><span>{{ matchResult.partialMatches?.length || 0 }}</span></div>
            <div class="result-list">
              <article v-for="(item, index) in visibleMatchItems('partialMatches')" :key="`${item.requirement}-${index}`" class="evidence-card">
                <h4>{{ item.requirement }}</h4>
                <div class="evidence-line"><span class="source-badge source-badge--jd">JD</span><p>{{ item.requirement }}</p></div>
                <div class="evidence-line"><span class="source-badge source-badge--resume">Resume</span><p>{{ item.resumeEvidence || "Related evidence is limited." }}</p></div>
                <div class="evidence-line"><span class="source-badge source-badge--orion">OrionAI</span><p>{{ item.missingEvidence }} {{ item.suggestion }}</p></div>
              </article>
            </div>
            <button v-if="hasHiddenMatchItems('partialMatches')" class="text-action" type="button" @click="toggleMatchSection('partialMatches')">{{ matchExpanded.partialMatches ? "Show less" : "Show all" }}</button>
          </section>

          <section class="result-section">
            <div class="result-section__head"><h3>Missing Evidence</h3><span>{{ matchResult.missingEvidence?.length || 0 }}</span></div>
            <div class="result-list">
              <article v-for="(item, index) in visibleMatchItems('missingEvidence')" :key="`${item.requirement}-${index}`" class="evidence-card">
                <h4>{{ item.requirement }}</h4>
                <div class="evidence-line"><span class="source-badge source-badge--jd">JD</span><p>{{ item.requirement }}</p></div>
                <div class="evidence-line"><span class="source-badge source-badge--resume">Resume</span><p>{{ item.resumeEvidence || "No clear evidence found." }}</p></div>
                <div class="evidence-line"><span class="source-badge source-badge--orion">OrionAI</span><p>{{ item.suggestion }}</p></div>
              </article>
            </div>
            <button v-if="hasHiddenMatchItems('missingEvidence')" class="text-action" type="button" @click="toggleMatchSection('missingEvidence')">{{ matchExpanded.missingEvidence ? "Show less" : "Show all" }}</button>
          </section>

          <section v-if="matchResult.interviewRiskAreas?.length" class="result-section">
            <div class="result-section__head"><h3>Interview Risk Areas</h3><span>{{ matchResult.interviewRiskAreas.length }}</span></div>
            <div class="result-list result-list--compact">
              <article v-for="(item, index) in visibleMatchItems('interviewRiskAreas')" :key="`${item.area}-${index}`" class="risk-item">
                <div><span class="source-badge source-badge--orion">OrionAI</span><strong>{{ item.area }}</strong></div>
                <p>{{ item.reason }}</p><small>{{ item.preparationSuggestion }}</small>
              </article>
            </div>
            <button v-if="hasHiddenMatchItems('interviewRiskAreas')" class="text-action" type="button" @click="toggleMatchSection('interviewRiskAreas')">{{ matchExpanded.interviewRiskAreas ? "Show less" : "Show all" }}</button>
          </section>

          <section v-if="matchResult.suggestedImprovements?.length" class="result-section">
            <div class="result-section__head"><h3>Suggested Resume Improvements</h3></div>
            <ol class="suggestion-list">
              <li v-for="(item, index) in visibleMatchItems('suggestedImprovements')" :key="`${item}-${index}`"><span class="source-badge source-badge--orion">OrionAI</span><span>{{ item }}</span></li>
            </ol>
            <button v-if="hasHiddenMatchItems('suggestedImprovements')" class="text-action" type="button" @click="toggleMatchSection('suggestedImprovements')">{{ matchExpanded.suggestedImprovements ? "Show less" : "Show all" }}</button>
          </section>
        </div>
      </section>

      <section v-if="activeTab === 'practice'" class="career-panel career-section-stack">
        <div class="career-panel-head">
          <div>
            <span class="career-kicker">Preparing for</span>
            <h2>{{ prepContext.title || "Interview Preparation" }}</h2>
            <p>
              {{
                prepContext.subtitle ||
                "Grounded in saved applications, resume, JD, notes, and the selected round."
              }}
            </p>
          </div>
          <div v-if="selectedPrepApplication || selectedPrepInterview" class="career-action-group">
            <button class="career-btn career-btn--primary" type="button" :disabled="preparing" @click="generateInterviewPrep">
              {{ prepResult ? "Refresh preparation" : "Generate Interview Prep" }}
            </button>
          </div>
        </div>
        <div class="prep-source-notes">
          <p v-if="(selectedPrepApplication || selectedPrepInterview) && !selectedPrepResume" class="career-inline-note">Select or upload a resume for resume-based preparation.</p>
          <p v-if="(selectedPrepApplication || selectedPrepInterview) && !selectedPrepJobDescription" class="career-inline-note">Add the job description for role-specific preparation. Generated output will be labeled as General OrionAI preparation.</p>
          <p v-if="prepIsStale" class="career-inline-note warning">Preparation may be outdated because your source information changed.</p>
        </div>
        <div v-if="preparing" class="career-loading" role="status"><span class="career-spinner" aria-hidden="true"></span>Generating interview preparation…</div>
        <div v-else-if="!prepResult" class="career-empty">
          <strong>Prepare</strong>
          <p>Choose an application or interview, then generate a grounded preparation plan.</p>
        </div>
        <div v-else class="prep-results career-section-stack">
          <div class="prep-results__title"><div><span class="career-kicker">Your interview prep</span><h2>Interview Preparation</h2></div><span v-if="!selectedPrepJobDescription" class="source-badge source-badge--orion">General OrionAI preparation</span></div>
          <section class="prep-output-section"><h3>Role snapshot</h3><p>{{ prepResult.roleSummary }}</p></section>
          <section v-if="prepResult.priorityTopics?.length" class="prep-output-section"><h3>Focus first</h3><ol class="focus-list"><li v-for="item in prepResult.priorityTopics.slice(0, 5)" :key="item.topic"><strong>{{ item.topic }}</strong><span>{{ item.reason }}</span><small>{{ item.priority }} priority · {{ item.source }}</small></li></ol></section>
          <section v-if="prepResult.resumeQuestions?.length" class="prep-output-section"><h3>Questions from your resume</h3><div class="question-list"><article v-for="item in prepResult.resumeQuestions" :key="item.question"><p>{{ item.question }}</p><small><span class="source-badge source-badge--resume">Resume</span> Why OrionAI may ask this: {{ item.resumeBasis }}</small></article></div></section>
          <section v-if="prepResult.jdQuestions?.length" class="prep-output-section"><h3>Questions from the JD</h3><div class="question-list"><article v-for="item in prepResult.jdQuestions" :key="item.question"><p>{{ item.question }}</p><small><span class="source-badge source-badge--jd">JD</span> {{ item.jdBasis }}</small></article></div></section>
          <section v-if="prepResult.behavioralQuestions?.length" class="prep-output-section"><h3>Behavioral questions</h3><ul class="plain-list"><li v-for="item in prepResult.behavioralQuestions" :key="item">{{ item }}</li></ul></section>
          <section v-if="prepResult.likelyDeepDiveAreas?.length" class="prep-output-section"><h3>Likely deep-dive areas</h3><div class="question-list"><article v-for="item in prepResult.likelyDeepDiveAreas" :key="item.area"><p>{{ item.area }}</p><small><span class="source-badge source-badge--jd">JD</span> {{ item.reason }}</small></article></div></section>
          <section v-if="prepResult.weakAreasToReview?.length" class="prep-output-section"><h3>Weak areas from previous practice</h3><div class="question-list"><article v-for="item in prepResult.weakAreasToReview" :key="item.area"><p>{{ item.area }}</p><small><span class="source-badge source-badge--memory">Memory</span> {{ item.reason }}</small></article></div></section>
          <section v-if="prepResult.questionsForInterviewer?.length" class="prep-output-section"><h3>Questions to ask the interviewer</h3><ul class="plain-list"><li v-for="item in prepResult.questionsForInterviewer" :key="item">{{ item }}</li></ul></section>
          <section v-if="prepResult.preparationPlan?.length" class="prep-output-section"><h3>Preparation checklist</h3><ul class="checklist"><li v-for="item in prepResult.preparationPlan" :key="item"><span class="check-box" aria-hidden="true"></span>{{ item }}</li></ul></section>
        </div>

        <div class="career-memory">
          <button class="career-btn" type="button" @click="toggleMemory">
            {{ memoryExpanded ? "Hide Career Memory" : "Career Memory" }}
          </button>
          <div v-if="memoryExpanded" class="memory-panel">
            <div class="memory-toolbar">
              <select v-model="memoryApplicationId" @change="loadMemory">
                <option value="">All Career memory</option>
                <option v-for="app in applications" :key="app._id" :value="app._id">
                  {{ app.company }} - {{ app.role }}
                </option>
              </select>
              <button
                class="career-btn"
                type="button"
                :disabled="memoryLoading"
                @click="loadMemory"
              >
                {{ memoryLoading ? "Loading..." : "Refresh" }}
              </button>
              <button
                v-if="memoryApplicationId"
                class="career-btn"
                type="button"
                @click="clearSelectedApplicationMemory"
              >
                Clear application memory
              </button>
              <button class="career-btn" type="button" @click="clearAllMemory">
                Clear Career memory
              </button>
            </div>
            <div v-if="memoryLoading" class="career-empty">Loading Career memory...</div>
            <div v-else-if="!careerMemory.length" class="career-empty">
              No Career memory saved yet.
            </div>
            <article v-for="memory in careerMemory" :key="memory._id" class="memory-row">
              <div>
                <strong>{{ memory.title }}</strong>
                <p>{{ memory.content || "Structured summary only." }}</p>
                <small
                  >{{ typeLabel(memory.memoryType) }} · {{ memory.sourceType || "other" }} ·
                  {{ formatDate(memory.createdAt) }}</small
                >
              </div>
              <button type="button" @click="deleteMemory(memory)">Delete</button>
            </article>
          </div>
        </div>
      </section>

      <section v-if="activeTab === 'practice'" class="career-panel career-section-stack">
        <div class="career-panel-head">
          <div>
            <h2>Practice Interview</h2>
            <p>One question at a time, with feedback that keeps your real experience intact.</p>
          </div>
          <button v-if="selectedPrepInterview && !practiceSession" class="career-btn career-btn--primary" type="button" @click="startPractice(selectedPrepInterview)">{{ practiceStartLabel }}</button>
        </div>
        <div v-if="!practiceSession" class="career-empty">
          {{ selectedPrepInterview ? "Start when you are ready to answer one question at a time." : "Select an interview to start contextual practice." }}
        </div>
        <div v-else class="practice-box">
          <span class="career-kicker">Question {{ practiceQuestionIndex + 1 }}</span>
          <strong>{{ currentPracticeQuestion?.question }}</strong>
          <textarea v-if="!currentPracticeQuestion?.answeredAt" v-model="practiceAnswer" placeholder="Answer with your real experience"></textarea>
          <div v-if="!currentPracticeQuestion?.answeredAt" class="career-action-group">
            <button class="career-btn career-btn--primary" type="button" :disabled="practiceSubmitting || !practiceAnswer.trim()" @click="submitPracticeAnswer">{{ practiceSubmitting ? "Saving…" : "Submit Answer" }}</button>
            <button class="career-btn" type="button" :disabled="practiceSubmitting" @click="skipPracticeQuestion">Skip</button>
          </div>
          <div v-if="hasPracticeFeedback" class="feedback-box">
            <h3>What was good</h3>
            <p v-for="item in currentPracticeQuestion.feedback.good || []" :key="item">
              {{ item }}
            </p>
            <h3>What was missing</h3>
            <p v-for="item in currentPracticeQuestion.feedback.missing || []" :key="item">
              {{ item }}
            </p>
            <h3>Better structure</h3>
            <p>{{ currentPracticeQuestion.feedback.betterStructure }}</p>
            <h3>Suggested stronger answer</h3>
            <p>{{ currentPracticeQuestion.feedback.suggestedStrongerAnswer }}</p>
            <button v-if="hasNextPracticeQuestion" class="career-btn career-btn--primary" type="button" @click="showNextPracticeQuestion">Next Question</button>
          </div>
        </div>
      </section>

      <section v-if="activeTab === 'overview'" class="career-panel">
        <div class="career-panel-head">
          <div>
            <h2>HR Follow-ups</h2>
            <p>Draft only. OrionAI never auto-sends.</p>
          </div>
        </div>
        <div v-if="!followUps.length" class="career-empty">You’re caught up.</div>
        <article v-for="item in followUps" :key="item.id" class="followup-card">
          <div>
            <h3>{{ item.company }}</h3>
            <p>{{ item.role }} · {{ item.why }}</p>
            <small>Due {{ formatDate(item.dueDate) }}</small>
          </div>
          <div class="row-actions">
            <button type="button" @click="draftFollowUp(item.application)">Draft Follow-up</button>
            <button
              v-if="item.application?.sourceApp === 'gmail' && item.application?.sourceRef"
              type="button"
              @click="openEmail(item.application.sourceRef)"
            >
              Open Email
            </button>
            <button type="button" @click="snoozeFollowUp(item.applicationId)">Snooze</button>
            <button type="button" @click="markFollowUpHandled(item.applicationId)">
              Mark handled
            </button>
          </div>
        </article>
      </section>

      <section v-if="activeTab === 'overview'" class="career-panel">
        <div class="career-panel-head">
          <div>
            <h2>Career Suggestions</h2>
            <p>Likely career-related Gmail signals. Review before saving.</p>
          </div>
          <button class="career-btn" type="button" @click="loadEmailSignals">
            Refresh Gmail signals
          </button>
        </div>
        <div v-if="emailSignalLoading" class="career-empty">Checking Gmail career signals...</div>
        <div v-else-if="!emailSignals.length" class="career-empty">
          {{
            emailConnected === false
              ? "Gmail is not connected."
              : "No high-confidence career suggestions found."
          }}
        </div>
        <article v-for="signal in emailSignals" :key="signal.gmailMessageId" class="signal-card">
          <div>
            <strong
              >Possible {{ categoryLabel(signal.category) }} email{{
                signal.companyHint ? ` from ${signal.companyHint}` : ""
              }}</strong
            >
            <p>{{ signal.subject }}</p>
            <small>{{ signal.evidence?.[1] || signal.snippet }}</small>
          </div>
          <select v-model="signalLinks[signal.gmailMessageId]">
            <option value="">Create new application on accept</option>
            <option v-for="app in applications" :key="app._id" :value="app._id">
              {{ app.company }} - {{ app.role }}
            </option>
          </select>
          <div class="row-actions">
            <button type="button" @click="openEmail(signal.gmailMessageId)">Open Email</button>
            <button type="button" @click="acceptSignal(signal)">Review &amp; Add</button>
            <button type="button" @click="ignoreSignal(signal)">Ignore</button>
          </div>
        </article>
      </section>

      <section v-if="activeTab === 'overview'" class="career-panel">
        <div class="career-panel-head">
          <div>
            <h2>Offer Discussions</h2>
            <p>Track entered offer details and draft emails without legal/payroll advice.</p>
          </div>
        </div>
        <form class="inline-form" @submit.prevent="createOffer">
          <select v-model="offerForm.applicationId" @change="hydrateOfferFromApplication">
            <option value="">Standalone offer...</option>
            <option v-for="app in applications" :key="app._id" :value="app._id">
              {{ app.company }} - {{ app.role }}
            </option>
          </select>
          <input v-model="offerForm.company" placeholder="Company" />
          <input v-model="offerForm.role" placeholder="Role" />
          <input v-model="offerForm.compensationText" placeholder="Compensation text as entered" />
          <OrionDatePicker
            v-model="offerForm.deadline"
            label="Offer deadline (optional)"
            placeholder="Select offer deadline"
          />
          <textarea v-model="offerForm.notes" placeholder="Notes"></textarea>
          <button class="career-btn career-btn--primary" type="submit">Add offer</button>
        </form>
        <div v-if="!offers.length" class="career-empty">No offers tracked.</div>
        <article v-for="offer in offers" :key="offer._id" class="followup-card">
          <div>
            <h3>{{ offer.company }}</h3>
            <p>{{ offer.role }} · {{ offer.status }}</p>
            <small
              >{{ offer.compensationText || "No compensation text entered" }}
              <span v-if="offer.deadline">· Deadline {{ formatDate(offer.deadline) }}</span></small
            >
          </div>
          <div class="row-actions">
            <button v-if="offer.offerDocumentId" type="button" @click="openOfferDocument(offer)">
              Open document
            </button>
            <button type="button" @click="draftOfferEmail(offer, 'clarification')">
              Draft clarification email
            </button>
            <button type="button" @click="draftOfferEmail(offer, 'negotiation')">
              Draft negotiation email
            </button>
          </div>
        </article>
      </section>
    </main>

    <aside v-if="selectedApplication || draftText" class="career-drawer">
      <button
        class="drawer-close"
        type="button"
        @click="
          selectedApplication = null;
          draftText = '';
        "
      >
        ×
      </button>
      <template v-if="draftText">
        <h2>Draft</h2>
        <textarea v-model="draftText"></textarea>
        <p>Review and send yourself. OrionAI will not auto-send.</p>
      </template>
      <template v-else-if="selectedApplication">
        <h2>{{ selectedApplication.company }}</h2>
        <p>{{ selectedApplication.role }} · {{ statusLabel(selectedApplication.status) }}</p>
        <dl class="detail-list">
          <dt>Suggested next action</dt>
          <dd>{{ suggestedActionForApplication(selectedApplication) }}</dd>
          <dt>Job description</dt>
          <dd>{{ documentTitle(selectedApplication.jobDescriptionId) || "No JD attached." }}</dd>
          <dt>Resume</dt>
          <dd>{{ documentTitle(selectedApplication.resumeId) || overview.primaryResume?.title || "No resume selected." }}</dd>
          <dt>Upcoming interview</dt>
          <dd>{{ upcomingForApplication(selectedApplication._id) || "None scheduled." }}</dd>
          <dt>Follow-up</dt>
          <dd>{{ formatDate(selectedApplication.nextFollowUpAt) || "No follow-up set." }}</dd>
          <dt>Notes</dt>
          <dd>{{ selectedApplication.notes || "No notes yet." }}</dd>
        </dl>
        <div class="row-actions">
          <button type="button" @click="prepareApplication(selectedApplication)">Prepare</button>
          <button
            type="button"
            :disabled="!selectedApplication.jobDescriptionId"
            @click="runResumeMatchForApplication(selectedApplication)"
          >
            Resume Match
          </button>
          <button type="button" @click="openInterviewForm({ application: selectedApplication })">
            Add interview
          </button>
        </div>
        <div v-if="selectedApplicationIntelligence" class="job-intelligence">
          <h3>OrionAI Job Intelligence</h3>
          <p><strong>Your strongest matches</strong></p>
          <p>{{ selectedApplicationIntelligence.strongest }}</p>
          <p><strong>Skills this role emphasizes</strong></p>
          <p>{{ selectedApplicationIntelligence.skills }}</p>
          <p><strong>Missing evidence in your resume</strong></p>
          <p>{{ selectedApplicationIntelligence.gaps }}</p>
          <p><strong>What they may ask you</strong></p>
          <p>{{ selectedApplicationIntelligence.questions }}</p>
          <p><strong>What to prepare first</strong></p>
          <p>{{ selectedApplicationIntelligence.prepare }}</p>
          <p><strong>Suggested resume improvements</strong></p>
          <p>{{ selectedApplicationIntelligence.improvements }}</p>
          <p><strong>Questions you should ask</strong></p>
          <p>{{ selectedApplicationIntelligence.ask }}</p>
        </div>
      </template>
    </aside>

    <div v-if="formMode" class="modal-backdrop" @click.self="closeForm">
      <form class="career-modal" @submit.prevent="saveForm">
        <h2>
          {{
            formMode === "application"
              ? "Application"
              : formMode === "interview"
              ? "Interview"
              : formMode === "chooseInterview"
              ? "Select Interview"
              : formMode === "jobImport"
              ? "Add a job"
              : formMode === "renameDocument"
              ? "Rename Document"
              : "Job Description"
          }}
        </h2>
        <template v-if="formMode === 'application'">
          <input v-model="applicationForm.company" placeholder="Company" required />
          <input v-model="applicationForm.role" placeholder="Role" required />
          <select v-model="applicationForm.status">
            <option v-for="status in applicationStatuses" :key="status" :value="status">
              {{ statusLabel(status) }}
            </option>
          </select>
          <input v-model="applicationForm.sourceUrl" placeholder="Job URL optional" />
          <input v-model="applicationForm.location" placeholder="Location optional" />
          <select v-model="applicationForm.workMode">
            <option value="">Work mode optional</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">Onsite</option>
          </select>
          <OrionDatePicker
            v-if="applicationForm.status !== 'interested'"
            v-model="applicationForm.appliedAt"
            label="Applied date"
            placeholder="Select applied date"
          />
          <OrionDatePicker
            v-model="applicationForm.nextFollowUpAt"
            label="Follow-up date (optional)"
            placeholder="Select follow-up date"
          />
          <select v-model="applicationForm.resumeId">
            <option value="">Resume optional</option>
            <option v-for="doc in resumes" :key="doc._id" :value="doc._id">{{ doc.title }}</option>
          </select>
          <select v-model="applicationForm.jobDescriptionId">
            <option value="">Job description optional</option>
            <option v-for="doc in jobDescriptions" :key="doc._id" :value="doc._id">
              {{ doc.title }}
            </option>
          </select>
          <textarea v-model="applicationForm.notes" placeholder="Notes"></textarea>
        </template>
        <template v-else-if="formMode === 'interview'">
          <select v-model="interviewForm.applicationId" @change="hydrateInterviewFromApplication">
            <option value="">No application link</option>
            <option v-for="app in applications" :key="app._id" :value="app._id">
              {{ app.company }} - {{ app.role }}
            </option>
          </select>
          <input v-model="interviewForm.company" placeholder="Company" required />
          <input v-model="interviewForm.role" placeholder="Role" />
          <OrionDatePicker
            v-model="interviewForm.scheduledAt"
            label="Interview date and time"
            placeholder="Select interview date"
            with-time
          />
          <input v-model.number="interviewForm.durationMinutes" type="number" min="1" max="1440" />
          <select v-model="interviewForm.roundType">
            <option value="">Round type unknown</option>
            <option v-for="round in roundTypes" :key="round" :value="round">
              {{ roundLabel(round) }}
            </option>
          </select>
          <input v-model="interviewForm.meetingUrl" placeholder="Meeting URL optional" />
          <input v-model="interviewForm.location" placeholder="Location optional" />
          <textarea v-model="interviewForm.notes" placeholder="Notes"></textarea>
        </template>
        <template v-else-if="formMode === 'chooseInterview'">
          <p>Choose the interview to prepare for, or prepare for the role without a scheduled round.</p>
          <article
            v-for="interview in prepInterviewChoices"
            :key="interview._id"
            class="choice-row"
          >
            <div>
              <strong>{{ roundLabel(interview.roundType) || "Interview" }}</strong>
              <p>{{ formatDateTime(interview.scheduledAt) }}</p>
            </div>
            <button class="career-btn" type="button" @click="prepareInterview(interview)">
              Prepare this interview
            </button>
          </article>
          <button
            class="career-btn career-btn--primary"
            type="button"
            @click="prepareRole(prepApplicationForChoice)"
          >
            Prepare for this role
          </button>
        </template>
        <template v-else-if="formMode === 'jobImport'">
          <template v-if="!jobImport.review">
            <label class="field-label">
              <span>Paste job link</span>
              <input v-model="jobImport.url" placeholder="https://..." />
            </label>
            <div class="modal-actions">
              <button
                class="career-btn career-btn--primary"
                type="button"
                :disabled="jobImport.loading || !jobImport.url"
                @click="importJob"
              >
                {{ jobImport.loading ? "Importing..." : "Import with OrionAI" }}
              </button>
              <button class="career-btn career-btn--ghost" type="button" @click="switchJobImportToManual">
                Enter manually
              </button>
            </div>
            <p v-if="jobImport.error" class="career-empty error">{{ jobImport.error }}</p>
          </template>
          <template v-else>
            <h3>Review imported job</h3>
            <input v-model="jobImport.review.company" placeholder="Company" required />
            <input v-model="jobImport.review.role" placeholder="Role" required />
            <input v-model="jobImport.review.location" placeholder="Location" />
            <select v-model="jobImport.review.workMode">
              <option value="unknown">Work mode not found</option>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
              <option value="onsite">Onsite</option>
            </select>
            <input v-model="jobImport.review.employmentType" placeholder="Employment type" />
            <input v-model="jobImport.review.salaryText" placeholder="Salary text" />
            <select v-model="jobImport.status">
              <option v-for="status in applicationStatuses" :key="status" :value="status">
                {{ statusLabel(status) }}
              </option>
            </select>
            <OrionDatePicker
              v-if="jobImport.status === 'applied'"
              v-model="jobImport.appliedAt"
              label="Applied date"
              placeholder="Select applied date"
            />
            <OrionDatePicker
              v-model="jobImport.nextFollowUpAt"
              label="Follow-up date (optional)"
              placeholder="Select follow-up date"
            />
            <select v-model="jobImport.resumeId">
              <option value="">Resume optional</option>
              <option v-for="doc in resumes" :key="doc._id" :value="doc._id">{{ doc.title }}</option>
            </select>
            <textarea v-model="jobImport.review.jobDescriptionText" placeholder="Job description"></textarea>
            <p v-if="jobImport.review.skills?.length" class="chip-row">
              <span v-for="skill in jobImport.review.skills" :key="skill">{{ skill }}</span>
            </p>
            <textarea v-model="jobImport.notes" placeholder="Personal notes optional"></textarea>
          </template>
        </template>
        <template v-else-if="formMode === 'renameDocument'">
          <label class="field-label">
            <span>Document title</span>
            <input v-model="renameDocumentTitle" placeholder="Document title" required />
          </label>
        </template>
        <template v-else>
          <input v-model="jdForm.title" placeholder="JD title or role" />
          <input v-model="jdForm.sourceUrl" placeholder="Job URL optional" />
          <select v-model="jdForm.applicationId">
            <option value="">Attach to application...</option>
            <option v-for="app in applications" :key="app._id" :value="app._id">
              {{ app.company }} - {{ app.role }}
            </option>
          </select>
          <textarea v-model="jdForm.text" placeholder="Paste job description"></textarea>
        </template>
        <div class="modal-actions">
          <button class="career-btn career-btn--ghost" type="button" @click="closeForm">
            Cancel
          </button>
          <button
            v-if="formMode !== 'chooseInterview' && !(formMode === 'jobImport' && !jobImport.review)"
            class="career-btn career-btn--primary"
            type="submit"
          >
            {{ formMode === "jobImport" ? "Add application" : "Save" }}
          </button>
        </div>
      </form>
    </div>

    <div v-if="confirmDialog.open" class="modal-backdrop" @click.self="closeConfirm">
      <section class="career-modal career-confirm" role="dialog" aria-modal="true">
        <h2>{{ confirmDialog.title }}</h2>
        <p>{{ confirmDialog.message }}</p>
        <div class="modal-actions">
          <button class="career-btn career-btn--ghost" type="button" @click="closeConfirm">
            Cancel
          </button>
          <button class="career-btn career-btn--danger" type="button" @click="runConfirmedAction">
            {{ confirmDialog.confirmLabel }}
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import OrionDatePicker from "../components/career/OrionDatePicker.vue";
import { careerAPI } from "../services/api";
import { store } from "../stores/app";

defineEmits(["close"]);

const applicationStatuses = [
  "interested",
  "preparing",
  "applied",
  "hr_screening",
  "interviewing",
  "assignment",
  "offer",
  "rejected",
  "withdrawn",
  "archived",
];
const roundTypes = [
  "hr",
  "recruiter",
  "technical",
  "coding",
  "system_design",
  "managerial",
  "behavioral",
  "assignment_review",
  "final",
  "other",
];
const tabs = [
  { id: "overview", label: "Overview" },
  { id: "applications", label: "Applications" },
  { id: "interviews", label: "Interviews" },
  { id: "documents", label: "Documents" },
  { id: "resume-match", label: "Resume Match" },
  { id: "practice", label: "Practice" },
];

const loading = ref(true);
const uploading = ref(false);
const uploadProgress = ref(0);
const matching = ref(false);
const preparing = ref(false);
const practiceSubmitting = ref(false);
const activeTab = ref("overview");
const formMode = ref("");
const editingId = ref("");
const selectedApplication = ref(null);
const draftText = ref("");
const renameDocumentTarget = ref(null);
const renameDocumentTitle = ref("");
const notice = ref({ type: "", text: "" });
const overview = ref({ counts: {}, primaryResume: null });
const applications = ref([]);
const interviews = ref([]);
const calendarSuggestions = ref([]);
const followUps = ref([]);
const documents = ref([]);
const offers = ref([]);
const careerMemory = ref([]);
const selectedFile = ref(null);
const documentType = ref("resume");
const uploadDocumentTitle = ref("");
const makePrimary = ref(false);
const drivePanelOpen = ref(false);
const driveLoading = ref(false);
const driveError = ref("");
const driveQuery = ref("");
const driveDocumentType = ref("resume");
const driveFiles = ref([]);
const attachingDriveId = ref("");
const jdForm = reactive({ title: "", sourceUrl: "", applicationId: "", text: "" });
const matchResumeId = ref("");
const matchApplicationId = ref("");
const matchResult = ref(null);
const matchExpanded = reactive({
  strongMatches: false,
  partialMatches: false,
  missingEvidence: false,
  interviewRiskAreas: false,
  suggestedImprovements: false,
});
const prepResult = ref(null);
const prepContext = ref({ title: "", subtitle: "" });
const prepMeta = ref(null);
const selectedPrepApplication = ref(null);
const selectedPrepInterview = ref(null);
const prepInterviewChoices = ref([]);
const prepApplicationForChoice = ref(null);
const memoryExpanded = ref(false);
const memoryApplicationId = ref("");
const memoryLoading = ref(false);
const practiceSession = ref(null);
const practiceAnswer = ref("");
const practiceQuestionIndex = ref(0);
const emailSignalLoading = ref(false);
const emailSignals = ref([]);
const emailConnected = ref(null);
const signalLinks = reactive({});
const calendarLinks = reactive({});
const applicationForm = reactive(defaultApplicationForm());
const interviewForm = reactive(defaultInterviewForm());
const offerForm = reactive(defaultOfferForm());
const jobImport = reactive(defaultJobImport());
const confirmDialog = reactive({
  open: false,
  title: "",
  message: "",
  confirmLabel: "Confirm",
  action: null,
});

const resumes = computed(() => documents.value.filter((doc) => doc.type === "resume"));
const jobDescriptions = computed(() =>
  documents.value.filter((doc) => doc.type === "job_description")
);
const currentPracticeQuestion = computed(
  () => practiceSession.value?.questions?.[practiceQuestionIndex.value] || null
);
const hasNextPracticeQuestion = computed(
  () => practiceQuestionIndex.value < (practiceSession.value?.questions?.length || 0) - 1
);
const hasPracticeFeedback = computed(() => {
  const feedback = currentPracticeQuestion.value?.feedback;
  return Boolean(
    feedback &&
      ((feedback.good || []).length ||
        (feedback.missing || []).length ||
        feedback.betterStructure ||
        feedback.suggestedStrongerAnswer)
  );
});
const selectedMatchResume = computed(() =>
  resumes.value.find((doc) => String(doc._id) === String(matchResumeId.value)) || null
);
const selectedMatchApplication = computed(() =>
  applications.value.find((app) => String(app._id) === String(matchApplicationId.value)) || null
);
const selectedMatchJobDescription = computed(() => {
  const id = selectedMatchApplication.value?.jobDescriptionId;
  return jobDescriptions.value.find((doc) => String(doc._id) === String(id)) || null;
});
const canRunResumeMatch = computed(
  () =>
    !matching.value &&
    selectedMatchResume.value?.processingStatus === "ready" &&
    selectedMatchJobDescription.value?.processingStatus === "ready" &&
    !selectedMatchResume.value?.sourceUnavailable &&
    !selectedMatchJobDescription.value?.sourceUnavailable
);
const matchDisabledReason = computed(() => {
  if (matching.value) return "Analysis is in progress.";
  if (!selectedMatchResume.value) return "Select a resume.";
  if (selectedMatchResume.value.sourceUnavailable) return "The selected resume source is unavailable.";
  if (["processing", "uploaded"].includes(selectedMatchResume.value.processingStatus)) {
    return "Resume is still being processed. Try again in a moment.";
  }
  if (selectedMatchResume.value.processingStatus !== "ready") return "Select a readable resume.";
  if (!selectedMatchApplication.value) return "Select an application.";
  if (!selectedMatchJobDescription.value) return "Add a job description to run Resume Match.";
  if (selectedMatchJobDescription.value.sourceUnavailable) return "The job description source is unavailable.";
  if (selectedMatchJobDescription.value.processingStatus !== "ready") return "The job description is not ready.";
  return "";
});
const selectedPrepResume = computed(() => {
  const id = selectedPrepApplication.value?.resumeId || overview.value.primaryResume?._id;
  return resumes.value.find((doc) => String(doc._id) === String(id)) || overview.value.primaryResume || null;
});
const selectedPrepJobDescription = computed(() => {
  const id = selectedPrepApplication.value?.jobDescriptionId;
  return jobDescriptions.value.find((doc) => String(doc._id) === String(id)) || null;
});
const prepIsStale = computed(() => {
  if (!prepResult.value) return false;
  if (!prepMeta.value) return true;
  const current = {
    resumeId: String(selectedPrepResume.value?._id || ""),
    resumeUpdatedAt: isoValue(selectedPrepResume.value?.updatedAt),
    jobDescriptionId: String(selectedPrepJobDescription.value?._id || ""),
    jobDescriptionUpdatedAt: isoValue(selectedPrepJobDescription.value?.updatedAt),
    roundType: selectedPrepInterview.value?.roundType || "",
  };
  return ["resumeId", "jobDescriptionId", "roundType"].some(
    (key) => String(prepMeta.value?.[key] || "") !== String(current[key] || "")
  ) || ["resumeUpdatedAt", "jobDescriptionUpdatedAt"].some(
    (key) => prepMeta.value?.[key] && String(prepMeta.value[key]) !== String(current[key] || "")
  );
});
const practiceStartLabel = computed(() => {
  const round = roundLabel(selectedPrepInterview.value?.roundType);
  return round ? `Start ${round} Practice` : "Start Practice Interview";
});
const selectedApplicationIntelligence = computed(() => {
  if (!selectedApplication.value) return null;
  const jd = documents.value.find((doc) => String(doc._id) === String(selectedApplication.value.jobDescriptionId));
  const resume = documents.value.find((doc) => String(doc._id) === String(selectedApplication.value.resumeId)) || overview.value.primaryResume;
  if (!jd && !resume) return null;
  if (matchResult.value && String(matchApplicationId.value) === String(selectedApplication.value._id)) {
    const strong = matchResult.value.strongMatches?.[0];
    const gap = matchResult.value.missingEvidence?.[0];
    const risk = matchResult.value.interviewRiskAreas?.[0];
    return {
      strongest: strong
        ? `JD evidence: ${strong.requirement || strong.jdRequirement}. Resume evidence: ${strong.resumeEvidence}.`
        : "No strong resume evidence found yet.",
      skills: [
        ...(matchResult.value.strongMatches || []),
        ...(matchResult.value.partialMatches || []),
        ...(matchResult.value.missingEvidence || []),
      ]
        .flatMap((item) => item.keywords || [])
        .slice(0, 8)
        .join(", ") || "Run Resume Match to extract role emphasis from the JD.",
      gaps: gap ? `${gap.requirement || gap.jdRequirement} — ${gap.suggestion || gap.assessment}` : "No missing evidence surfaced in the latest match.",
      questions: risk ? `Be ready to discuss: ${risk.area || risk}` : "Use Interview Prep for role-specific questions.",
      prepare: suggestedActionForApplication(selectedApplication.value),
      improvements: matchResult.value.suggestedImprovements?.[0] || "No resume improvement suggested yet.",
      ask: `Ask how success is measured for the ${selectedApplication.value.role} role.`,
    };
  }
  return {
    strongest: resume?.processingStatus === "ready" ? "Use Resume Match to see resume-grounded evidence." : "Upload or select a ready resume.",
    skills: jd?.processingStatus === "ready" ? "JD-grounded skills are available through Resume Match and Prep." : "Add a readable JD to identify role emphasis.",
    gaps: resume && jd ? "Run Resume Match for evidence-based gaps. Missing evidence will stay marked missing." : "Add both a resume and JD first.",
    questions: "Use Interview Prep once the application has enough context.",
    prepare: suggestedActionForApplication(selectedApplication.value),
    improvements: "Run Resume Match before changing your resume.",
    ask: `Ask what outcomes matter most for the ${selectedApplication.value.role} role.`,
  };
});
const suggestedNextAction = computed(() => {
  const interview = interviews.value.find((item) => new Date(item.scheduledAt) >= new Date());
  if (interview) return `Prepare ${roundLabel(interview.roundType) || "interview"} for ${interview.company}.`;
  if (followUps.value.length) return `Follow up with ${followUps.value[0].company}.`;
  const appWithoutJd = applications.value.find((app) => !app.jobDescriptionId);
  if (appWithoutJd) return `Add a job description for ${appWithoutJd.company}.`;
  if (!resumes.value.length) return "Upload/select a resume to unlock resume-based preparation.";
  return "No urgent career action right now.";
});

function defaultApplicationForm() {
  return {
    company: "",
    role: "",
    status: "interested",
    sourceUrl: "",
    location: "",
    workMode: "",
    appliedAt: "",
    nextFollowUpAt: "",
    resumeId: "",
    jobDescriptionId: "",
    notes: "",
  };
}

function defaultInterviewForm() {
  return {
    applicationId: "",
    company: "",
    role: "",
    scheduledAt: "",
    durationMinutes: 60,
    roundType: "",
    meetingUrl: "",
    location: "",
    notes: "",
  };
}

function defaultOfferForm() {
  return {
    applicationId: "",
    company: "",
    role: "",
    compensationText: "",
    deadline: "",
    notes: "",
  };
}

function defaultJobImport() {
  return {
    url: "",
    loading: false,
    error: "",
    review: null,
    status: "interested",
    appliedAt: "",
    nextFollowUpAt: "",
    resumeId: "",
    notes: "",
  };
}

function assignForm(target, source) {
  Object.keys(target).forEach((key) => {
    target[key] = source[key] ?? "";
  });
}

function showNotice(text, type = "success") {
  notice.value = { text, type };
  setTimeout(() => {
    if (notice.value.text === text) notice.value = { type: "", text: "" };
  }, 3200);
}

function requestConfirm({ title, message, confirmLabel = "Confirm", action }) {
  Object.assign(confirmDialog, { open: true, title, message, confirmLabel, action });
}

function closeConfirm() {
  Object.assign(confirmDialog, {
    open: false,
    title: "",
    message: "",
    confirmLabel: "Confirm",
    action: null,
  });
}

async function runConfirmedAction() {
  const action = confirmDialog.action;
  closeConfirm();
  if (typeof action === "function") await action();
}

function statusLabel(value = "") {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
const prepLabel = statusLabel;
const roundLabel = statusLabel;
const typeLabel = statusLabel;
const categoryLabel = statusLabel;

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function isoValue(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function normalizeMatchForUi(value) {
  if (!value || typeof value !== "object") return null;
  const requirement = (item) => item?.requirement || item?.jdRequirement || item?.title || "";
  return {
    summary:
      value.summary ||
      "OrionAI compared the supplied resume and job description using the available document evidence.",
    strongMatches: (value.strongMatches || []).map((item) => ({
      requirement: requirement(item),
      resumeEvidence: item?.resumeEvidence || item?.evidence || "",
      explanation: item?.explanation || item?.assessment || "Direct evidence was found.",
      keywords: item?.keywords || [],
    })),
    partialMatches: (value.partialMatches || []).map((item) => ({
      requirement: requirement(item),
      resumeEvidence: item?.resumeEvidence || item?.evidence || "",
      missingEvidence: item?.missingEvidence || item?.assessment || "The evidence is incomplete.",
      suggestion: item?.suggestion || "If you genuinely have this experience, add a specific example.",
      keywords: item?.keywords || [],
    })),
    missingEvidence: (value.missingEvidence || []).map((item) => ({
      requirement: requirement(item),
      resumeEvidence: item?.resumeEvidence || item?.evidence || "No clear evidence found.",
      evidenceStatus: item?.evidenceStatus || "not_found",
      suggestion: item?.suggestion || item?.assessment || "Prepare to discuss only your real experience.",
      keywords: item?.keywords || [],
    })),
    interviewRiskAreas: (value.interviewRiskAreas || []).map((item) =>
      typeof item === "string"
        ? { area: item, reason: "Resume evidence is limited or incomplete.", preparationSuggestion: "Prepare a truthful explanation of your experience." }
        : item
    ),
    suggestedImprovements: (value.suggestedImprovements || []).filter(
      (item) => typeof item === "string"
    ),
    grounding: value.grounding || {},
  };
}

function normalizePrepForUi(value) {
  if (!value || typeof value !== "object") return null;
  const toQuestions = (items, basisKey) =>
    (items || []).map((item) =>
      typeof item === "string" ? { question: item, [basisKey]: "Source detail available in the selected document." } : item
    );
  const legacyPriorities = (value.whatToPrepare || []).map((item) => ({
    topic: typeof item === "string" ? item : item?.title || item?.topic || "",
    reason: "Included in the saved preparation plan.",
    priority: "medium",
    source: "OrionAI",
  }));
  return {
    roleSummary: value.roleSummary || "Preparation is ready.",
    priorityTopics: value.priorityTopics || legacyPriorities,
    resumeQuestions: toQuestions(value.resumeQuestions || value.resumeBasedQuestions, "resumeBasis"),
    jdQuestions: toQuestions(value.jdQuestions || value.jdBasedQuestions, "jdBasis"),
    behavioralQuestions: (value.behavioralQuestions || value.behavioralPreparation || []).map((item) =>
      typeof item === "string" ? item : item?.question || item?.text || ""
    ).filter(Boolean),
    likelyDeepDiveAreas: value.likelyDeepDiveAreas || [],
    weakAreasToReview:
      value.weakAreasToReview ||
      (value.careerMemory || []).map((item) => ({
        area: item.title,
        reason: item.content || "Saved Career Memory marked this for review.",
        source: "Career Memory",
      })),
    questionsForInterviewer: (
      value.questionsForInterviewer || value.questionsToAskInterviewer || value.companyRoleQuestions || []
    ).map((item) => (typeof item === "string" ? item : item?.question || "")).filter(Boolean),
    preparationPlan: value.preparationPlan || legacyPriorities.map((item) => `Review ${item.topic}.`),
    grounding: value.grounding || {},
    careerMemory: value.careerMemory || [],
  };
}

function dateInput(value) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

function datetimeInput(value) {
  if (!value) return "";
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function documentTitle(id) {
  if (!id) return "";
  return documents.value.find((doc) => String(doc._id) === String(id))?.title || "";
}

function documentStatusLabel(doc = {}) {
  if (doc.processingStatus === "ready") return "Ready";
  if (doc.processingStatus === "failed") return "Failed";
  if (doc.processingStatus === "processing" || doc.processingStatus === "uploaded") return "Processing";
  return statusLabel(doc.processingStatus || "Unknown");
}

function selectTab(tabId) {
  activeTab.value = tabId;
  if (tabId === "resume-match") {
    if (!matchResumeId.value) {
      matchResumeId.value =
        overview.value.primaryResume?._id || resumes.value.find((doc) => doc.processingStatus === "ready")?._id || "";
    }
    if (matchApplicationId.value) onMatchApplicationChange();
  }
}

function clearMatchResult() {
  matchResult.value = null;
}

function onMatchApplicationChange() {
  const app = selectedMatchApplication.value;
  if (!app) {
    matchResult.value = null;
    return;
  }
  const savedResumeId = app.resumeMatchMeta?.resumeId || app.resumeId || overview.value.primaryResume?._id;
  if (savedResumeId && resumes.value.some((doc) => String(doc._id) === String(savedResumeId))) {
    matchResumeId.value = savedResumeId;
  }
  const sameResume = !app.resumeMatchMeta?.resumeId || String(app.resumeMatchMeta.resumeId) === String(matchResumeId.value);
  const sameJd = !app.resumeMatchMeta?.jobDescriptionId ||
    String(app.resumeMatchMeta.jobDescriptionId) === String(app.jobDescriptionId || "");
  matchResult.value = sameResume && sameJd ? normalizeMatchForUi(app.resumeMatch) : null;
}

function visibleMatchItems(key) {
  const items = matchResult.value?.[key] || [];
  return matchExpanded[key] ? items : items.slice(0, 4);
}

function hasHiddenMatchItems(key) {
  return (matchResult.value?.[key]?.length || 0) > 4;
}

function toggleMatchSection(key) {
  matchExpanded[key] = !matchExpanded[key];
}

function openDocumentsForResume() {
  activeTab.value = "documents";
  documentType.value = "resume";
}

function openJobDescriptionForMatch() {
  jdForm.applicationId = matchApplicationId.value;
  openJobDescriptionForm();
}

function upcomingForApplication(id) {
  const interview = interviews.value.find((item) => String(item.applicationId) === String(id));
  return interview ? formatDateTime(interview.scheduledAt) : "";
}

function suggestedActionForApplication(app = {}) {
  const interview = interviews.value.find((item) => String(item.applicationId) === String(app._id));
  if (interview && new Date(interview.scheduledAt) <= new Date(Date.now() + 36 * 60 * 60 * 1000)) {
    return `Interview soon — practice ${roundLabel(interview.roundType) || "now"}.`;
  }
  if (app.nextFollowUpAt && new Date(app.nextFollowUpAt) <= new Date()) return "Follow up with recruiter.";
  if (!app.jobDescriptionId) return "Add job description.";
  if (!app.resumeId && !overview.value.primaryResume) return "Upload/select a resume.";
  if (app.status === "interviewing") return "Prepare technical and behavioral questions.";
  return "Keep this opportunity up to date.";
}

async function refreshAll() {
  loading.value = true;
  try {
    const [overviewRes, appsRes, interviewsRes, docsRes, followUpsRes, offersRes, memoryRes] =
      await Promise.all([
        careerAPI.overview(),
        careerAPI.listApplications(),
        careerAPI.listInterviews(),
        careerAPI.listDocuments(),
        careerAPI.listFollowUps(),
        careerAPI.listOffers(),
        careerAPI.listMemory(
          memoryApplicationId.value ? { applicationId: memoryApplicationId.value } : {}
        ),
      ]);
    overview.value = overviewRes.data || { counts: {} };
    applications.value = appsRes.data?.applications || [];
    interviews.value = interviewsRes.data?.interviews || [];
    calendarSuggestions.value = interviewsRes.data?.calendarSuggestions || [];
    documents.value = docsRes.data?.documents || [];
    followUps.value = followUpsRes.data?.followUps || [];
    offers.value = offersRes.data?.offers || [];
    careerMemory.value = memoryRes.data?.memory || [];
    if (!matchResumeId.value) {
      matchResumeId.value =
        overview.value.primaryResume?._id || resumes.value.find((doc) => doc.processingStatus === "ready")?._id || "";
    }
    if (selectedPrepApplication.value?._id) {
      selectedPrepApplication.value =
        applications.value.find(
          (item) => String(item._id) === String(selectedPrepApplication.value._id)
        ) || selectedPrepApplication.value;
    }
    if (selectedPrepInterview.value?._id) {
      selectedPrepInterview.value =
        interviews.value.find(
          (item) => String(item._id) === String(selectedPrepInterview.value._id)
        ) || selectedPrepInterview.value;
    }
  } catch (error) {
    showNotice(error.response?.data?.error || "Could not load Career & Interviews", "error");
  } finally {
    loading.value = false;
  }
}

function openApplicationForm(app = null) {
  formMode.value = "application";
  editingId.value = app?._id || "";
  assignForm(
    applicationForm,
    app
      ? {
          ...app,
          appliedAt: dateInput(app.appliedAt),
          nextFollowUpAt: dateInput(app.nextFollowUpAt),
          resumeId: app.resumeId || "",
          jobDescriptionId: app.jobDescriptionId || "",
        }
      : defaultApplicationForm()
  );
}

function openInterviewForm(payload = {}) {
  const app = payload.application || null;
  const interview = payload.interview || null;
  formMode.value = "interview";
  editingId.value = interview?._id || "";
  assignForm(
    interviewForm,
    interview
      ? {
          ...interview,
          scheduledAt: datetimeInput(interview.scheduledAt),
          applicationId: interview.applicationId || "",
        }
      : {
          ...defaultInterviewForm(),
          applicationId: app?._id || "",
          company: app?.company || "",
          role: app?.role || "",
        }
  );
}

function openJobDescriptionForm() {
  formMode.value = "jd";
}

function openJobImportForm() {
  Object.assign(jobImport, defaultJobImport());
  formMode.value = "jobImport";
}

function switchJobImportToManual() {
  closeForm();
  openApplicationForm();
}

function closeForm() {
  formMode.value = "";
  editingId.value = "";
  prepInterviewChoices.value = [];
  prepApplicationForChoice.value = null;
  renameDocumentTarget.value = null;
  renameDocumentTitle.value = "";
}

async function saveForm() {
  try {
    if (formMode.value === "application") {
      const payload = { ...applicationForm };
      if (payload.status === "interested") payload.appliedAt = "";
      if (editingId.value) await careerAPI.updateApplication(editingId.value, payload);
      else await careerAPI.createApplication(payload);
      showNotice("Application saved");
    } else if (formMode.value === "interview") {
      if (editingId.value) await careerAPI.updateInterview(editingId.value, interviewForm);
      else await careerAPI.createInterview(interviewForm);
      showNotice("Interview saved");
    } else if (formMode.value === "jobImport") {
      await saveImportedJob();
    } else if (formMode.value === "renameDocument") {
      await saveDocumentRename();
    } else if (formMode.value === "chooseInterview") {
      return;
    } else {
      await saveJobDescription();
    }
    closeForm();
    await refreshAll();
  } catch (error) {
    showNotice(error.response?.data?.error || "Could not save", "error");
  }
}

async function importJob() {
  jobImport.loading = true;
  jobImport.error = "";
  try {
    const { data } = await careerAPI.importJob({ sourceUrl: jobImport.url });
    jobImport.review = data.importedJob;
    if (data.importedJob?.confidence) {
      showNotice("OrionAI found job details. Review them before saving.");
    }
  } catch (error) {
    jobImport.error = error.response?.data?.error || "OrionAI couldn't access this job page.";
  } finally {
    jobImport.loading = false;
  }
}

async function saveImportedJob() {
  if (!jobImport.review) return;
  const { data } = await careerAPI.confirmImportedJob({
    importedJob: jobImport.review,
    status: jobImport.status,
    appliedAt: jobImport.status === "applied" ? jobImport.appliedAt : "",
    nextFollowUpAt: jobImport.nextFollowUpAt,
    resumeId: jobImport.resumeId,
    notes: jobImport.notes,
  });
  showNotice(data.duplicate ? "This job link is already tracked" : "Imported job added");
  if (data.application) selectedApplication.value = data.application;
  matchApplicationId.value = data.application?._id || "";
}

async function changeApplicationStatus(app, status) {
  await careerAPI.updateApplication(app._id, { status });
  await refreshAll();
}

async function archiveApplication(app) {
  requestConfirm({
    title: "Archive Application?",
    message: `${app.company} - ${app.role} will move out of your active Career hub.`,
    confirmLabel: "Archive",
    action: async () => {
      await careerAPI.deleteApplication(app._id);
      showNotice("Application archived");
      await refreshAll();
    },
  });
}

function hydrateInterviewFromApplication() {
  const app = applications.value.find((item) => item._id === interviewForm.applicationId);
  if (!app) return;
  interviewForm.company = app.company;
  interviewForm.role = app.role;
}

function hydrateOfferFromApplication() {
  const app = applications.value.find((item) => item._id === offerForm.applicationId);
  if (!app) return;
  offerForm.company = app.company;
  offerForm.role = app.role;
}

function onFileChange(event) {
  selectedFile.value = event.target.files?.[0] || null;
}

async function uploadDocument() {
  if (!selectedFile.value) return showNotice("Choose a document first", "error");
  uploading.value = true;
  uploadProgress.value = 0;
  try {
    const form = new FormData();
    form.append("file", selectedFile.value);
    form.append("type", documentType.value);
    form.append("title", uploadDocumentTitle.value);
    form.append("isPrimary", makePrimary.value ? "true" : "false");
    await careerAPI.uploadDocument(form, (event) => {
      if (event.total) uploadProgress.value = Math.round((event.loaded / event.total) * 100);
    });
    selectedFile.value = null;
    uploadDocumentTitle.value = "";
    makePrimary.value = false;
    showNotice("Document uploaded");
    await refreshAll();
  } catch (error) {
    showNotice(error.response?.data?.error || "Upload failed", "error");
  } finally {
    uploading.value = false;
    uploadProgress.value = 0;
  }
}

async function openDocument(doc) {
  const res = await careerAPI.openDocumentFile(doc._id);
  const url = URL.createObjectURL(res.data);
  window.open(url, "_blank", "noopener");
}

function fileLabel(file = {}) {
  if (file.mimeType === "application/vnd.google-apps.document") return "Google Docs";
  if (file.mimeType === "application/pdf") return "PDF";
  if (file.mimeType?.includes("wordprocessingml.document")) return "DOCX";
  if (file.mimeType === "text/plain") return "Text";
  return file.mimeType || "Drive file";
}

async function toggleDrivePanel() {
  drivePanelOpen.value = !drivePanelOpen.value;
  if (drivePanelOpen.value && !driveFiles.value.length && !driveError.value) await loadDriveFiles();
}

async function loadDriveFiles() {
  driveLoading.value = true;
  driveError.value = "";
  try {
    const { data } = await careerAPI.listDriveFiles({ query: driveQuery.value, limit: 20 });
    driveFiles.value = data.files || [];
    if (data.error) driveError.value = data.error;
  } catch (error) {
    driveError.value = error.response?.data?.error || "Could not load Google Drive files";
  } finally {
    driveLoading.value = false;
  }
}

async function attachDriveFile(file) {
  attachingDriveId.value = file.id;
  driveError.value = "";
  try {
    const { data } = await careerAPI.attachDriveDocument({
      fileId: file.id,
      type: driveDocumentType.value,
      title: file.name,
      isPrimary: driveDocumentType.value === "resume" && makePrimary.value,
    });
    showNotice(data.duplicate ? "Drive document is already attached" : "Drive document attached");
    await refreshAll();
  } catch (error) {
    driveError.value = error.response?.data?.error || "Could not attach Google Drive document";
  } finally {
    attachingDriveId.value = "";
  }
}

async function setPrimaryResume(doc) {
  await careerAPI.updateDocument(doc._id, { isPrimary: true });
  await refreshAll();
}

async function renameDocument(doc) {
  renameDocumentTarget.value = doc;
  renameDocumentTitle.value = doc.title || "";
  formMode.value = "renameDocument";
}

async function saveDocumentRename() {
  const title = renameDocumentTitle.value.trim();
  if (!renameDocumentTarget.value || !title) return;
  await careerAPI.updateDocument(renameDocumentTarget.value._id, { title });
  showNotice("Document renamed");
  await refreshAll();
}

async function deleteDocument(doc) {
  requestConfirm({
    title: doc.type === "job_description" ? "Archive Job Description?" : "Archive Document?",
    message:
      doc.type === "job_description"
        ? "This document will no longer be used for interview preparation or resume matching."
        : `${doc.title} will be removed from active Career documents.`,
    confirmLabel: "Archive",
    action: async () => {
      await careerAPI.deleteDocument(doc._id);
      showNotice(doc.type === "job_description" ? "Job description archived" : "Document archived");
      await refreshAll();
    },
  });
}

async function loadMemory() {
  memoryLoading.value = true;
  try {
    const { data } = memoryApplicationId.value
      ? await careerAPI.listApplicationMemory(memoryApplicationId.value)
      : await careerAPI.listMemory();
    careerMemory.value = data.memory || [];
  } catch (error) {
    showNotice(error.response?.data?.error || "Could not load Career memory", "error");
  } finally {
    memoryLoading.value = false;
  }
}

async function toggleMemory() {
  memoryExpanded.value = !memoryExpanded.value;
  if (memoryExpanded.value) await loadMemory();
}

async function deleteMemory(memory) {
  requestConfirm({
    title: "Delete Memory?",
    message: `"${memory.title}" will stop being used in Career preparation.`,
    confirmLabel: "Delete",
    action: async () => {
      await careerAPI.deleteMemory(memory._id);
      showNotice("Career memory deleted");
      await loadMemory();
    },
  });
}

async function clearSelectedApplicationMemory() {
  const app = applications.value.find((item) => item._id === memoryApplicationId.value);
  const label = app ? `${app.company} - ${app.role}` : "this application";
  requestConfirm({
    title: "Clear Application Memory?",
    message: `All Career memory for ${label} will be deleted.`,
    confirmLabel: "Clear",
    action: async () => {
      await careerAPI.clearApplicationMemory(memoryApplicationId.value);
      showNotice("Application Career memory cleared");
      await loadMemory();
    },
  });
}

async function clearAllMemory() {
  requestConfirm({
    title: "Clear Career Memory?",
    message: "All Career memory will be deleted and will stop being used in preparation.",
    confirmLabel: "Clear",
    action: async () => {
      await careerAPI.clearMemory();
      showNotice("Career memory cleared");
      await loadMemory();
    },
  });
}

async function saveJobDescription() {
  await careerAPI.createJobDescription(jdForm);
  Object.assign(jdForm, { title: "", sourceUrl: "", applicationId: "", text: "" });
  showNotice("Job description saved");
  await refreshAll();
}

async function runResumeMatch() {
  if (!canRunResumeMatch.value) return;
  matching.value = true;
  try {
    const { data } = await careerAPI.resumeMatch(matchApplicationId.value, {
      resumeId: matchResumeId.value,
      jobDescriptionId: selectedMatchJobDescription.value?._id,
    });
    matchResult.value = normalizeMatchForUi(data.match);
    if (selectedMatchApplication.value) selectedMatchApplication.value.resumeMatch = data.match;
    Object.keys(matchExpanded).forEach((key) => {
      matchExpanded[key] = false;
    });
  } catch (error) {
    showNotice(error.response?.data?.error || "Could not compare resume and JD", "error");
  } finally {
    matching.value = false;
  }
}

async function runResumeMatchForApplication(app) {
  matchApplicationId.value = app._id;
  matchResumeId.value = app.resumeId || overview.value.primaryResume?._id || matchResumeId.value;
  selectTab("resume-match");
  onMatchApplicationChange();
}

function prepareInterview(interview) {
  const app = applications.value.find((item) => String(item._id) === String(interview.applicationId));
  selectedPrepApplication.value = app || null;
  selectedPrepInterview.value = interview;
  prepContext.value = {
    title: `${interview.role || app?.role || "Role"} — ${interview.company || app?.company || "Company"}`,
    subtitle: `${roundLabel(interview.roundType) || "Interview"} · ${formatDateTime(interview.scheduledAt)}`,
  };
  activeTab.value = "practice";
  closeForm();
  prepResult.value = normalizePrepForUi(interview.prepPlan);
  prepMeta.value = interview.prepMeta || null;
  practiceSession.value = null;
  practiceQuestionIndex.value = 0;
}

function prepareApplication(app) {
  const choices = interviews.value
    .filter((item) => String(item.applicationId) === String(app._id))
    .filter((item) => !item.scheduledAt || new Date(item.scheduledAt) >= new Date())
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  if (choices.length === 1) return prepareInterview(choices[0]);
  if (choices.length > 1) {
    prepInterviewChoices.value = choices;
    prepApplicationForChoice.value = app;
    formMode.value = "chooseInterview";
    return;
  }
  return prepareRole(app);
}

function prepareRole(app) {
  if (!app?._id) return;
  selectedPrepApplication.value = app;
  selectedPrepInterview.value = null;
  prepContext.value = {
    title: `${app.role} — ${app.company}`,
    subtitle: "Role preparation using the application, selected resume, JD, and saved notes.",
  };
  selectedApplication.value = app;
  activeTab.value = "practice";
  closeForm();
  prepResult.value = normalizePrepForUi(app.prepPlan);
  prepMeta.value = app.prepMeta || null;
  practiceSession.value = null;
  practiceQuestionIndex.value = 0;
}

async function generateInterviewPrep() {
  if (!selectedPrepApplication.value && !selectedPrepInterview.value) return;
  preparing.value = true;
  try {
    const { data } = selectedPrepInterview.value
      ? await careerAPI.prepareInterview(selectedPrepInterview.value._id)
      : await careerAPI.prepareApplication(selectedPrepApplication.value._id);
    prepResult.value = normalizePrepForUi(data.preparation);
    prepMeta.value = data.interview?.prepMeta || data.application?.prepMeta || null;
    await refreshAll();
  } catch (error) {
    showNotice(error.response?.data?.error || "Could not generate interview preparation", "error");
  } finally {
    preparing.value = false;
  }
}

async function startPractice(interview) {
  if (!interview?._id) return;
  if (String(selectedPrepInterview.value?._id) !== String(interview._id)) prepareInterview(interview);
  const { data } = await careerAPI.startPractice(interview._id, {
    type: interview.roundType || "role_specific",
  });
  practiceSession.value = data.session;
  practiceAnswer.value = "";
  const pendingIndex = (data.session?.questions || []).findIndex((item) => !item.answeredAt);
  practiceQuestionIndex.value = pendingIndex >= 0 ? pendingIndex : Math.max(0, (data.session?.questions?.length || 1) - 1);
  activeTab.value = "practice";
}

async function submitPracticeAnswer() {
  if (!practiceAnswer.value.trim()) return;
  practiceSubmitting.value = true;
  try {
    const { data } = await careerAPI.answerPractice(practiceSession.value._id, {
      answer: practiceAnswer.value,
      questionIndex: practiceQuestionIndex.value,
    });
    practiceSession.value = data.session;
    practiceAnswer.value = "";
    await loadMemory();
  } catch (error) {
    showNotice(error.response?.data?.error || "Could not save practice answer", "error");
  } finally {
    practiceSubmitting.value = false;
  }
}

async function skipPracticeQuestion() {
  if (!practiceSession.value || practiceSubmitting.value) return;
  practiceSubmitting.value = true;
  try {
    const { data } = await careerAPI.answerPractice(practiceSession.value._id, {
      skip: true,
      questionIndex: practiceQuestionIndex.value,
    });
    practiceSession.value = data.session;
    practiceAnswer.value = "";
  } catch (error) {
    showNotice(error.response?.data?.error || "Could not skip this question", "error");
  } finally {
    practiceSubmitting.value = false;
  }
}

function showNextPracticeQuestion() {
  if (!hasNextPracticeQuestion.value) return;
  practiceQuestionIndex.value += 1;
  practiceAnswer.value = "";
}

async function draftFollowUp(app) {
  if (!app?._id) return;
  const { data } = await careerAPI.draftFollowUp(app._id);
  draftText.value = data.draft;
}

async function snoozeFollowUp(id) {
  await careerAPI.snoozeFollowUp(id, 3);
  await refreshAll();
}

async function markFollowUpHandled(id) {
  await careerAPI.markFollowUpHandled(id);
  await refreshAll();
}

async function loadEmailSignals() {
  emailSignalLoading.value = true;
  try {
    const { data } = await careerAPI.emailSignals();
    emailConnected.value = data.connected;
    emailSignals.value = data.signals || [];
  } catch (error) {
    showNotice(error.response?.data?.error || "Could not load Gmail signals", "error");
  } finally {
    emailSignalLoading.value = false;
  }
}

async function acceptSignal(signal) {
  const applicationId = signalLinks[signal.gmailMessageId] || "";
  const createApplication = !applicationId;
  const company = signal.companyHint || "";
  if (createApplication && !company) {
    showNotice("Choose an existing application or add the company first.", "error");
    return;
  }
  await careerAPI.acceptEmailSignal(signal.gmailMessageId, {
    signal,
    applicationId,
    createApplication,
    company,
    role: signal.roleHint || "Role to confirm",
  });
  await refreshAll();
  await loadEmailSignals();
}

async function ignoreSignal(signal) {
  await careerAPI.ignoreEmailSignal(signal.gmailMessageId, signal);
  await loadEmailSignals();
}

async function saveCalendarInterview(event) {
  const applicationId = calendarLinks[event.id] || "";
  const app = applications.value.find((item) => item._id === applicationId);
  await careerAPI.createInterview({
    applicationId,
    company: app?.company || event.company || event.title,
    role: app?.role || "",
    scheduledAt: event.scheduledAt,
    durationMinutes: event.durationMinutes,
    meetingUrl: event.meetingUrl,
    location: event.location,
    sourceApp: "google_calendar",
    sourceRef: event.id,
  });
  await refreshAll();
}

async function createOffer() {
  try {
    await careerAPI.createOffer(offerForm);
    Object.assign(offerForm, defaultOfferForm());
    showNotice("Offer saved");
    await refreshAll();
  } catch (error) {
    showNotice(error.response?.data?.error || "Could not save offer", "error");
  }
}

async function draftOfferEmail(offer, type) {
  const { data } = await careerAPI.draftOfferEmail(offer._id, type);
  draftText.value = data.draft;
}

function openExternal(url) {
  window.open(url, "_blank", "noopener");
}

function openEmail(messageId) {
  document.dispatchEvent(
    new CustomEvent("orion:open-module", {
      detail: {
        module: "gmail",
        context: { messageId, focus: "message" },
      },
    })
  );
}

function openOfferDocument(offer) {
  const doc = documents.value.find((item) => String(item._id) === String(offer.offerDocumentId));
  if (doc?.canOpenFile) openDocument(doc);
  else if (doc) activeTab.value = "documents";
}

onMounted(async () => {
  await refreshAll();
  const focus = store.moduleContext?.focus || "";
  if (tabs.some((tab) => tab.id === focus)) activeTab.value = focus;
  if (["followups", "signals", "offers"].includes(focus)) activeTab.value = "overview";
  if (["prep", "intelligence"].includes(focus)) activeTab.value = focus === "prep" ? "practice" : "resume-match";
  const interviewId = store.moduleContext?.interviewId || "";
  const interview = interviews.value.find((item) => String(item._id) === String(interviewId));
  if (interview) prepareInterview(interview);
});
</script>

<style scoped>
.career-shell {
  --career-section-gap: 28px;
  --career-card-gap: 14px;
  --career-action-gap: 10px;
  min-height: 100vh;
  padding: 32px 32px 48px;
  color: var(--text-primary);
  background: var(--bg-base);
  overflow: auto;
}
.career-header,
.career-panel,
.career-drawer,
.career-modal {
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.055);
  border-radius: 8px;
}
.career-header {
  padding: 22px;
}
.career-back,
.career-btn,
.row-actions button,
.row-actions select,
.career-tabs button,
.cb-btn {
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-primary);
  border-radius: 6px;
  padding: 8px 11px;
  cursor: pointer;
  font-weight: 700;
}
.career-back {
  margin-bottom: 14px;
}
.career-title-row,
.career-panel-head,
.card-topline,
.calendar-suggestion,
.followup-card {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: flex-start;
}
.career-title-row h1,
.career-panel h2,
.career-card h3,
.application-row h3,
.followup-card h3 {
  margin: 0;
}
.career-kicker {
  color: #7dd3fc;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0;
}
.career-actions,
.row-actions,
.modal-actions,
.career-action-group,
.career-tabs {
  display: flex;
  gap: var(--career-action-gap);
  flex-wrap: wrap;
}
.career-action-group,
.modal-actions {
  align-items: center;
}
.career-btn--primary {
  background: rgba(45, 212, 191, 0.22);
  border-color: rgba(45, 212, 191, 0.38);
}
.career-btn--danger {
  background: rgba(248, 113, 113, 0.18);
  border-color: rgba(248, 113, 113, 0.4);
  color: #fecaca;
}
.career-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-top: 16px;
}
.career-metrics article {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.14);
}
.career-metrics span,
.career-panel p,
.application-row small,
.career-card p,
.career-card span,
.followup-card small,
.career-empty {
  color: var(--text-secondary);
}
.career-metrics strong {
  display: block;
  margin-top: 8px;
  font-size: 20px;
}
.career-tabs {
  margin: 24px 0;
}
.career-tabs button.active {
  background: rgba(125, 211, 252, 0.16);
  border-color: rgba(125, 211, 252, 0.35);
}
.career-main {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--career-section-gap);
}
.career-panel {
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.career-section-stack,
.match-results,
.prep-results {
  display: flex;
  flex-direction: column;
  gap: var(--career-section-gap);
}
.career-panel-head p,
.career-panel-head h2,
.prep-output-section h3,
.result-section h3,
.match-summary p {
  margin-bottom: 0;
}
.career-panel-head p {
  margin-top: 6px;
}
.career-empty {
  border: 1px dashed rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  padding: 18px;
}
.application-table,
.career-card-grid,
.prep-grid,
.match-grid,
.overview-grid {
  display: grid;
  gap: var(--career-card-gap);
}
.application-row,
.career-card,
.followup-card,
.signal-card,
.calendar-suggestion,
.match-column,
.prep-section,
.practice-box,
.feedback-box {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 14px;
  background: rgba(0, 0, 0, 0.13);
}
.application-row {
  display: grid;
  grid-template-columns: minmax(180px, 1.2fr) 140px minmax(210px, 1fr) minmax(280px, 1.5fr);
  gap: 12px;
  align-items: start;
}
.row-meta {
  display: grid;
  gap: 4px;
  color: var(--text-secondary);
  font-size: 13px;
}
.career-card-grid,
.prep-grid,
.match-grid,
.overview-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.inline-form,
.career-modal {
  display: grid;
  gap: var(--career-card-gap);
  margin-bottom: 0;
}
input,
select,
textarea {
  width: 100%;
  min-width: 0;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.22);
  color: var(--text-primary);
  border-radius: 6px;
  padding: 10px;
}
.field-label {
  display: grid;
  gap: 7px;
}
.field-label span {
  color: rgba(226, 232, 240, 0.84);
  font-size: 12px;
  font-weight: 800;
}
textarea {
  min-height: 100px;
  resize: vertical;
}
.file-input input {
  display: none;
}
.file-input span,
.check-row {
  display: block;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  padding: 10px;
  color: var(--text-secondary);
}
.check-row input {
  width: auto;
}
.status-pill {
  display: inline-flex;
  width: fit-content;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(125, 211, 252, 0.14);
  color: #bae6fd;
  font-size: 12px;
  font-weight: 800;
}
.status-pill[data-status="offer"],
.status-pill[data-status="ready"] {
  background: rgba(45, 212, 191, 0.16);
  color: #99f6e4;
}
.status-pill[data-status="rejected"] {
  background: rgba(248, 113, 113, 0.16);
  color: #fecaca;
}
.career-subsection {
  margin-top: 4px;
  display: flex;
  flex-direction: column;
  gap: var(--career-card-gap);
}
.career-progress {
  height: 6px;
  margin: -4px 0 12px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
}
.career-progress span {
  display: block;
  height: 100%;
  background: #2dd4bf;
  transition: width 0.18s ease;
}
.drive-attach,
.career-memory {
  margin: 0;
}
.drive-panel,
.memory-panel {
  display: grid;
  gap: 10px;
  margin-top: 10px;
}
.match-workflow {
  display: grid;
  gap: var(--career-card-gap);
}
.match-step {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
  padding: 16px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-surface);
}
.step-number {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(125, 211, 252, 0.35);
  border-radius: 50%;
  color: #bae6fd;
  background: rgba(125, 211, 252, 0.1);
  font-size: 12px;
  font-weight: 800;
}
.match-step__body,
.match-run,
.prep-source-notes {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.match-meta {
  margin: 0;
  font-size: 12px;
}
.match-metadata {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
}
.match-metadata div {
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
}
.match-metadata dt {
  color: var(--text-muted);
  font-size: 11px;
}
.match-metadata dd {
  margin: 4px 0 0;
  overflow-wrap: anywhere;
  font-size: 13px;
}
.career-inline-note {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0;
  padding: 12px 14px;
  border: 1px solid rgba(125, 211, 252, 0.24);
  border-radius: 7px;
  background: rgba(125, 211, 252, 0.07);
  color: var(--text-secondary);
  font-size: 13px;
}
.career-inline-note.error {
  border-color: rgba(248, 113, 113, 0.3);
  color: #fecaca;
}
.career-inline-note.warning {
  border-color: rgba(251, 191, 36, 0.32);
  background: rgba(251, 191, 36, 0.07);
  color: #fde68a;
}
.career-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px;
  border: 1px solid rgba(45, 212, 191, 0.2);
  border-radius: 8px;
  color: #99f6e4;
  background: rgba(45, 212, 191, 0.06);
}
.career-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(153, 246, 228, 0.25);
  border-top-color: #99f6e4;
  border-radius: 50%;
  animation: career-spin 700ms linear infinite;
}
@keyframes career-spin { to { transform: rotate(360deg); } }
.career-empty--compact {
  padding: 14px 16px;
}
.match-summary,
.prep-output-section,
.result-section {
  display: flex;
  flex-direction: column;
  gap: var(--career-card-gap);
}
.match-summary {
  padding: 18px;
  border-left: 3px solid rgba(45, 212, 191, 0.65);
  background: rgba(45, 212, 191, 0.06);
}
.match-summary p,
.prep-output-section > p {
  margin-top: 0;
  line-height: 1.65;
}
.result-section {
  padding-top: 24px;
  border-top: 1px solid var(--border-subtle);
}
.result-section__head,
.prep-results__title {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}
.result-section__head > span {
  color: var(--text-muted);
  font-size: 12px;
}
.result-list,
.question-list,
.focus-list,
.plain-list,
.checklist,
.suggestion-list {
  display: grid;
  gap: var(--career-card-gap);
  margin: 0;
}
.result-list {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.result-list--compact {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.evidence-card,
.risk-item,
.question-list article,
.focus-list li {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.13);
}
.evidence-card h4,
.evidence-card p,
.risk-item p,
.question-list p,
.focus-list strong,
.focus-list span {
  margin: 0;
}
.evidence-card h4 {
  font-size: 14px;
  line-height: 1.45;
}
.evidence-line {
  display: grid;
  grid-template-columns: 68px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
}
.evidence-line p,
.risk-item p,
.question-list p,
.focus-list span {
  line-height: 1.55;
}
.source-badge {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 22px;
  padding: 3px 7px;
  border-radius: 5px;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
}
.source-badge--jd { color: #fde68a; background: rgba(251, 191, 36, 0.12); }
.source-badge--resume { color: #bfdbfe; background: rgba(96, 165, 250, 0.13); }
.source-badge--orion { color: #99f6e4; background: rgba(45, 212, 191, 0.12); }
.source-badge--memory { color: #e9d5ff; background: rgba(192, 132, 252, 0.12); }
.text-action {
  width: fit-content;
  border: 0;
  padding: 2px 0;
  color: #7dd3fc;
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-weight: 700;
}
.suggestion-list,
.plain-list,
.checklist,
.focus-list {
  padding-left: 20px;
}
.suggestion-list li {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: start;
}
.prep-results__title h2 {
  margin: 4px 0 0;
}
.focus-list li {
  margin-left: 4px;
}
.focus-list small,
.question-list small,
.risk-item small {
  color: var(--text-muted);
  line-height: 1.5;
}
.plain-list,
.checklist {
  line-height: 1.6;
}
.checklist {
  list-style: none;
  padding-left: 0;
}
.checklist li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.check-box {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  margin-top: 4px;
  border: 1px solid rgba(148, 163, 184, 0.5);
  border-radius: 4px;
}
.practice-box {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.feedback-box {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 2px;
}
.feedback-box h3,
.feedback-box p {
  margin: 0;
}
.drive-form,
.memory-toolbar {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) 180px auto;
  align-items: center;
  gap: 8px;
}
.drive-file,
.memory-row,
.choice-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.12);
}
.drive-file small,
.memory-row small {
  display: block;
  margin-top: 4px;
  color: var(--text-secondary);
}
.career-empty.error {
  border-color: rgba(248, 113, 113, 0.3);
  color: #fecaca;
}
.signal-card {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) 260px auto;
  gap: 12px;
  align-items: center;
  margin-bottom: 10px;
}
.career-drawer {
  position: fixed;
  right: 24px;
  top: 96px;
  width: min(440px, calc(100vw - 48px));
  padding: 18px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
}
.detail-list {
  display: grid;
  grid-template-columns: 130px 1fr;
  gap: 8px 12px;
}
.detail-list dt {
  color: rgba(148, 163, 184, 0.9);
  font-weight: 800;
}
.detail-list dd {
  margin: 0;
}
.job-intelligence {
  margin-top: 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding-top: 14px;
}
.chip-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.chip-row span {
  border: 1px solid rgba(125, 211, 252, 0.22);
  border-radius: 999px;
  padding: 4px 8px;
  background: rgba(125, 211, 252, 0.1);
  color: #bae6fd;
  font-size: 12px;
  font-weight: 800;
}
.drawer-close {
  float: right;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  font-size: 22px;
  cursor: pointer;
}
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(3, 7, 18, 0.82);
  backdrop-filter: blur(8px);
  display: grid;
  place-items: center;
  padding: 20px;
  z-index: 20;
}
.career-modal {
  width: min(680px, 100%);
  max-height: 86vh;
  overflow: auto;
  padding: 18px;
  background: #0f1724;
  border-color: rgba(148, 163, 184, 0.34);
  box-shadow: 0 28px 90px rgba(0, 0, 0, 0.62);
}
.career-modal h2 {
  margin-top: 0;
  color: #f8fafc;
}
.career-modal input,
.career-modal select,
.career-modal textarea {
  background: #080d17;
  border-color: rgba(148, 163, 184, 0.28);
  color: #f8fafc;
}
.career-modal input::placeholder,
.career-modal textarea::placeholder {
  color: rgba(203, 213, 225, 0.68);
}
.career-notice {
  margin: 12px 0 0;
  padding: 10px 12px;
  border-radius: 6px;
  background: rgba(45, 212, 191, 0.14);
  color: #99f6e4;
}
.career-notice.error {
  background: rgba(248, 113, 113, 0.14);
  color: #fecaca;
}
@media (max-width: 1100px) {
  .application-row,
  .career-card-grid,
  .prep-grid,
  .match-grid,
  .overview-grid,
  .signal-card,
  .drive-form,
  .memory-toolbar,
  .career-metrics {
    grid-template-columns: 1fr;
  }
  .result-list,
  .result-list--compact,
  .match-metadata {
    grid-template-columns: 1fr;
  }
  .career-title-row,
  .career-panel-head,
  .calendar-suggestion,
  .followup-card,
  .drive-file,
  .memory-row {
    flex-direction: column;
  }
}
@media (max-width: 640px) {
  .career-shell {
    --career-section-gap: 24px;
    padding: 16px;
  }
  .career-actions,
  .row-actions,
  .modal-actions,
  .career-action-group {
    flex-direction: column;
    align-items: stretch;
  }
  .career-actions button,
  .row-actions button,
  .row-actions select,
  .modal-actions button,
  .career-action-group button {
    width: 100%;
  }
  .career-panel,
  .career-header {
    padding: 18px;
  }
  .match-step {
    grid-template-columns: 1fr;
  }
  .career-inline-note,
  .prep-results__title {
    align-items: flex-start;
    flex-direction: column;
  }
  .evidence-line {
    grid-template-columns: 1fr;
  }
}
</style>
