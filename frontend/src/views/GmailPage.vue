<template>
  <div class="gm-root">

    <!-- ══ SIDEBAR ══ -->
    <div :class="['gm-sidebar', !sidebarOpen && 'gm-sidebar--collapsed']">
      <div class="gm-brand">
        <svg width="28" height="28" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
          <path fill="#4caf50" d="M45 16.2l-5 2.75-5 4.75V40h7s3 0 3-3V16.2z"/>
          <path fill="#1e88e5" d="M3 16.2l3.5 2.75L11 23.7V40H4s-3 0-3-3V16.2z"/>
          <polygon fill="#e53935" points="35,11.2 24,19.45 13,11.2 12,17 13,17 24,24.75 35,17 36,17"/>
          <path fill="#c62828" d="M3,12.298V16.2l10,7.5V11.2L9.876,8.859C9.132,8.301,8.228,8,7.298,8h0C4.924,8,3,9.924,3,12.298z"/>
          <path fill="#fbc02d" d="M45,12.298V16.2l-10,7.5V11.2l3.124-2.341C38.868,8.301,39.772,8,40.702,8h0C43.076,8,45,9.924,45,12.298z"/>
        </svg>
        <span class="gm-brand-name">Gmail</span>
      </div>

      <button class="gm-compose" @click="showCompose = true">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Compose
      </button>

      <nav class="gm-nav">
        <button v-for="f in folders" :key="f.key"
          :class="['gm-nav-btn', activeFolder === f.key ? 'active' : '']"
          @click="switchFolder(f.key)">
          <span class="gm-nav-icon" v-html="f.svg"></span>
          <span class="gm-nav-label">{{ f.label }}</span>
          <span v-if="labelCounts[f.key] > 0" class="gm-badge">
            {{ formatCompactCount(labelCounts[f.key]) }}
          </span>
        </button>
      </nav>

      <!-- <div class="gm-quota">
        <div class="gm-quota-bar">
          <div class="gm-quota-fill"
            :style="{ width: storageQuota.limit ? Math.min(100, storageQuota.usage / storageQuota.limit * 100).toFixed(1) + '%' : '0%' }">
          </div>
        </div>
        <span class="gm-quota-text">
          <template v-if="storageQuota.scopeError">Storage unavailable</template>
          <template v-else-if="storageQuota.limit">{{ formatQuotaBytes(storageQuota.usage) }} of {{ formatQuotaBytes(storageQuota.limit) }} used</template>
          <template v-else>Loading storage…</template>
        </span>
      </div> -->

      <!-- ── Account profile pill ── -->
      <div class="gm-profile-wrap" v-if="gmailProfile" ref="profileWrapRef">
        <button class="gm-profile-btn" @click.stop="showProfileMenu = !showProfileMenu">
          <img v-if="gmailProfile.picture" :src="gmailProfile.picture" class="gm-profile-img" referrerpolicy="no-referrer" />
          <div v-else class="gm-profile-av" :style="{ background: avatarColor(gmailProfile.name || gmailProfile.email) }">
            {{ profileInitials() }}
          </div>
          <div class="gm-profile-text">
            <span class="gm-profile-name">{{ gmailProfile.name || gmailProfile.email }}</span>
            <span class="gm-profile-email">{{ gmailProfile.email }}</span>
          </div>
          <svg class="gm-profile-caret" :style="{ transform: showProfileMenu ? 'rotate(180deg)' : '' }" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>

        <!-- Dropdown menu -->
        <transition name="gm-fade">
        <div v-if="showProfileMenu" class="gm-profile-menu" @click.stop>
          <!-- Profile header -->
          <div class="gm-pm-header">
            <img v-if="gmailProfile.picture" :src="gmailProfile.picture" class="gm-pm-avatar-img" referrerpolicy="no-referrer" />
            <div v-else class="gm-pm-avatar" :style="{ background: avatarColor(gmailProfile.name || gmailProfile.email) }">
              {{ profileInitials() }}
            </div>
            <div class="gm-pm-info">
              <div class="gm-pm-name">{{ gmailProfile.name }}</div>
              <div class="gm-pm-email">{{ gmailProfile.email }}</div>
            </div>
          </div>
          <div class="gm-pm-divider"></div>
          <button class="gm-pm-item">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            Manage Google Account
          </button>
          <button class="gm-pm-item" @click="showProfileMenu=false; $emit('open-integrations')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
            Add another account
          </button>
          <div class="gm-pm-divider"></div>
          <button class="gm-pm-item gm-pm-item--danger" @click="showProfileMenu=false; $emit('open-integrations')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Disconnect Gmail
          </button>
        </div>
        </transition>
      </div>
    </div>

    <!-- ══ LIST PANE ══ -->
    <div class="gm-list-pane">
      <!-- Toggle + Search row -->
      <div class="gm-list-topbar">
        <button class="gm-toggle-btn" @click="sidebarOpen = !sidebarOpen" :title="sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <div class="gm-search-wrap">
        <svg class="gm-search-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input v-model="searchQuery" class="gm-search-input"
          :placeholder="`Search ${folderLabel}…`"
          @keyup.enter="doSearch" />
        <button v-if="searchQuery" class="gm-search-x" @click="searchQuery = ''">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        </div>
      </div>

      <!-- Tab row + refresh button -->
      <div class="gm-tab-row">
        <span class="gm-tab-label">{{ searchQuery ? `"${searchQuery}"` : folderLabel }}</span>
        <span v-if="!loading && emails.length" class="gm-tab-count">
          {{ emails.length }}{{ nextPageToken ? '+' : '' }}
        </span>
        <!-- Refresh button -->
        <button class="gm-refresh-btn" @click="refreshEmails" :disabled="refreshing || loading" title="Refresh inbox">
          <svg :class="refreshing ? 'gm-spin' : ''" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <polyline points="23 4 23 10 17 10"/>
            <polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
        </button>
        <!-- Live indicator -->
        <span class="gm-sync-badge gm-sync-badge--live" title="Connected — emails load directly from Gmail">
          <span class="gm-sync-dot gm-sync-dot--live"></span>
          Live
        </span>
      </div>

      <div class="gm-insights-wrap">
        <CommunicationInsightsWidget
          title="OrionAI insights"
          panel-title="Reply / Action Required"
          :panel-headline="'Gmail threads OrionAI believes are genuinely waiting on you'"
          :summary-text="gmailActionSummary"
          :counts="gmailActionCounts"
          :items="gmailActionItems"
          :groups="gmailActionGroups"
          :loading="gmailActionsLoading"
          :selected-conversation-id="selectedEmail?.threadId || selectedId"
          @refresh="refreshGmailActions"
          @open="openGmailActionConversation"
          @draft="draftGmailActionConversation"
          @done="completeGmailAction"
          @snooze="snoozeGmailAction"
          @dismiss="dismissGmailAction"
        />
      </div>

      <!-- New email toast banner — shows when WS pushes new Gmail notification -->
      <transition name="gm-slide-down">
        <div v-if="newEmailBanner" class="gm-new-email-banner" @click="dismissBanner">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22 6 12 13 2 6"/>
          </svg>
          <span>{{ newEmailBanner }}</span>
          <button class="gm-new-email-banner-btn" @click.stop="refreshEmails(); dismissBanner()">View</button>
          <button class="gm-new-email-banner-close" @click.stop="dismissBanner">✕</button>
        </div>
      </transition>
      <!-- Skeleton -->
      <div v-if="loading" class="gm-list-scroll">
        <div v-for="i in 9" :key="i" class="gm-skel-row">
          <div class="gm-skel-av"></div>
          <div class="gm-skel-lines">
            <div class="gm-skel-l" style="width:68%"></div>
            <div class="gm-skel-l" style="width:88%"></div>
            <div class="gm-skel-l" style="width:52%"></div>
          </div>
        </div>
      </div>

      <!-- List -->
      <div v-else class="gm-list-scroll" ref="emailListRef">
        <div v-if="!emails.length" class="gm-empty-list">
          <template v-if="loading">
            <div class="gm-sync-spinner"></div>
            <p>Loading…</p>
          </template>
          <template v-else>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".3"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/></svg>
            <p>{{ searchQuery ? 'No results found' : 'Nothing here' }}</p>
          </template>
        </div>

        <div v-for="email in emails" :key="email.id"
          :class="['gm-row', selectedId === email.id && 'gm-row--active', email.unread && 'gm-row--unread']"
          @click="openEmail(email)">

          <div class="gm-row-av"
            :class="isLogoMode(displayFrom(email)) && !contactPhotoUrl(displayFrom(email)) ? 'gm-row-av--logo' : ''"
            :style="(!contactPhotoUrl(displayFrom(email)) && !isLogoMode(displayFrom(email))) ? { background: avatarColor(displayFrom(email)) } : {}">
            <!-- Real contact photo (Google People API) -->
            <img v-if="contactPhotoUrl(displayFrom(email))"
              :src="contactPhotoUrl(displayFrom(email))"
              class="gm-av-img" referrerpolicy="no-referrer" />
            <!-- Company logo — only when isLogoMode is true -->
            <img v-else-if="isLogoMode(displayFrom(email))"
              :src="logoUrl(displayFrom(email))"
              class="gm-av-img gm-av-img--logo"
              @error="markLogoFailed(displayFrom(email))"
              referrerpolicy="no-referrer" />
            <!-- Initials -->
            <span v-else>{{ avatarInitials(displayFrom(email)) }}</span>
          </div>

          <div class="gm-row-content">
            <div class="gm-row-line1">
              <span class="gm-row-from">{{ senderName(displayFrom(email)) }}</span>
              <div class="gm-row-line1-meta">
                <span class="gm-row-date">{{ email.date }}</span>
              </div>
            </div>
            <div class="gm-row-subject">{{ email.subject }}</div>
            <div class="gm-row-snippet">{{ email.snippet }}</div>
          </div>

          <div v-if="email.unread" class="gm-row-dot"></div>
        </div>

        <!-- sentinel -->
        <div ref="sentinelRef" class="gm-sentinel">
          <span v-if="loadingMore" class="gm-spinner"></span>
          <span v-else-if="!nextPageToken && emails.length" class="gm-done-label">✓ All loaded</span>
        </div>
      </div>
    </div>

    <!-- ══ DETAIL PANE ══ -->
    <div class="gm-detail">

      <!-- Empty -->
      <div v-if="!selectedEmail" class="gm-detail-empty">
        <div class="gm-detail-empty-ring">
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#EA4335" stroke-width="1.1" opacity=".5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/></svg>
        </div>
        <div class="gm-detail-empty-title">No email selected</div>
        <div class="gm-detail-empty-sub">Choose a message from the list</div>
      </div>

      <template v-else>
        <!-- Header — subject only, sender info moves into thread cards -->
        <div class="gm-detail-head">
          <div class="gm-detail-subj-row">
            <h2 class="gm-detail-subj">{{ selectedEmail.subject }}</h2>
            <div class="gm-detail-btns">
              <button class="gm-icon-btn" title="Star">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              </button>
              <button class="gm-icon-btn" title="Archive">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
              </button>
              <button class="gm-icon-btn" title="Delete">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Thread scroll — all messages in conversation -->
        <div class="gm-thread-scroll" ref="threadScrollRef">
          <!-- Loading skeleton -->
          <div v-if="threadLoading" class="gm-thread-loading">
            <div v-for="i in 2" :key="i" class="gm-skel-row" style="padding:20px 24px;margin:0">
              <div class="gm-skel-av"></div>
              <div class="gm-skel-lines" style="flex:1">
                <div class="gm-skel-l" style="width:50%"></div>
                <div class="gm-skel-l" style="width:80%"></div>
                <div class="gm-skel-l" style="width:65%"></div>
                <div class="gm-skel-l" style="width:90%"></div>
                <div class="gm-skel-l" style="width:40%"></div>
              </div>
            </div>
          </div>

          <!-- Thread messages -->
          <div v-else class="gm-thread-msgs">
            <div v-for="(msg, idx) in threadMessages" :key="msg.id"
              :class="[
                'gm-thread-msg',
                msg.direction === 'outbound' ? 'gm-thread-msg--outbound' : 'gm-thread-msg--inbound',
                msg._optimistic && 'gm-thread-msg--sending',
              ]">
              <!-- Message header -->
              <div class="gm-tm-hdr">
                <!-- Avatar: contact photo > own profile > company logo > initials -->
                <div class="gm-detail-av"
                  :class="isLogoMode(msg.from) && !isSelf(msg.from) && !contactPhotoUrl(msg.from) ? 'gm-row-av--logo' : ''"
                  :style="getSenderAvatarStyle(msg.from)">
                  <!-- Real Google contact photo -->
                  <img v-if="contactPhotoUrl(msg.from)"
                    :src="contactPhotoUrl(msg.from)"
                    class="gm-av-img" referrerpolicy="no-referrer" />
                  <!-- Own Google profile photo -->
                  <img v-else-if="isSelf(msg.from) && gmailProfile?.picture"
                    :src="gmailProfile.picture"
                    class="gm-av-img" referrerpolicy="no-referrer" />
                  <!-- Company logo — only when isLogoMode is true -->
                  <img v-else-if="!isSelf(msg.from) && isLogoMode(msg.from)"
                    :src="logoUrl(msg.from)"
                    class="gm-av-img gm-av-img--logo"
                    @error="markLogoFailed(msg.from)"
                    referrerpolicy="no-referrer" />
                  <!-- Initials fallback -->
                  <span v-else>{{ isSelf(msg.from) ? profileInitials() : avatarInitials(msg.from) }}</span>
                </div>
                <div class="gm-tm-sender-info">
                  <div class="gm-tm-sender-row">
                    <span class="gm-detail-sender-name">{{ senderName(msg.from) }}</span>
                    <span
                      class="gm-direction-chip"
                      :class="msg.direction === 'outbound' ? 'is-outbound' : 'is-inbound'"
                    >
                      {{ msg.direction === 'outbound' ? 'Sent' : 'Received' }}
                    </span>
                    <span v-if="msg.unread" class="gm-unread-chip">Unread</span>
                  </div>
                  <div class="gm-detail-sender-email">&lt;{{ extractEmail(msg.from) }}&gt;</div>
                  <div v-if="msg.to" class="gm-tm-to">
                    <span class="gm-detail-to-lbl">To</span>
                    <span class="gm-detail-to-val">{{ msg.to }}</span>
                  </div>
                </div>
                <span class="gm-detail-date-pill">{{ msg.date }}</span>
              </div>

              <!-- Message body: iframe for RICH HTML only, plain text renderer for simple replies -->
              <div class="gm-tm-body">
                <iframe v-if="isRichEmail(msg)"
                  :srcdoc="wrapHtml(msg.html)"
                  class="gm-html-frame"
                  @load="onFrameLoad($event)"
                  sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
                  scrolling="no"
                />
                <div v-else class="gm-body-text" v-html="renderEmailBody(msg.body || plainFromHtml(msg.html) || msg.snippet)" />
              </div>

              <!-- Attachments -->
              <div v-if="msg.attachments && msg.attachments.length" class="gm-tm-atts">
                <div class="gm-atts-label">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
                  {{ msg.attachments.length }} attachment{{ msg.attachments.length > 1 ? 's' : '' }}
                </div>
                <div class="gm-atts-grid">
                  <div v-for="att in msg.attachments" :key="att.attachmentId" class="gm-att-chip">
                    <span class="gm-att-icon">{{ attIcon(att.mimeType) }}</span>
                    <span class="gm-att-name">{{ att.filename }}</span>
                    <span class="gm-att-size">{{ formatSize(att.size) }}</span>
                  </div>
                </div>
              </div>

              <!-- Thread divider between messages -->
              <div v-if="idx < threadMessages.length - 1" class="gm-thread-divider"></div>
            </div>
          </div>
        </div>

        <!-- Reply -->
        <div class="gm-reply-dock">
          <div v-if="!showReply" class="gm-reply-chip" @click="openReply">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 00-4-4H4"/></svg>
            <span>Reply to <strong>{{ replyTargetName }}</strong></span>
            <span class="gm-reply-chip-hint">Click to compose</span>
          </div>

          <div v-else class="gm-reply-composer">
            <div class="gm-rc-header">
              <div class="gm-rc-to">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 00-4-4H4"/></svg>
                Replying to <strong>{{ replyTargetName }}</strong>
              </div>
              <div style="display:flex;align-items:center;gap:10px">
                <button v-if="!showReplyCC" class="gm-ccbcc-btn" style="margin:0" @click="showReplyCC=true">Cc</button>
                <span v-if="replySent" class="gm-sent-flash">✓ Sent!</span>
                <button class="gm-rc-close" @click="showReply=false">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>
            <!-- Reply CC field -->
            <div v-if="showReplyCC" class="gm-rc-cc-row">
              <label>Cc</label>
              <input v-model="replyCC" placeholder="Cc recipients" class="gm-rc-cc-input" />
              <button class="gm-ccbcc-rm" @click="showReplyCC=false; replyCC=''">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div v-if="suggestLoading" class="gm-ai-pill ai-loading">
              <span class="gm-spinner sm"></span> Generating AI reply…
            </div>
            <div v-else-if="replyDraft" class="gm-ai-pill ai-ready">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              AI suggestion — edit freely
              <button @click="replyDraft=''" class="gm-ai-clr">Clear</button>
            </div>

            <textarea v-model="replyDraft" class="gm-rc-textarea"
              placeholder="Write your reply…" rows="5" :disabled="suggestLoading" />

            <!-- Reply attachment chips -->
            <div v-if="replyAttachments.length" class="gm-att-chips gm-att-chips--reply">
              <div v-for="(att, i) in replyAttachments" :key="i" class="gm-att-chip-pill">
                <span class="gm-att-chip-icon">{{ attIcon(att.mimeType) }}</span>
                <span class="gm-att-chip-name">{{ att.name }}</span>
                <span class="gm-att-chip-size">{{ formatSize(att.size) }}</span>
                <button class="gm-att-chip-rm" @click="replyAttachments.splice(i,1)" title="Remove">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>

            <!-- Hidden file input for reply -->
            <input ref="replyFileInputRef" type="file" multiple style="display:none"
              @change="onReplyFilePick" />

            <div class="gm-rc-footer">
              <button class="gm-send-btn" :disabled="!replyDraft.trim()||replySending" @click="sendReply">
                <span v-if="replySending" class="gm-spinner sm"></span>
                <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                {{ replySending ? 'Sending…' : 'Send' }}
              </button>
              <!-- Paperclip -->
              <button class="gm-attach-btn" @click="replyFileInputRef.click()" title="Attach files">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
                <span v-if="replyAttachments.length" class="gm-attach-badge">{{ replyAttachments.length }}</span>
              </button>
              <button class="gm-discard-btn" @click="showReply=false; replyAttachments=[]">Discard</button>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- ══ COMPOSE MODAL ══ -->
    <transition name="gm-fade">
    <div v-if="showCompose" class="gm-compose-overlay" @click.self="showCompose=false">
      <div class="gm-compose-modal">
        <div class="gm-cm-titlebar">
          <span>New Message</span>
          <div style="display:flex;gap:6px">
            <button class="gm-cm-btn" @click="showCompose=false">—</button>
            <button class="gm-cm-btn gm-cm-close" @click="showCompose=false">✕</button>
          </div>
        </div>
        <div class="gm-cm-field">
          <label>To</label>
          <input v-model="composeTo" placeholder="Recipients" />
          <div class="gm-ccbcc-btns">
            <button v-if="!showCC"  class="gm-ccbcc-btn" @click="showCC=true">Cc</button>
            <button v-if="!showBCC" class="gm-ccbcc-btn" @click="showBCC=true">Bcc</button>
          </div>
        </div>
        <div v-if="showCC" class="gm-cm-field">
          <label>Cc</label>
          <input v-model="composeCC" placeholder="Cc recipients" />
          <button class="gm-ccbcc-rm" @click="showCC=false; composeCC=''">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div v-if="showBCC" class="gm-cm-field">
          <label>Bcc</label>
          <input v-model="composeBCC" placeholder="Bcc recipients" />
          <button class="gm-ccbcc-rm" @click="showBCC=false; composeBCC=''">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="gm-cm-field">
          <label>Subject</label>
          <input v-model="composeSubject" placeholder="Add a subject" />
        </div>
        <textarea v-model="composeBody" class="gm-cm-body" placeholder="Write your message…" />

        <!-- Compose attachment chips -->
        <div v-if="composeAttachments.length" class="gm-att-chips">
          <div v-for="(att, i) in composeAttachments" :key="i" class="gm-att-chip-pill">
            <span class="gm-att-chip-icon">{{ attIcon(att.mimeType) }}</span>
            <span class="gm-att-chip-name">{{ att.name }}</span>
            <span class="gm-att-chip-size">{{ formatSize(att.size) }}</span>
            <button class="gm-att-chip-rm" @click="composeAttachments.splice(i,1)" title="Remove">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <!-- Hidden file input -->
        <input ref="composeFileInputRef" type="file" multiple style="display:none"
          @change="onComposeFilePick" />

        <div class="gm-cm-footer">
          <button class="gm-send-btn" :disabled="!composeTo||!composeBody||composeSending" @click="sendCompose">
            <span v-if="composeSending" class="gm-spinner sm"></span>
            <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            {{ composeSending ? 'Sending…' : 'Send' }}
          </button>
          <!-- Paperclip -->
          <button class="gm-attach-btn" @click="composeFileInputRef.click()" title="Attach files">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
            <span v-if="composeAttachments.length" class="gm-attach-badge">{{ composeAttachments.length }}</span>
          </button>
          <button class="gm-cm-trash" @click="discardCompose" title="Discard">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>
          </button>
        </div>
      </div>
    </div>
    </transition>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import api from '../services/api'
