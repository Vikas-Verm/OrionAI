<template>
  <div class="career-shell">
    <header class="career-header">
      <button class="career-back" type="button" @click="$emit('close')">
        <span aria-hidden="true">←</span>
        Back to Workspace Briefing
      </button>
      <div class="career-title-row">
        <div>
          <span class="career-kicker">Focus Area</span>
          <h1>Career &amp; Interviews</h1>
        </div>
        <div class="career-actions">
          <button class="career-btn" type="button" @click="openApplicationForm()">
            Add Application
          </button>
          <button class="career-btn" type="button" @click="openInterviewForm()">
            Add Interview
          </button>
          <button
            class="career-btn"
            type="button"
            @click="
              activeTab = 'documents';
              documentType = 'resume';
            "
          >
            Upload Resume
          </button>
          <button
            class="career-btn career-btn--primary"
            type="button"
            @click="openJobDescriptionForm()"
          >
            Add Job Description
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
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </nav>

    <main class="career-main">
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
              <span>{{ doc.processingStatus }}</span>
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

      <section v-if="activeTab === 'intelligence'" class="career-panel">
        <div class="career-panel-head">
          <div>
            <h2>Resume Match</h2>
            <p>Evidence-based comparison, no fake ATS score.</p>
          </div>
        </div>
        <form class="inline-form" @submit.prevent="saveJobDescription">
          <input v-model="jdForm.title" placeholder="JD title or role" />
          <input v-model="jdForm.sourceUrl" placeholder="Job URL optional" />
          <select v-model="jdForm.applicationId">
            <option value="">Attach to application...</option>
            <option v-for="app in applications" :key="app._id" :value="app._id">
              {{ app.company }} - {{ app.role }}
            </option>
          </select>
          <textarea v-model="jdForm.text" placeholder="Paste job description"></textarea>
          <button class="career-btn career-btn--primary" type="submit">Save Job Description</button>
        </form>
        <div class="match-row">
          <select v-model="matchApplicationId">
            <option value="">Choose application for resume match...</option>
            <option v-for="app in applications" :key="app._id" :value="app._id">
              {{ app.company }} - {{ app.role }}
            </option>
          </select>
          <button
            class="career-btn"
            type="button"
            :disabled="!matchApplicationId || matching"
            @click="runResumeMatch"
          >
            {{ matching ? "Comparing..." : "Run Resume Match" }}
          </button>
        </div>
        <div v-if="!matchResult" class="career-empty">
          Add the job description for role-specific preparation.
        </div>
        <div v-else class="match-grid">
          <MatchColumn title="Strong matches" :items="matchResult.strongMatches" />
          <MatchColumn title="Partial matches" :items="matchResult.partialMatches" />
          <MatchColumn title="Missing or weak evidence" :items="matchResult.missingEvidence" />
          <section class="match-column">
            <h3>Suggested improvements</h3>
            <p v-for="item in matchResult.suggestedImprovements || []" :key="item">{{ item }}</p>
            <h3>Questions likely to arise</h3>
            <p v-for="item in matchResult.interviewRiskAreas || []" :key="item">{{ item }}</p>
          </section>
        </div>
      </section>

      <section v-if="activeTab === 'prep'" class="career-panel">
        <div class="career-panel-head">
          <div>
            <h2>Interview Preparation</h2>
            <p>Grounded in saved applications, resume, JD, notes, and the selected round.</p>
          </div>
        </div>
        <div v-if="preparing" class="career-empty">Generating interview preparation...</div>
        <div v-else-if="!prepResult" class="career-empty">
          Choose an interview and click Prepare Interview.
        </div>
        <div v-else class="prep-grid">
          <PrepSection title="Role Summary" :value="prepResult.roleSummary" />
          <PrepSection title="What to Prepare" :items="prepResult.whatToPrepare" />
          <PrepSection title="Resume-Based Questions" :items="prepResult.resumeBasedQuestions" />
          <PrepSection title="JD-Based Questions" :items="prepResult.jdBasedQuestions" />
          <PrepSection title="Company/Role Questions" :items="companyQuestions" />
          <PrepSection title="Behavioral Preparation" :items="prepResult.behavioralPreparation" />
          <PrepSection
            title="Questions to Ask Interviewer"
            :items="prepResult.questionsToAskInterviewer"
          />
          <PrepSection title="Career Memory Used" :items="memoryUsedInPrep" />
        </div>

        <div class="career-memory">
          <button class="career-btn" type="button" @click="memoryExpanded = !memoryExpanded">
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

      <section v-if="activeTab === 'practice'" class="career-panel">
        <div class="career-panel-head">
          <div>
            <h2>Practice Interview</h2>
            <p>One question at a time, with feedback that keeps your real experience intact.</p>
          </div>
        </div>
        <div v-if="!practiceSession" class="career-empty">
          Start practice from an upcoming interview.
        </div>
        <div v-else class="practice-box">
          <strong>{{ currentPracticeQuestion?.question }}</strong>
          <textarea
            v-model="practiceAnswer"
            placeholder="Answer with your real experience"
          ></textarea>
          <button
            class="career-btn career-btn--primary"
            type="button"
            :disabled="practiceSubmitting"
            @click="submitPracticeAnswer"
          >
            {{ practiceSubmitting ? "Saving..." : "Submit answer" }}
          </button>
          <div v-if="currentPracticeQuestion?.feedback" class="feedback-box">
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
          </div>
        </div>
      </section>

      <section v-if="activeTab === 'followups'" class="career-panel">
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

      <section v-if="activeTab === 'signals'" class="career-panel">
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

      <section v-if="activeTab === 'offers'" class="career-panel">
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
          <input v-model="offerForm.deadline" type="date" />
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
        <p>{{ selectedApplication.role }}</p>
        <dl>
          <dt>Next action</dt>
          <dd>{{ selectedApplication.notes || "No notes yet." }}</dd>
          <dt>Job description</dt>
          <dd>{{ documentTitle(selectedApplication.jobDescriptionId) || "No JD attached." }}</dd>
          <dt>Upcoming interview</dt>
          <dd>{{ upcomingForApplication(selectedApplication._id) || "None scheduled." }}</dd>
        </dl>
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
          <input v-model="applicationForm.appliedAt" type="date" />
          <input v-model="applicationForm.nextFollowUpAt" type="date" />
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
          <input v-model="interviewForm.scheduledAt" type="datetime-local" required />
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
          <button class="career-btn career-btn--primary" type="submit">Save</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { computed, defineComponent, h, onMounted, reactive, ref } from "vue";
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
  { id: "applications", label: "Applications" },
  { id: "interviews", label: "Interviews" },
  { id: "documents", label: "Documents" },
  { id: "intelligence", label: "Resume Match" },
  { id: "prep", label: "Prep" },
  { id: "practice", label: "Practice" },
  { id: "followups", label: "Follow-ups" },
  { id: "signals", label: "Suggestions" },
  { id: "offers", label: "Offers" },
];

