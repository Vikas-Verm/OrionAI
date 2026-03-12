<template>
  <div :class="['tg-root', `theme-${activeTheme}`]">

    <!-- INIT spinner -->
    <div v-if="authStep === 'loading'" class="tg-init-screen">
      <div class="tg-init-spinner"></div>
    </div>

    <!-- AUTH -->
    <div v-else-if="authStep !== 'done'" class="tg-auth-screen">
      <div class="tg-auth-glow"></div>
      <div class="tg-auth-box">
        <div class="tg-auth-logo">
          <svg width="52" height="52" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="#229ED9"/><path d="M5.4 11.9l10.2-3.9c.47-.18.88.11.73.8l-1.74 8.2c-.13.58-.47.72-.95.45l-2.63-1.94-1.27 1.22c-.14.14-.26.26-.53.26l.19-2.69 4.87-4.4c.21-.19-.05-.29-.32-.1L7.47 13.9 4.87 13.1c-.56-.17-.57-.56.53-1.2z" fill="white"/></svg>
        </div>
        <h2 class="tg-auth-title">Telegram</h2>
        <p class="tg-auth-sub">Sign in to your account</p>
        <div v-if="authStep === 'phone'" class="tg-auth-fields">
          <div class="tg-auth-field">
            <label class="tg-auth-label">Phone number</label>
            <input v-model="authPhone" class="tg-auth-input" placeholder="+91 98765 43210" type="tel" @keydown.enter="submitPhone" autofocus/>
          </div>
          <div class="tg-auth-hint">Include country code · e.g. +91 for India</div>
          <button class="tg-auth-btn" @click="submitPhone" :disabled="authLoading">
            <span v-if="authLoading" class="tg-auth-spinner"></span><span v-else>Send Code →</span>
          </button>
          <div v-if="authError" class="tg-auth-error">{{ authError }}</div>
        </div>
        <div v-else-if="authStep === 'code'" class="tg-auth-fields">
          <div class="tg-auth-field">
            <label class="tg-auth-label">Verification code</label>
            <div class="tg-code-hint">Sent to {{ authPhone }} via Telegram</div>
            <input v-model="authCode" class="tg-auth-input tg-code-input" placeholder="12345" type="text" maxlength="6" @keydown.enter="submitCode" autofocus/>
          </div>
          <button class="tg-auth-btn" @click="submitCode" :disabled="authLoading">
            <span v-if="authLoading" class="tg-auth-spinner"></span><span v-else>Verify →</span>
          </button>
          <button class="tg-auth-back" @click="authStep = 'phone'">← Change number</button>
          <div v-if="authError" class="tg-auth-error">{{ authError }}</div>
        </div>
        <div v-else-if="authStep === 'password'" class="tg-auth-fields">
          <div class="tg-auth-field">
            <label class="tg-auth-label">Two-step verification</label>
            <div class="tg-code-hint">Your account has 2FA enabled</div>
            <input v-model="authPassword" class="tg-auth-input" placeholder="Password" type="password" @keydown.enter="submitPassword" autofocus/>
          </div>
          <button class="tg-auth-btn" @click="submitPassword" :disabled="authLoading">
            <span v-if="authLoading" class="tg-auth-spinner"></span><span v-else>Sign in →</span>
          </button>
          <div v-if="authError" class="tg-auth-error">{{ authError }}</div>
        </div>
      </div>
    </div>

    <!-- MAIN APP -->
    <div v-else class="tg-app">

      <!-- ══ SIDEBAR ══ -->
      <div class="tg-sidebar">
        <div class="tg-sidebar-header">
          <div class="tg-sidebar-title">
            <svg width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="#229ED9"/><path d="M5.4 11.9l10.2-3.9c.47-.18.88.11.73.8l-1.74 8.2c-.13.58-.47.72-.95.45l-2.63-1.94-1.27 1.22c-.14.14-.26.26-.53.26l.19-2.69 4.87-4.4c.21-.19-.05-.29-.32-.1L7.47 13.9 4.87 13.1c-.56-.17-.57-.56.53-1.2z" fill="white"/></svg>
            <span>Telegram</span>
          </div>
          <div class="tg-sidebar-right">
            <!-- Theme picker -->
            <div class="tg-theme-wrap" ref="themeWrapRef">
              <button class="tg-icon-btn" @click="showThemePicker = !showThemePicker" title="Change theme">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 010 20c-2.76 0-4-1.79-4-4 0-1.64.67-3.12 1.75-4.2L12 12V2z" fill="currentColor" opacity=".3"/></svg>
              </button>
              <div v-if="showThemePicker" class="tg-theme-picker">
                <div class="tg-theme-title">Theme</div>
                <div class="tg-theme-options">
                  <button v-for="t in themes" :key="t.id" :class="['tg-theme-opt', activeTheme === t.id && 'active']" @click="setTheme(t.id)">
                    <div class="tg-theme-swatch" :style="{ background: t.swatch }"></div>
                    <span>{{ t.label }}</span>
                  </button>
                </div>
              </div>
            </div>
            <span class="tg-me-name" v-if="me">{{ me.firstName }}</span>
            <button class="tg-icon-btn danger" @click="logout" title="Disconnect">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <!-- Search -->
        <div class="tg-search-wrap">
          <svg class="tg-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input v-model="searchQuery" class="tg-search" placeholder="Search chats…"/>
        </div>

        <!-- Filter pills -->
        <div class="tg-filter-row">
          <button v-for="f in filters" :key="f.value" :class="['tg-filter-pill', activeFilter === f.value && 'active']" @click="activeFilter = f.value">{{ f.label }}</button>
        </div>

        <!-- Dialog list -->
        <div class="tg-dialog-list" ref="dialogListEl">
          <div v-if="dialogsLoading" class="tg-list-loading">
            <div v-for="i in 8" :key="i" class="tg-skeleton-row">
              <div class="tg-skeleton-avatar"></div>
              <div class="tg-skeleton-lines"><div class="tg-skeleton-name"></div><div class="tg-skeleton-msg"></div></div>
            </div>
          </div>
          <div v-else-if="filteredDialogs.length === 0" class="tg-empty-list">No chats found</div>
          <div v-else v-for="d in filteredDialogs" :key="d.id"
            :class="['tg-dialog-item', selectedDialog?.id === d.id && 'active', d.pinned && 'pinned']"
            @click="selectDialog(d)">
            <div class="tg-dialog-av-wrap">
              <img v-if="photoCache[d.id]" :src="photoCache[d.id]" class="tg-dialog-avatar-img"/>
              <div v-else class="tg-dialog-avatar" :style="{ background: avatarColor(d.name) }">{{ avatarInitials(d.name) }}</div>
              <span v-if="d.type === 'channel'" class="tg-type-badge">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>
              </span>
              <span v-else-if="d.type === 'group'" class="tg-type-badge group">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="white"><path d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05C16.19 13.89 17 15.02 17 16.5V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
              </span>
              <!-- Unread badge — hidden when this chat is selected (already read) -->
              <span v-if="d.unreadCount > 0 && selectedDialog?.id !== d.id" class="tg-unread-badge">{{ d.unreadCount > 99 ? '99+' : d.unreadCount }}</span>
            </div>
            <div class="tg-dialog-body">
              <div class="tg-dialog-top">
                <span class="tg-dialog-name">{{ d.name }}</span>
                <span class="tg-dialog-date">{{ formatDate(d.lastDate) }}</span>
              </div>
              <div class="tg-dialog-bottom">
                <span class="tg-dialog-preview">{{ d.lastMessage || '…' }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ══ CHAT PANE ══ -->
      <div class="tg-chat-pane">
        <div v-if="!selectedDialog" class="tg-empty-chat">
          <div class="tg-empty-chat-icon">
            <svg width="80" height="80" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="rgba(34,158,217,0.08)"/><path d="M5.4 11.9l10.2-3.9c.47-.18.88.11.73.8l-1.74 8.2c-.13.58-.47.72-.95.45l-2.63-1.94-1.27 1.22c-.14.14-.26.26-.53.26l.19-2.69 4.87-4.4c.21-.19-.05-.29-.32-.1L7.47 13.9 4.87 13.1c-.56-.17-.57-.56.53-1.2z" fill="#229ED9" opacity=".4"/></svg>
          </div>
          <p class="tg-empty-chat-text">Select a chat to start messaging</p>
          <p class="tg-empty-chat-sub">Choose from your conversations on the left</p>
        </div>

        <template v-else>
          <!-- Chat header -->
          <div class="tg-chat-header">
            <div class="tg-chat-header-av-wrap">
              <img v-if="photoCache[selectedDialog.id]" :src="photoCache[selectedDialog.id]" class="tg-chat-header-avatar-img"/>
              <div v-else class="tg-chat-header-avatar" :style="{ background: avatarColor(selectedDialog.name) }">{{ avatarInitials(selectedDialog.name) }}</div>
            </div>
            <div class="tg-chat-header-info">
              <div class="tg-chat-header-name">{{ selectedDialog.name }}</div>
              <div class="tg-chat-header-sub">{{ chatSubtitle }}</div>
            </div>
            <div class="tg-chat-header-actions">
              <!-- In-chat search -->
              <button class="tg-header-btn" :class="showChatSearch && 'active-btn'" @click="toggleChatSearch" title="Search in chat">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              </button>
              <!-- Refresh -->
              <button class="tg-header-btn" @click="loadMessages(selectedDialog, true)" title="Refresh">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
              </button>
              <!-- More menu -->
              <div class="tg-more-wrap" ref="moreWrapRef">
                <button class="tg-header-btn" @click="showMoreMenu = !showMoreMenu" title="More">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
                </button>
                <div v-if="showMoreMenu" class="tg-more-menu">
                  <button class="tg-more-item" @click="clearHistory">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>
                    Clear history
                  </button>
                  <button class="tg-more-item" @click="copyDialogLink">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
                    Copy link
                  </button>
                  <div class="tg-more-divider"></div>
                  <button class="tg-more-item danger" @click="logout">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
                    Disconnect Telegram
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- In-chat search bar -->
          <div v-if="showChatSearch" class="tg-chat-search-bar">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;color:var(--tg-muted)"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input v-model="chatSearchQuery" class="tg-chat-search-input" placeholder="Search in conversation…" autofocus/>
            <span v-if="chatSearchQuery && chatSearchResults.length" class="tg-search-count">{{ chatSearchIdx + 1 }} / {{ chatSearchResults.length }}</span>
            <button v-if="chatSearchQuery" class="tg-icon-btn" @click="chatSearchNav(-1)">↑</button>
            <button v-if="chatSearchQuery" class="tg-icon-btn" @click="chatSearchNav(1)">↓</button>
            <button class="tg-icon-btn" @click="showChatSearch = false; chatSearchQuery = ''">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <!-- Messages -->
          <div class="tg-messages-area" ref="messagesAreaEl">
            <div v-if="messagesLoading" class="tg-messages-loading"><div class="tg-msg-spinner"></div></div>
            <div v-else-if="messages.length === 0" class="tg-no-messages">No messages yet</div>
            <div v-else class="tg-messages-list">

              <div class="tg-load-more-wrap" v-if="canLoadMore">
                <button class="tg-load-more-btn" @click="loadMoreMessages" :disabled="loadingMore">
                  <span v-if="loadingMore" class="tg-msg-spinner small"></span>
                  <span v-else>↑ Load earlier messages</span>
                </button>
              </div>

              <template v-for="(msg, idx) in visibleMessages" :key="msg.id">
                <div v-if="showDateSep(idx)" class="tg-date-sep"><span>{{ formatDateSep(msg.date) }}</span></div>

                <div :class="['tg-msg-row', msg.fromMe ? 'from-me' : 'from-them']"
                  :id="'msg-' + msg.id"
                  :data-search-match="chatSearchResults.includes(idx)">

                  <!-- Avatar col (group/channel) -->
                  <div v-if="!msg.fromMe && selectedDialog.type !== 'user'" class="tg-msg-av-col">
                    <template v-if="isLastInGroup(idx)">
                      <img v-if="photoCache[msg.fromId]" :src="photoCache[msg.fromId]" class="tg-msg-av-img"/>
                      <div v-else class="tg-msg-av" :style="{ background: avatarColor(msg.fromName || msg.fromId) }">{{ avatarInitials(msg.fromName || '?') }}</div>
                    </template>
                  </div>

                  <div :class="['tg-msg-bubble-wrap', isFirstInGroup(idx) && 'first-in-group']">
                    <div v-if="!msg.fromMe && selectedDialog.type !== 'user' && isFirstInGroup(idx)"
                      class="tg-msg-sender-name" :style="{ color: senderColor(msg.fromId) }">{{ msg.fromName || 'Unknown' }}</div>

                    <div :class="['tg-msg-bubble', msg.fromMe ? 'bubble-me' : 'bubble-them', !isLastInGroup(idx) && !msg.fromMe && 'no-tail', chatSearchResults.includes(idx) && idx === chatSearchResults[chatSearchIdx] && 'search-highlight']">

                      <!-- ── MEDIA RENDERING ── -->
                      <template v-if="msg.media">
                        <!-- Photo -->
                        <div v-if="msg.media.type === 'photo'" class="tg-media-photo">
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".6"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                          <span>Photo</span>
                        </div>
                        <!-- Video -->
                        <div v-else-if="msg.media.type === 'video'" class="tg-media-video">
                          <div class="tg-media-play">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                          </div>
                          <span class="tg-media-dur" v-if="msg.media.duration">{{ formatDuration(msg.media.duration) }}</span>
                        </div>
                        <!-- Voice message -->
                        <div v-else-if="msg.media.type === 'voice'" class="tg-media-voice">
                          <div class="tg-voice-icon">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2" stroke="currentColor" stroke-width="2" fill="none"/><line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" stroke-width="2"/><line x1="8" y1="23" x2="16" y2="23" stroke="currentColor" stroke-width="2"/></svg>
                          </div>
                          <div class="tg-voice-wave">
                            <div v-for="i in 20" :key="i" class="tg-voice-bar" :style="{ height: (30 + Math.sin(i * 1.2) * 20) + '%' }"></div>
                          </div>
                          <span class="tg-voice-dur" v-if="msg.media.duration">{{ formatDuration(msg.media.duration) }}</span>
                        </div>
                        <!-- Audio file -->
                        <div v-else-if="msg.media.type === 'audio'" class="tg-media-audio">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" opacity=".8"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                          <div class="tg-file-info">
                            <span class="tg-file-name">{{ msg.media.fileName }}</span>
                            <span class="tg-file-size">{{ formatSize(msg.media.size) }}</span>
                          </div>
                        </div>
                        <!-- GIF -->
                        <div v-else-if="msg.media.type === 'gif'" class="tg-media-gif">
                          <span class="tg-gif-badge">GIF</span>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".6"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                        </div>
                        <!-- Sticker -->
                        <div v-else-if="msg.media.type === 'sticker'" class="tg-media-sticker">
                          <span>🎭 Sticker</span>
                        </div>
                        <!-- Document/File -->
                        <div v-else-if="msg.media.type === 'document'" class="tg-media-doc">
                          <div class="tg-doc-icon" :style="{ background: fileIconColor(msg.media.fileName) }">
                            {{ fileExt(msg.media.fileName) }}
                          </div>
                          <div class="tg-file-info">
                            <span class="tg-file-name">{{ msg.media.fileName }}</span>
                            <span class="tg-file-size">{{ formatSize(msg.media.size) }}</span>
                          </div>
                        </div>
                        <!-- Location -->
                        <div v-else-if="msg.media.type === 'location'" class="tg-media-location">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                          <span>Location</span>
                        </div>
                        <!-- Contact -->
                        <div v-else-if="msg.media.type === 'contact'" class="tg-media-contact">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                          <div class="tg-file-info">
                            <span class="tg-file-name">{{ msg.media.name }}</span>
                            <span class="tg-file-size">{{ msg.media.phone }}</span>
                          </div>
                        </div>
                        <!-- Poll -->
                        <div v-else-if="msg.media.type === 'poll'" class="tg-media-poll">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                          <span>📊 {{ msg.media.question || 'Poll' }}</span>
                        </div>
                        <!-- Webpage preview -->
                        <div v-else-if="msg.media.type === 'webpage'" class="tg-media-webpage">
                          <div class="tg-webpage-bar"></div>
                          <div class="tg-webpage-body">
                            <span class="tg-webpage-title">{{ msg.media.title }}</span>
                            <span v-if="msg.media.description" class="tg-webpage-desc">{{ msg.media.description }}</span>
                            <a v-if="msg.media.url" :href="msg.media.url" target="_blank" class="tg-webpage-url">{{ msg.media.url }}</a>
                          </div>
                        </div>
                        <!-- Fallback -->
                        <div v-else class="tg-media-fallback">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
                          {{ msg.media.type || 'Attachment' }}
                        </div>
                      </template>

                      <!-- Text (shown with or after media) -->
                      <div v-if="msg.text" class="tg-msg-text" v-html="highlightSearch(msg.text, idx)"></div>

                      <!-- Footer -->
                      <div class="tg-msg-footer">
                        <span v-if="msg.views" class="tg-msg-views">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" opacity=".7"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                          {{ formatViews(msg.views) }}
                        </span>
                        <span class="tg-msg-time">{{ formatTime(msg.date) }}</span>
                        <span v-if="msg.fromMe" class="tg-msg-ticks">
                          <svg width="15" height="10" viewBox="0 0 15 10" fill="none">
                            <path d="M1 5l3 3 5-7" stroke="rgba(255,255,255,0.7)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M5 5l3 3 5-7" stroke="rgba(255,255,255,0.7)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </template>
              <div ref="bottomAnchorEl"></div>
            </div>
          </div>

          <!-- Input bar (hidden for channels) -->
          <div v-if="selectedDialog.type !== 'channel'" class="tg-input-bar">
            <div class="tg-input-wrap">
              <button class="tg-emoji-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
              </button>
              <textarea v-model="draftText" class="tg-input" placeholder="Message…" rows="1"
                @keydown.enter.exact.prevent="sendMessage" @input="autoResize" ref="inputEl"></textarea>
              <button class="tg-attach-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
              </button>
              <button class="tg-send-btn" :class="{ active: draftText.trim() }" @click="sendMessage" :disabled="!draftText.trim() || sending">
                <span v-if="sending" class="tg-send-spinner"></span>
                <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
          </div>
          <div v-else class="tg-channel-bar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
            Channel — view only
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import api from '../services/api'

// ── Auth ──────────────────────────────────────────────────
const authStep     = ref('loading')
const authPhone    = ref('')
const authCode     = ref('')
const authPassword = ref('')
const authLoading  = ref(false)
const authError    = ref('')

// ── App state ─────────────────────────────────────────────
const me              = ref(null)
const dialogs         = ref([])
const dialogsLoading  = ref(false)
const selectedDialog  = ref(null)
const messages        = ref([])
const messagesLoading = ref(false)
const loadingMore     = ref(false)
const canLoadMore     = ref(false)
const draftText       = ref('')
const sending         = ref(false)
const searchQuery     = ref('')
const activeFilter    = ref('all')
const photoCache      = ref({})

// ── UI state ──────────────────────────────────────────────
const showMoreMenu    = ref(false)
const showThemePicker = ref(false)
const showChatSearch  = ref(false)
const chatSearchQuery = ref('')
const chatSearchIdx   = ref(0)
const activeTheme     = ref(localStorage.getItem('tg-theme') || 'dark')

// ── Refs ──────────────────────────────────────────────────
const dialogListEl   = ref(null)
const messagesAreaEl = ref(null)
const bottomAnchorEl = ref(null)
const inputEl        = ref(null)
const moreWrapRef    = ref(null)
const themeWrapRef   = ref(null)

const filters = [
  { label: 'All', value: 'all' },
  { label: 'Personal', value: 'user' },
  { label: 'Groups', value: 'group' },
  { label: 'Channels', value: 'channel' },
  { label: 'Unread', value: 'unread' },
]

const themes = [
  { id: 'dark',    label: 'Dark',     swatch: 'linear-gradient(135deg,#1c1c1e,#2b5278)' },
  { id: 'light',   label: 'Light',    swatch: 'linear-gradient(135deg,#f0f2f5,#229ED9)' },
  { id: 'classic', label: 'Classic',  swatch: 'linear-gradient(135deg,#e6ebf0,#2481cc)' },
  { id: 'black',   label: 'Night',    swatch: 'linear-gradient(135deg,#000,#1a3a5c)' },
]

// ── Theme ─────────────────────────────────────────────────
function setTheme(id) {
  activeTheme.value = id
  localStorage.setItem('tg-theme', id)
  showThemePicker.value = false
}

// ── Init ──────────────────────────────────────────────────
onMounted(async () => {
  try {
    const res = await api.get('/api/telegram/me')
    if (res.data?.authorized) {
      me.value = res.data; authStep.value = 'done'; loadDialogs()
    } else { authStep.value = 'phone' }
  } catch { authStep.value = 'phone' }
  document.addEventListener('click', handleOutsideClick)
})
onUnmounted(() => document.removeEventListener('click', handleOutsideClick))

function handleOutsideClick(e) {
  if (moreWrapRef.value && !moreWrapRef.value.contains(e.target)) showMoreMenu.value = false
  if (themeWrapRef.value && !themeWrapRef.value.contains(e.target)) showThemePicker.value = false
}

// ── Auth ──────────────────────────────────────────────────
async function submitPhone() {
  authError.value = ''; authLoading.value = true
  try {
    await api.post('/api/telegram/auth/phone', { phoneNumber: authPhone.value })
    authStep.value = 'code'
  } catch (err) { authError.value = err.response?.data?.error || 'Failed to send code' }
  finally { authLoading.value = false }
}
async function submitCode() {
  authError.value = ''; authLoading.value = true
  try {
    const res = await api.post('/api/telegram/auth/code', { code: authCode.value })
    if (res.data.needsPassword) { authStep.value = 'password' }
    else { me.value = res.data; authStep.value = 'done'; loadDialogs() }
  } catch (err) { authError.value = err.response?.data?.error || 'Invalid code' }
  finally { authLoading.value = false }
}
async function submitPassword() {
  authError.value = ''; authLoading.value = true
  try {
    const res = await api.post('/api/telegram/auth/password', { password: authPassword.value })
    me.value = res.data; authStep.value = 'done'; loadDialogs()
  } catch (err) { authError.value = err.response?.data?.error || 'Wrong password' }
  finally { authLoading.value = false }
}
async function logout() {
  showMoreMenu.value = false
  try { await api.delete('/api/telegram/session') } catch {}
  me.value = null; dialogs.value = []; messages.value = []
  selectedDialog.value = null; authStep.value = 'phone'
  authPhone.value = ''; authCode.value = ''
}

// ── Dialogs ───────────────────────────────────────────────
async function loadDialogs() {
  dialogsLoading.value = true
  try {
    const res = await api.get('/api/telegram/dialogs?limit=80')
    dialogs.value = res.data.dialogs
    loadPhotosForDialogs(res.data.dialogs)
  } catch (err) { console.error('Failed to load dialogs:', err) }
  finally { dialogsLoading.value = false }
}
async function loadPhotosForDialogs(list) {
  for (let i = 0; i < list.length; i += 5) {
    const batch = list.slice(i, i + 5)
    await Promise.allSettled(batch.map(d => fetchPhoto(d.id)))
    await new Promise(r => setTimeout(r, 200))
  }
}
async function fetchPhoto(entityId) {
  if (!entityId || photoCache.value[entityId] !== undefined) return
  photoCache.value[entityId] = null
  try {
    const res = await api.get(`/api/telegram/photo/${encodeURIComponent(entityId)}`)
    if (res.data.photo) photoCache.value[entityId] = res.data.photo
  } catch {}
}

const filteredDialogs = computed(() => {
  let list = dialogs.value
  if (activeFilter.value !== 'all') {
    if (activeFilter.value === 'unread') list = list.filter(d => d.unreadCount > 0)
    else list = list.filter(d => d.type === activeFilter.value)
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(d => d.name.toLowerCase().includes(q) || d.username?.toLowerCase().includes(q))
  }
  return list
})

const chatSubtitle = computed(() => {
  if (!selectedDialog.value) return ''
  const d = selectedDialog.value
  if (d.type === 'channel') return 'Channel'
  if (d.type === 'group')   return 'Group'
  return d.username ? '@' + d.username : 'Private chat'
})

// ── Messages ──────────────────────────────────────────────
async function selectDialog(dialog) {
  selectedDialog.value = dialog
  messages.value       = []
  canLoadMore.value    = false
  showChatSearch.value = false
  chatSearchQuery.value = ''
  showMoreMenu.value   = false
  // Clear unread badge immediately
  const d = dialogs.value.find(x => x.id === dialog.id)
  if (d) d.unreadCount = 0
  await loadMessages(dialog, false)
}

async function loadMessages(dialog, refresh = false) {
  messagesLoading.value = true
  if (refresh) messages.value = []
  try {
    const res = await api.get(`/api/telegram/dialogs/${encodeURIComponent(dialog.id)}/messages?limit=50`)
    messages.value    = res.data.messages
    canLoadMore.value = res.data.messages.length >= 50
    if (dialog.type !== 'user') {
      const ids = [...new Set(res.data.messages.filter(m => !m.fromMe && m.fromId).map(m => m.fromId))]
      ids.forEach(id => fetchPhoto(id))
    }
    await nextTick(); scrollToBottom()
  } catch (err) { console.error('Failed to load messages:', err) }
  finally { messagesLoading.value = false }
}

async function loadMoreMessages() {
  if (!selectedDialog.value || messages.value.length === 0) return
  loadingMore.value = true
  const oldestId = messages.value[0]?.id || 0
  try {
    const res = await api.get(`/api/telegram/dialogs/${encodeURIComponent(selectedDialog.value.id)}/messages?limit=50&offsetId=${oldestId}`)
    messages.value    = [...res.data.messages, ...messages.value]
    canLoadMore.value = res.data.messages.length >= 50
    await nextTick()
    if (messagesAreaEl.value) messagesAreaEl.value.scrollTop = 200
  } catch {}
  finally { loadingMore.value = false }
}

async function sendMessage() {
  const text = draftText.value.trim()
  if (!text || !selectedDialog.value || sending.value) return
  sending.value = true
  const optimistic = { id: Date.now(), text, fromMe: true, fromName: me.value?.firstName || 'Me', fromId: null, date: new Date().toISOString(), media: null }
  messages.value.push(optimistic)
  draftText.value = ''
  await nextTick(); scrollToBottom()
  if (inputEl.value) inputEl.value.style.height = 'auto'
  try {
    await api.post(`/api/telegram/dialogs/${encodeURIComponent(selectedDialog.value.id)}/send`, { text })
  } catch (err) {
    messages.value = messages.value.filter(m => m.id !== optimistic.id)
    console.error('Send failed:', err)
  } finally { sending.value = false }
}

// ── In-chat search ────────────────────────────────────────
const chatSearchResults = computed(() => {
  if (!chatSearchQuery.value.trim()) return []
  const q = chatSearchQuery.value.toLowerCase()
  return visibleMessages.value
    .map((m, i) => m.text?.toLowerCase().includes(q) ? i : -1)
    .filter(i => i >= 0)
})
watch(chatSearchResults, (res) => {
  chatSearchIdx.value = res.length ? res.length - 1 : 0
  if (res.length) scrollToMsg(res[res.length - 1])
})
function toggleChatSearch() {
  showChatSearch.value = !showChatSearch.value
  if (!showChatSearch.value) chatSearchQuery.value = ''
}
function chatSearchNav(dir) {
  const res = chatSearchResults.value
  if (!res.length) return
  chatSearchIdx.value = (chatSearchIdx.value + dir + res.length) % res.length
  scrollToMsg(res[chatSearchIdx.value])
}
function scrollToMsg(idx) {
  nextTick(() => {
    const el = messagesAreaEl.value?.querySelector(`#msg-${visibleMessages.value[idx]?.id}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
}
function highlightSearch(text, idx) {
  if (!chatSearchQuery.value || !chatSearchResults.value.includes(idx)) return escHtml(text)
  const q = chatSearchQuery.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return escHtml(text).replace(new RegExp(escHtml(q), 'gi'), m => `<mark class="tg-hl">${m}</mark>`)
}
function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

// ── More menu actions ─────────────────────────────────────
function clearHistory() { messages.value = []; showMoreMenu.value = false }
function copyDialogLink() {
  const u = selectedDialog.value?.username
  const text = u ? `https://t.me/${u}` : selectedDialog.value?.name || ''
  navigator.clipboard?.writeText(text)
  showMoreMenu.value = false
}

// ── Helpers ───────────────────────────────────────────────
const visibleMessages = computed(() => messages.value)

function autoResize(e) {
  const el = e.target; el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 140) + 'px'
}
function scrollToBottom() {
  nextTick(() => bottomAnchorEl.value?.scrollIntoView({ behavior: 'smooth' }))
}
function isFirstInGroup(idx) {
  if (idx === 0) return true
  const c = visibleMessages.value[idx], p = visibleMessages.value[idx - 1]
  return !c || !p || c.fromId !== p.fromId || c.fromMe !== p.fromMe
}
function isLastInGroup(idx) {
  const c = visibleMessages.value[idx], n = visibleMessages.value[idx + 1]
  return !n || c.fromId !== n.fromId || c.fromMe !== n.fromMe
}
function showDateSep(idx) {
  if (idx === 0) return true
  const c = visibleMessages.value[idx]?.date, p = visibleMessages.value[idx - 1]?.date
  return !c || !p ? false : new Date(c).toDateString() !== new Date(p).toDateString()
}

const AVATAR_COLORS = ['#6366f1','#8b5cf6','#ec4899','#06b6d4','#10b981','#f59e0b','#ef4444','#229ED9','#0ea5e9','#14b8a6']
const SENDER_COLORS = ['#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7','#DDA0DD','#98D8C8','#F7DC6F','#BB8FCE','#85C1E9']
function avatarColor(n=''){let h=0;for(let i=0;i<n.length;i++)h=n.charCodeAt(i)+((h<<5)-h);return AVATAR_COLORS[Math.abs(h)%AVATAR_COLORS.length]}
function senderColor(id=''){let h=0;for(let i=0;i<id.length;i++)h=id.charCodeAt(i)+((h<<5)-h);return SENDER_COLORS[Math.abs(h)%SENDER_COLORS.length]}
function avatarInitials(n=''){const w=n.trim().split(/\s+/);return w.length>=2?(w[0][0]+w[1][0]).toUpperCase():(n.slice(0,2)||'?').toUpperCase()}
function formatDate(iso){if(!iso)return'';const d=new Date(iso),now=new Date(),diff=Math.floor((now-d)/86400000);if(diff===0)return d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});if(diff===1)return'Yesterday';if(diff<7)return d.toLocaleDateString([],{weekday:'short'});return d.toLocaleDateString([],{day:'numeric',month:'short'})}
function formatTime(iso){if(!iso)return'';return new Date(iso).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
function formatDateSep(iso){if(!iso)return'';const d=new Date(iso),now=new Date(),diff=Math.floor((now-d)/86400000);if(diff===0)return'Today';if(diff===1)return'Yesterday';return d.toLocaleDateString([],{day:'numeric',month:'long',year:'numeric'})}
function formatDuration(s){const m=Math.floor(s/60),sec=s%60;return`${m}:${String(sec).padStart(2,'0')}`}
function formatSize(b){if(!b)return'';if(b<1024)return b+'B';if(b<1048576)return(b/1024).toFixed(1)+'KB';return(b/1048576).toFixed(1)+'MB'}
function formatViews(v){if(!v)return'';if(v>=1000000)return(v/1000000).toFixed(1)+'M';if(v>=1000)return(v/1000).toFixed(1)+'K';return String(v)}
function fileExt(name=''){return(name.split('.').pop()||'?').slice(0,4).toUpperCase()}
const EXT_COLORS={'pdf':'#e44','doc':'#2b7','docx':'#2b7','xls':'#1a9','xlsx':'#1a9','zip':'#fa0','rar':'#fa0','mp4':'#a5f','mp3':'#59f','png':'#06c','jpg':'#06c','jpeg':'#06c'}
function fileIconColor(name=''){const ext=(name.split('.').pop()||'').toLowerCase();return EXT_COLORS[ext]||'#888'}
</script>

<style scoped>
/* ══════════════════════════════════════════
   THEME TOKENS
══════════════════════════════════════════ */
.tg-root {
  --tg-bg:       #1c1c1e;
  --tg-surface:  #2c2c2e;
  --tg-elevated: #3a3a3c;
  --tg-border:   rgba(255,255,255,0.08);
  --tg-primary:  var(--text-primary, #fff);
  --tg-secondary:rgba(235,235,245,0.6);
  --tg-muted:    rgba(235,235,245,0.3);
  --tg-bubble-me:#2b5278;
  --tg-bubble-them:#2c2c2e;
  --tg-bubble-me-text:#e8f4fd;
  --tg-bubble-them-text:#fff;
  --tg-accent:   #229ED9;
  --tg-input-bg: #2c2c2e;
}
.tg-root.theme-light {
  --tg-bg:       #f0f2f5;
  --tg-surface:  #ffffff;
  --tg-elevated: #f0f2f5;
  --tg-border:   rgba(0,0,0,0.08);
  --tg-primary:  #000;
  --tg-secondary:#555;
  --tg-muted:    #999;
  --tg-bubble-me:#229ED9;
  --tg-bubble-them:#ffffff;
  --tg-bubble-me-text:#fff;
  --tg-bubble-them-text:#000;
  --tg-input-bg: #fff;
}
.tg-root.theme-classic {
  --tg-bg:       #e6ebf0;
  --tg-surface:  #ffffff;
  --tg-elevated: #f0f4f9;
  --tg-border:   rgba(0,0,0,0.1);
  --tg-primary:  #1e2d3d;
  --tg-secondary:#4a5568;
  --tg-muted:    #8896a5;
  --tg-bubble-me:#2481cc;
  --tg-bubble-them:#ffffff;
  --tg-bubble-me-text:#fff;
  --tg-bubble-them-text:#1e2d3d;
  --tg-accent:   #2481cc;
  --tg-input-bg: #fff;
}
.tg-root.theme-black {
  --tg-bg:       #000000;
  --tg-surface:  #111111;
  --tg-elevated: #1a1a1a;
  --tg-border:   rgba(255,255,255,0.06);
  --tg-primary:  #fff;
  --tg-secondary:rgba(255,255,255,0.55);
  --tg-muted:    rgba(255,255,255,0.25);
  --tg-bubble-me:#1a4a6e;
  --tg-bubble-them:#1a1a1a;
  --tg-bubble-me-text:#e0f0ff;
  --tg-bubble-them-text:#ddd;
  --tg-input-bg: #111;
}

/* ══════════════════════════════════════════
   ROOT
══════════════════════════════════════════ */
.tg-root { display:flex; flex-direction:column; height:100%; background:var(--tg-bg); overflow:hidden; position:relative; color:var(--tg-primary); font-size:14px; }

/* Init */
.tg-init-screen { flex:1; display:flex; align-items:center; justify-content:center; }
.tg-init-spinner { width:32px; height:32px; border-radius:50%; border:3px solid rgba(34,158,217,.2); border-top-color:#229ED9; animation:tg-spin .7s linear infinite; }

/* ══════════════════════════════════════════
   AUTH
══════════════════════════════════════════ */
.tg-auth-screen { flex:1; display:flex; align-items:center; justify-content:center; position:relative; overflow:hidden; }
.tg-auth-glow { position:absolute; width:500px; height:500px; background:radial-gradient(circle,rgba(34,158,217,.1) 0%,transparent 70%); top:50%; left:50%; transform:translate(-50%,-50%); pointer-events:none; }
.tg-auth-box { background:var(--tg-surface); border:1px solid var(--tg-border); border-radius:20px; padding:40px 36px; width:100%; max-width:380px; display:flex; flex-direction:column; align-items:center; position:relative; z-index:1; }
.tg-auth-logo { margin-bottom:18px; }
.tg-auth-title { font-size:22px; font-weight:700; color:var(--tg-primary); margin:0 0 6px; }
.tg-auth-sub   { font-size:13px; color:var(--tg-muted); margin:0 0 28px; }
.tg-auth-fields { width:100%; display:flex; flex-direction:column; gap:14px; }
.tg-auth-field  { display:flex; flex-direction:column; gap:7px; }
.tg-auth-label  { font-size:12px; font-weight:600; color:var(--tg-secondary); letter-spacing:.4px; text-transform:uppercase; }
.tg-auth-input  { background:var(--tg-elevated); border:1.5px solid var(--tg-border); border-radius:10px; padding:11px 14px; color:var(--tg-primary); font-size:14px; outline:none; transition:border-color .2s; }
.tg-auth-input:focus { border-color:#229ED9; box-shadow:0 0 0 3px rgba(34,158,217,.12); }
.tg-code-input  { font-size:22px; letter-spacing:8px; text-align:center; }
.tg-auth-hint, .tg-code-hint { font-size:12px; color:var(--tg-muted); }
.tg-auth-btn    { width:100%; padding:12px; background:#229ED9; color:#fff; border:none; border-radius:10px; font-size:14px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; }
.tg-auth-btn:hover:not(:disabled) { opacity:.88; } .tg-auth-btn:disabled { opacity:.5; cursor:not-allowed; }
.tg-auth-back  { background:none; border:none; color:var(--tg-muted); font-size:13px; cursor:pointer; }
.tg-auth-back:hover { color:#229ED9; }
.tg-auth-error { font-size:12.5px; color:#ef4444; text-align:center; padding:6px 12px; background:rgba(239,68,68,.08); border-radius:8px; }
.tg-auth-spinner { width:16px; height:16px; border:2px solid rgba(255,255,255,.3); border-top-color:#fff; border-radius:50%; animation:tg-spin .65s linear infinite; display:inline-block; }

/* ══════════════════════════════════════════
   LAYOUT
══════════════════════════════════════════ */
.tg-app { flex:1; display:flex; overflow:hidden; }

/* ══════════════════════════════════════════
   SIDEBAR
══════════════════════════════════════════ */
.tg-sidebar { width:320px; flex-shrink:0; display:flex; flex-direction:column; border-right:1px solid var(--tg-border); background:var(--tg-surface); overflow:hidden; }
.tg-sidebar-header { display:flex; align-items:center; justify-content:space-between; padding:12px 14px 10px; border-bottom:1px solid var(--tg-border); flex-shrink:0; }
.tg-sidebar-title  { display:flex; align-items:center; gap:9px; font-size:16px; font-weight:700; color:var(--tg-primary); }
.tg-sidebar-right  { display:flex; align-items:center; gap:6px; }
.tg-me-name        { font-size:12px; color:var(--tg-muted); }
.tg-icon-btn { background:none; border:none; color:var(--tg-muted); cursor:pointer; width:28px; height:28px; border-radius:7px; display:flex; align-items:center; justify-content:center; transition:all .15s; }
.tg-icon-btn:hover { background:var(--tg-elevated); color:var(--tg-primary); }
.tg-icon-btn.danger:hover { color:#ef4444; }

/* Theme picker */
.tg-theme-wrap   { position:relative; }
.tg-theme-picker { position:absolute; top:36px; right:0; background:var(--tg-surface); border:1px solid var(--tg-border); border-radius:12px; padding:10px; z-index:100; min-width:170px; box-shadow:0 8px 24px rgba(0,0,0,.3); }
.tg-theme-title  { font-size:11px; font-weight:600; color:var(--tg-muted); text-transform:uppercase; letter-spacing:.5px; margin-bottom:8px; padding:0 4px; }
.tg-theme-options { display:grid; grid-template-columns:1fr 1fr; gap:6px; }
.tg-theme-opt    { display:flex; flex-direction:column; align-items:center; gap:5px; padding:6px; border:1.5px solid transparent; border-radius:8px; background:transparent; cursor:pointer; transition:all .15s; color:var(--tg-primary); font-size:11px; }
.tg-theme-opt:hover { background:var(--tg-elevated); }
.tg-theme-opt.active { border-color:#229ED9; }
.tg-theme-swatch { width:36px; height:24px; border-radius:6px; }

.tg-search-wrap  { position:relative; padding:10px 12px 6px; flex-shrink:0; }
.tg-search-icon  { position:absolute; left:22px; top:50%; transform:translateY(-50%); color:var(--tg-muted); pointer-events:none; margin-top:2px; }
.tg-search       { width:100%; background:var(--tg-elevated); border:1px solid var(--tg-border); border-radius:10px; padding:8px 12px 8px 34px; font-size:13px; color:var(--tg-primary); outline:none; }
.tg-search:focus { border-color:#229ED9; }
.tg-search::placeholder { color:var(--tg-muted); }

.tg-filter-row   { display:flex; gap:6px; padding:6px 12px 8px; flex-shrink:0; overflow-x:auto; scrollbar-width:none; }
.tg-filter-row::-webkit-scrollbar { display:none; }
.tg-filter-pill  { padding:4px 12px; border:1px solid var(--tg-border); border-radius:20px; background:transparent; color:var(--tg-muted); font-size:12px; cursor:pointer; white-space:nowrap; transition:all .15s; }
.tg-filter-pill.active { background:rgba(34,158,217,.15); border-color:#229ED9; color:#229ED9; font-weight:600; }

.tg-dialog-list  { flex:1; overflow-y:auto; scrollbar-width:thin; }
.tg-dialog-list::-webkit-scrollbar { width:3px; }
.tg-dialog-list::-webkit-scrollbar-thumb { background:var(--tg-border); }

/* Skeletons */
.tg-list-loading { padding:8px 0; }
.tg-skeleton-row { display:flex; gap:12px; align-items:center; padding:10px 14px; }
.tg-skeleton-avatar { width:44px; height:44px; border-radius:50%; background:var(--tg-elevated); animation:shimmer 1.4s ease infinite; flex-shrink:0; }
.tg-skeleton-lines { flex:1; display:flex; flex-direction:column; gap:8px; }
.tg-skeleton-name  { height:12px; border-radius:6px; background:var(--tg-elevated); width:55%; animation:shimmer 1.4s ease infinite; }
.tg-skeleton-msg   { height:10px; border-radius:6px; background:var(--tg-elevated); width:75%; animation:shimmer 1.4s ease infinite .2s; }
@keyframes shimmer { 0%,100%{opacity:.5}50%{opacity:1} }
.tg-empty-list { display:flex; align-items:center; justify-content:center; padding:40px; font-size:13px; color:var(--tg-muted); }

/* Dialog rows */
.tg-dialog-item { display:flex; align-items:center; gap:12px; padding:8px 14px; cursor:pointer; transition:background .1s; }
.tg-dialog-item:hover  { background:var(--tg-elevated); }
.tg-dialog-item.active { background:rgba(34,158,217,.1); }
.tg-dialog-av-wrap   { position:relative; flex-shrink:0; width:46px; height:46px; }
.tg-dialog-avatar-img{ width:46px; height:46px; border-radius:50%; object-fit:cover; }
.tg-dialog-avatar    { width:46px; height:46px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:15px; font-weight:700; color:#fff; }
.tg-type-badge { position:absolute; bottom:-1px; right:-1px; width:16px; height:16px; border-radius:50%; background:#229ED9; display:flex; align-items:center; justify-content:center; border:2px solid var(--tg-surface); }
.tg-type-badge.group { background:#10b981; }
.tg-unread-badge { position:absolute; top:-3px; right:-3px; min-width:18px; height:18px; border-radius:9px; background:#229ED9; color:#fff; font-size:10px; font-weight:700; display:flex; align-items:center; justify-content:center; padding:0 4px; }
.tg-dialog-body   { flex:1; min-width:0; }
.tg-dialog-top    { display:flex; align-items:baseline; justify-content:space-between; margin-bottom:3px; gap:8px; }
.tg-dialog-name   { font-size:13.5px; font-weight:600; color:var(--tg-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.tg-dialog-date   { font-size:11px; color:var(--tg-muted); flex-shrink:0; }
.tg-dialog-preview{ font-size:12.5px; color:var(--tg-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

/* ══════════════════════════════════════════
   CHAT PANE
══════════════════════════════════════════ */
.tg-chat-pane { flex:1; display:flex; flex-direction:column; overflow:hidden; background:var(--tg-bg); position:relative; }
.tg-chat-pane::before { content:''; position:absolute; inset:0; background-image:radial-gradient(circle,rgba(34,158,217,.02) 1px,transparent 1px); background-size:24px 24px; pointer-events:none; z-index:0; }

.tg-empty-chat { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; z-index:1; position:relative; }
.tg-empty-chat-icon { opacity:.5; }
.tg-empty-chat-text { font-size:15px; font-weight:600; color:var(--tg-secondary); }
.tg-empty-chat-sub  { font-size:13px; color:var(--tg-muted); }

/* Header */
.tg-chat-header { display:flex; align-items:center; gap:12px; padding:10px 16px; border-bottom:1px solid var(--tg-border); background:var(--tg-surface); flex-shrink:0; z-index:2; position:relative; }
.tg-chat-header-av-wrap { flex-shrink:0; }
.tg-chat-header-avatar-img { width:38px; height:38px; border-radius:50%; object-fit:cover; }
.tg-chat-header-avatar { width:38px; height:38px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:700; color:#fff; }
.tg-chat-header-info { flex:1; }
.tg-chat-header-name { font-size:14px; font-weight:700; color:var(--tg-primary); }
.tg-chat-header-sub  { font-size:11.5px; color:var(--tg-muted); margin-top:1px; }
.tg-chat-header-actions { display:flex; gap:4px; }
.tg-header-btn { width:32px; height:32px; border-radius:8px; border:1px solid var(--tg-border); background:transparent; color:var(--tg-muted); cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all .15s; }
.tg-header-btn:hover, .tg-header-btn.active-btn { background:var(--tg-elevated); color:var(--tg-primary); }

/* More menu */
.tg-more-wrap { position:relative; }
.tg-more-menu { position:absolute; top:38px; right:0; background:var(--tg-surface); border:1px solid var(--tg-border); border-radius:10px; padding:6px; z-index:200; min-width:180px; box-shadow:0 8px 24px rgba(0,0,0,.3); }
.tg-more-item { width:100%; display:flex; align-items:center; gap:9px; padding:8px 10px; border:none; background:transparent; color:var(--tg-primary); font-size:13px; cursor:pointer; border-radius:7px; text-align:left; transition:background .12s; }
.tg-more-item:hover { background:var(--tg-elevated); }
.tg-more-item.danger { color:#ef4444; }
.tg-more-divider { height:1px; background:var(--tg-border); margin:4px 0; }

/* In-chat search bar */
.tg-chat-search-bar { display:flex; align-items:center; gap:8px; padding:8px 14px; background:var(--tg-surface); border-bottom:1px solid var(--tg-border); flex-shrink:0; z-index:2; position:relative; }
.tg-chat-search-input { flex:1; background:transparent; border:none; outline:none; color:var(--tg-primary); font-size:13px; }
.tg-chat-search-input::placeholder { color:var(--tg-muted); }
.tg-search-count { font-size:11px; color:var(--tg-muted); white-space:nowrap; }

/* Messages */
.tg-messages-area { flex:1; overflow-y:auto; padding:12px 16px 8px; position:relative; z-index:1; display:flex; flex-direction:column; }
.tg-messages-area::-webkit-scrollbar { width:4px; }
.tg-messages-area::-webkit-scrollbar-thumb { background:var(--tg-border); border-radius:2px; }
.tg-messages-loading, .tg-no-messages { display:flex; align-items:center; justify-content:center; flex:1; font-size:13px; color:var(--tg-muted); }
.tg-messages-list { display:flex; flex-direction:column; gap:2px; }
.tg-load-more-wrap { display:flex; justify-content:center; padding:6px 0 12px; }
.tg-load-more-btn { padding:5px 16px; border:1px solid var(--tg-border); border-radius:20px; background:var(--tg-elevated); color:var(--tg-secondary); font-size:12px; cursor:pointer; display:flex; align-items:center; gap:7px; }
.tg-load-more-btn:hover:not(:disabled) { border-color:#229ED9; color:#229ED9; }
.tg-date-sep { display:flex; align-items:center; justify-content:center; padding:8px 0; margin:4px 0; }
.tg-date-sep span { font-size:11.5px; color:var(--tg-muted); background:var(--tg-elevated); border:1px solid var(--tg-border); padding:3px 12px; border-radius:12px; }

/* Bubbles */
.tg-msg-row { display:flex; align-items:flex-end; gap:6px; margin-bottom:2px; }
.tg-msg-row.from-me   { justify-content:flex-end; }
.tg-msg-row.from-them { justify-content:flex-start; }
.tg-msg-av-col { width:30px; flex-shrink:0; align-self:flex-end; }
.tg-msg-av-img { width:30px; height:30px; border-radius:50%; object-fit:cover; }
.tg-msg-av     { width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:700; color:#fff; flex-shrink:0; }
.tg-msg-bubble-wrap { max-width:72%; display:flex; flex-direction:column; }
.from-me .tg-msg-bubble-wrap { align-items:flex-end; }
.tg-msg-sender-name { font-size:12px; font-weight:700; margin-bottom:4px; padding-left:2px; }
.tg-msg-bubble { padding:7px 11px 5px; border-radius:18px; position:relative; word-break:break-word; min-width:72px; }
.bubble-them { background:var(--tg-bubble-them); border:1px solid var(--tg-border); color:var(--tg-bubble-them-text); border-radius:4px 18px 18px 18px; }
.bubble-them.no-tail { border-radius:18px; }
.bubble-me { background:var(--tg-bubble-me); color:var(--tg-bubble-me-text); border-radius:18px 18px 4px 18px; }
.search-highlight { outline:2px solid #f59e0b; outline-offset:1px; }
.tg-msg-text { font-size:14px; line-height:1.5; white-space:pre-wrap; }
.tg-msg-footer { display:flex; align-items:center; justify-content:flex-end; gap:4px; margin-top:3px; float:right; margin-left:8px; margin-bottom:-2px; }
.tg-msg-time { font-size:11px; opacity:.6; }
.tg-msg-views { display:flex; align-items:center; gap:2px; font-size:11px; opacity:.6; }
.tg-msg-ticks { display:flex; align-items:center; }

/* Search highlight */
:deep(.tg-hl) { background:#f59e0b44; border-radius:2px; padding:0 1px; }

/* ── MEDIA CARDS ── */
.tg-media-photo, .tg-media-video, .tg-media-gif {
  width:220px; height:140px; border-radius:10px; background:rgba(0,0,0,.25);
  display:flex; align-items:center; justify-content:center; flex-direction:column;
  gap:6px; font-size:13px; color:rgba(255,255,255,.7);
  margin-bottom:4px; overflow:hidden; position:relative;
}
.tg-media-gif { background:rgba(0,0,0,.3); }
.tg-gif-badge { position:absolute; top:8px; left:8px; background:rgba(0,0,0,.6); color:#fff; font-size:11px; font-weight:700; padding:2px 7px; border-radius:4px; }
.tg-media-play { width:44px; height:44px; border-radius:50%; background:rgba(0,0,0,.5); display:flex; align-items:center; justify-content:center; }
.tg-media-dur  { font-size:11px; font-weight:600; position:absolute; bottom:8px; left:10px; background:rgba(0,0,0,.5); padding:1px 6px; border-radius:4px; color:#fff; }

.tg-media-voice { display:flex; align-items:center; gap:8px; padding:4px 0; min-width:160px; }
.tg-voice-icon  { width:32px; height:32px; border-radius:50%; background:#229ED9; display:flex; align-items:center; justify-content:center; flex-shrink:0; color:#fff; }
.tg-voice-wave  { display:flex; align-items:center; gap:2px; flex:1; height:30px; }
.tg-voice-bar   { flex:1; background:rgba(34,158,217,.6); border-radius:2px; min-height:15%; max-height:100%; }
.tg-voice-dur   { font-size:11px; color:rgba(255,255,255,.6); flex-shrink:0; }

.tg-media-audio, .tg-media-doc, .tg-media-contact { display:flex; align-items:center; gap:10px; padding:3px 0; min-width:180px; }
.tg-doc-icon { width:38px; height:38px; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:9px; font-weight:700; color:#fff; flex-shrink:0; }
.tg-file-info { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }
.tg-file-name { font-size:13px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.tg-file-size { font-size:11px; opacity:.6; }

.tg-media-location { display:flex; align-items:center; gap:8px; font-size:13px; }
.tg-media-poll     { display:flex; align-items:flex-start; gap:7px; font-size:13px; }
.tg-media-sticker  { font-size:14px; padding:4px 0; }
.tg-media-fallback { display:flex; align-items:center; gap:6px; font-size:12px; opacity:.7; font-style:italic; }

.tg-media-webpage { border-left:3px solid var(--tg-accent,#229ED9); padding:4px 8px; margin-bottom:4px; }
.tg-webpage-body  { display:flex; flex-direction:column; gap:3px; }
.tg-webpage-title { font-size:13px; font-weight:600; color:var(--tg-accent,#229ED9); }
.tg-webpage-desc  { font-size:12px; opacity:.75; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
.tg-webpage-url   { font-size:11px; color:var(--tg-accent,#229ED9); opacity:.7; text-decoration:none; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

/* ══════════════════════════════════════════
   INPUT BAR
══════════════════════════════════════════ */
.tg-input-bar { padding:8px 12px 10px; border-top:1px solid var(--tg-border); background:var(--tg-surface); flex-shrink:0; position:relative; z-index:2; }
.tg-input-wrap { display:flex; align-items:flex-end; gap:4px; background:var(--tg-input-bg); border:1px solid var(--tg-border); border-radius:24px; padding:6px; transition:border-color .2s; }
.tg-input-wrap:focus-within { border-color:#229ED9; }
.tg-emoji-btn, .tg-attach-btn { width:34px; height:34px; border-radius:50%; border:none; background:transparent; color:var(--tg-muted); cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:color .15s; }
.tg-emoji-btn:hover, .tg-attach-btn:hover { color:#229ED9; }
.tg-input { flex:1; background:transparent; border:none; outline:none; color:var(--tg-primary); font-size:14px; font-family:inherit; line-height:1.5; resize:none; min-height:22px; max-height:140px; padding:5px 4px; scrollbar-width:none; }
.tg-input::placeholder { color:var(--tg-muted); }
.tg-send-btn { width:36px; height:36px; border-radius:50%; border:none; background:var(--tg-elevated); color:var(--tg-muted); cursor:pointer; flex-shrink:0; display:flex; align-items:center; justify-content:center; transition:all .2s; }
.tg-send-btn.active { background:#229ED9; color:#fff; box-shadow:0 2px 10px rgba(34,158,217,.35); }
.tg-send-btn:disabled { opacity:.4; cursor:not-allowed; }

/* Channel read-only bar */
.tg-channel-bar { display:flex; align-items:center; justify-content:center; gap:7px; padding:12px 16px; border-top:1px solid var(--tg-border); background:var(--tg-surface); color:var(--tg-muted); font-size:13px; flex-shrink:0; z-index:2; position:relative; }

/* Spinners */
.tg-msg-spinner       { width:22px; height:22px; border:2px solid rgba(34,158,217,.2); border-top-color:#229ED9; border-radius:50%; animation:tg-spin .65s linear infinite; display:inline-block; }
.tg-msg-spinner.small { width:13px; height:13px; }
.tg-send-spinner      { width:14px; height:14px; border:2px solid rgba(255,255,255,.3); border-top-color:#fff; border-radius:50%; animation:tg-spin .65s linear infinite; display:inline-block; }
@keyframes tg-spin { to { transform:rotate(360deg); } }
</style>