import { agentAPI } from '../services/api'
import { useWebSocket } from '../composables/useWebSocket'
import CommunicationInsightsWidget from '../components/communications/CommunicationInsightsWidget.vue'
import { useCommunicationActions } from '../composables/useCommunicationActions'
import { store, setModuleContext } from '../stores/app'

defineEmits(['close', 'open-integrations'])

const folders = [
  { key: 'inbox',   label: 'Inbox',    svg: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>` },
  { key: 'starred', label: 'Starred',  svg: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>` },
  { key: 'sent',    label: 'Sent',     svg: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>` },
  { key: 'drafts',  label: 'Drafts',   svg: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>` },
  { key: 'all',     label: 'All Mail', svg: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/></svg>` },
]

const activeFolder   = ref('inbox')
const emails         = ref([])
const selectedEmail  = ref(null)
const selectedId     = ref(null)
const loading        = ref(false)
const loadingMore    = ref(false)
const nextPageToken  = ref(null)   // Gmail cursor — replaces page numbers
const refreshing     = ref(false)  // refresh button spinner
const searchQuery    = ref('')
const showReply      = ref(false)
const replyDraft     = ref('')
const replySending   = ref(false)
const replySent      = ref(false)
const suggestLoading = ref(false)
const showCompose    = ref(false)
const composeTo      = ref('')
const composeSubject = ref('')
const composeBody    = ref('')
const composeSending = ref(false)
const composeAttachments = ref([])   // [{ name, mimeType, size, file }]  file = File object
const composeFileInputRef = ref(null)
const replyAttachments   = ref([])   // same shape
const replyFileInputRef  = ref(null)
const composeCC   = ref('')
const composeBCC  = ref('')
const showCC      = ref(false)
const showBCC     = ref(false)
const replyCC     = ref('')
const showReplyCC = ref(false)
const sentinelRef    = ref(null)
const threadScrollRef = ref(null)
const labelCounts    = ref({ inbox: 0, starred: 0, sent: 0, drafts: 0 })
const sidebarOpen    = ref(true)
const threadMessages = ref([])
const threadLoading  = ref(false)
const gmailProfile   = ref(null)
const showProfileMenu = ref(false)
const profileWrapRef  = ref(null)
let   sseSource      = null
let   observer       = null
const newEmailBanner = ref(null)
let   bannerTimer    = null

const { notifications, unreadByApp } = useWebSocket()
const {
  actionableItems: gmailActionItems,
  counts: gmailActionCounts,
  groups: gmailActionGroups,
  loading: gmailActionsLoading,
  summaryText: gmailActionSummary,
  refresh: refreshGmailActions,
  recordAction: recordGmailAction,
} = useCommunicationActions('gmail')
let prevNotifCount = notifications.length
let mailboxSyncPromise = null
 
watch(notifications, (newList) => {
  // Find newest Gmail notification we haven't seen yet
  if (newList.length <= prevNotifCount) { prevNotifCount = newList.length; return }
  const newest = newList[0]
  if (newest?.app === 'gmail' && newest?.isNew !== false) {
    const subject = newest.items?.[0]?.subject || newest.summary || 'New email'
    const from    = newest.items?.[0]?.from    || ''
    const name    = from.match(/^([^<]+)</)?.[1]?.trim() || from.split('@')[0] || 'Someone'
    newEmailBanner.value = `${name}: ${subject.slice(0, 50)}${subject.length > 50 ? '…' : ''}`
 
    // Auto-refresh the inbox list so new email appears
    syncMailboxView().catch(() => {})
 
    // Auto-dismiss after 8s
    clearTimeout(bannerTimer)
    bannerTimer = setTimeout(dismissBanner, 8000)
  }
  prevNotifCount = newList.length
}, { deep: true })
 
function dismissBanner() {
  newEmailBanner.value = null
  clearTimeout(bannerTimer)
}

function notifyPriorityStateChange(reason, extras = {}) {
  document.dispatchEvent(new CustomEvent('orion:priority-refresh-needed', {
    detail: {
      reason,
      sourceApp: 'gmail',
      ...extras,
    },
  }))
}

// Close profile menu on any click outside the profile wrap
function onDocClick(e) {
  if (showProfileMenu.value && profileWrapRef.value && !profileWrapRef.value.contains(e.target)) {
    showProfileMenu.value = false
  }
}

const folderLabel = computed(() => folders.find(f => f.key === activeFolder.value)?.label ?? 'Inbox')
const latestThreadMessage = computed(() => {
  const items = threadMessages.value || []
  return items.length ? items[items.length - 1] : null
})
const latestExternalThreadMessage = computed(() => {
  return [...(threadMessages.value || [])]
    .reverse()
    .find((msg) => !(msg.isSelf || isSelf(msg.from))) || null
})
const replyTargetDisplay = computed(() => {
  if (latestThreadMessage.value && !(latestThreadMessage.value.isSelf || isSelf(latestThreadMessage.value.from))) {
    return latestThreadMessage.value.replyTo || latestThreadMessage.value.from
  }
  if (latestExternalThreadMessage.value) {
    return latestExternalThreadMessage.value.replyTo || latestExternalThreadMessage.value.from
  }
  if (selectedEmail.value?.isSent) {
    return selectedEmail.value.to || selectedEmail.value.from || ''
  }
  return selectedEmail.value?.replyTo || selectedEmail.value?.from || selectedEmail.value?.to || ''
})
const replyTargetAddress = computed(() => extractEmail(replyTargetDisplay.value))
const replyTargetName = computed(() => senderName(replyTargetDisplay.value || selectedEmail.value?.from || selectedEmail.value?.to || ''))

function formatCompactCount(value) {
  const count = Number(value || 0)
  if (count < 1000) return String(count)
  return new Intl.NumberFormat('en-IN', {
    notation: 'compact',
    maximumFractionDigits: count >= 10000 ? 0 : 1,
  }).format(count)
}

// ── Real unread counts via Labels API (single cheap call) ──
async function fetchLabelCounts() {
  try {
    const res = await api.get('/api/gmail/labels', {
      params: { _: Date.now() },
      headers: { 'Cache-Control': 'no-cache' },
    })
    labelCounts.value = { ...labelCounts.value, ...res.data }
  } catch(e) {console.error('Failed to fetch label counts:', e.message) }
}

// ── Fetch Gmail profile (name, email, picture) ──
async function fetchGmailProfile() {
  try {
    // First, get stored name/email from integration doc
    const res = await api.get('/api/integrations')
    const gmail = (res.data || []).find(i => i.type === 'gmail' && i.enabled)
    if (!gmail?.gmail) return

    gmailProfile.value = {
      email:   gmail.gmail.userEmail || '',
      name:    gmail.gmail.userName  || '',
      picture: null,
    }

    // Fetch live profile picture from Google
    const pic = await api.get('/api/gmail/profile-picture')
    if (pic.data?.picture) {
      gmailProfile.value = {
        ...gmailProfile.value,
        picture: pic.data.picture,
        name:    pic.data.name  || gmailProfile.value.name,
        email:   pic.data.email || gmailProfile.value.email,
      }
    }
  } catch(e) { console.error('Profile fetch failed:', e.message) }
}

// ── Contact photo cache: email address → photo URL (or null if none) ──
const contactPhotos = ref({})   // { 'akash@poshn.co': 'https://lh3.google...' }
const contactPhotosFetching = new Set()   // emails currently in-flight

async function fetchContactPhotos(fromList) {
  // Extract unique personal-sender emails we haven't fetched yet
  const needed = [...new Set(
    fromList
      .map(f => extractEmail(f).toLowerCase())
      .filter(e => e && !(e in contactPhotos.value) && !contactPhotosFetching.has(e)
                && !isSelf_email(e))
  )]
  if (!needed.length) return
  needed.forEach(e => contactPhotosFetching.add(e))
  try {
    const res = await api.post('/api/gmail/contact-photos', { emails: needed })
    const data = res.data || {}
    // Merge results — null means "tried and found nothing"
    const updated = { ...contactPhotos.value }
    needed.forEach(e => { updated[e] = data[e] || null })
    contactPhotos.value = updated
  } catch { /* silently ignore — fallback to initials */ }
  finally { needed.forEach(e => contactPhotosFetching.delete(e)) }
}

function isSelf_email(email) {
  return gmailProfile.value?.email?.toLowerCase() === email.toLowerCase()
}

function contactPhotoUrl(from) {
  const email = extractEmail(from).toLowerCase()
  return contactPhotos.value[email] || null
}

// ── SSE — listens for inbox_updated pushes (e.g. after sending email) ──
function connectSSE() {
  if (sseSource) sseSource.close()
  sseSource = new EventSource('/api/gmail/events', { withCredentials: true })
  sseSource.addEventListener('inbox_updated', async () => {
    await syncMailboxView()
  })
}

// ── Refresh emails (manual button) ────────────────────────────
async function refreshEmails() {
  refreshing.value = true
  await syncMailboxView()
  refreshing.value = false
}

// ── Load emails (reset to first page) ─────────────────────────
async function loadEmails(silent = false) {
  if (!silent) loading.value = true
  if (!silent) {
    nextPageToken.value = null
    emails.value = []
  }
  try {
    const res = await api.post('/api/gmail/list', {
      folder:    activeFolder.value,
      search:    searchQuery.value.trim(),
      pageToken: null,
    })
    emails.value        = res.data.emails       || []
    nextPageToken.value = res.data.nextPageToken || null
    fetchContactPhotos(emails.value.map(e => e.from))
  } catch (e) { console.error('Gmail load failed:', e.message) }
  finally {
    loading.value = false
    setTimeout(setupObserver, 50)
  }
}

async function syncMailboxView() {
  if (mailboxSyncPromise) return mailboxSyncPromise
  mailboxSyncPromise = Promise.all([
    fetchLabelCounts(),
    loadEmails(true),
    refreshGmailActions({ silent: true }),
  ])
    .finally(() => { mailboxSyncPromise = null })
  return mailboxSyncPromise
}

function onWindowFocus() {
  syncMailboxView().catch(() => {})
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') {
    syncMailboxView().catch(() => {})
  }
}

watch(
  () => unreadByApp.gmail?.count,
  (next, prev) => {
    if (typeof next !== 'number') return
    if (prev === undefined || next === prev) return
    if (document.visibilityState !== 'visible') return
    syncMailboxView().catch(() => {})
  }
)

// ── Load next page (cursor-based) ─────────────────────────────
async function loadMore() {
  if (loadingMore.value || !nextPageToken.value) return
  loadingMore.value = true
  const token = nextPageToken.value
  try {
    const res = await api.post('/api/gmail/list', {
      folder:    activeFolder.value,
      search:    searchQuery.value.trim(),
      pageToken: token,
    })
    emails.value        = [...emails.value, ...(res.data.emails || [])]
    nextPageToken.value = res.data.nextPageToken || null
    fetchContactPhotos((res.data.emails || []).map(e => e.from))
  } catch (e) { console.error('loadMore failed:', e.message) }
  finally { loadingMore.value = false }
}

function setupObserver() {
  if (observer) observer.disconnect()
  observer = new IntersectionObserver(
    ([e]) => { if (e.isIntersecting) loadMore() },
    { threshold: 0.1 }
  )
  if (sentinelRef.value) observer.observe(sentinelRef.value)
}

let searchTimer = null
watch(searchQuery, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(loadEmails, 400)
})

// Auto-scroll to bottom of thread when a new message is appended
watch(() => threadMessages.value.length, async (newLen, oldLen) => {
  if (newLen > oldLen && threadScrollRef.value) {
    await nextTick()
    threadScrollRef.value.scrollTo({ top: threadScrollRef.value.scrollHeight, behavior: 'smooth' })
  }
})

async function switchFolder(key) {
  activeFolder.value  = key
  searchQuery.value   = ''
  selectedEmail.value = null
  selectedId.value    = null
  await loadEmails()
}
async function doSearch() { clearTimeout(searchTimer); await loadEmails() }

function applyBriefingContext() {
  const context = store.moduleContext
  if (!context || context.module !== 'gmail') return

  activeFolder.value = context.activeFolder || 'inbox'
  searchQuery.value = context.searchQuery || ''
  selectedEmail.value = null
  selectedId.value = null
  setModuleContext(null)
}

async function openEmail(email) {
  selectedId.value    = email.id
  selectedEmail.value = email
  showReply.value     = false
  replyDraft.value    = ''
  replySent.value     = false
  threadMessages.value = []
  threadLoading.value  = true
  try {
    const res = await api.post('/api/gmail/thread', { threadId: email.threadId })
    threadMessages.value = res.data.messages || []
    if (res.data.thread) {
      selectedEmail.value = { ...email, ...res.data.thread }
    }
    // Fetch contact photos for all thread participants
    fetchContactPhotos(threadMessages.value.map(m => m.from))
    refreshGmailActions({ silent: true }).catch(() => {})
  } catch (e) {
      console.log('Thread fetch failed, trying single message fetch:', e.message)
    // Fallback to single message fetch
    try {
      const res = await api.post('/api/gmail/message', { messageId: email.id })
      selectedEmail.value  = { ...email, ...res.data }
      threadMessages.value = [selectedEmail.value]
    } catch (e2) { console.error(e2.message) }
  } finally {
    threadLoading.value = false
  }
  // Mark as read locally
  const i = emails.value.findIndex(e => e.id === email.id)
  if (i !== -1 && emails.value[i].unread) {
    emails.value[i] = { ...emails.value[i], unread: false }
    notifyPriorityStateChange('gmail_read', {
      emailId: email.id,
      threadId: email.threadId,
      subject: email.subject,
    })
    setTimeout(() => {
      syncMailboxView().catch(() => {})
    }, 250)
  }
}

async function openGmailActionConversation(state) {
  const existing = emails.value.find((email) => String(email.threadId) === String(state.threadId || state.conversationId))
  if (existing) {
    await openEmail(existing)
    return
  }

  const synthetic = {
    id: state.threadId || state.conversationId,
    threadId: state.threadId || state.conversationId,
    from: state.platformMetadata?.latestFrom || state.participantLabel || '',
    to: state.platformMetadata?.latestTo || '',
    cc: state.platformMetadata?.latestCc || '',
    subject: state.conversationTitle,
    date: '',
    snippet: state.previewText || '',
    unread: true,
  }

  emails.value = [synthetic, ...emails.value.filter((email) => String(email.threadId) !== String(synthetic.threadId))]
  await openEmail(synthetic)
}

async function draftGmailActionConversation(state) {
  await openGmailActionConversation(state)
  if (selectedEmail.value) {
    await openReply()
  }
}

async function completeGmailAction(state) {
  try {
    await recordGmailAction(state, 'approved')
  } catch (err) {
    console.error('Failed to mark Gmail action done:', err.message)
  }
}

async function snoozeGmailAction(state) {
  try {
    await recordGmailAction(state, 'snoozed', { snoozeMinutes: 60 })
  } catch (err) {
    console.error('Failed to snooze Gmail action:', err.message)
  }
}

async function dismissGmailAction(state) {
  try {
    await recordGmailAction(state, 'dismissed')
  } catch (err) {
    console.error('Failed to dismiss Gmail action:', err.message)
  }
}

async function openReply() {
  if (!replyTargetAddress.value) return
  showReply.value = true; replyDraft.value = ''; suggestLoading.value = true
  try {
    const { data } = await agentAPI.gmailSuggestReply({
      subject: selectedEmail.value.subject,
      from: replyTargetDisplay.value || selectedEmail.value.from,
      body: latestThreadMessage.value?.body || selectedEmail.value.body,
      snippet: latestThreadMessage.value?.snippet || selectedEmail.value.snippet,
    })
    replyDraft.value = data.suggested || ''
  } catch (e) {console.error('AI suggestion failed:', e.message) }
  finally { suggestLoading.value = false }
}

// ── File attachment helpers ────────────────────────────────────
// Store the original File object — we'll stream it via FormData, not base64 JSON
async function onComposeFilePick(e) {
  for (const file of Array.from(e.target.files || [])) {
    composeAttachments.value.push({ name: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, file })
  }
  e.target.value = ''
}

async function onReplyFilePick(e) {
  for (const file of Array.from(e.target.files || [])) {
    replyAttachments.value.push({ name: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, file })
  }
  e.target.value = ''
}

function discardCompose() {
  showCompose.value = false
  composeTo.value = ''; composeSubject.value = ''; composeBody.value = ''
  composeCC.value = ''; composeBCC.value = ''
  showCC.value = false; showBCC.value = false
  composeAttachments.value = []
}

// Build a FormData payload so files are sent as binary (no base64 in JSON → no PayloadTooLarge)
function buildSendFormData({ to, cc, bcc, subject, body, threadId, attachments }) {
  const fd = new FormData()
  fd.append('to', to || '')
  fd.append('cc', cc || '')
  fd.append('bcc', bcc || '')
  fd.append('subject', subject || '')
  fd.append('body', body || '')
  if (threadId) fd.append('threadId', threadId)
  for (const att of (attachments || [])) {
    fd.append('attachments', att.file, att.name)
  }
  return fd
}

async function sendReply() {
  const replyTo = replyTargetAddress.value
  if ((!replyDraft.value.trim() && !replyAttachments.value.length) || !replyTo) return
  replySending.value = true

  // Capture draft state before clearing
  const draftBody = replyDraft.value
  const draftCC   = replyCC.value
  const draftAtts = [...replyAttachments.value]

  try {
    const fd = buildSendFormData({
      to:          replyTo,
      cc:          draftCC,
      subject:     `Re: ${selectedEmail.value.subject}`,
      body:        draftBody,
      threadId:    selectedEmail.value.threadId,
      attachments: draftAtts,
    })
    await api.post('/api/gmail/send', fd)

    // ── 1. Clear composer immediately ──────────────────────────
    replySent.value = true; showReply.value = false
    replyDraft.value = ''; replyAttachments.value = []
    replyCC.value = ''; showReplyCC.value = false
    setTimeout(() => replySent.value = false, 3000)
    notifyPriorityStateChange('gmail_replied', {
      threadId: selectedEmail.value.threadId,
      subject: selectedEmail.value.subject,
    })
    refreshGmailActions({ silent: true }).catch(() => {})

    // ── 2. Optimistically append sent message to thread ────────
    const now = new Date()
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const optimisticMsg = {
      id:         `optimistic_${Date.now()}`,
      threadId:   selectedEmail.value.threadId,
      from:       gmailProfile.value?.email || '',
      to:         replyTo,
      cc:         draftCC || '',
      subject:    `Re: ${selectedEmail.value.subject}`,
      timestamp:  now.getTime(),
      direction:  'outbound',
      isSelf:     true,
      senderEmail: extractEmail(gmailProfile.value?.email || ''),
      date:       timeStr,
      snippet:    draftBody.slice(0, 100),
      body:       draftBody,
      html:       '',
      attachments: draftAtts.map(a => ({ filename: a.name, mimeType: a.mimeType, size: a.size })),
      unread:     false,
      _optimistic: true,
    }
    threadMessages.value = [...threadMessages.value, optimisticMsg]

    // ── 3. Silently reload thread from API in background ───────
    // Replace optimistic message with real data once Gmail returns it
    setTimeout(async () => {
      try {
        const res = await api.post('/api/gmail/thread', { threadId: selectedEmail.value.threadId })
        if (res.data.messages?.length) {
          threadMessages.value = res.data.messages
          if (res.data.thread) {
            selectedEmail.value = { ...selectedEmail.value, ...res.data.thread }
          }
          fetchContactPhotos(res.data.messages.map(m => m.from))
        }
      } catch { /* keep optimistic message if reload fails */ }

      try {
        await syncMailboxView()
        notifyPriorityStateChange('gmail_replied', {
          threadId: selectedEmail.value.threadId,
          subject: selectedEmail.value.subject,
          sync: 'post_reply_refresh',
        })
      } catch (err) {
        console.debug('Post-reply Gmail sync refresh skipped:', err?.message || err)
      }
    }, 1500) // small delay — Gmail needs a moment to index the sent message

  } catch (e) { console.error(e.message) }
  finally { replySending.value = false }
}

async function sendCompose() {
  composeSending.value = true
  try {
    const fd = buildSendFormData({
      to:          composeTo.value,
      cc:          composeCC.value,
      bcc:         composeBCC.value,
      subject:     composeSubject.value,
      body:        composeBody.value,
      attachments: composeAttachments.value,
    })
    await api.post('/api/gmail/send', fd)
    discardCompose()
  } catch (e) { console.error(e.message) }
  finally { composeSending.value = false }
}

function senderName(from) {
  if (!from) return 'Unknown'
  const m = from.match(/^([^<]+)</)
  const raw = m ? m[1].trim() : (from.match(/([^@<\s]+)@/)?.[1] ?? from)
  // Strip surrounding quotes: "Hari Kumar (Jira)" → Hari Kumar (Jira)
  return raw.replace(/^["']+|["']+$/g, '').trim()
}
function extractEmail(from) {
  return from?.match(/<([^>]+)>/)?.[1] ?? from ?? ''
}
function avatarInitials(from) {
  const n = senderName(from), p = n.split(/\s+/)
  return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : n.slice(0, 2).toUpperCase()
}

// Show the OTHER person in the thread, not yourself.
// For sent items: show the recipient (email.to), not the sender (email.from = you).
function displayFrom(email) {
  const myEmail = gmailProfile.value?.email?.toLowerCase()
  if (!myEmail) return email.from || ''
  const from = email.from || ''
  // Explicit isSent flag (set by backend) OR from-address is self
  if (email.isSent || extractEmail(from).toLowerCase() === myEmail) {
    return email.to || from  // show recipient name, not your own name
  }
  return from
}
const PALETTE = ['#EA4335','#4285F4','#34A853','#FBBC05','#9334EA','#00897B','#E91E63','#FF6D00','#0288D1']
function avatarColor(from) {
  const n = senderName(from); let h = 0
  for (const c of n) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
  return PALETTE[Math.abs(h) % PALETTE.length]
}

// ── Sender avatar helpers ─────────────────────────────────────
const logoFailState = ref({})

// Domains where we never show a company logo (personal email providers)
const GENERIC_DOMAINS = new Set([
  'gmail.com','yahoo.com','yahoo.in','outlook.com','hotmail.com','icloud.com',
  'me.com','live.com','msn.com','aol.com','protonmail.com','zoho.com',
  'rediffmail.com','ymail.com','googlemail.com',
])

// Notification/automation domains — always show initials, never logos
// because logos (e.g. grey Jira robot) look confusing for person-named senders
const NOTIFICATION_DOMAINS = new Set([
  'atlassian.net','jira.com','github.com','gitlab.com','linear.app',
  'notion.so','asana.com','trello.com','monday.com','clickup.com',
  'figma.com','vercel.com','render.com','heroku.com','pagerduty.com',
  'sentry.io','datadog.com','newrelic.com',
])

function senderDomain(from) {
  const email = extractEmail(from)
  const match = email.match(/@([\w.-]+)/)
  return match ? match[1].toLowerCase() : null
}

// Strip parenthetical suffixes before checking: "Hari Kumar (Jira)" → "Hari Kumar"
function cleanNameForPersonCheck(name) {
  return name.replace(/\s*\([^)]*\)\s*/g, '').trim()
}

// Detect if sender name looks like a real person ("First Last")
// vs a company/service name ("Notion Team", "The Educative Team")
function isPersonSender(from) {
  const raw = senderName(from).trim()
  const name = cleanNameForPersonCheck(raw)  // strip "(Jira)", "(via GitHub)" etc.
  const words = name.split(/\s+/)
  if (words.length === 1) {
    const companyWords = /team|support|noreply|newsletter|info|updates|hello|alert|notification|service|admin|billing|sales|help|notifications/i
    return !companyWords.test(words[0])
  }
  if (words.length === 2) {
    const companyWords = /team|support|corp|inc|ltd|llc|co\.|group|solutions|services|updates|media|digital|tech|labs|hub|app/i
    if (companyWords.test(name)) return false
    return /^[A-Z][a-z]/.test(words[0]) && /^[A-Z][a-z]/.test(words[1])
  }
  // 3+ words → likely company ("The Educative Team", "Zoom SMB Team")
  return false
}

function shouldShowLogo(from) {
  const domain = senderDomain(from)
  if (!domain) return false
  if (GENERIC_DOMAINS.has(domain)) return false
  // Check notification domains and their subdomains (e.g. poshn-co.atlassian.net)
  const isNotifDomain = [...NOTIFICATION_DOMAINS].some(d => domain === d || domain.endsWith('.' + d))
  if (isNotifDomain) return false   // show initials, not grey robot logo
  if (isPersonSender(from)) return false
  return true
}

function logoUrl(from) {
  if (!shouldShowLogo(from)) return ''
  const domain = senderDomain(from)
  const state = logoFailState.value[domain]
  if (state === 'clearbit') return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`
  return `https://logo.clearbit.com/${domain}`
}

function logoFailed(from) {
  if (!shouldShowLogo(from)) return true
  const domain = senderDomain(from)
  return logoFailState.value[domain] === 'google'
}

function isLogoMode(from) {
  return shouldShowLogo(from) && !logoFailed(from)
}

function markLogoFailed(from) {
  const domain = senderDomain(from)
  if (!domain) return
  const cur = logoFailState.value[domain]
  if (!cur) {
    logoFailState.value = { ...logoFailState.value, [domain]: 'clearbit' }
  } else if (cur === 'clearbit') {
    logoFailState.value = { ...logoFailState.value, [domain]: 'google' }
  }
}

function profileInitials() {
  const n = gmailProfile.value?.name || gmailProfile.value?.email || 'G'
  const p = n.split(/\s+/)
  return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : n.slice(0, 2).toUpperCase()
}

function isSelf(from) {
  if (!gmailProfile.value?.email || !from) return false
  return extractEmail(from).toLowerCase() === gmailProfile.value.email.toLowerCase()
}

function getSenderAvatarStyle(from) {
  if (contactPhotoUrl(from)) return {}        // photo covers bg
  if (isSelf(from)) {
    return gmailProfile.value?.picture ? {} : { background: avatarColor(from) }
  }
  if (isLogoMode(from)) return {}             // white bg via CSS class
  return { background: avatarColor(from) }
}

// Plain HTML from gmail reply → extract text
function plainFromHtml(html) {
  if (!html) return ''
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&')
             .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim()
}

// Only use iframe for truly rich emails (marketing, newsletters, formatted)
// Simple replies like "Hi" or "Thanks" should use plain text renderer
function isRichEmail(msg) {
  if (!msg.html) return false
  const html = msg.html
  // Must have actual rich content markers
  const hasRichMarkers = /<table[^>]*(width|cellpadding)|background(-color)?\s*:|bgcolor\s*=|<img[^>]+src|<style[^>]*>|font-size\s*:|color\s*:/i.test(html)
  // Strip tags and check if plain content is short (simple reply)
  const plainLen = html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().length
  // If it's marketing HTML or long enough to need iframe
  return hasRichMarkers || plainLen > 300
}

// Marketing emails have tables/images/bgcolor — need white bg
// Plain replies are just wrapped text — should match dark UI
function isMarketingHtml(html) {
  return /<table[^>]*(width|cellpadding)|background(-color)?\s*:|bgcolor\s*=|<img[^>]+src/i.test(html)
}

function wrapHtml(html) {
  const marketing = isMarketingHtml(html)
  const bg   = marketing ? '#ffffff' : 'transparent'
  const fg   = marketing ? '#1f1f1f' : '#e8eaed'
  const link = marketing ? '#1a73e8' : '#8ab4f8'
  const quote= marketing ? '#666'    : '#9aa0a6'
  const qbdr = marketing ? '#ccc'    : '#5f6368'
 
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<base target="_blank">
<style>
*{box-sizing:border-box}
html,body{margin:0;padding:${marketing?'0':'4px 0'};overflow-x:hidden;background:${bg};color:${fg}}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.6}
img{max-width:100%!important;height:auto!important}
a{color:${link};word-break:break-word}
table{max-width:100%!important}
body>table,body>center,body>div{max-width:100%!important}
blockquote{border-left:3px solid ${qbdr};margin:8px 0;padding:4px 12px;color:${quote};opacity:.85}
.gmail_quote,.gmail_attr{color:${quote}}
.gmail_extra{color:${quote}}
 
/* ── CALENDAR INVITE FIX ─────────────────────────────────────────────── */
/* Google Calendar invites use white text on colored backgrounds.
   When we render them in an iframe with white background, those elements
   become white-on-white. Fix: detect colored-bg containers and force
   their text to stay readable. */
[bgcolor="#ffffff"],[bgcolor="white"],
[style*="background-color: #fff"],[style*="background-color:#fff"],
[style*="background-color: white"],[style*="background:#fff"],
[style*="background: white"],[style*="background:white"] {
  color: #1f1f1f !important;
}
/* Force all text inside white/light containers to be dark */
[bgcolor="#ffffff"] *,[bgcolor="white"] *,
[style*="background-color: #fff"] *,[style*="background-color:#fff"] * {
  color: inherit;
}
/* Google's calendar invite specific classes */
td[style*="color:#ffffff"],td[style*="color: #ffffff"],
td[style*="color:white"],td[style*="color: white"],
span[style*="color:#ffffff"],span[style*="color: #ffffff"],
p[style*="color:#ffffff"],p[style*="color: #ffffff"] {
  /* Only override white text IF the parent bg is also white/light */
  /* We do this by not overriding here, but forcing bg on body-level container */
}
/* The main trick: the outer container of calendar invites is a white table.
   Force all text within it to dark unless explicitly on a colored button bg. */
body > table td:not([bgcolor]):not([style*="background"]) {
  color: #1f1f1f !important;
}
/* Keep colored button text white (e.g. "Join with Google Meet" blue button) */
[bgcolor="#1a73e8"],[bgcolor="#0070f3"],[bgcolor="#4285F4"],
[style*="background-color:#1a73e8"],[style*="background-color: #1a73e8"],
[style*="background-color:#4285f4"],[style*="background-color: #4285f4"],
[style*="background:#1a73e8"],[style*="background: #1a73e8"] {
  color: #ffffff !important;
}
[bgcolor="#1a73e8"] *,[bgcolor="#4285F4"] *,
[style*="background-color:#1a73e8"] *,
[style*="background-color: #1a73e8"] * {
  color: #ffffff !important;
}
/* ── END CALENDAR INVITE FIX ─────────────────────────────────────────── */
</style>
<script>
function sendHeight(){
  const h = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
  window.parent.postMessage({type:'gm-frame-height',height:h},'*');
}
window.addEventListener('load', () => {
  sendHeight();
  const imgs = document.querySelectorAll('img');
  let loaded = 0;
  if(!imgs.length){ setTimeout(sendHeight,300); return; }
  imgs.forEach(img => {
    if(img.complete){ loaded++; if(loaded===imgs.length) sendHeight(); }
    else {
      img.addEventListener('load',()=>{ loaded++; if(loaded===imgs.length) sendHeight(); });
      img.addEventListener('error',()=>{ loaded++; if(loaded===imgs.length) sendHeight(); });
    }
  });
  setTimeout(sendHeight,800);
  setTimeout(sendHeight,2000);
});
<\/script>
</head><body>${html}</body></html>`
}

// Map of iframe element → Vue ref key for height tracking
let frameIdCounter = 0

function onFrameLoad(e) {
  const frame = e.target
  // Assign a stable ID if not already
  if (!frame._gmFrameId) frame._gmFrameId = ++frameIdCounter
  // Initial size from scrollHeight (before images)
  try {
    const doc = frame.contentDocument
    if (doc?.body) {
      const h = doc.body.scrollHeight || 400
      frame.style.height = (h + 8) + 'px'
    }
  } catch { frame.style.height = '400px' }
}

// Global postMessage listener for iframe height updates
function onFrameMessage(e) {
  if (e.data?.type !== 'gm-frame-height') return
  const h = e.data.height
  if (!h || h < 50) return
  // Find the iframe that sent this message by checking all frames
  document.querySelectorAll('.gm-html-frame').forEach(frame => {
    try {
      if (frame.contentWindow === e.source) {
        const cur = parseInt(frame.style.height) || 0
        if (h > cur) frame.style.height = (h + 8) + 'px'
      }
    } catch {console.log('Frame message from inaccessible frame, ignoring')}
  })
}

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}

function attIcon(mimeType = '') {
  if (mimeType.startsWith('image/')) return '🖼'
  if (mimeType.includes('pdf')) return '📄'
  if (mimeType.includes('zip') || mimeType.includes('compressed')) return '🗜'
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) return '📊'
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝'
  if (mimeType.includes('video')) return '🎬'
  if (mimeType.includes('audio')) return '🎵'
  return '📎'
}

function renderEmailBody(text) {
  if (!text) return ''

  // Escape HTML entities first
  const escape = (s) => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

  const lines = text.split('\n')
  const output = []
  let inQuote = false
  let quoteLines = []

  let paraLines = []

  const flushPara = () => {
    if (!paraLines.length) return
    const joined = paraLines.join(' ').trim()
    if (joined) output.push(`<p class="em-para">${linkify(joined)}</p>`)
    paraLines = []

  }
  const flushQuote = () => {
    if (!quoteLines.length) return
    const inner = quoteLines.map(l => `<span>${linkify(l)}</span>`).join('<br>')
    output.push(`<blockquote class="em-quote">${inner}</blockquote>`)
    quoteLines = []
    inQuote = false
  }

  const linkify = (s) => {
    // Make URLs clickable
    return s.replace(
      /(https?:\/\/[^\s<>"']+)/g,
      '<a href="$1" target="_blank" rel="noopener" class="em-link">$1</a>'
    )
  }

  // Detect signature start (-- alone on a line, or common signature phrases)
  const isSigStart = (l) => /^--\s*$/.test(l) || /^_{3,}$/.test(l)
  // Detect quoted line: starts with > or >>
  const isQuoted = (l) => /^(&gt;|>)+/.test(l)
  // Detect bullet
  const isBullet = (l) => /^\s*[\*\-•]\s+/.test(l)
  // Detect numbered list
  const isNumbered = (l) => /^\s*\d+[\.\)]\s+/.test(l)
  // Detect header-like line (all caps or ends with colon and is short)
  const isHeader = (l) => l.length < 60 && /^[A-Z][^a-z]{4,}$/.test(l.trim())
  // Detect divider
  const isDivider = (l) => /^[-=_]{4,}\s*$/.test(l.trim())

  let inSig = false
  let listItems = []
  let listType = null

  const flushList = () => {
    if (!listItems.length) return
    const tag = listType === 'ol' ? 'ol' : 'ul'
    const items = listItems.map(i => `<li class="em-li">${linkify(i)}</li>`).join('')
    output.push(`<${tag} class="em-list">${items}</${tag}>`)
    listItems = []
    listType = null
  }

  for (let raw of lines) {
    const l = escape(raw)
    const trimmed = l.trim()

    // Signature block — render dimmed
    if (!inSig && isSigStart(trimmed)) {
      flushPara(); flushQuote(); flushList()
      inSig = true
      output.push('<div class="em-sig">')
      continue
    }
    if (inSig) {
      output.push(`<span class="em-sig-line">${linkify(l)}<br></span>`)
      continue
    }

    // Blank line — flush pending content
    if (!trimmed) {
      flushPara(); flushQuote(); flushList()
      output.push('<div class="em-spacer"></div>')
      continue
    }

    // Divider
    if (isDivider(trimmed)) {
      flushPara(); flushQuote(); flushList()
      output.push('<hr class="em-hr">')
      continue
    }

    // Quoted / replied content
    if (isQuoted(trimmed)) {
      flushPara(); flushList()
      const stripped = trimmed.replace(/^(&gt;|>)+\s?/, '')
      quoteLines.push(stripped)
      inQuote = true
      continue
    } else if (inQuote) {
      flushQuote()
    }

    // Bullet list
    if (isBullet(trimmed)) {
      flushPara(); flushQuote()
      if (listType && listType !== 'ul') flushList()
      listType = 'ul'
      listItems.push(trimmed.replace(/^\s*[\*\-•]\s+/, ''))
      continue
    }
    // Numbered list
    if (isNumbered(trimmed)) {
      flushPara(); flushQuote()
      if (listType && listType !== 'ol') flushList()
      listType = 'ol'
      listItems.push(trimmed.replace(/^\s*\d+[\.\)]\s+/, ''))
      continue
    }
    if (listType && !isBullet(trimmed) && !isNumbered(trimmed)) {
      flushList()
    }

    // Header-like line
    if (isHeader(trimmed)) {
      flushPara()
      output.push(`<p class="em-heading">${linkify(trimmed)}</p>`)
      continue
    }

    // Default: accumulate into paragraph
    paraLines.push(trimmed)
  }

  // Flush any remaining
  flushPara(); flushQuote(); flushList()
  if (inSig) output.push('</div>')

  return output.join('\n')
}

onMounted(async () => {
  applyBriefingContext()
  fetchLabelCounts()
  fetchGmailProfile()
  connectSSE()
  await loadEmails()
  await refreshGmailActions()
  setTimeout(setupObserver, 100)
  document.addEventListener('click', onDocClick, true)
  window.addEventListener('message', onFrameMessage)
  window.addEventListener('focus', onWindowFocus)
  document.addEventListener('visibilitychange', onVisibilityChange)
})
onUnmounted(() => {
  if (observer) observer.disconnect()
  if (sseSource) sseSource.close()
  document.removeEventListener('click', onDocClick, true)
  window.removeEventListener('message', onFrameMessage)
  window.removeEventListener('focus', onWindowFocus)
  document.removeEventListener('visibilitychange', onVisibilityChange)
})
</script>

<style scoped>
/* ── Root ── */
.gm-root {
  height:100%;
  display:flex;
  overflow:hidden;
  background:
    radial-gradient(circle at 14% 12%, rgba(82, 212, 255, 0.08), transparent 24%),
    linear-gradient(180deg, var(--bg-base-alt, var(--bg-base)), var(--bg-base));
}

/* ══ SIDEBAR ══ */
.gm-sidebar {
  width:212px; flex-shrink:0; display:flex; flex-direction:column;
  background:rgba(8, 13, 28, 0.62); border-right:1px solid var(--border-subtle);
  padding-bottom:16px; overflow:hidden;
  transition:width .22s cubic-bezier(.4,0,.2,1);
  backdrop-filter:blur(20px);
}
.gm-sidebar--collapsed { width:0; border-right:none; }
.gm-brand {
  display:flex; align-items:center; gap:9px;
  padding:18px 20px 14px;
}
.gm-brand-name { font-size:19px; font-weight:700; color:var(--text-primary); letter-spacing:-.4px; }

.gm-compose {
  margin:0 12px 14px; padding:10px 0;
  display:flex; align-items:center; justify-content:center; gap:8px;
  background:linear-gradient(135deg,#EA4335 0%,#C5221F 100%);
  color:#fff; font-size:13px; font-weight:600;
  border:1px solid rgba(255,255,255,.08); border-radius:999px; cursor:pointer;
  box-shadow:0 16px 28px rgba(234,67,53,.24);
  transition:transform .15s, box-shadow .15s;
}
.gm-compose:hover { transform:translateY(-1px); box-shadow:0 5px 16px rgba(234,67,53,.45); }
.gm-compose:active { transform:translateY(0); }

.gm-nav { display:flex; flex-direction:column; gap:2px; padding:0 8px; flex:1; }
.gm-nav-btn {
  display:flex; align-items:center; gap:10px;
  padding:8px 11px; border-radius:10px;
  border:none; background:none; cursor:pointer;
  color:var(--text-secondary); font-size:13px; text-align:left; width:100%;
  transition:background .12s, color .12s;
}
.gm-nav-btn:hover { background:rgba(255,255,255,.05); color:var(--text-primary); }
.gm-nav-btn.active {
  background:rgba(234,67,53,.11);
  color:#EA4335; font-weight:600;
}
.gm-nav-icon { width:18px; display:flex; justify-content:center; flex-shrink:0; }
.gm-nav-label { flex:1; }
.gm-badge {
  background:#EA4335; color:#fff;
  font-size:10px; font-weight:700; min-width:18px;
  padding:1px 5px; border-radius:9px; text-align:center; line-height:1.6;
}

.gm-quota { padding:14px 16px 0; margin-top:auto; }
.gm-quota-bar { height:3px; background:var(--border-default); border-radius:2px; margin-bottom:5px; overflow:hidden; }
.gm-quota-fill { height:100%; background:#4285F4; border-radius:2px; }
.gm-quota-text { font-size:10.5px; color:var(--text-muted); }

/* ══ LIST PANE ══ */
.gm-list-pane {
  width:310px; flex-shrink:0; display:flex; flex-direction:column;
  border-right:1px solid var(--border-subtle);
  background:rgba(7, 11, 24, 0.42);
  backdrop-filter:blur(18px);
}
.gm-insights-wrap { padding: 0 12px 8px; }
.gm-list-topbar {
  display:flex; align-items:center; gap:8px;
  padding:12px 12px 4px;
}
.gm-toggle-btn {
  flex-shrink:0; width:30px; height:30px; border-radius:8px;
  background:none; border:none; cursor:pointer;
  color:var(--text-muted); display:flex; align-items:center; justify-content:center;
  transition:background .12s, color .12s;
}
.gm-toggle-btn:hover { background:rgba(255,255,255,.07); color:var(--text-primary); }
.gm-search-wrap {
  flex:1; display:flex; align-items:center; gap:8px;
  background:rgba(255,255,255,.045);
  border:1.5px solid var(--border-default);
  border-radius:999px; padding:0 14px;
  transition:border-color .15s, box-shadow .15s;
  backdrop-filter:blur(16px);
}
.gm-search-wrap:focus-within {
  border-color:rgba(82, 212, 255, .34);
  box-shadow:0 0 0 4px rgba(82, 212, 255, .08);
}
.gm-search-ico { color:var(--text-muted); flex-shrink:0; }
.gm-search-input {
  flex:1; padding:9px 0; background:none; border:none;
  color:var(--text-primary); font-size:13px; outline:none;
}
.gm-search-input::placeholder { color:var(--text-muted); }
.gm-search-x {
  background:none; border:none; color:var(--text-muted); cursor:pointer;
  display:flex; align-items:center; padding:2px; border-radius:4px; transition:color .12s;
}
.gm-search-x:hover { color:var(--text-primary); }

.gm-tab-row {
  display:flex; align-items:center; gap:6px;
  padding:8px 14px 6px;
}
.gm-tab-label { font-size:10.5px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.07em; }
.gm-tab-count { font-size:10.5px; color:var(--text-muted); }
.gm-sync-badge {
  margin-left:auto; display:flex; align-items:center; gap:4px;
  font-size:9.5px; color:var(--text-muted); opacity:.75; white-space:nowrap;
}
.gm-sync-dot {
  width:6px; height:6px; border-radius:50%; flex-shrink:0; display:inline-block;
}
.gm-sync-dot--live  { background:#34A853; box-shadow:0 0 4px #34A853; }
.gm-sync-dot--error { background:#EA4335; }
.gm-sync-dot--spin  {
  border:1.5px solid rgba(255,255,255,.3); border-top-color:var(--text-muted);
  animation: gm-spin .7s linear infinite; background:transparent;
}
@keyframes gm-spin { to { transform: rotate(360deg); } }
.gm-sync-spinner {
  width:28px; height:28px; border-radius:50%; margin:0 auto 12px;
  border:2.5px solid rgba(255,255,255,.08); border-top-color:#4285F4;
  animation: gm-spin .85s linear infinite;
}
.gm-list-scroll {
  flex:1; overflow-y:auto;
  scrollbar-width:thin; scrollbar-color:var(--border-default) transparent;
}
.gm-list-pane :deep(.comm-insights) { background: var(--bg-surface); }
.gm-list-pane :deep(.comm-panel) { background: var(--bg-base); }
.gm-list-scroll::-webkit-scrollbar { width:3px; }
.gm-list-scroll::-webkit-scrollbar-thumb { background:var(--border-default); border-radius:2px; }

/* Email row */
.gm-row {
  display:flex; align-items:flex-start; gap:10px;
  padding:10px 13px; cursor:pointer; position:relative;
  border-bottom:1px solid rgba(255,255,255,.03);
  transition:background .1s;
}
.gm-row:hover { background:rgba(255,255,255,.05); }
.gm-row--active {
  background:linear-gradient(135deg, rgba(82, 212, 255, .08), rgba(139, 125, 255, .08)) !important;
}
.gm-row--active::before {
  content:''; position:absolute; left:0; top:8px; bottom:8px;
  width:3px; background:var(--accent); border-radius:0 3px 3px 0;
}
.gm-row-av {
  width:36px; height:36px; border-radius:50%;
  display:flex; align-items:center; justify-content:center;
  font-size:12.5px; font-weight:700; color:#fff; flex-shrink:0;
  box-shadow:0 1px 4px rgba(0,0,0,.25);
  overflow:hidden;
}
/* Logo mode: white bg so company logos (designed for light bg) look correct */
.gm-row-av--logo {
  background:#fff !important;
  padding:4px;
  box-shadow:0 1px 4px rgba(0,0,0,.18), 0 0 0 1px rgba(0,0,0,.06);
}
.gm-detail-av { overflow:hidden; }
.gm-av-img {
  width:100%; height:100%;
  object-fit:cover; border-radius:50%;
  display:block;
}
/* Company logo: contain (don't crop/stretch), already has white bg from parent */
.gm-av-img--logo {
  object-fit:contain;
  border-radius:0;
  padding:0;
}
.gm-row-content { flex:1; min-width:0; }
.gm-row-line1 { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:2px; }
.gm-row-line1-meta { display:flex; align-items:center; gap:8px; flex-shrink:0; }
.gm-row-from {
  font-size:13px; font-weight:500; color:var(--text-secondary);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:155px;
}
.gm-row--unread .gm-row-from { font-weight:700; color:var(--text-primary); }
.gm-row-date { font-size:11px; color:var(--text-muted); flex-shrink:0; }
.gm-row--unread .gm-row-date { color:var(--text-secondary); font-weight:600; }
.gm-row-subject {
  font-size:12.5px; color:var(--text-muted);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-bottom:2px;
}
.gm-row--unread .gm-row-subject { color:var(--text-primary); font-weight:600; }
.gm-row-snippet {
  font-size:11.5px; color:var(--text-muted);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; opacity:.65;
}
.gm-row-dot {
  width:8px; height:8px; border-radius:50%;
  background:#4285F4; flex-shrink:0; margin-top:6px;
  box-shadow:0 0 5px rgba(66,133,244,.6);
}
.gm-action-chip {
  display:inline-flex; align-items:center; justify-content:center;
  padding:3px 8px; border-radius:999px;
  font-size:10px; font-weight:700;
  background:rgba(148,163,184,.14);
  color:var(--text-secondary);
}
.gm-action-chip.state-waiting_on_your_reply { background:rgba(245,158,11,.14); color:#b45309; }
.gm-action-chip.state-needs_approval { background:rgba(239,68,68,.14); color:#b91c1c; }
.gm-action-chip.state-needs_follow_up { background:rgba(14,165,233,.14); color:#0369a1; }
.gm-action-chip.state-waiting_on_others { background:rgba(16,185,129,.14); color:#047857; }
.gm-empty-list {
  display:flex; flex-direction:column; align-items:center;
  justify-content:center; gap:10px; padding:56px 24px; color:var(--text-muted);
}
.gm-empty-list p { font-size:13px; }

/* Skeleton */
.gm-skel-row {
  display:flex; gap:10px; padding:11px 13px;
  border-bottom:1px solid rgba(255,255,255,.028);
}
.gm-skel-av {
  width:36px; height:36px; border-radius:50%;
  background:var(--bg-elevated); flex-shrink:0;
  animation:gm-pulse 1.4s ease-in-out infinite;
}
.gm-skel-lines { flex:1; display:flex; flex-direction:column; gap:7px; padding-top:3px; }
.gm-skel-l {
  height:9px; border-radius:5px; background:var(--bg-elevated);
  animation:gm-pulse 1.4s ease-in-out infinite;
}
@keyframes gm-pulse { 0%,100%{opacity:.5} 50%{opacity:1} }

/* Sentinel */
.gm-sentinel { padding:16px; display:flex; justify-content:center; min-height:40px; }
.gm-done-label { font-size:11px; color:var(--text-muted); }

/* ══ DETAIL ══ */
.gm-detail { flex:1; display:flex; flex-direction:column; overflow:hidden; }

.gm-detail-empty {
  flex:1; display:flex; flex-direction:column;
  align-items:center; justify-content:center; gap:12px;
}
.gm-detail-empty-ring {
  width:96px; height:96px; border-radius:50%;
  background:rgba(234,67,53,.06);
  display:flex; align-items:center; justify-content:center;
}
.gm-detail-empty-title { font-size:16px; font-weight:600; color:var(--text-primary); }
.gm-detail-empty-sub { font-size:13px; color:var(--text-muted); }

.gm-detail-head {
  padding:20px 26px 14px;
  border-bottom:1px solid var(--border-subtle);
  flex-shrink:0; background:var(--bg-surface);
}
.gm-detail-subj-row {
  display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:0;
}
.gm-detail-subj {
  font-size:20px; font-weight:700; color:var(--text-primary);
  margin:0; line-height:1.3; flex:1;
}
.gm-detail-btns { display:flex; gap:3px; flex-shrink:0; }
.gm-icon-btn {
  width:30px; height:30px; display:flex; align-items:center; justify-content:center;
  background:none; border:none; border-radius:8px;
  color:var(--text-muted); cursor:pointer; transition:all .12s;
}
.gm-icon-btn:hover { background:var(--bg-elevated); color:var(--text-primary); }

.gm-detail-sender {
  display:flex; align-items:center; gap:11px; margin-bottom:8px;
}
.gm-detail-av {
  width:40px; height:40px; border-radius:50%; flex-shrink:0;
  display:flex; align-items:center; justify-content:center;
  font-size:14px; font-weight:700; color:#fff;
  box-shadow:0 2px 6px rgba(0,0,0,.25);
}
.gm-detail-sender-info { flex:1; min-width:0; }
.gm-detail-sender-name { font-size:14px; font-weight:600; color:var(--text-primary); }
.gm-detail-sender-email { font-size:12px; color:var(--text-muted); }
.gm-detail-meta-right { display:flex; flex-direction:column; align-items:flex-end; gap:5px; flex-shrink:0; }
.gm-detail-date-pill {
  font-size:11.5px; color:var(--text-muted);
  background:var(--bg-elevated); padding:2px 8px; border-radius:10px;
}
.gm-unread-chip {
  font-size:10px; font-weight:700; padding:2px 7px;
  background:rgba(66,133,244,.14); color:#4285F4; border-radius:9px;
}
.gm-detail-to { display:flex; gap:8px; font-size:12px; }
.gm-detail-to-lbl { color:var(--text-muted); font-weight:600; width:20px; }
.gm-detail-to-val { color:var(--text-secondary); }

/* Thread scroll */
.gm-thread-scroll { flex:1; overflow-y:auto; }
.gm-thread-loading { display:flex; flex-direction:column; gap:0; }
.gm-thread-msgs { display:flex; flex-direction:column; }

/* Individual thread message card */
.gm-thread-msg { padding:20px 26px 0; }
.gm-thread-msg--outbound {
  background:linear-gradient(180deg, rgba(66,133,244,.05) 0%, rgba(66,133,244,0) 100%);
}
.gm-thread-msg--inbound {
  background:linear-gradient(180deg, rgba(234,67,53,.04) 0%, rgba(234,67,53,0) 100%);
}
.gm-thread-msg--sending { opacity:.6; transition:opacity .4s; }
.gm-tm-hdr {
  display:flex; align-items:flex-start; gap:12px; margin-bottom:14px;
}
.gm-tm-sender-info { flex:1; min-width:0; }
.gm-tm-sender-row { display:flex; align-items:center; gap:8px; margin-bottom:2px; }
.gm-direction-chip {
  display:inline-flex; align-items:center; justify-content:center;
  padding:2px 7px; border-radius:999px;
  font-size:10px; font-weight:700;
  border:1px solid transparent;
}
.gm-direction-chip.is-outbound {
  background:rgba(66,133,244,.12);
  color:#2563eb;
  border-color:rgba(66,133,244,.18);
}
.gm-direction-chip.is-inbound {
  background:rgba(234,67,53,.1);
  color:#c5221f;
  border-color:rgba(234,67,53,.16);
}
.gm-tm-to { display:flex; gap:6px; font-size:12px; margin-top:3px; }
.gm-tm-body { padding:0 0 20px 52px; }

.gm-html-frame {
  width:100%; border:none; display:block;
  min-height:100px; border-radius:10px; overflow:hidden;
  background:#ffffff;
  box-shadow:0 1px 6px rgba(0,0,0,.18);
}

/* Attachments */
.gm-tm-atts {
  margin:0 0 16px 52px; padding:12px 14px;
  background:rgba(255,255,255,.03);
  border:1px solid var(--border-subtle); border-radius:10px;
}
.gm-atts-label {
  display:flex; align-items:center; gap:6px;
  font-size:11.5px; color:var(--text-muted); font-weight:600;
  margin-bottom:10px; text-transform:uppercase; letter-spacing:.05em;
}
.gm-atts-grid { display:flex; flex-wrap:wrap; gap:8px; }
.gm-att-chip {
  display:flex; align-items:center; gap:7px;
  padding:7px 12px;
  background:var(--bg-elevated);
  border:1px solid var(--border-default); border-radius:9px;
  cursor:pointer; transition:all .12s;
  max-width:220px;
}
.gm-att-chip:hover { border-color:rgba(66,133,244,.4); background:rgba(66,133,244,.06); }
.gm-att-icon { font-size:14px; flex-shrink:0; }
.gm-att-name {
  font-size:12.5px; color:var(--text-primary); font-weight:500;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; min-width:0;
}
.gm-att-size { font-size:11px; color:var(--text-muted); flex-shrink:0; }

/* Thread divider between messages */
.gm-thread-divider {
  margin:4px 26px 0;
  border-top:1px solid var(--border-subtle);
}

.gm-detail-body { flex:1; overflow-y:auto; padding:22px 26px; }
.gm-body-text {
  font-size:14px; line-height:1.8; color:var(--text-primary);
  word-break:break-word; max-width:700px;
}
/* Rendered email body elements */
.gm-body-text :deep(.em-para) {
  margin:0 0 10px; color:var(--text-primary); line-height:1.75;
}
.gm-body-text :deep(.em-heading) {
  margin:14px 0 6px; font-size:13px; font-weight:700;
  color:var(--text-secondary); letter-spacing:.04em; text-transform:uppercase;
}
.gm-body-text :deep(.em-spacer) { height:6px; }
.gm-body-text :deep(.em-hr) {
  border:none; border-top:1px solid var(--border-subtle);
  margin:14px 0;
}
.gm-body-text :deep(.em-quote) {
  margin:10px 0; padding:10px 14px;
  border-left:3px solid rgba(234,67,53,.4);
  background:rgba(234,67,53,.04);
  border-radius:0 8px 8px 0;
  color:var(--text-muted); font-size:13px; line-height:1.65;
  display:flex; flex-direction:column; gap:3px;
}
.gm-body-text :deep(.em-list) {
  margin:6px 0 10px 18px; padding:0;
  color:var(--text-primary); font-size:14px; line-height:1.75;
}
.gm-body-text :deep(.em-li) { margin-bottom:3px; }
.gm-body-text :deep(.em-link) {
  color:#4285F4; text-decoration:none;
  word-break:break-all; font-size:13px;
  border-bottom:1px solid rgba(66,133,244,.25);
  transition:border-color .12s, color .12s;
}
.gm-body-text :deep(.em-link:hover) {
  color:#2563eb; border-color:rgba(66,133,244,.6);
}
.gm-body-text :deep(.em-sig) {
  margin-top:18px; padding-top:12px;
  border-top:1px dashed var(--border-subtle);
}
.gm-body-text :deep(.em-sig-line) {
  font-size:12px; color:var(--text-muted); line-height:1.6;
}
.gm-body-skel { display:flex; flex-direction:column; gap:11px; }
.gm-body-skel .gm-skel-l { height:11px; animation:gm-pulse 1.4s ease-in-out infinite; }

/* Reply dock */
.gm-reply-dock {
  border-top:1px solid var(--border-subtle);
  padding:13px 22px 16px; flex-shrink:0; background:var(--bg-surface);
}
.gm-reply-chip {
  display:flex; align-items:center; gap:10px;
  padding:11px 16px;
  background:var(--bg-elevated);
  border:1px solid var(--border-default); border-radius:12px;
  cursor:pointer; transition:all .14s;
}
.gm-reply-chip:hover { border-color:rgba(234,67,53,.4); box-shadow:0 2px 8px rgba(234,67,53,.1); }
.gm-reply-chip > span:first-of-type { flex:1; font-size:13px; color:var(--text-primary); }
.gm-reply-chip-hint { font-size:11.5px; color:var(--text-muted); }

.gm-reply-composer { display:flex; flex-direction:column; gap:8px; }
.gm-rc-header {
  display:flex; justify-content:space-between; align-items:center;
  font-size:12.5px; color:var(--text-secondary);
}
.gm-rc-to { display:flex; align-items:center; gap:7px; }
.gm-rc-close {
  background:none; border:none; color:var(--text-muted); cursor:pointer;
  display:flex; align-items:center; padding:3px; border-radius:5px; transition:all .12s;
}
.gm-rc-close:hover { background:var(--bg-elevated); color:var(--text-primary); }

.gm-ai-pill {
  display:flex; align-items:center; gap:8px;
  padding:6px 12px; border-radius:8px; font-size:12px;
}
.ai-loading { background:rgba(99,102,241,.08); color:#818cf8; }
.ai-ready   { background:rgba(52,168,83,.08);  color:#34a853; }
.gm-ai-clr { background:none; border:none; color:inherit; cursor:pointer; margin-left:auto; font-size:11px; opacity:.7; }
.gm-ai-clr:hover { opacity:1; }

.gm-rc-textarea {
  width:100%; padding:11px 13px;
  background:var(--bg-elevated);
  border:1.5px solid var(--border-default); border-radius:10px;
  color:var(--text-primary); font-size:13.5px; resize:none; outline:none;
  font-family:inherit; line-height:1.6; box-sizing:border-box; transition:border-color .15s;
}
.gm-rc-textarea:focus { border-color:rgba(234,67,53,.4); }
.gm-rc-footer { display:flex; gap:8px; align-items:center; }

.gm-send-btn {
  display:flex; align-items:center; gap:7px;
  padding:9px 22px; background:#EA4335;
  border:none; border-radius:22px; color:#fff;
  font-size:13px; font-weight:600; cursor:pointer;
  transition:all .15s;
}
.gm-send-btn:hover:not(:disabled) { background:#d93025; transform:translateY(-1px); box-shadow:0 3px 10px rgba(234,67,53,.4); }
.gm-send-btn:disabled { opacity:.4; cursor:not-allowed; }
.gm-discard-btn {
  padding:8px 14px; background:none;
  border:1px solid var(--border-default); border-radius:22px;
  color:var(--text-muted); font-size:12.5px; cursor:pointer; transition:all .12s;
}
.gm-discard-btn:hover { border-color:var(--border-strong); color:var(--text-primary); }
.gm-sent-flash { font-size:12.5px; color:#34a853; font-weight:600; }

/* ── Attachment chips (compose + reply) ── */
.gm-att-chips {
  display:flex; flex-wrap:wrap; gap:6px;
  padding:6px 14px 2px;
  border-top:1px solid var(--border-subtle);
}
.gm-att-chips--reply { padding:6px 0 2px; border-top:1px solid var(--border-subtle); }
.gm-att-chip-pill {
  display:flex; align-items:center; gap:5px;
  padding:4px 8px 4px 7px;
  background:var(--bg-elevated);
  border:1px solid var(--border-default);
  border-radius:20px; max-width:220px;
  font-size:11.5px; color:var(--text-secondary);
}
.gm-att-chip-icon { font-size:12px; flex-shrink:0; }
.gm-att-chip-name {
  flex:1; min-width:0; white-space:nowrap;
  overflow:hidden; text-overflow:ellipsis;
  color:var(--text-primary); font-weight:500;
}
.gm-att-chip-size { flex-shrink:0; color:var(--text-muted); font-size:10.5px; }
.gm-att-chip-rm {
  flex-shrink:0; background:none; border:none; cursor:pointer;
  color:var(--text-muted); display:flex; align-items:center;
  padding:1px; border-radius:3px; transition:color .1s;
}
.gm-att-chip-rm:hover { color:#EA4335; }

/* Paperclip button */
.gm-attach-btn {
  position:relative;
  width:32px; height:32px; border-radius:8px;
  background:none; border:1px solid var(--border-default);
  cursor:pointer; color:var(--text-muted);
  display:flex; align-items:center; justify-content:center;
  transition:all .12s; flex-shrink:0;
}
.gm-attach-btn:hover { background:rgba(234,67,53,.07); border-color:rgba(234,67,53,.35); color:#EA4335; }
.gm-attach-badge {
  position:absolute; top:-5px; right:-5px;
  min-width:14px; height:14px; padding:0 3px;
  background:#EA4335; color:#fff;
  font-size:9px; font-weight:700; border-radius:7px;
  display:flex; align-items:center; justify-content:center;
  line-height:1;
}

/* CC / BCC toggle buttons */
.gm-ccbcc-btns { display:flex; gap:4px; margin-left:auto; flex-shrink:0; }
.gm-ccbcc-btn {
  padding:2px 8px; background:none;
  border:1px solid var(--border-default); border-radius:5px;
  color:var(--text-muted); font-size:11px; font-weight:600;
  cursor:pointer; transition:all .12s;
}
.gm-ccbcc-btn:hover { border-color:rgba(234,67,53,.4); color:#EA4335; background:rgba(234,67,53,.05); }
.gm-ccbcc-rm {
  flex-shrink:0; background:none; border:none; cursor:pointer;
  color:var(--text-muted); display:flex; align-items:center;
  padding:3px; border-radius:4px; transition:color .1s; margin-left:4px;
}
.gm-ccbcc-rm:hover { color:#EA4335; }
/* Reply CC row */
.gm-rc-cc-row {
  display:flex; align-items:center; gap:8px;
  padding:6px 12px; border-bottom:1px solid var(--border-subtle);
  font-size:12px;
}
.gm-rc-cc-row label {
  font-size:11px; font-weight:700; color:var(--text-muted);
  text-transform:uppercase; letter-spacing:.06em; width:22px; flex-shrink:0;
}
.gm-rc-cc-input {
  flex:1; background:none; border:none; outline:none;
  color:var(--text-primary); font-size:13px; font-family:inherit;
}
.gm-rc-cc-input::placeholder { color:var(--text-muted); }

/* ══ COMPOSE MODAL ══ */
.gm-compose-overlay {
  position:absolute; inset:0; z-index:100;
  display:flex; align-items:flex-end; justify-content:flex-end;
  padding:0 28px 28px 0;
  background:rgba(0,0,0,.25); backdrop-filter:blur(3px);
}
.gm-compose-modal {
  width:500px;
  background:var(--bg-surface);
  border:1px solid var(--border-default);
  border-radius:14px; overflow:hidden;
  display:flex; flex-direction:column;
  box-shadow:0 20px 60px rgba(0,0,0,.55);
}
.gm-cm-titlebar {
  display:flex; justify-content:space-between; align-items:center;
  padding:11px 14px;
  background:#2a2a2a;
  font-size:13px; font-weight:600; color:#fff;
}
.gm-cm-btn {
  width:22px; height:22px; border-radius:5px;
  background:rgba(255,255,255,.15); border:none; color:#fff;
  cursor:pointer; font-size:13px; transition:background .12s;
  display:flex; align-items:center; justify-content:center;
}
.gm-cm-btn:hover { background:rgba(255,255,255,.28); }
.gm-cm-close:hover { background:#EA4335 !important; }
.gm-cm-field {
  display:flex; align-items:center; gap:12px;
  padding:9px 16px; border-bottom:1px solid var(--border-subtle);
}
.gm-cm-field label {
  font-size:11px; font-weight:700; color:var(--text-muted);
  text-transform:uppercase; letter-spacing:.06em; width:48px; flex-shrink:0;
}
.gm-cm-field input {
  flex:1; background:none; border:none; outline:none;
  color:var(--text-primary); font-size:13.5px; font-family:inherit;
}
.gm-cm-field input::placeholder { color:var(--text-muted); }
.gm-cm-body {
  min-height:200px; padding:13px 16px;
  background:none; border:none; outline:none;
  color:var(--text-primary); font-size:14px; font-family:inherit;
  resize:none; line-height:1.65; box-sizing:border-box;
}
.gm-cm-footer {
  display:flex; align-items:center; gap:10px;
  padding:10px 14px; border-top:1px solid var(--border-subtle);
}
.gm-cm-trash {
  margin-left:auto; background:none; border:none;
  color:var(--text-muted); cursor:pointer; padding:6px; border-radius:7px; transition:all .12s;
}
.gm-cm-trash:hover { color:#EA4335; background:rgba(234,67,53,.08); }

/* Compose transition */
.gm-fade-enter-active,.gm-fade-leave-active { transition:opacity .18s; }
.gm-fade-enter-from,.gm-fade-leave-to { opacity:0; }

/* Shared */
.gm-spinner {
  display:inline-block; width:16px; height:16px;
  border:2px solid rgba(234,67,53,.2); border-top-color:#EA4335;
  border-radius:50%; animation:spin .7s linear infinite; flex-shrink:0;
}
.gm-spinner.sm { width:12px; height:12px; border-width:1.5px; }
/* ══ PROFILE SECTION ══ */
.gm-profile-wrap {
  margin:10px 8px 0; position:relative;
}
.gm-profile-btn {
  width:100%; display:flex; align-items:center; gap:9px;
  padding:8px 10px; border-radius:10px;
  background:none; border:none; cursor:pointer;
  transition:background .12s;
}
.gm-profile-btn:hover { background:rgba(255,255,255,.06); }
.gm-profile-img {
  width:32px; height:32px; border-radius:50%; flex-shrink:0;
  object-fit:cover; border:2px solid rgba(234,67,53,.3);
}
.gm-profile-av {
  width:32px; height:32px; border-radius:50%; flex-shrink:0;
  display:flex; align-items:center; justify-content:center;
  font-size:12px; font-weight:700; color:#fff;
  border:2px solid rgba(234,67,53,.3);
}
.gm-profile-text { flex:1; min-width:0; text-align:left; }
.gm-profile-name {
  display:block; font-size:12.5px; font-weight:600;
  color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
.gm-profile-email {
  display:block; font-size:10.5px; color:var(--text-muted);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
.gm-profile-caret { color:var(--text-muted); flex-shrink:0; transition:transform .2s ease; }

.gm-profile-menu {
  position:absolute; bottom:calc(100% + 6px); left:0; right:0;
  background:var(--bg-surface);
  border:1px solid var(--border-default);
  border-radius:12px; overflow:hidden;
  box-shadow:0 -8px 32px rgba(0,0,0,.45);
  z-index:200;
}
.gm-pm-header {
  display:flex; align-items:center; gap:11px;
  padding:14px 14px 12px;
}
.gm-pm-avatar-img {
  width:42px; height:42px; border-radius:50%; flex-shrink:0;
  object-fit:cover; border:2px solid rgba(234,67,53,.3);
}
.gm-pm-avatar {
  width:42px; height:42px; border-radius:50%; flex-shrink:0;
  display:flex; align-items:center; justify-content:center;
  font-size:15px; font-weight:700; color:#fff;
}
.gm-pm-info { flex:1; min-width:0; }
.gm-pm-name { font-size:13.5px; font-weight:600; color:var(--text-primary); }
.gm-pm-email { font-size:11.5px; color:var(--text-muted); word-break:break-all; }
.gm-pm-divider { height:1px; background:var(--border-subtle); margin:2px 0; }
.gm-pm-item {
  display:flex; align-items:center; gap:10px; width:100%;
  padding:10px 14px; background:none; border:none; cursor:pointer;
  color:var(--text-secondary); font-size:13px; text-align:left;
  transition:background .1s, color .1s;
}
.gm-pm-item:hover { background:rgba(255,255,255,.05); color:var(--text-primary); }
.gm-pm-item--danger { color:rgba(234,67,53,.85); }
.gm-pm-item--danger:hover { background:rgba(234,67,53,.08); color:#EA4335; }
@keyframes spin { to { transform:rotate(360deg); } }

/* ── Refresh button ── */
.gm-refresh-btn {
  flex-shrink:0; width:28px; height:28px; border-radius:8px;
  background:none; border:1px solid var(--border-default);
  cursor:pointer; color:var(--text-muted);
  display:flex; align-items:center; justify-content:center;
  transition:background .12s, color .12s, border-color .12s;
}
.gm-refresh-btn:hover:not(:disabled) {
  background:rgba(234,67,53,.08);
  border-color:rgba(234,67,53,.35);
  color:#EA4335;
}
.gm-refresh-btn:disabled { opacity:.4; cursor:not-allowed; }
.gm-spin { animation:spin .7s linear infinite; }

.gm-new-email-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 13px;
  background: rgba(66, 133, 244, 0.12);
  border-bottom: 1px solid rgba(66, 133, 244, 0.25);
  font-size: 12.5px;
  color: var(--text-primary);
  cursor: pointer;
  animation: gm-pulse-once 0.4s ease;
}
.gm-new-email-banner svg { color: #4285F4; flex-shrink: 0; }
.gm-new-email-banner span {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gm-new-email-banner-btn {
  flex-shrink: 0;
  padding: 3px 10px;
  background: #4285F4;
  border: none;
  border-radius: 12px;
  color: white;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.gm-new-email-banner-close {
  flex-shrink: 0;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 12px;
  padding: 2px 4px;
}
.gm-new-email-banner-close:hover { color: var(--text-primary); }
 
@keyframes gm-pulse-once {
  0%   { opacity: 0; transform: translateY(-8px); }
  100% { opacity: 1; transform: translateY(0); }
}
 
/* Slide down transition for banner */
.gm-slide-down-enter-active { transition: all 0.25s cubic-bezier(0.34,1.56,0.64,1); }
.gm-slide-down-leave-active { transition: all 0.15s ease; }
.gm-slide-down-enter-from  { opacity: 0; transform: translateY(-10px); }
.gm-slide-down-leave-to    { opacity: 0; transform: translateY(-6px); }
</style>