const loading = ref(true);
const uploading = ref(false);
const uploadProgress = ref(0);
const matching = ref(false);
const preparing = ref(false);
const practiceSubmitting = ref(false);
const activeTab = ref("applications");
const formMode = ref("");
const editingId = ref("");
const selectedApplication = ref(null);
const draftText = ref("");
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
const matchApplicationId = ref("");
const matchResult = ref(null);
const prepResult = ref(null);
const memoryExpanded = ref(false);
const memoryApplicationId = ref("");
const memoryLoading = ref(false);
const practiceSession = ref(null);
const practiceAnswer = ref("");
const emailSignalLoading = ref(false);
const emailSignals = ref([]);
const emailConnected = ref(null);
const signalLinks = reactive({});
const calendarLinks = reactive({});
const applicationForm = reactive(defaultApplicationForm());
const interviewForm = reactive(defaultInterviewForm());
const offerForm = reactive(defaultOfferForm());

const resumes = computed(() => documents.value.filter((doc) => doc.type === "resume"));
const jobDescriptions = computed(() =>
  documents.value.filter((doc) => doc.type === "job_description")
);
const currentPracticeQuestion = computed(() => practiceSession.value?.questions?.at(-1) || null);
const companyQuestions = computed(() =>
  (prepResult.value?.companyRoleQuestions || []).map((item) =>
    typeof item === "string"
      ? item
      : `${item.question || ""}${item.source ? ` (${item.source})` : ""}`
  )
);
const memoryUsedInPrep = computed(() =>
  (prepResult.value?.careerMemory || []).map(
    (memory) =>
      `${typeLabel(memory.memoryType)}: ${memory.title}${
        memory.sourceType ? ` (${memory.sourceType})` : ""
      }`
  )
);

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

function upcomingForApplication(id) {
  const interview = interviews.value.find((item) => String(item.applicationId) === String(id));
  return interview ? formatDateTime(interview.scheduledAt) : "";
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

function closeForm() {
  formMode.value = "";
  editingId.value = "";
}

async function saveForm() {
  try {
    if (formMode.value === "application") {
      if (editingId.value) await careerAPI.updateApplication(editingId.value, applicationForm);
      else await careerAPI.createApplication(applicationForm);
      showNotice("Application saved");
    } else if (formMode.value === "interview") {
      if (editingId.value) await careerAPI.updateInterview(editingId.value, interviewForm);
      else await careerAPI.createInterview(interviewForm);
      showNotice("Interview saved");
    } else {
      await saveJobDescription();
    }
    closeForm();
    await refreshAll();
  } catch (error) {
    showNotice(error.response?.data?.error || "Could not save", "error");
  }
}

async function changeApplicationStatus(app, status) {
  await careerAPI.updateApplication(app._id, { status });
  await refreshAll();
}

async function archiveApplication(app) {
  if (!window.confirm(`Archive ${app.company} - ${app.role}?`)) return;
  await careerAPI.deleteApplication(app._id);
  await refreshAll();
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
  const title = window.prompt("Rename document", doc.title);
  if (!title) return;
  await careerAPI.updateDocument(doc._id, { title });
  await refreshAll();
}

async function deleteDocument(doc) {
  if (!window.confirm(`Archive ${doc.title}?`)) return;
  await careerAPI.deleteDocument(doc._id);
  await refreshAll();
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

async function deleteMemory(memory) {
  if (!window.confirm(`Delete memory "${memory.title}"?`)) return;
  await careerAPI.deleteMemory(memory._id);
  await loadMemory();
}

async function clearSelectedApplicationMemory() {
  const app = applications.value.find((item) => item._id === memoryApplicationId.value);
  const label = app ? `${app.company} - ${app.role}` : "this application";
  if (!window.confirm(`Clear all Career memory for ${label}?`)) return;
  await careerAPI.clearApplicationMemory(memoryApplicationId.value);
  await loadMemory();
}

async function clearAllMemory() {
  if (!window.confirm("Clear all Career memory?")) return;
  await careerAPI.clearMemory();
  await loadMemory();
}

async function saveJobDescription() {
  await careerAPI.createJobDescription(jdForm);
  Object.assign(jdForm, { title: "", sourceUrl: "", applicationId: "", text: "" });
  showNotice("Job description saved");
  await refreshAll();
}

async function runResumeMatch() {
  matching.value = true;
  try {
    const { data } = await careerAPI.resumeMatch(matchApplicationId.value);
    matchResult.value = data.match;
  } catch (error) {
    showNotice(error.response?.data?.error || "Could not compare resume and JD", "error");
  } finally {
    matching.value = false;
  }
}

async function prepareInterview(interview) {
  activeTab.value = "prep";
  preparing.value = true;
  try {
    const { data } = await careerAPI.prepareInterview(interview._id);
    prepResult.value = data.preparation;
    await refreshAll();
  } catch (error) {
    showNotice(error.response?.data?.error || "Could not prepare interview", "error");
  } finally {
    preparing.value = false;
  }
}

function prepareApplication(app) {
  const interview = interviews.value.find((item) => String(item.applicationId) === String(app._id));
  if (interview) return prepareInterview(interview);
  selectedApplication.value = app;
  activeTab.value = "prep";
  prepResult.value = null;
  showNotice("Add an interview to generate round-specific preparation.", "error");
}

async function startPractice(interview) {
  const { data } = await careerAPI.startPractice(interview._id, {
    type: interview.roundType || "role_specific",
  });
  practiceSession.value = data.session;
  practiceAnswer.value = "";
  activeTab.value = "practice";
}

async function submitPracticeAnswer() {
  if (!practiceAnswer.value.trim()) return;
  practiceSubmitting.value = true;
  try {
    const { data } = await careerAPI.answerPractice(practiceSession.value._id, {
      answer: practiceAnswer.value,
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
  const company = signal.companyHint || window.prompt("Company for this application");
  if (createApplication && !company) return;
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

const MatchColumn = defineComponent({
  props: { title: String, items: { type: Array, default: () => [] } },
  setup(props) {
    return () =>
      h("section", { class: "match-column" }, [
        h("h3", props.title),
        ...(props.items.length
          ? props.items
          : [{ jdRequirement: "No entries yet", resumeEvidence: "", assessment: "" }]
        ).map((item) =>
          h("article", { class: "match-item" }, [
            h("strong", item.jdRequirement || item),
            item.resumeEvidence ? h("p", item.resumeEvidence) : null,
            item.assessment ? h("span", item.assessment) : null,
          ])
        ),
      ]);
  },
});

const PrepSection = defineComponent({
  props: { title: String, value: String, items: { type: Array, default: () => [] } },
  setup(props) {
    const labelFor = (item) => {
      if (typeof item === "string") return item;
      return item?.question || item?.title || item?.text || item?.name || "";
    };
    return () =>
      h("section", { class: "prep-section" }, [
        h("h3", props.title),
        props.value ? h("p", props.value) : null,
        ...(props.items || []).map((item) => h("p", labelFor(item))),
      ]);
  },
});

onMounted(async () => {
  await refreshAll();
  const focus = store.moduleContext?.focus || "";
  if (tabs.some((tab) => tab.id === focus)) activeTab.value = focus;
  if (focus === "followups") activeTab.value = "followups";
  const interviewId = store.moduleContext?.interviewId || "";
  const interview = interviews.value.find((item) => String(item._id) === String(interviewId));
  if (interview) prepareInterview(interview);
});
</script>

<style scoped>
.career-shell {
  min-height: 100vh;
  padding: 24px;
  color: var(--text-primary);
  background: linear-gradient(180deg, rgba(8, 13, 26, 0.98), rgba(12, 17, 28, 0.96));
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
  padding: 18px;
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
.career-tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.career-btn--primary {
  background: rgba(45, 212, 191, 0.22);
  border-color: rgba(45, 212, 191, 0.38);
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
  margin: 16px 0;
}
.career-tabs button.active {
  background: rgba(125, 211, 252, 0.16);
  border-color: rgba(125, 211, 252, 0.35);
}
.career-main {
  position: relative;
}
.career-panel {
  padding: 18px;
}
.career-empty {
  border: 1px dashed rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  padding: 18px;
}
.application-table,
.career-card-grid,
.prep-grid,
.match-grid {
  display: grid;
  gap: 12px;
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
.match-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.inline-form,
.career-modal {
  display: grid;
  gap: 10px;
  margin-bottom: 14px;
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
  margin-top: 18px;
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
  margin: 12px 0;
}
.drive-panel,
.memory-panel {
  display: grid;
  gap: 10px;
  margin-top: 10px;
}
.drive-form,
.memory-toolbar {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) 180px auto;
  align-items: center;
  gap: 8px;
}
.drive-file,
.memory-row {
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
  .signal-card,
  .drive-form,
  .memory-toolbar,
  .career-metrics {
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
    padding: 12px;
  }
  .career-actions,
  .row-actions {
    flex-direction: column;
  }
}
</style>
