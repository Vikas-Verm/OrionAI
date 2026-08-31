<template>
  <div class="wa-shell" :class="{ 'is-collapsed': isSidebarCollapsed, 'wa-shell--mobile': isCompactLayout }">
    <aside v-if="showSidebarPane" class="wa-sidebar" :class="{ collapsed: isSidebarCollapsed }">
      <div class="wa-sidebar-head">
        <button
          class="wa-brand wa-brand-btn"
          type="button"
          :disabled="!isSidebarCollapsed && !isConnected"
          :title="isSidebarCollapsed ? 'Expand sidebar' : (isConnected ? 'View your WhatsApp profile' : 'WhatsApp not connected')"
          @click="isSidebarCollapsed ? (sidebarCollapsed = false) : toggleProfilePanel()"
        >
          <div class="wa-brand-icon">
            <img
              v-if="status.profile?.avatarUrl && !isImageBroken(status.profile.avatarUrl)"
              :src="authMediaUrl(status.profile.avatarUrl)"
              :alt="status.profile?.displayName || 'WhatsApp profile'"
              class="wa-brand-avatar"
              @error="markImageBroken(status.profile?.avatarUrl)"
            />
            <span v-else class="wa-avatar-fallback">
              {{ avatarInitials(status.profile?.displayName || status.profile?.phone || 'WhatsApp') }}
            </span>
          </div>
          <div v-if="!isSidebarCollapsed" class="wa-brand-copy">
            <strong>WhatsApp</strong>
            <span>{{ isConnected ? (status.profile?.displayName || 'Connected') : 'Connect WhatsApp in Integrations' }}</span>
          </div>
        </button>

        <div v-if="!isSidebarCollapsed" class="wa-head-actions">
          <button
            class="wa-icon-btn"
            :disabled="syncingContacts || !isConnected"
            :title="syncingContacts ? 'Syncing contacts…' : 'Sync contacts (refresh names from your phone’s address book)'"
            @click="syncContacts"
          >
            <span v-if="syncingContacts" class="wa-spinner wa-spinner--sm"></span>
            <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 11l-3-3-3 3" />
              <path d="M19 8v8" />
            </svg>
          </button>
          <button class="wa-icon-btn" :disabled="refreshing" title="Refresh WhatsApp" @click="refreshAll">
            <span v-if="refreshing" class="wa-spinner wa-spinner--sm"></span>
            <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M23 4v6h-6" />
              <path d="M1 20v-6h6" />
              <path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10" />
              <path d="M1 14l4.6 4.4A9 9 0 0 0 20.5 15" />
            </svg>
          </button>
          <button
            v-if="!isCompactLayout"
            class="wa-icon-btn"
            title="Collapse sidebar"
            @click="sidebarCollapsed = true"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        </div>
      </div>

      <div v-if="showProfilePanel && isConnected && !isSidebarCollapsed" class="wa-profile-popover">
        <div class="wa-profile-card">
          <div class="wa-profile-actions">
            <button class="wa-icon-btn wa-icon-btn--ghost" title="Close profile" @click="showProfilePanel = false">
              <span aria-hidden="true">✕</span>
            </button>
          </div>

          <div class="wa-profile-hero">
            <div class="wa-profile-avatar">
              <img
                v-if="status.profile?.avatarUrl && !isImageBroken(status.profile.avatarUrl)"
                :src="authMediaUrl(status.profile.avatarUrl)"
                :alt="status.profile?.displayName || 'WhatsApp profile'"
                @error="markImageBroken(status.profile?.avatarUrl)"
              />
              <span v-else>{{ avatarInitials(status.profile?.displayName || status.profile?.phone || 'WhatsApp') }}</span>
            </div>
            <div class="wa-profile-copy">
              <strong>{{ status.profile?.displayName || 'WhatsApp profile' }}</strong>
              <span>{{ status.profile?.phone || 'Linked on this device' }}</span>
            </div>
          </div>

          <div class="wa-info-grid">
            <div class="wa-info-item">
              <span>Chats</span>
              <strong>{{ chats.length }}</strong>
            </div>
            <div class="wa-info-item">
              <span>Unread</span>
              <strong>{{ status.unreadCount || 0 }}</strong>
            </div>
            <div class="wa-info-item">
              <span>Status</span>
              <strong>{{ status.loginState || 'connected' }}</strong>
            </div>
            <div class="wa-info-item">
              <span>Linked</span>
              <strong>{{ status.connectedAt ? formatDateDivider(status.connectedAt) : 'Now' }}</strong>
            </div>
          </div>

          <div class="wa-info-actions">
            <button class="wa-chip-btn" @click="showProfilePanel = false">Close</button>
            <button class="wa-chip-btn" @click="emit('open-integrations')">Open Integrations</button>
          </div>
        </div>
      </div>

      <div v-if="isConnected && !isSidebarCollapsed" class="wa-action-panel-wrap">
        <CommunicationInsightsWidget
          title="OrionAI insights"
          panel-title="Reply / Action Required"
          :panel-headline="'WhatsApp chats OrionAI believes are truly waiting on you'"
          :summary-text="whatsappActionSummary"
          :counts="whatsappActionCounts"
          :items="whatsappActionItems"
          :groups="whatsappActionGroups"
          :loading="whatsappActionsLoading"
          :selected-conversation-id="selectedChat?.roomId || selectedChat?.id"
          @refresh="refreshWhatsAppActions"
          @open="openWhatsAppActionConversation"
          @draft="draftWhatsAppActionConversation"
          @done="completeWhatsAppAction"
          @snooze="snoozeWhatsAppAction"
          @dismiss="dismissWhatsAppAction"
        />
      </div>

      <div v-if="!isSidebarCollapsed" class="wa-search-wrap">
        <svg class="wa-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          v-model="chatQuery"
          class="wa-search"
          :disabled="!isConnected"
          type="search"
          placeholder="Search chats"
        />
      </div>

      <div v-if="!isSidebarCollapsed" class="wa-filter-row">
        <button
          v-for="filter in CHAT_FILTERS"
          :key="filter.id"
          class="wa-filter-chip"
          :class="{ active: activeFilter === filter.id }"
          :disabled="!isConnected"
          @click="activeFilter = filter.id"
        >
          {{ filter.label }}
        </button>
      </div>

      <div
        v-if="!isSidebarCollapsed && isConnected && syncProgressText"
        class="wa-sync-progress"
        :class="{ 'has-error': syncStatus.failedCount > 0 }"
      >
        <span v-if="syncStatus.pendingConversationCount > 0" class="wa-spinner wa-spinner--sm"></span>
        <span>{{ syncProgressText }}</span>
      </div>

      <div v-if="loadingChats && chats.length === 0" class="wa-list-state" :class="{ compact: isSidebarCollapsed }">
        <div v-for="n in isSidebarCollapsed ? 6 : 5" :key="`chat-skeleton-${n}`" class="wa-chat-skeleton" :class="{ compact: isSidebarCollapsed }">
          <span class="wa-chat-skeleton-avatar"></span>
          <span v-if="!isSidebarCollapsed" class="wa-chat-skeleton-lines">
            <span></span>
            <span></span>
          </span>
        </div>
      </div>

      <div v-else-if="!isConnected && !isSidebarCollapsed" class="wa-list-empty">
        <div class="wa-empty-orb">
          <span>QR</span>
        </div>
        <strong>
          {{ status.loginState === 'pending_qr' ? 'Finish linking WhatsApp' : 'WhatsApp is not connected' }}
        </strong>
        <p v-if="status.loginState === 'pending_qr'">
          OrionAI already requested a QR code. Open Integrations to scan it from Linked Devices on your phone.
        </p>
        <p v-else>
          {{ status.lastError || 'Connect WhatsApp in Integrations to load your live chats inside OrionAI.' }}
        </p>
        <button class="wa-primary-btn" @click="emit('open-integrations')">Open Integrations</button>
      </div>

      <div v-else-if="filteredChats.length === 0 && !isSidebarCollapsed" class="wa-list-empty">
        <div class="wa-empty-orb">
          <span v-if="chatQuery">0</span>
          <span v-else-if="isConversationSyncing" class="wa-empty-spinner" aria-hidden="true"></span>
          <span v-else>0</span>
        </div>
        <strong>{{ chatQuery ? 'No chats match your search' : emptyChatTitle }}</strong>
        <p>
          {{ chatQuery
            ? 'Try a different name, message preview, or filter.'
            : emptyChatDescription }}
        </p>
      </div>

      <div v-else class="wa-chat-list" :class="{ compact: isSidebarCollapsed }">
        <button
          v-for="chat in filteredChats"
          :key="chat.roomId || chat.id"
          class="wa-chat-row"
          :class="{ active: currentRoomId(chat) === currentRoomId(selectedChat), compact: isSidebarCollapsed }"
          :title="chat.title || chat.name"
          @click="selectChat(chat)"
        >
          <div class="wa-chat-avatar">
            <img
              v-if="chat.avatarUrl && !isImageBroken(chat.avatarUrl)"
              :src="authMediaUrl(chat.avatarUrl)"
              :alt="chat.title || chat.name"
              @error="markImageBroken(chat.avatarUrl)"
            />
            <span v-else>{{ avatarInitials(chat.title || chat.name) }}</span>
          </div>

          <template v-if="!isSidebarCollapsed">
            <div class="wa-chat-copy">
              <div class="wa-chat-title-row">
                <strong>{{ chat.title || chat.name }}</strong>
                <span>{{ formatChatTime(chat.lastMessageAt) }}</span>
              </div>
              <div class="wa-chat-preview-row">
                <p>{{ chat.lastMessagePreview || (chat.bridgeStatus === 'contact' ? 'Known contact, chat sync pending' : 'No messages yet') }}</p>
                <span v-if="chat.isPinned" class="wa-chat-flag" title="Pinned">Pin</span>
                <span v-if="chat.isMuted" class="wa-chat-flag" title="Muted">Mute</span>
                <span v-if="chat.bridgeStatus === 'contact'" class="wa-chat-flag" title="Bridge contact">Contact</span>
              </div>
            </div>

            <div class="wa-chat-meta">
              <span v-if="chat.unreadCount" class="wa-chat-badge">{{ chat.unreadCount }}</span>
              <span class="wa-chat-kind">{{ chat.bridgeStatus === 'contact' ? 'Known' : (chat.isGroup ? 'Group' : 'Direct') }}</span>
            </div>
          </template>
        </button>
      </div>
    </aside>

    <main v-if="showMainPane" class="wa-main">
      <template v-if="!isConnected">
        <section class="wa-state-panel">
          <div class="wa-state-hero">
            <div class="wa-state-illustration">
              <span class="wa-state-circle wa-state-circle--one"></span>
              <span class="wa-state-circle wa-state-circle--two"></span>
              <div class="wa-state-card">
                <div class="wa-state-card-head">
                  <span class="wa-state-card-dot"></span>
                  <span>{{ status.loginState === 'pending_qr' ? 'Awaiting QR scan' : 'Bridge offline' }}</span>
                </div>
                <div v-if="status.loginState === 'pending_qr' && status.qrImageUrl" class="wa-state-qr">
                  <img :src="status.qrImageUrl" alt="WhatsApp QR code" />
                </div>
                <div v-else class="wa-state-lines">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
            <div class="wa-state-copy">
              <strong>
                {{ status.loginState === 'pending_qr' ? 'Scan the QR in Integrations' : 'WhatsApp lives here once linked' }}
              </strong>
              <p>
                {{ status.loginState === 'pending_qr'
                  ? 'OrionAI already provisioned your hidden Matrix session and asked the bridge for a QR. Open Integrations to finish linking from Linked Devices.'
                  : status.lastError || 'Chats and messages stay live in Matrix and are proxied into OrionAI without storing personal history in MongoDB.' }}
              </p>
              <button class="wa-primary-btn" @click="emit('open-integrations')">Go to Integrations</button>
            </div>
          </div>
        </section>
      </template>

      <template v-else-if="!selectedChat">
        <section class="wa-state-panel">
          <div class="wa-state-hero">
            <div class="wa-state-copy">
              <strong>Your WhatsApp workspace is ready</strong>
              <p>Select a chat on the left to read messages, send files, record a voice note, and reply without leaving OrionAI.</p>
            </div>
          </div>
        </section>
      </template>

      <template v-else>
        <header class="wa-chat-head">
          <button
            v-if="isCompactLayout"
            class="wa-icon-btn wa-chat-back"
            type="button"
            title="Back to chats"
            @click="selectedChat = null; showInfoPanel = false; searchInChatOpen = false; messageQuery = ''"
          >
            <span aria-hidden="true">←</span>
          </button>
          <button class="wa-chat-head-main wa-chat-head-main-btn" type="button" @click="showInfoPanel = !showInfoPanel">
            <div class="wa-chat-head-avatar">
              <img
                v-if="selectedChat.avatarUrl && !isImageBroken(selectedChat.avatarUrl)"
                :src="authMediaUrl(selectedChat.avatarUrl)"
                :alt="selectedChat.title || selectedChat.name"
                @error="markImageBroken(selectedChat.avatarUrl)"
              />
              <span v-else>{{ avatarInitials(selectedChat.title || selectedChat.name) }}</span>
            </div>
            <div class="wa-chat-head-copy">
              <strong>{{ selectedChat.title || selectedChat.name }}</strong>
              <span>{{ selectedChatStatusLine }}</span>
            </div>
          </button>

          <div class="wa-chat-actions">
            <button class="wa-icon-btn" :class="{ active: searchInChatOpen }" title="Search in chat" @click="toggleMessageSearch">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </button>
            <button class="wa-icon-btn" title="Call contact" @click="startVoiceCall">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72l.33 2.53a2 2 0 0 1-.57 1.72l-1.1 1.1a16 16 0 0 0 6 6l1.1-1.1a2 2 0 0 1 1.72-.57l2.53.33A2 2 0 0 1 22 16.92Z" />
              </svg>
            </button>
            <button class="wa-icon-btn" title="Open WhatsApp video handoff" @click="startVideoCall">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="m22 8-6 4 6 4V8Z" />
                <rect x="2" y="6" width="14" height="12" rx="2" />
              </svg>
            </button>
            <button class="wa-icon-btn" :disabled="loadingMessages" title="Refresh chat" @click="refreshSelectedConversation">
              <span v-if="loadingMessages" class="wa-spinner wa-spinner--sm"></span>
              <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M23 4v6h-6" />
                <path d="M1 20v-6h6" />
                <path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10" />
                <path d="M1 14l4.6 4.4A9 9 0 0 0 20.5 15" />
              </svg>
            </button>
            <button
              class="wa-icon-btn wa-icon-btn--danger"
              :disabled="deletingChat"
              title="Delete chat (removes it from OrionAI; the other party keeps their copy)"
              @click="deleteCurrentChat"
            >
              <span v-if="deletingChat" class="wa-spinner wa-spinner--sm"></span>
              <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
            </button>
          </div>
        </header>

        <div v-if="searchInChatOpen" class="wa-chat-search">
          <input
            v-model="messageQuery"
            class="wa-chat-search-input"
            type="search"
            placeholder="Search this conversation"
          />
        </div>

        <div class="wa-chat-layout">
          <section class="wa-thread-panel">
            <div v-if="prevBatch" class="wa-load-earlier">
              <button class="wa-load-btn" :disabled="loadingOlder" @click="loadOlderMessages">
                <span v-if="loadingOlder" class="wa-spinner wa-spinner--sm"></span>
                <span v-else>Load earlier messages</span>
              </button>
            </div>

            <div ref="messagesEl" class="wa-thread-scroll">
              <!-- FIX 1: spacer pushes messages to the bottom when content is short -->
              <div class="wa-thread-push"></div>

              <div v-if="loadingMessages && messages.length === 0" class="wa-thread-loading">
                <div v-for="n in 4" :key="`msg-skeleton-${n}`" class="wa-msg-skeleton" :class="{ 'is-out': n % 2 === 0 }">
                  <span></span>
                </div>
              </div>

              <template v-else>
                <template v-for="(message, index) in visibleMessages" :key="message.id">
                  <div v-if="showDateDivider(message, index)" class="wa-date-divider">
                    <span>{{ formatDateDivider(message.timestamp) }}</span>
                  </div>

                  <div class="wa-message-row" :class="{ 'from-me': message.direction === 'outbound' || message.fromMe }">
                    <div v-if="message.direction !== 'outbound' && !message.fromMe" class="wa-message-avatar">
                      <img
                        v-if="message.senderAvatarUrl && !isImageBroken(message.senderAvatarUrl)"
                        :src="authMediaUrl(message.senderAvatarUrl)"
                        :alt="message.senderName"
                        loading="lazy"
                        decoding="async"
                        @error="markImageBroken(message.senderAvatarUrl)"
                      />
                      <span v-else>{{ avatarInitials(message.senderName) }}</span>
                    </div>

                    <div class="wa-message-stack">
                      <div class="wa-message-actions">
                        <button class="wa-mini-btn" @click="startReply(message)">Reply</button>
                        <button class="wa-mini-btn" @click="copyMessage(message)">Copy</button>
                        <button
                          v-if="firstAttachment(message)?.url"
                          class="wa-mini-btn"
                          @click="downloadAttachment(firstAttachment(message))"
                        >
                          Download
                        </button>
                        <button
                          v-if="!message.deleted"
                          class="wa-mini-btn wa-mini-btn--danger"
                          :disabled="deletingMessageIds.has(message.id)"
                          :title="canDeleteForEveryone(message)
                            ? 'Delete for everyone — also removes the message from WhatsApp for the other party'
                            : 'Delete this message'"
                          @click="deleteMessage(message)"
                        >
                          Delete
                        </button>
                      </div>

                      <div class="wa-bubble" :class="{ deleted: message.deleted }">
                        <div v-if="message.direction !== 'outbound' && !message.fromMe && selectedChat.isGroup" class="wa-message-sender">
                          {{ message.senderName }}
                        </div>

                        <div v-if="message.replyPreview" class="wa-reply-preview">
                          <strong>{{ message.replyPreview.senderName }}</strong>
                          <span>{{ message.replyPreview.text }}</span>
                        </div>

                        <div v-if="message.deleted" class="wa-deleted-copy">Message deleted</div>

                        <template v-else>
                          <div
                            v-if="firstAttachment(message)?.type === 'image' && firstAttachment(message)?.url && !isImageBroken(firstAttachment(message)?.url)"
                            class="wa-media-card wa-media-card--image"
                          >
                            <img
                              :src="authMediaUrl(firstAttachment(message).url)"
                              :alt="firstAttachment(message).fileName"
                              loading="lazy"
                              decoding="async"
                              @click="openLightbox(firstAttachment(message))"
                              @error="markImageBroken(firstAttachment(message).url)"
                            />
                          </div>

                          <div v-else-if="firstAttachment(message)?.type === 'video'" class="wa-media-card wa-media-card--video">
                            <video :src="authMediaUrl(firstAttachment(message).url)" controls preload="metadata"></video>
                          </div>

                          <div v-else-if="firstAttachment(message)?.type === 'audio'" class="wa-media-card wa-media-card--audio">
                            <div class="wa-audio-pill">
                              <span class="wa-audio-wave"></span>
                              <span>{{ message.isVoice ? 'Voice message' : 'Audio attachment' }}</span>
                            </div>
                            <audio :src="authMediaUrl(firstAttachment(message).url)" controls preload="metadata"></audio>
                          </div>

                          <div v-else-if="firstAttachment(message)?.url" class="wa-media-card">
                            <div class="wa-file-card">
                              <div>
                                <strong>{{ firstAttachment(message).fileName }}</strong>
                                <span>{{ readableSize(firstAttachment(message).size) || firstAttachment(message).mimeType || 'Attachment' }}</span>
                              </div>
                              <button class="wa-mini-btn" @click="downloadAttachment(firstAttachment(message))">Open</button>
                            </div>
                          </div>

                          <p v-if="message.text" class="wa-message-text" v-html="linkifyText(message.text)"></p>

                          <div v-if="message.reactions?.length" class="wa-reaction-row">
                            <span v-for="reaction in message.reactions" :key="`${message.id}-${reaction.key}`" class="wa-reaction-pill">
                              {{ reaction.key }} {{ reaction.count }}
                            </span>
                          </div>
                        </template>

                        <div class="wa-message-meta">
                          <span>{{ message.timeLabel || formatChatTime(message.timestamp) }}</span>
                          <span v-if="message.direction === 'outbound' || message.fromMe">
                            {{ message.deliveryLabel || 'Sent' }}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </template>

                <div v-if="visibleMessages.length === 0" class="wa-thread-empty">
                  <strong>{{ messageQuery ? 'No messages match your search' : (selectedChat.bridgeStatus === 'contact' ? 'Chat sync pending' : 'No messages yet') }}</strong>
                  <p>
                    {{ messageQuery
                      ? 'Try a different search phrase.'
                      : selectedChat.bridgeStatus === 'contact'
                        ? 'OrionAI is creating the live chat room for this contact. You can keep typing while it finishes.'
                        : 'Start the conversation from OrionAI.' }}
                  </p>
                </div>
              </template>
            </div>
          </section>

          <aside v-if="showInfoPanel" class="wa-info-panel">
            <div class="wa-info-head">
              <strong>Contact info</strong>
              <button class="wa-icon-btn wa-icon-btn--ghost" title="Close profile" @click="showInfoPanel = false">
                <span aria-hidden="true">✕</span>
              </button>
            </div>

            <div class="wa-info-card">
              <div class="wa-info-avatar">
                <img
                  v-if="selectedChat.avatarUrl && !isImageBroken(selectedChat.avatarUrl)"
                  :src="authMediaUrl(selectedChat.avatarUrl)"
                  :alt="selectedChat.title || selectedChat.name"
                  @error="markImageBroken(selectedChat.avatarUrl)"
                />
                <span v-else>{{ avatarInitials(selectedChat.title || selectedChat.name) }}</span>
              </div>
              <strong>{{ selectedChat.title || selectedChat.name }}</strong>
              <span>{{ selectedChatSubtitle }}</span>
            </div>

            <div class="wa-info-grid">
              <div class="wa-info-item">
                <span>Unread</span>
                <strong>{{ selectedChat.unreadCount || 0 }}</strong>
              </div>
              <div class="wa-info-item">
                <span>Type</span>
                <strong>{{ selectedChat.isGroup ? 'Group' : 'Direct' }}</strong>
              </div>
              <div class="wa-info-item">
                <span>Phone</span>
                <strong>{{ selectedChat.phoneNumber || 'Not available' }}</strong>
              </div>
              <div class="wa-info-item">
                <span>Bridge</span>
                <strong>{{ selectedChat.bridgeStatus === 'contact' ? 'Contact only' : 'Live portal' }}</strong>
              </div>
            </div>

            <div class="wa-info-section">
              <span class="wa-info-label">Profile</span>
              <p>{{ selectedChat.fullName || selectedChat.title || selectedChat.name }}</p>
              <p v-if="selectedChat.pushName && selectedChat.pushName !== selectedChat.fullName">Push name: {{ selectedChat.pushName }}</p>
              <p v-if="selectedChat.businessName">Business: {{ selectedChat.businessName }}</p>
              <p v-if="selectedChat.contactMxid">Ghost: <code>{{ selectedChat.contactMxid }}</code></p>
              <p v-if="selectedChat.contactJid">JID: <code>{{ selectedChat.contactJid }}</code></p>
            </div>

            <div class="wa-info-section">
              <span class="wa-info-label">Sync</span>
              <p>{{ selectedChat.bridgeStatus === 'contact' ? 'The bridge has the contact metadata, but the live Matrix portal has not finished syncing yet.' : 'Live WhatsApp chats are loaded on demand and proxied through Matrix without storing message history in MongoDB.' }}</p>
            </div>

            <div class="wa-info-actions">
              <button class="wa-chip-btn" @click="markCurrentRoomRead()">Mark read</button>
              <button class="wa-chip-btn" @click="toggleMuteCurrentRoom">
                {{ selectedChat.isMuted ? 'Unmute' : 'Mute' }}
              </button>
              <button class="wa-chip-btn" @click="refreshSelectedConversation">Refresh chat</button>
            </div>
          </aside>
        </div>

        <section class="wa-composer-shell">
          <div v-if="replyTarget || draftAttachments.length || recording" class="wa-compose-top">
            <div v-if="replyTarget" class="wa-compose-banner">
              <span class="wa-compose-banner-label">Replying to {{ replyTarget.senderName }}</span>
              <span class="wa-compose-banner-text">{{ replyTarget.text || firstAttachment(replyTarget)?.fileName || 'Attachment' }}</span>
              <button @click="clearReply">✕</button>
            </div>

            <div v-if="draftAttachments.length" class="wa-upload-strip">
              <div v-for="(draft, index) in draftAttachments" :key="draft.id" class="wa-upload-chip">
                <div class="wa-upload-thumb">
                  <img v-if="draft.previewType === 'image' && draft.previewUrl" :src="draft.previewUrl" :alt="draft.fileName" />
                  <span v-else>{{ draft.previewLabel }}</span>
                </div>
                <span>{{ draft.fileName }}</span>
                <button @click="removeDraftAttachment(index)">✕</button>
              </div>
            </div>

            <div v-if="recording" class="wa-compose-banner wa-compose-banner--recording">
              <span class="wa-compose-banner-label">Recording voice note</span>
              <span class="wa-compose-banner-text">{{ formatRecordingTime(recordingSeconds) }}</span>
              <button @click="stopVoiceRecording()">Stop</button>
            </div>
          </div>

          <div v-if="composerNotice" class="wa-composer-notice">
            <span>{{ composerNotice }}</span>
            <button type="button" @click="composerNotice = ''">Dismiss</button>
          </div>

          <div v-if="emojiPanelOpen" class="wa-quick-panel">
            <div ref="emojiPickerEl" class="wa-emoji-mart"></div>
          </div>

          <div v-if="gifPanelOpen" class="wa-quick-panel wa-quick-panel--gif">
            <div class="wa-gif-search">
              <input
                v-model="gifQuery"
                class="wa-gif-search-input"
                type="search"
                placeholder="Search GIFs"
                @input="onGifQueryInput"
              />
            </div>
            <div v-if="gifLoading" class="wa-gif-loading">Searching…</div>
            <div v-else-if="gifResults.length" class="wa-gif-grid">
              <button
                v-for="gif in gifResults"
                :key="gif.id"
                class="wa-gif-card"
                :title="gif.title"
                @click="pickGif(gif)"
              >
                <img :src="gif.preview" :alt="gif.title" loading="lazy" />
              </button>
            </div>
            <div v-else-if="gifError" class="wa-gif-empty">{{ gifError }}</div>
            <div v-else class="wa-gif-empty">
              No results — try a different search.
            </div>
          </div>

          <footer class="wa-compose">
            <input ref="fileInputEl" class="wa-hidden-input" type="file" multiple @change="handleFilePick" />
            <button class="wa-compose-btn" :disabled="composerDisabled" title="Attach files" @click="openAttachmentPicker">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="m21.44 11.05-8.49 8.49a5.5 5.5 0 0 1-7.78-7.78l9.2-9.19a3.5 3.5 0 1 1 4.95 4.95l-9.19 9.2a1.5 1.5 0 0 1-2.12-2.12l8.49-8.48" />
              </svg>
            </button>
            <button class="wa-compose-btn wa-emoji-btn" :disabled="composerDisabled" title="Emoji picker" @click.stop="toggleEmojiPanel">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                <path d="M9 9h.01" />
                <path d="M15 9h.01" />
              </svg>
            </button>
            <button class="wa-compose-btn" :disabled="composerDisabled" title="GIF picker" @click="toggleGifPanel">GIF</button>
            <button
              class="wa-compose-btn"
              :class="{ 'is-recording': recording }"
              :disabled="composerDisabled || !canRecordVoice"
              :title="recording ? 'Stop voice recording' : 'Record a voice message'"
              @click="toggleVoiceRecording"
            >
              <span v-if="recording" class="wa-recording-dot"></span>
              <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 1 1-6 0V6a3 3 0 0 1 3-3Z" />
                <path d="M19 11a7 7 0 0 1-14 0" />
                <path d="M12 18v3" />
              </svg>
            </button>

            <textarea
              ref="composerEl"
              v-model="composer"
              class="wa-compose-input"
              rows="1"
              :disabled="!selectedChat || !isConnected || sending"
              :placeholder="composerPlaceholder"
              @keydown.enter.exact.prevent="sendMessage"
              @input="autoResize"
            ></textarea>

            <button class="wa-compose-send" :disabled="sendDisabled" @click="sendMessage">
              <span v-if="sending" class="wa-spinner wa-spinner--sm"></span>
              <svg v-else width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </footer>
        </section>
      </template>
    </main>

    <transition name="wa-fade">
      <div v-if="lightbox" class="wa-lightbox" @click="closeLightbox">
        <div class="wa-lightbox-card" @click.stop>
          <img :src="authMediaUrl(lightbox.url)" :alt="lightbox.fileName" />
          <div class="wa-lightbox-actions">
            <span>{{ lightbox.fileName }}</span>
            <button class="wa-mini-btn" @click="downloadAttachment(lightbox)">Download</button>
          </div>
        </div>
      </div>
    </transition>

    <!-- OrionAI-styled confirm modal — replaces window.confirm so prompts
         feel native to the app instead of showing the browser's
         "localhost says…" dialog. Used for delete-for-me / delete-for-
         everyone / delete-chat. -->
    <transition name="wa-fade">
      <div
        v-if="confirmModal.open"
        class="wa-confirm-backdrop"
        @click.self="closeConfirm()"
      >
        <div class="wa-confirm-card" role="dialog" aria-modal="true">
          <div class="wa-confirm-head">
            <strong>{{ confirmModal.title }}</strong>
            <button
              class="wa-confirm-close"
              aria-label="Close"
              @click="closeConfirm()"
            >
              ✕
            </button>
          </div>
          <p v-if="confirmModal.message" class="wa-confirm-body">
            {{ confirmModal.message }}
          </p>
          <div class="wa-confirm-actions">
            <button
              v-for="(action, idx) in confirmModal.actions"
              :key="idx"
              class="wa-confirm-btn"
              :class="`wa-confirm-btn--${action.variant || 'default'}`"
              :disabled="confirmModal.busy"
              @click="runConfirmAction(action)"
            >
              {{ action.label }}
            </button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import emojiData from '@emoji-mart/data'
import { Picker, init as initEmojiMart } from 'emoji-mart'
import api, { API_BASE } from '../services/api'
import CommunicationInsightsWidget from '../components/communications/CommunicationInsightsWidget.vue'
import { useCommunicationActions, emitCommunicationPriorityRefresh } from '../composables/useCommunicationActions'
import { useWebSocket } from '../composables/useWebSocket'
import { store, setModuleContext } from '../stores/app'
import {
  mergeConversationLists,
  mergeConversationMetadata,
  mergeMessagesByEvent,
  createConversationHistoryCache,
  sortConversationsByActivity,
} from '../utils/whatsappRuntime'

initEmojiMart({ data: emojiData })

const EMOJI_CATEGORIES = Object.freeze([
  'frequent',
  'people',
  'nature',
  'foods',
  'activity',
  'places',
  'objects',
  'symbols',
  'flags',
])
const emit = defineEmits(['close', 'open-integrations'])

const CHAT_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'groups', label: 'Groups' },
]
const WHATSAPP_INITIAL_HISTORY_LIMIT = 25
const WHATSAPP_OLDER_HISTORY_LIMIT = 50
// GIF picker is backed by the backend's Tenor proxy (TENOR_API_KEY in env).
// We never call Tenor directly from the browser so the key stays server-side.

const status = ref({
  connected: false,
  loginState: 'disconnected',
  lastError: '',
  qrImageUrl: null,
  roomCount: 0,
  unreadCount: 0,
  profile: null,
  connectedAt: null,
})
const syncStatus = ref({
  state: 'CONNECTING',
  remoteState: 'UNKNOWN',
  portalCount: 0,
  discoveredPortalCount: 0,
  eligibleConversationCount: 0,
  verifiedCount: 0,
  verifiedConversationCount: 0,
  pendingConversationCount: 0,
  ignoredCount: 0,
  duplicateCount: 0,
  failedCount: 0,
  lastReconcileAt: null,
  errorCode: '',
})
const chats = ref([])
const messages = ref([])
const prevBatch = ref(null)
const selectedChat = ref(null)
const chatQuery = ref('')
const messageQuery = ref('')
const activeFilter = ref('all')
const composer = ref('')
const replyTarget = ref(null)
const loadingChats = ref(false)
const loadingMessages = ref(false)
const loadingOlder = ref(false)
const refreshing = ref(false)
const deletingChat = ref(false)
const deletingMessageIds = ref(new Set())
const historyCache = createConversationHistoryCache({
  maxEntries: 12,
  maxAgeMs: 2 * 60 * 1000,
})

// OrionAI-styled confirm modal. Replaces window.confirm so the dialog feels
// like part of the app rather than a browser-chrome alert. Each action is
// `{ label, variant: 'default' | 'danger' | 'ghost', handler: async () => {} }`.
// While an action's handler runs, all buttons are disabled (busy = true).
const confirmModal = ref({
  open: false,
  title: '',
  message: '',
  actions: [],
  busy: false,
})

function openConfirm({ title = '', message = '', actions = [] } = {}) {
  confirmModal.value = {
    open: true,
    title,
    message,
    actions,
    busy: false,
  }
}

function closeConfirm() {
  confirmModal.value = {
    open: false,
    title: '',
    message: '',
    actions: [],
    busy: false,
  }
}

async function runConfirmAction(action) {
  if (!action || typeof action.handler !== 'function' || confirmModal.value.busy) {
    if (action?.handler === null || action?.cancel) {
      closeConfirm()
    }
    return
  }
  confirmModal.value = { ...confirmModal.value, busy: true }
  try {
    await action.handler()
  } finally {
    closeConfirm()
  }
}

// "Delete for me" hide-list. Matrix redactions are always-for-everyone, so
// to mimic WhatsApp's local-only "Delete for me" we keep an opt-in hide
// list per (user, room) in localStorage and filter the visible messages.
// The actual server-side message is left untouched.
const hiddenMessageIds = ref(new Set())

function hideListStorageKey(roomId) {
  const user = store.user?.username || 'anon'
  return `wa:hidden:${user}:${roomId || ''}`
}

function loadHiddenMessageIds(roomId) {
  if (!roomId || typeof window === 'undefined') {
    hiddenMessageIds.value = new Set()
    return
  }
  try {
    const raw = localStorage.getItem(hideListStorageKey(roomId))
    if (!raw) {
      hiddenMessageIds.value = new Set()
      return
    }
    const parsed = JSON.parse(raw)
    hiddenMessageIds.value = new Set(
      Array.isArray(parsed) ? parsed.filter(Boolean) : []
    )
  } catch {
    hiddenMessageIds.value = new Set()
  }
}

function persistHiddenMessageIds(roomId) {
  if (!roomId || typeof window === 'undefined') return
  try {
    localStorage.setItem(
      hideListStorageKey(roomId),
      JSON.stringify([...hiddenMessageIds.value])
    )
  } catch {
    // localStorage might be disabled — best-effort only.
  }
}

function hideMessageLocally(message) {
  if (!message?.id || !selectedChat.value?.roomId) return
  const next = new Set(hiddenMessageIds.value)
  next.add(message.id)
  hiddenMessageIds.value = next
  persistHiddenMessageIds(selectedChat.value.roomId)
}
const syncingContacts = ref(false)
const sending = ref(false)
const emojiPanelOpen = ref(false)
const gifPanelOpen = ref(false)
const gifQuery = ref('')
const gifResults = ref([])
const gifLoading = ref(false)
const gifError = ref('')
let gifSearchTimer = null
const searchInChatOpen = ref(false)
const composerNotice = ref('')
const draftAttachments = ref([])
const recording = ref(false)
const recordingSeconds = ref(0)
const lightbox = ref(null)
const failedImages = ref({})
const showInfoPanel = ref(false)
const showProfilePanel = ref(false)
const sidebarCollapsed = ref(false)
const viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1280)
// Per-room "read up to" timestamps. Persisted to localStorage so that a chat
// the user has read in OrionAI stays read across page reloads (previously this
// was in-memory only, so every reload re-surfaced phantom unread badges — the
// core of bug #3). Keyed by Matrix room id.
const READ_CUTOFF_STORAGE_KEY = 'orion.whatsapp.readCutoffs'
function loadPersistedReadCutoffs() {
  if (typeof window === 'undefined' || !window.localStorage) return {}
  try {
    const raw = window.localStorage.getItem(READ_CUTOFF_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}
const localReadCutoffs = ref(loadPersistedReadCutoffs())
function persistReadCutoffs() {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(
      READ_CUTOFF_STORAGE_KEY,
      JSON.stringify(localReadCutoffs.value || {})
    )
  } catch {
    /* storage full / disabled — non-fatal, falls back to in-memory */
  }
}

const fileInputEl = ref(null)
const messagesEl = ref(null)
const composerEl = ref(null)
const emojiPickerEl = ref(null)

let refreshTimer = null
let mediaRecorder = null
let recordingStream = null
let recordingTimer = null
let recordingChunks = []
let recordingMode = 'queue'
let emojiPicker = null

const {
  actionableItems: whatsappActionItems,
  counts: whatsappActionCounts,
  groups: whatsappActionGroups,
  loading: whatsappActionsLoading,
  summaryText: whatsappActionSummary,
  refresh: refreshWhatsAppActions,
  recordAction: recordWhatsAppAction,
} = useCommunicationActions('whatsapp')
const { unreadByApp } = useWebSocket()

const isConnected = computed(() =>
  Boolean(status.value.connected || status.value.loginState === 'connected')
)
const isConversationSyncing = computed(() =>
  Number(syncStatus.value.pendingConversationCount || 0) > 0 ||
  ['CONNECTING', 'CONNECTED_SYNCING'].includes(String(syncStatus.value.state || ''))
)
const syncProgressText = computed(() => {
  const pending = Number(syncStatus.value.pendingConversationCount || 0)
  const failed = Number(syncStatus.value.failedCount || 0)
  if (pending > 0) return `Syncing ${pending} more chat${pending === 1 ? '' : 's'}...`
  if (failed > 0) return `${failed} chat${failed === 1 ? '' : 's'} need${failed === 1 ? 's' : ''} attention`
  return ''
})
const emptyChatTitle = computed(() => {
  if (syncStatus.value.state === 'SYNC_FAILED') return 'Chat sync needs attention'
  if (syncStatus.value.state === 'ACTION_REQUIRED') return 'WhatsApp needs attention'
  if (syncStatus.value.state === 'READY') return 'No chats yet'
  return 'Syncing your chats...'
})
const emptyChatDescription = computed(() => {
  if (syncStatus.value.state === 'SYNC_FAILED') return 'OrionAI could not finish verifying your chats. Refresh to retry safely.'
  if (syncStatus.value.state === 'ACTION_REQUIRED') return 'Open Integrations to restore the WhatsApp connection.'
  if (syncStatus.value.state === 'READY') return 'Your verified WhatsApp conversations will appear here when available.'
  return 'OrionAI is verifying your bridge-owned conversations.'
})
const isCompactLayout = computed(() => viewportWidth.value <= 860)
const isSidebarCollapsed = computed(() => !isCompactLayout.value && sidebarCollapsed.value)
const showSidebarPane = computed(() => {
  if (!isCompactLayout.value) return true
  if (!isConnected.value) return false
  return !selectedChat.value
})
const showMainPane = computed(() =>
  !isCompactLayout.value || !isConnected.value || !!selectedChat.value
)
const canRecordVoice = computed(() =>
  typeof window !== 'undefined' &&
  typeof MediaRecorder !== 'undefined' &&
  Boolean(navigator?.mediaDevices?.getUserMedia)
)
const composerDisabled = computed(() =>
  !selectedChat.value ||
  !isConnected.value ||
  sending.value
)
const sendDisabled = computed(() => {
  if (composerDisabled.value) return true
  return !composer.value.trim() && draftAttachments.value.length === 0
})
const composerPlaceholder = computed(() => {
  if (!selectedChat.value) return 'Choose a conversation first'
  if (!isConnected.value) return 'Connect WhatsApp in Integrations first'
  if (selectedChat.value.bridgeStatus === 'contact') {
    return 'Type a message and OrionAI will prepare the live chat room'
  }
  return draftAttachments.value.length ? 'Add a caption or send the files…' : 'Type a message'
})
const selectedChatSubtitle = computed(() => {
  if (!selectedChat.value) return ''
  if (selectedChat.value.bridgeStatus === 'contact') {
    return 'Known contact, live chat sync pending'
  }
  if (selectedChat.value.isGroup) {
    const unread = Number(selectedChat.value.unreadCount || 0)
    return `${selectedChat.value.memberCount || 0} members${unread ? ` · ${unread} unread` : ''}`
  }
  return selectedChat.value.unreadCount
    ? `${selectedChat.value.unreadCount} unread`
    : 'Direct WhatsApp conversation'
})
const selectedChatStatusLine = computed(() => {
  if (!selectedChat.value) return ''

  const typingUsers = Array.isArray(selectedChat.value.typingUsers)
    ? selectedChat.value.typingUsers
    : []

  if (typingUsers.length === 1) {
    return `${typingUsers[0].displayName || 'Someone'} is typing…`
  }
  if (typingUsers.length > 1) {
    return 'Several people are typing…'
  }
  if (selectedChat.value.bridgeStatus === 'contact') {
    return 'Preparing live chat…'
  }
  if (selectedChat.value.isGroup) {
    return selectedChatSubtitle.value
  }
  return 'Live in OrionAI'
})
const callPhoneNumber = computed(() => normalizeDigits(selectedChat.value?.phoneNumber || ''))

const filteredChats = computed(() => {
  const query = chatQuery.value.trim().toLowerCase()
  return chats.value.filter((chat) => {
    if (activeFilter.value === 'unread' && !Number(chat.unreadCount || 0)) return false
    if (activeFilter.value === 'groups' && !chat.isGroup) return false
    if (!query) return true

    const haystack = [
      chat.title,
      chat.name,
      chat.lastMessagePreview,
      chat.lastSender,
      chat.phoneNumber,
      chat.fullName,
      chat.pushName,
      chat.businessName,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return haystack.includes(query)
  })
})

const visibleMessages = computed(() => {
  const hidden = hiddenMessageIds.value
  const base = hidden.size
    ? messages.value.filter((message) => !hidden.has(message.id))
    : messages.value
  const query = messageQuery.value.trim().toLowerCase()
  if (!query) return base
  return base.filter((message) => {
    const haystack = [
      message.text,
      message.senderName,
      firstAttachment(message)?.fileName,
      message.replyPreview?.text,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return haystack.includes(query)
  })
})

function normalizeDigits(value = '') {
  return String(value || '').replace(/\D/g, '')
}

// Escape HTML, then turn URLs into clickable links. Safe: text is escaped
// first, so only the anchors we build are ever rendered as HTML.
function linkifyText(value = '') {
  const raw = String(value || '')
  if (!raw) return ''
  const escaped = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
  const urlRe = /((?:https?:\/\/|www\.)[^\s<]+[^\s<.,;:!?)\]}'"])/gi
  return escaped.replace(urlRe, (match) => {
    const href = match.startsWith('http') ? match : `https://${match}`
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="wa-link">${match}</a>`
  })
}

function normalizeTimestamp(value) {
  if (!value) return 0
  const numeric = Number(value)
  if (Number.isFinite(numeric) && numeric > 0) return numeric
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function currentRoomId(chat = null) {
  return String(chat?.roomId || chat?.id || '')
}

function normalizeChatIdentityKey(chat = null) {
  if (!chat) return ''

  const canonical = String(chat.canonicalContactJid || chat.contactJid || '').trim().toLowerCase()
  if (canonical) return canonical

  const digits = normalizeDigits(chat.phoneNumber || chat.title || chat.name || '')
  if (digits) return digits

  return currentRoomId(chat)
}

function chatsMatch(left = null, right = null) {
  if (!left || !right) return false

  const leftRoomId = currentRoomId(left)
  const rightRoomId = currentRoomId(right)
  // STRICT: when BOTH sides have a Matrix room ID, require an exact match.
  // The previous fuzzy fallback (matching by phone digits when room IDs
  // differed) caused the selected chat to "auto-jump" to a different chat
  // during the 8s polling refresh — two contacts with similar phone digits
  // or one with an empty digit fallback would collide and selectedChat got
  // swapped to whichever happened to match first.
  if (leftRoomId && rightRoomId) {
    return leftRoomId === rightRoomId
  }

  // Only fall through to the loose identity match when at least one side has
  // no room ID yet (e.g. a freshly-discovered contact that hasn't been
  // materialised as a portal yet).
  const leftKey = normalizeChatIdentityKey(left)
  const rightKey = normalizeChatIdentityKey(right)
  return Boolean(leftKey && rightKey && leftKey === rightKey)
}

function findMatchingChat(collection = [], target = null) {
  return (collection || []).find((chat) => chatsMatch(chat, target)) || null
}

function replaceChatInList(nextChat = null, previousChat = null) {
  if (!nextChat?.roomId) return

  let matched = false
  chats.value = chats.value.map((chat) => {
    if (!chatsMatch(chat, nextChat) && !(previousChat && chatsMatch(chat, previousChat))) return chat
    matched = true
    return normalizeChatReadState({
      ...chat,
      ...nextChat,
      roomId: nextChat.roomId,
      id: nextChat.roomId,
    })
  })

  if (!matched) {
    chats.value = [
      normalizeChatReadState({
        ...nextChat,
        roomId: nextChat.roomId,
        id: nextChat.roomId,
      }),
      ...chats.value,
    ]
  }
  chats.value = sortConversationsByActivity(chats.value)
}

function previewForRealtimeMessage(message = {}) {
  return String(
    message.text ||
      message.attachments?.[0]?.fileName ||
      (message.attachments?.length ? 'Attachment' : '')
  ).trim()
}

function handleWhatsAppRealtimeMessage(event) {
  const detail = event?.detail || {}
  if (detail.provider !== 'whatsapp' || !detail.roomId || !detail.message) return
  const roomId = String(detail.roomId)
  const existing = chats.value.find((chat) => currentRoomId(chat) === roomId)
  if (!existing) return
  const message = { ...detail.message, id: detail.eventId || detail.message.id }
  const active = currentRoomId(selectedChat.value) === roomId
  const incoming = {
    roomId,
    title: detail.conversation?.title || '',
    displayNameSource: 'room_name',
    displayNameRank: 80,
    avatarUrl: detail.conversation?.avatarUrl || '',
    lastMessagePreview: previewForRealtimeMessage(message),
    lastMessageAt: message.timestamp || detail.conversation?.lastActivityAt || new Date().toISOString(),
    lastEventId: message.id,
    latestMessageId: message.id,
    unreadCount: active ? 0 : Number(existing.unreadCount || 0) + 1,
  }
  const merged = normalizeChatReadState(mergeConversationMetadata(existing, incoming))
  chats.value = sortConversationsByActivity(
    chats.value.map((chat) => currentRoomId(chat) === roomId ? merged : chat)
  )
  if (active) {
    messages.value = mergeMessages(messages.value, [message])
    historyCache.set(roomId, {
      messages: messages.value,
      prevBatch: prevBatch.value,
    })
    selectedChat.value = merged
    nextTick(() => scrollToBottom())
  } else {
    historyCache.append(roomId, [message])
  }
}

function handleWhatsAppSendStatus(event) {
  const detail = event?.detail || {}
  if (detail.provider !== 'whatsapp' || !detail.eventId) return
  const statusValue = String(detail.status || '')
  messages.value = messages.value.map((message) => {
    if (String(message.id || message.eventId) !== String(detail.eventId)) return message
    if (statusValue === 'REMOTE_SENT') {
      return { ...message, deliveryState: 'sent', deliveryLabel: 'Sent' }
    }
    if (statusValue === 'REMOTE_FAILED') {
      return { ...message, deliveryState: 'failed', deliveryLabel: 'Failed' }
    }
    return { ...message, deliveryState: 'pending', deliveryLabel: 'Sending' }
  })
  const statusRoomId = String(detail.roomId || currentRoomId(selectedChat.value) || '')
  if (statusRoomId) {
    historyCache.update(statusRoomId, (cachedMessages) =>
      cachedMessages.map((message) => {
        if (String(message.id || message.eventId) !== String(detail.eventId)) return message
        if (statusValue === 'REMOTE_SENT') {
          return { ...message, deliveryState: 'sent', deliveryLabel: 'Sent' }
        }
        if (statusValue === 'REMOTE_FAILED') {
          return { ...message, deliveryState: 'failed', deliveryLabel: 'Failed' }
        }
        return { ...message, deliveryState: 'pending', deliveryLabel: 'Sending' }
      })
    )
  }
}

function handleWhatsAppSyncStatus(event) {
  const detail = event?.detail || {}
  const previousVerified = Number(syncStatus.value.verifiedConversationCount || syncStatus.value.verifiedCount || 0)
  syncStatus.value = {
    state: detail.state || 'CONNECTING',
    remoteState: detail.remoteState || 'UNKNOWN',
    portalCount: Number(detail.portalCount || 0),
    discoveredPortalCount: Number(detail.discoveredPortalCount || detail.portalCount || 0),
    eligibleConversationCount: Number(detail.eligibleConversationCount || 0),
    verifiedCount: Number(detail.verifiedCount || 0),
    verifiedConversationCount: Number(detail.verifiedConversationCount || detail.verifiedCount || 0),
    pendingConversationCount: Number(detail.pendingConversationCount || 0),
    ignoredCount: Number(detail.ignoredCount || 0),
    duplicateCount: Number(detail.duplicateCount || 0),
    failedCount: Number(detail.failedCount || 0),
    lastReconcileAt: detail.lastReconcileAt || null,
    errorCode: detail.errorCode || '',
  }
  if (
    detail.state === 'READY' ||
    Number(syncStatus.value.verifiedConversationCount || 0) > previousVerified
  ) {
    loadChats({ silent: true }).catch(() => {})
  }
}

function authMediaUrl(url = '') {
  const raw = String(url || '').trim()
  if (!raw) return ''
  if (/^(data:|blob:|https?:\/\/)/i.test(raw)) return raw

  const token = localStorage.getItem('token') || ''
  const resolved = raw.startsWith('http') ? raw : `${API_BASE}${raw}`

  try {
    const urlObject = new URL(resolved)
    if (token && !urlObject.searchParams.has('token')) {
      urlObject.searchParams.set('token', `Bearer ${token}`)
    }
    return urlObject.toString()
  } catch {
    return resolved
  }
}

function avatarInitials(name = '') {
  const value = String(name || '').trim()
  if (!value) return '?'
  const parts = value.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return value.slice(0, 2).toUpperCase()
}

function readableSize(bytes = 0) {
  const value = Number(bytes || 0)
  if (!value) return ''
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function formatChatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function formatDateDivider(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return 'Today'
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function showDateDivider(message, index) {
  if (!message || index === 0) return true
  const previous = visibleMessages.value[index - 1]
  if (!previous?.timestamp) return true
  return new Date(previous.timestamp).toDateString() !== new Date(message.timestamp).toDateString()
}

function autoResize(event) {
  const element = event?.target || composerEl.value
  if (!element) return
  element.style.height = 'auto'
  element.style.height = `${Math.min(element.scrollHeight, 150)}px`
}

function isNearBottom() {
  const element = messagesEl.value
  if (!element) return true
  return element.scrollHeight - element.scrollTop - element.clientHeight < 96
}

function scrollToBottom() {
  const element = messagesEl.value
  if (!element) return
  element.scrollTop = element.scrollHeight
}

function mergeMessages(existing = [], incoming = []) {
  return mergeMessagesByEvent(existing, incoming)
}

function firstAttachment(message = {}) {
  return Array.isArray(message.attachments) ? message.attachments[0] || null : null
}

function isImageBroken(url = '') {
  const key = String(url || '').trim()
  return Boolean(key && failedImages.value[key])
}

function markImageBroken(url = '') {
  const key = String(url || '').trim()
  if (!key || failedImages.value[key]) return
  failedImages.value = {
    ...failedImages.value,
    [key]: true,
  }
}

function setLocalReadCutoff(roomId = '', timestamp = 0) {
  const key = String(roomId || '').trim()
  if (!key) return
  localReadCutoffs.value = {
    ...localReadCutoffs.value,
    [key]: normalizeTimestamp(timestamp || Date.now()),
  }
  persistReadCutoffs()
}

function clearLocalReadCutoff(roomId = '') {
  const key = String(roomId || '').trim()
  if (!key || !(key in localReadCutoffs.value)) return
  const next = { ...localReadCutoffs.value }
  delete next[key]
  localReadCutoffs.value = next
  persistReadCutoffs()
}

function getLocalReadCutoff(roomId = '') {
  return Number(localReadCutoffs.value[String(roomId || '').trim()] || 0)
}

function normalizeChatReadState(chat = null) {
  if (!chat?.roomId) return chat
  const roomId = String(chat.roomId)
  const latestTimestamp = normalizeTimestamp(chat.lastMessageTs || chat.lastMessageAt)
  const localCutoff = getLocalReadCutoff(roomId)
  const isOpenRoom = String(selectedChat.value?.roomId || '') === roomId

  if (localCutoff && latestTimestamp > localCutoff) {
    clearLocalReadCutoff(roomId)
  }

  if (isOpenRoom || (localCutoff && (!latestTimestamp || latestTimestamp <= localCutoff))) {
    return {
      ...chat,
      unreadCount: 0,
      highlightCount: 0,
    }
  }

  return chat
}

function buildMediaUrlFromMxc(mxc = '') {
  const raw = String(mxc || '').trim()
  return raw ? `/api/whatsapp/media?mxc=${encodeURIComponent(raw)}` : ''
}

async function loadStatus() {
  const [{ data }, syncResult] = await Promise.all([
    api.get('/api/whatsapp/status'),
    api.get('/api/whatsapp/sync-status').catch(() => null),
  ])
  status.value = data || {
    connected: false,
    loginState: 'disconnected',
    lastError: '',
    qrImageUrl: null,
    profile: null,
  }
  if (syncResult?.data) syncStatus.value = syncResult.data
}

function updateSelectedChatFromList() {
  if (!selectedChat.value) return
  const fresh = findMatchingChat(chats.value, selectedChat.value)
  if (fresh) {
    selectedChat.value = fresh
  }
}

async function loadChats({ silent = false } = {}) {
  if (!silent) loadingChats.value = true
  try {
    const { data } = await api.get('/api/whatsapp/chats', {
      params: { limit: 200 },
    })
    const incoming = (Array.isArray(data?.chats) ? data.chats : []).map((chat) => normalizeChatReadState(chat))
    chats.value = mergeConversationLists(chats.value, incoming).map((chat) => normalizeChatReadState(chat))

    if (selectedChat.value && !findMatchingChat(chats.value, selectedChat.value)) {
      selectedChat.value = null
      messages.value = []
      prevBatch.value = null
      showInfoPanel.value = false
    }

    updateSelectedChatFromList()
  } finally {
    if (!silent) loadingChats.value = false
  }
}

// "Delete for everyone" semantic — only on outbound (own) messages. WhatsApp
// itself only allows the sender to recall, so we offer that wording to
// match. For received messages we still let the user delete locally via
// the same path (the server may reject with 403 if their power level is
// too low); failure surfaces in composerNotice.
function canDeleteForEveryone(message) {
  if (!message) return false
  return Boolean(message.fromMe || message.direction === 'outbound')
}

// Perform the actual "Delete for everyone" call. Used by the modal handler.
async function performDeleteForEveryone(message) {
  if (!message?.id || !selectedChat.value?.roomId) return
  if (deletingMessageIds.value.has(message.id)) return
  const nextSet = new Set(deletingMessageIds.value)
  nextSet.add(message.id)
  deletingMessageIds.value = nextSet
  try {
    await api.post(
      `/api/whatsapp/rooms/${encodeURIComponent(
        selectedChat.value.roomId
      )}/messages/${encodeURIComponent(message.id)}/redact`,
      {}
    )
    // Optimistically reflect the redaction locally — the next sync will
    // also confirm it via an inbound m.room.redaction event.
    messages.value = messages.value.map((m) =>
      m.id === message.id
        ? {
            ...m,
            deleted: true,
            text: 'Message deleted',
            previewText: 'Message deleted',
            media: null,
            reactions: [],
          }
        : m
    )
  } catch (err) {
    composerNotice.value =
      err?.response?.data?.error ||
      err?.message ||
      'Could not delete that message.'
  } finally {
    const releasedSet = new Set(deletingMessageIds.value)
    releasedSet.delete(message.id)
    deletingMessageIds.value = releasedSet
  }
}

// Open the WhatsApp-style three-option modal. Own messages get the full
// "Delete for everyone / Delete for me / Cancel" set; received messages
// only get the local-only "Delete for me / Cancel".
function deleteMessage(message) {
  if (!message?.id || !selectedChat.value?.roomId) return
  if (deletingMessageIds.value.has(message.id)) return

  const forEveryone = canDeleteForEveryone(message)
  const actions = []
  if (forEveryone) {
    actions.push({
      label: 'Delete for everyone',
      variant: 'danger',
      handler: () => performDeleteForEveryone(message),
    })
  }
  actions.push({
    label: 'Delete for me',
    variant: 'default',
    handler: () => {
      hideMessageLocally(message)
    },
  })
  actions.push({
    label: 'Cancel',
    variant: 'ghost',
    cancel: true,
    handler: null,
  })

  openConfirm({
    title: 'Delete message?',
    message: forEveryone
      ? "Choose how you'd like to delete this message. 'Delete for everyone' removes it from WhatsApp for the other person too."
      : 'This will hide the message from your view in OrionAI. The original stays in the chat for everyone else.',
    actions,
  })
}

async function performDeleteCurrentChat() {
  const chat = selectedChat.value
  if (!chat?.roomId || deletingChat.value) return
  deletingChat.value = true
  try {
    await api.delete(
      `/api/whatsapp/rooms/${encodeURIComponent(chat.roomId)}`
    )
    const goneRoomId = chat.roomId
    chats.value = chats.value.filter((c) => c.roomId !== goneRoomId)
    selectedChat.value = null
    messages.value = []
    prevBatch.value = null
    showProfilePanel.value = false
    showInfoPanel.value = false
    emitCommunicationPriorityRefresh('communication_chat_deleted', {
      sourceApp: 'whatsapp',
      conversationId: goneRoomId,
    })
    loadChats({ silent: true }).catch(() => {})
  } catch (err) {
    composerNotice.value =
      err?.response?.data?.error ||
      err?.message ||
      'Could not delete the chat.'
  } finally {
    deletingChat.value = false
  }
}

function deleteCurrentChat() {
  const chat = selectedChat.value
  if (!chat?.roomId || deletingChat.value) return
  const label = chat.title || chat.name || 'this chat'
  openConfirm({
    title: 'Delete chat?',
    message:
      `"${label}" will be removed from OrionAI. The other person keeps their copy of the chat in their WhatsApp.`,
    actions: [
      {
        label: 'Delete chat',
        variant: 'danger',
        handler: () => performDeleteCurrentChat(),
      },
      {
        label: 'Cancel',
        variant: 'ghost',
        cancel: true,
        handler: null,
      },
    ],
  })
}

async function markCurrentRoomRead(roomId = selectedChat.value?.roomId || '', eventId = '') {
  const targetRoomId = String(roomId || '').trim()
  if (!targetRoomId) return
  try {
    const readTimestamp =
      normalizeTimestamp(eventId ? messages.value.find((message) => message.id === eventId)?.timestamp : 0) ||
      normalizeTimestamp(selectedChat.value?.lastMessageTs || selectedChat.value?.lastMessageAt) ||
      Date.now()
    setLocalReadCutoff(targetRoomId, readTimestamp)

    await api.post(`/api/whatsapp/rooms/${encodeURIComponent(targetRoomId)}/read`, {
      eventId: eventId || undefined,
    })

    chats.value = chats.value.map((chat) =>
      currentRoomId(chat) === targetRoomId
        ? normalizeChatReadState({ ...chat, unreadCount: 0, highlightCount: 0 })
        : chat
    )
    if (selectedChat.value?.roomId === targetRoomId) {
      selectedChat.value = normalizeChatReadState({
        ...selectedChat.value,
        unreadCount: 0,
        highlightCount: 0,
      })
    }

    emitCommunicationPriorityRefresh('communication_read', {
      sourceApp: 'whatsapp',
      conversationId: targetRoomId,
    })
    refreshWhatsAppActions({ silent: true }).catch(() => {})
  } catch (error) {
    console.debug('Failed to mark WhatsApp room as read:', error?.message || error)
  }
}

async function toggleMuteCurrentRoom() {
  const targetRoomId = currentRoomId(selectedChat.value)
  if (!targetRoomId) return
  const nextMuted = !selectedChat.value?.isMuted

  // Optimistic update
  if (selectedChat.value) {
    selectedChat.value = { ...selectedChat.value, isMuted: nextMuted }
  }
  chats.value = chats.value.map((chat) =>
    currentRoomId(chat) === targetRoomId ? { ...chat, isMuted: nextMuted } : chat
  )

  try {
    await api.post(`/api/whatsapp/rooms/${encodeURIComponent(targetRoomId)}/mute`, {
      muted: nextMuted,
    })
    refreshWhatsAppActions({ silent: true }).catch(() => {})
  } catch (error) {
    console.debug('Failed to toggle WhatsApp room mute:', error?.message || error)
    // Revert on failure
    if (selectedChat.value && currentRoomId(selectedChat.value) === targetRoomId) {
      selectedChat.value = { ...selectedChat.value, isMuted: !nextMuted }
    }
    chats.value = chats.value.map((chat) =>
      currentRoomId(chat) === targetRoomId ? { ...chat, isMuted: !nextMuted } : chat
    )
  }
}

async function loadSelectedConversation({
  from = '',
  append = false,
  silent = false,
  force = false,
} = {}) {
  if (!selectedChat.value) return

  const requestedChat = { ...selectedChat.value }
  const roomId = currentRoomId(selectedChat.value)
  if (!roomId) return

  const previousHeight = messagesEl.value?.scrollHeight || 0
  const shouldStick = !append && isNearBottom()
  const sameRoomHistory = messages.value.every(
    (message) => String(message.roomId || roomId) === String(roomId)
  )

  if (!append && !from && !force) {
    const cached = historyCache.get(roomId)
    if (cached) {
      const renderStartedAt = performance.now()
      messages.value = cached.messages
      prevBatch.value = cached.prevBatch
      await nextTick()
      if (import.meta.env.DEV) {
        console.info('[WhatsApp history frontend timing]', {
          frontend_network_ms: 0,
          frontend_render_ms: Math.round((performance.now() - renderStartedAt) * 10) / 10,
          message_count: messages.value.length,
          cache_hit: true,
        })
      }
      scrollToBottom()
      return
    }
  }

  if (append) loadingOlder.value = true
  else if (!silent) loadingMessages.value = true

  try {
    const networkStartedAt = performance.now()
    const { data } = await api.get(`/api/whatsapp/rooms/${encodeURIComponent(roomId)}/messages`, {
      params: {
        limit: append ? WHATSAPP_OLDER_HISTORY_LIMIT : WHATSAPP_INITIAL_HISTORY_LIMIT,
        ...(from ? { from } : {}),
      },
    })
    const networkMs = performance.now() - networkStartedAt

    const incoming = Array.isArray(data?.messages) ? data.messages : []
    if (!isChatSendTarget(selectedChat.value, requestedChat, roomId)) return

    prevBatch.value = data?.prevBatch || null
    selectedChat.value = normalizeChatReadState(data?.room || selectedChat.value)
    replaceChatInList(selectedChat.value, requestedChat)
    const resolvedRoomId = currentRoomId(selectedChat.value)

    if (append) {
      messages.value = mergeMessages(incoming, messages.value)
      await nextTick()
      if (messagesEl.value) {
        const delta = messagesEl.value.scrollHeight - previousHeight
        messagesEl.value.scrollTop += delta
      }
    } else {
      messages.value = sameRoomHistory ? mergeMessages(messages.value, incoming) : incoming
      const renderStartedAt = performance.now()
      await nextTick()
      if (import.meta.env.DEV) {
        console.info('[WhatsApp history frontend timing]', {
          frontend_network_ms: Math.round(networkMs * 10) / 10,
          frontend_render_ms: Math.round((performance.now() - renderStartedAt) * 10) / 10,
          message_count: messages.value.length,
          cache_hit: false,
        })
      }
      if (shouldStick || !silent) scrollToBottom()
    }

    historyCache.set(resolvedRoomId, {
      messages: messages.value,
      prevBatch: prevBatch.value,
    })

    const latestVisible = [...messages.value].reverse().find((message) => message?.id) || null
    const unreadCount = Number(data?.room?.unreadCount || selectedChat.value?.unreadCount || 0)
    if (selectedChat.value?.bridgeStatus !== 'contact' && unreadCount > 0 && latestVisible?.id) {
      await markCurrentRoomRead(resolvedRoomId, latestVisible.id)
    }
  } finally {
    if (append) loadingOlder.value = false
    else if (!silent) loadingMessages.value = false
  }
}

async function selectChat(chat) {
  if (!chat?.roomId) return
  const unreadBeforeOpen = Number(chat.unreadCount || 0)
  const switchingRooms = !chatsMatch(selectedChat.value, chat)
  setLocalReadCutoff(chat.roomId, chat.lastMessageTs || chat.lastMessageAt || Date.now())
  selectedChat.value = normalizeChatReadState(chat)
  showProfilePanel.value = false
  replyTarget.value = null
  searchInChatOpen.value = false
  messageQuery.value = ''
  composerNotice.value = ''
  if (switchingRooms) {
    messages.value = []
    prevBatch.value = null
  }
  // Re-hydrate the per-room "Delete for me" hide-list whenever the user
  // opens a chat so previously-hidden messages stay hidden across reloads.
  loadHiddenMessageIds(chat.roomId)
  await loadSelectedConversation()
  if (unreadBeforeOpen > 0 && selectedChat.value?.bridgeStatus !== 'contact') {
    const latestVisible = [...messages.value].reverse().find((message) => message?.id) || null
    if (latestVisible?.id) {
      await markCurrentRoomRead(currentRoomId(selectedChat.value), latestVisible.id)
    }
  }
}

async function refreshSelectedConversation() {
  if (!selectedChat.value?.roomId) return
  await loadSelectedConversation({ silent: false, force: true })
  await loadChats({ silent: true })
}

async function syncContacts() {
  if (syncingContacts.value || !isConnected.value) return
  syncingContacts.value = true
  try {
    await api.post('/api/whatsapp/sync-contacts')
    // The bridge takes a few seconds to write address-book names back into
    // its local SQLite. Schedule a delayed refresh so the user sees their
    // names appear without having to click Refresh themselves.
    setTimeout(() => {
      loadChats({ silent: true }).catch(() => {})
    }, 6000)
  } catch (err) {
    console.error('WhatsApp sync-contacts failed:', err.message)
  } finally {
    syncingContacts.value = false
  }
}

async function refreshAll() {
  refreshing.value = true
  try {
    await loadStatus()
    if (isConnected.value) {
      await loadChats()
      applyUnreadHints()
      await applyModuleContext()
      if (selectedChat.value) {
        await loadSelectedConversation({ silent: true, force: true })
      }
      await refreshWhatsAppActions()
    } else {
      chats.value = []
      messages.value = []
      prevBatch.value = null
      selectedChat.value = null
      showProfilePanel.value = false
      showInfoPanel.value = false
    }
  } finally {
    refreshing.value = false
  }
}

async function loadOlderMessages() {
  if (!selectedChat.value?.roomId || !prevBatch.value || loadingOlder.value) return
  await loadSelectedConversation({ from: prevBatch.value, append: true })
}

function startPolling() {
  stopPolling()
  refreshTimer = window.setInterval(async () => {
    try {
      await loadStatus()
      if (!isConnected.value) return
      await loadChats({ silent: true })
    } catch {
      // Keep the page usable during background polling failures.
    }
  }, 8000)
}

function applyUnreadHints() {
  const entry = unreadByApp.whatsapp
  const liveItems = Array.isArray(entry?.items) ? entry.items : []
  if (!liveItems.length || !chats.value.length) return

  const liveMap = new Map(
    liveItems
      .filter((item) => item?.chatId || item?.id)
      .map((item) => [String(item.chatId || item.id), item])
  )

  chats.value = chats.value.map((chat) => {
    const live = liveMap.get(String(chat.roomId || chat.id))
    if (!live) return chat

    const latestLiveTimestamp = normalizeTimestamp(live.latestMessageAt)
    const localCutoff = getLocalReadCutoff(chat.roomId)
    const nextBase = {
      ...chat,
      lastMessagePreview: live.preview || chat.lastMessagePreview,
      lastEventId: live.latestMessageId || chat.lastEventId,
      latestMessageId: live.latestMessageId || chat.latestMessageId,
      lastMessageAt: live.latestMessageAt || chat.lastMessageAt,
      lastMessageTs: latestLiveTimestamp || chat.lastMessageTs,
    }

    if (
      String(selectedChat.value?.roomId || '') === String(chat.roomId || '') ||
      (localCutoff && latestLiveTimestamp && latestLiveTimestamp <= localCutoff)
    ) {
      return normalizeChatReadState({
        ...nextBase,
        unreadCount: 0,
        highlightCount: 0,
      })
    }

    return normalizeChatReadState({
      ...nextBase,
      unreadCount: Math.max(Number(chat.unreadCount || 0), Number(live.unread || 0)),
    })
  })

  updateSelectedChatFromList()
}

function stopPolling() {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

async function applyModuleContext() {
  const context = store.moduleContext
  if (!context || context.module !== 'whatsapp') return

  const targetRoomId = String(
    context.chatId || context.roomId || context.conversationId || ''
  ).trim()
  if (!targetRoomId) {
    setModuleContext(null)
    return
  }

  let chat = chats.value.find((entry) => currentRoomId(entry) === targetRoomId)
  if (!chat) {
    await loadChats({ silent: true })
    chat = chats.value.find((entry) => currentRoomId(entry) === targetRoomId)
  }

  if (chat) {
    await selectChat(chat)
  }

  setModuleContext(null)
}

async function openWhatsAppActionConversation(state) {
  const targetRoomId = String(
    state?.conversationId ||
      state?.openContext?.chatId ||
      state?.openContext?.roomId ||
      ''
  ).trim()
  if (!targetRoomId) return

  let chat = chats.value.find((entry) => currentRoomId(entry) === targetRoomId)
  if (!chat) {
    await loadChats({ silent: true })
    chat = chats.value.find((entry) => currentRoomId(entry) === targetRoomId)
  }
  if (chat) await selectChat(chat)
}

async function draftWhatsAppActionConversation(state) {
  await openWhatsAppActionConversation(state)
  nextTick(() => composerEl.value?.focus())
}

async function completeWhatsAppAction(state) {
  try {
    await recordWhatsAppAction(state, 'approved')
  } catch (error) {
    console.error('Failed to complete WhatsApp action:', error.message)
  }
}

async function snoozeWhatsAppAction(state) {
  try {
    await recordWhatsAppAction(state, 'snoozed', { snoozeMinutes: 60 })
  } catch (error) {
    console.error('Failed to snooze WhatsApp action:', error.message)
  }
}

async function dismissWhatsAppAction(state) {
  try {
    await recordWhatsAppAction(state, 'dismissed')
  } catch (error) {
    console.error('Failed to dismiss WhatsApp action:', error.message)
  }
}

function toggleProfilePanel() {
  if (!isConnected.value) return
  showProfilePanel.value = !showProfilePanel.value
}

function clearReply() {
  replyTarget.value = null
}

function startReply(message) {
  replyTarget.value = message
  composerEl.value?.focus()
}

async function copyMessage(message) {
  try {
    await navigator.clipboard.writeText(
      message.text || firstAttachment(message)?.fileName || ''
    )
    composerNotice.value = 'Message copied.'
  } catch {
    composerNotice.value = 'Copy is not available in this browser.'
  }
}

function openAttachmentPicker() {
  fileInputEl.value?.click()
}

function makeDraftId() {
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createDraftAttachment(file, source = 'file') {
  const mimeType = file?.type || 'application/octet-stream'
  const previewType = mimeType.startsWith('image/')
    ? 'image'
    : mimeType.startsWith('audio/')
      ? 'audio'
      : mimeType.startsWith('video/')
        ? 'video'
        : 'file'

  return {
    id: makeDraftId(),
    source,
    file,
    fileName: file?.name || 'Attachment',
    mimeType,
    size: Number(file?.size || 0) || 0,
    previewType,
    previewUrl:
      previewType === 'image' || previewType === 'audio' || previewType === 'video'
        ? URL.createObjectURL(file)
        : '',
    previewLabel:
      source === 'voice'
        ? 'Voice'
        : previewType === 'file'
          ? 'File'
          : previewType.toUpperCase(),
  }
}

function revokeDraftAttachment(draft) {
  if (draft?.previewUrl) URL.revokeObjectURL(draft.previewUrl)
}

function removeDraftAttachment(index) {
  const next = [...draftAttachments.value]
  const [removed] = next.splice(index, 1)
  revokeDraftAttachment(removed)
  draftAttachments.value = next
}

function clearDraftAttachments() {
  draftAttachments.value.forEach(revokeDraftAttachment)
  draftAttachments.value = []
}

function handleFilePick(event) {
  const files = Array.from(event?.target?.files || [])
  if (!files.length) return
  draftAttachments.value = [
    ...draftAttachments.value,
    ...files.map((file) => createDraftAttachment(file, 'file')),
  ]
  if (event?.target) event.target.value = ''
}

// FIX 2: Always re-append the picker to the current DOM node when the panel opens.
// The v-if destroys the DOM node on close, so we must re-attach every time.
// Rebuild Emoji Mart every time the panel opens.
// The picker is a web component with an internal virtual scroller. Reusing the
// same Picker instance after Vue's v-if destroys/recreates the host div can
// leave only the first category rendered. A fresh instance fixes all categories.
function ensureEmojiPicker() {
  if (!emojiPickerEl.value) return

  if (emojiPicker?.remove) emojiPicker.remove()
  emojiPicker = null
  emojiPickerEl.value.innerHTML = ''

  emojiPicker = new Picker({
    data: emojiData,
    categories: EMOJI_CATEGORIES,
    set: 'native',
    theme: 'dark',
    previewPosition: 'none',
    navPosition: 'bottom',
    searchPosition: 'sticky',
    dynamicWidth: true,
    emojiButtonRadius: '14px',
    emojiButtonSize: 34,
    emojiSize: 20,
    onEmojiSelect: (emoji) => insertEmoji(emoji?.native || ''),
    onClickOutside: (event) => {
      const path = typeof event?.composedPath === 'function' ? event.composedPath() : []
      if (emojiPickerEl.value && path.includes(emojiPickerEl.value)) return
      if (event?.target && emojiPickerEl.value?.contains(event.target)) return
      emojiPanelOpen.value = false
    },
  })

  emojiPickerEl.value.appendChild(emojiPicker)
}

function toggleEmojiPanel(event) {
  event?.stopPropagation?.()
  emojiPanelOpen.value = !emojiPanelOpen.value
  if (emojiPanelOpen.value) gifPanelOpen.value = false
}

function toggleGifPanel() {
  gifPanelOpen.value = !gifPanelOpen.value
  if (gifPanelOpen.value) {
    emojiPanelOpen.value = false
    // Show trending on first open. Subsequent opens keep whatever the user
    // last searched for.
    if (!gifResults.value.length && !gifQuery.value && !gifLoading.value) {
      fetchGifs('')
    }
  }
}

function insertEmoji(emoji) {
  if (!emoji) return
  composer.value = `${composer.value}${emoji}`
  emojiPanelOpen.value = false
  nextTick(() => composerEl.value?.focus())
}

async function fetchGifs(query) {
  gifLoading.value = true
  gifError.value = ''
  try {
    const { data } = await api.get('/api/gifs/search', {
      params: { q: query || '', limit: 24 },
    })
    if (data?.ok === false) {
      gifError.value = data?.error || 'GIF search is not configured.'
      gifResults.value = []
      return
    }
    gifResults.value = Array.isArray(data?.results) ? data.results : []
  } catch (err) {
    gifError.value =
      err?.response?.data?.error ||
      'GIF search is unavailable. Set TENOR_API_KEY in the backend .env to enable it.'
    gifResults.value = []
  } finally {
    gifLoading.value = false
  }
}

function onGifQueryInput() {
  if (gifSearchTimer) clearTimeout(gifSearchTimer)
  gifSearchTimer = setTimeout(() => {
    fetchGifs(gifQuery.value)
  }, 300)
}

async function pickGif(gif) {
  gifPanelOpen.value = false
  if (!gif?.url || !selectedChat.value) {
    composerNotice.value = 'Could not send that GIF.'
    return
  }
  // We send the GIF as a Matrix m.image with the original GIF URL so the
  // mautrix-whatsapp bridge forwards it as an animated image attachment.
  try {
    await api.post(
      `/api/whatsapp/rooms/${encodeURIComponent(selectedChat.value.roomId)}/send`,
      {
        body: gif.title || 'GIF',
        msgtype: 'm.image',
        url: gif.url,
        info: {
          mimetype: 'image/gif',
          w: gif.width || undefined,
          h: gif.height || undefined,
        },
      }
    )
  } catch (err) {
    composerNotice.value =
      err?.response?.data?.error || 'Could not send that GIF.'
  }
}

function stopRecordingTimer() {
  if (recordingTimer) {
    clearInterval(recordingTimer)
    recordingTimer = null
  }
}

function releaseRecordingStream() {
  if (recordingStream) {
    recordingStream.getTracks().forEach((track) => track.stop())
    recordingStream = null
  }
}

function pickVoiceMimeType() {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') return ''
  const candidates = [
    'audio/ogg;codecs=opus',
    'audio/webm;codecs=opus',
    'audio/ogg',
    'audio/webm',
  ]
  return candidates.find((type) => MediaRecorder.isTypeSupported?.(type)) || ''
}

async function startVoiceRecording() {
  if (!canRecordVoice.value || recording.value) return

  composerNotice.value = ''
  try {
    recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const preferredType = pickVoiceMimeType()
    mediaRecorder = preferredType
      ? new MediaRecorder(recordingStream, { mimeType: preferredType })
      : new MediaRecorder(recordingStream)
    recordingChunks = []
    recordingMode = 'queue'

    mediaRecorder.ondataavailable = (event) => {
      if (event.data?.size) recordingChunks.push(event.data)
    }

    mediaRecorder.onstop = () => {
      const mimeType = mediaRecorder?.mimeType || preferredType || 'audio/webm'
      const shouldQueue = recordingMode === 'queue'
      const blob = new Blob(recordingChunks, { type: mimeType })
      recording.value = false
      stopRecordingTimer()
      releaseRecordingStream()
      mediaRecorder = null
      recordingChunks = []

      if (!shouldQueue || !blob.size) return

      const extension = mimeType.includes('ogg') ? 'ogg' : 'webm'
      const file = new File([blob], `voice-note-${Date.now()}.${extension}`, {
        type: mimeType,
      })
      draftAttachments.value = [
        ...draftAttachments.value,
        createDraftAttachment(file, 'voice'),
      ]
      composerNotice.value = /audio\/webm/i.test(mimeType)
        ? 'Voice note ready. OrionAI will send WEBM as an audio attachment on WhatsApp.'
        : 'Voice note ready to send.'
    }

    mediaRecorder.start(250)
    recording.value = true
    recordingSeconds.value = 0
    recordingTimer = window.setInterval(() => {
      recordingSeconds.value += 1
    }, 1000)
  } catch (error) {
    composerNotice.value =
      error?.message || 'Microphone access is required to record voice messages.'
    releaseRecordingStream()
  }
}

function stopVoiceRecording() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return
  recordingMode = 'queue'
  mediaRecorder.stop()
}

function cancelVoiceRecording() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return
  recordingMode = 'discard'
  mediaRecorder.stop()
}

function toggleVoiceRecording() {
  if (recording.value) {
    stopVoiceRecording()
    return
  }
  startVoiceRecording()
}

function formatRecordingTime(value = 0) {
  const minutes = Math.floor(Number(value || 0) / 60)
  const seconds = Number(value || 0) % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function buildOptimisticMessage({
  eventId,
  roomId,
  text = '',
  attachment = null,
  replyToEventId = null,
  timestamp = Date.now(),
  deliveryStatus = 'MATRIX_ACCEPTED',
}) {
  const attachmentArray = attachment ? [attachment] : []
  const replySource = replyToEventId
    ? messages.value.find((message) => String(message.id) === String(replyToEventId))
    : null

  return {
    id: String(eventId || `local-${timestamp}`),
    eventId: String(eventId || `local-${timestamp}`),
    roomId: String(roomId),
    senderId: 'me',
    senderName: 'You',
    senderAvatarUrl: status.value.profile?.avatarUrl || '',
    direction: 'outbound',
    text: String(text || '').trim(),
    timestamp: new Date(timestamp).toISOString(),
    timeLabel: formatChatTime(timestamp),
    attachments: attachmentArray,
    media: attachment || null,
    isVoice: attachment?.type === 'audio',
    reactions: [],
    replyPreview: replySource
      ? {
          eventId: replySource.id,
          senderName: replySource.senderName || 'You',
          text: replySource.text || firstAttachment(replySource)?.fileName || 'Attachment',
        }
      : null,
    deleted: false,
    fromMe: true,
    deliveryState: deliveryStatus === 'REMOTE_SENT' ? 'sent' : deliveryStatus === 'REMOTE_FAILED' ? 'failed' : 'pending',
    deliveryLabel: deliveryStatus === 'REMOTE_SENT' ? 'Sent' : deliveryStatus === 'REMOTE_FAILED' ? 'Failed' : 'Sending',
    readByCount: 0,
  }
}

function isChatSendTarget(chat = null, targetChat = null, roomId = '') {
  if (!chat) return false
  const targetRoomId = String(roomId || '').trim()
  if (targetRoomId && currentRoomId(chat) === targetRoomId) return true
  return Boolean(targetChat && chatsMatch(chat, targetChat))
}

function applyOptimisticChatState(message = {}, targetChat = null) {
  if (!message?.roomId) return
  const roomId = String(message.roomId)
  const timestamp = normalizeTimestamp(message.timestamp || Date.now())
  const isoTimestamp = new Date(timestamp).toISOString()
  const preview =
    message.text ||
    firstAttachment(message)?.fileName ||
    (firstAttachment(message)?.type === 'image'
      ? 'Sent an image'
      : firstAttachment(message)?.type === 'video'
        ? 'Sent a video'
        : firstAttachment(message)?.type === 'audio'
          ? 'Sent an audio message'
          : 'Attachment')

  chats.value = chats.value.map((chat) =>
    isChatSendTarget(chat, targetChat, roomId)
      ? normalizeChatReadState({
          ...chat,
          roomId,
          id: roomId,
          lastMessagePreview: preview,
          lastMessageAt: isoTimestamp,
          lastMessageTs: timestamp,
          lastSender: 'You',
          lastEventId: message.id,
          latestMessageId: message.id,
          bridgeStatus: 'portal',
        })
      : chat
  )

  if (isChatSendTarget(selectedChat.value, targetChat, roomId)) {
    selectedChat.value = normalizeChatReadState({
      ...selectedChat.value,
      roomId,
      id: roomId,
      lastMessagePreview: preview,
      lastMessageAt: isoTimestamp,
      lastMessageTs: timestamp,
      lastSender: 'You',
      lastEventId: message.id,
      latestMessageId: message.id,
      bridgeStatus: 'portal',
    })
  }
}

function appendOptimisticMessages(nextMessages = [], targetChat = null) {
  const validMessages = (nextMessages || []).filter(Boolean)
  if (!validMessages.length) return
  const visibleTargetMessages = validMessages.filter((message) =>
    isChatSendTarget(selectedChat.value, targetChat, message.roomId)
  )
  if (visibleTargetMessages.length) {
    messages.value = mergeMessages(messages.value, visibleTargetMessages)
    const roomId = String(visibleTargetMessages[0]?.roomId || '')
    if (roomId) {
      historyCache.set(roomId, {
        messages: messages.value,
        prevBatch: prevBatch.value,
      })
    }
  }
  validMessages.forEach((message) => applyOptimisticChatState(message, targetChat))
}

function buildAttachmentPayload(draft, contentUri = '') {
  const mediaUrl = draft.previewUrl || buildMediaUrlFromMxc(contentUri)
  return {
    type: draft.previewType === 'file' ? 'file' : draft.previewType,
    mxc: contentUri || '',
    url: mediaUrl,
    thumbnailUrl: '',
    fileName: draft.fileName,
    mimeType: draft.mimeType,
    size: draft.size || 0,
    duration: 0,
  }
}

async function sendMessage() {
  if (!selectedChat.value || sendDisabled.value) return

  const targetChat = { ...selectedChat.value }
  const roomId = currentRoomId(targetChat)
  const text = composer.value.trim()
  const replyToEventId = replyTarget.value?.id || null
  const optimisticMessages = []

  sending.value = true
  composerNotice.value = ''

  try {
    if (draftAttachments.value.length > 0) {
      const drafts = [...draftAttachments.value]
      for (let index = 0; index < drafts.length; index += 1) {
        const draft = drafts[index]
        const formData = new FormData()
        formData.append('file', draft.file, draft.fileName)
        if (index === 0 && text) formData.append('caption', text)
        if (index === 0 && replyToEventId) formData.append('replyToEventId', replyToEventId)

        const { data } = await api.post(
          `/api/whatsapp/rooms/${encodeURIComponent(roomId)}/upload`,
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        )
        const resolvedRoomId = String(data?.roomId || roomId)
        if (resolvedRoomId !== currentRoomId(targetChat)) {
          const nextChat = normalizeChatReadState({
            ...targetChat,
            roomId: resolvedRoomId,
            id: resolvedRoomId,
            bridgeStatus: 'portal',
          })
          if (isChatSendTarget(selectedChat.value, targetChat, '')) {
            selectedChat.value = nextChat
          }
          replaceChatInList(nextChat, targetChat)
        }

        optimisticMessages.push(
          buildOptimisticMessage({
            eventId: data?.eventId,
            roomId: resolvedRoomId,
            attachment: buildAttachmentPayload(draft, data?.contentUri || ''),
            replyToEventId,
          })
        )

        if (index === 0 && text && data?.captionEventId) {
          optimisticMessages.push(
            buildOptimisticMessage({
              eventId: data.captionEventId,
              roomId: resolvedRoomId,
              text,
              replyToEventId,
            })
          )
        }
      }
    } else {
      const { data } = await api.post(`/api/whatsapp/rooms/${encodeURIComponent(roomId)}/send`, {
        text,
        replyToEventId: replyToEventId || undefined,
      })
      const resolvedRoomId = String(data?.roomId || roomId)
      if (resolvedRoomId !== currentRoomId(targetChat)) {
        const nextChat = normalizeChatReadState({
          ...targetChat,
          roomId: resolvedRoomId,
          id: resolvedRoomId,
          bridgeStatus: 'portal',
        })
        if (isChatSendTarget(selectedChat.value, targetChat, '')) {
          selectedChat.value = nextChat
        }
        replaceChatInList(nextChat, targetChat)
      }

      optimisticMessages.push(
        buildOptimisticMessage({
          eventId: data?.eventId,
          roomId: resolvedRoomId,
          text,
          replyToEventId,
          deliveryStatus: data?.status || 'MATRIX_ACCEPTED',
        })
      )
      if (data?.status === 'REMOTE_FAILED') {
        composerNotice.value = 'WhatsApp could not deliver this message.'
      } else if (data?.status === 'REMOTE_TIMEOUT' || data?.status === 'MATRIX_ACCEPTED') {
        composerNotice.value = 'Message accepted. Delivery confirmation is pending.'
      }
    }

    composer.value = ''
    clearReply()
    clearDraftAttachments()
    emojiPanelOpen.value = false
    gifPanelOpen.value = false
    appendOptimisticMessages(optimisticMessages, targetChat)

    emitCommunicationPriorityRefresh('communication_replied', {
      sourceApp: 'whatsapp',
      conversationId: optimisticMessages[0]?.roomId || roomId,
    })

    await nextTick()
    scrollToBottom()

    Promise.all([
      loadChats({ silent: true }),
      refreshWhatsAppActions({ silent: true }),
    ]).catch(() => {})

    nextTick(() => {
      composerEl.value?.focus()
      autoResize({ target: composerEl.value })
    })
  } catch (error) {
    composerNotice.value =
      error?.response?.data?.error || error?.message || 'Unable to send the message right now.'
  } finally {
    sending.value = false
  }
}

function toggleMessageSearch() {
  searchInChatOpen.value = !searchInChatOpen.value
  if (!searchInChatOpen.value) {
    messageQuery.value = ''
  } else {
    nextTick(() => {
      const input = document.querySelector('.wa-chat-search-input')
      input?.focus()
    })
  }
}

function handleViewportResize() {
  viewportWidth.value = window.innerWidth
}

function startVoiceCall() {
  const phone = callPhoneNumber.value
  if (!phone) {
    composerNotice.value = 'Phone number is not available for this contact.'
    return
  }

  composerNotice.value = `Opening your system dialer for +${phone}.`
  try {
    window.location.href = `tel:+${phone}`
  } catch {
    composerNotice.value = 'Your browser could not open the system dialer.'
  }
}

function startVideoCall() {
  const phone = callPhoneNumber.value
  if (!phone) {
    composerNotice.value = 'Phone number is not available for this contact.'
    return
  }

  composerNotice.value =
    'mautrix-whatsapp does not expose in-app video calls yet. Opening the contact in WhatsApp instead.'
  window.open(`https://wa.me/${phone}`, '_blank', 'noopener')
}

function openLightbox(attachment) {
  if (!attachment?.url) return
  lightbox.value = attachment
}

function closeLightbox() {
  lightbox.value = null
}

function downloadAttachment(attachment) {
  if (!attachment?.url) return
  window.open(authMediaUrl(attachment.url), '_blank', 'noopener')
}

// FIX 2: Watch for emoji panel open and always re-attach picker to fresh DOM node
watch(
  () => unreadByApp.whatsapp?.items,
  () => {
    applyUnreadHints()
  }
)

watch(
  () => emojiPanelOpen.value,
  async (open) => {
    if (!open) return
    await nextTick()
    ensureEmojiPicker()
  }
)

watch(
  () => store.moduleContext,
  async () => {
    await applyModuleContext()
  }
)

onMounted(async () => {
  handleViewportResize()
  document.addEventListener('ws:whatsapp_message', handleWhatsAppRealtimeMessage)
  document.addEventListener('ws:whatsapp_send_status', handleWhatsAppSendStatus)
  document.addEventListener('ws:whatsapp_sync_status', handleWhatsAppSyncStatus)
  await refreshAll()
  startPolling()
  window.addEventListener('resize', handleViewportResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleViewportResize)
  document.removeEventListener('ws:whatsapp_message', handleWhatsAppRealtimeMessage)
  document.removeEventListener('ws:whatsapp_send_status', handleWhatsAppSendStatus)
  document.removeEventListener('ws:whatsapp_sync_status', handleWhatsAppSyncStatus)
  stopPolling()
  stopRecordingTimer()
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    recordingMode = 'discard'
    mediaRecorder.stop()
  }
  releaseRecordingStream()
  clearDraftAttachments()
  if (emojiPickerEl.value) {
    emojiPickerEl.value.innerHTML = ''
  }
  emojiPicker = null
  historyCache.clear()
  showInfoPanel.value = false
  showProfilePanel.value = false
})
</script>

<style scoped>
.wa-shell {
  display: grid;
  grid-template-columns: 360px minmax(0, 1fr);
  height: 100%;
  background:
    var(--bg-base);
  overflow: hidden;
}

.wa-shell.is-collapsed {
  grid-template-columns: 92px minmax(0, 1fr);
}

/* FIX 3: overflow: hidden ensures the sidebar respects the grid cell height
   so flex children (chat list) can scroll properly */
.wa-sidebar {
  position: relative;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 14px 14px;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(7, 12, 22, 0.78);
    box-sizing: border-box;
}

.wa-sidebar.collapsed {
  padding-inline: 10px;
}

.wa-sidebar-head,
.wa-chat-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.wa-brand,
.wa-chat-head-main {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.wa-brand-btn,
.wa-chat-head-main-btn {
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.wa-brand-btn:disabled {
  cursor: default;
}

.wa-brand-icon,
.wa-chat-head-avatar,
.wa-chat-avatar,
.wa-message-avatar,
.wa-profile-avatar,
.wa-info-avatar {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  background: rgba(37, 211, 102, 0.24);
  border: 1px solid rgba(95, 255, 170, 0.22);
  color: #dfffea;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  overflow: hidden;
  flex-shrink: 0;
}

.wa-chat-head-avatar,
.wa-chat-avatar,
.wa-message-avatar,
.wa-info-avatar {
  border-radius: 50%;
}

.wa-brand-avatar,
.wa-chat-head-avatar img,
.wa-chat-avatar img,
.wa-message-avatar img,
.wa-profile-avatar img,
.wa-info-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.wa-avatar-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 13px;
  font-weight: 700;
}

.wa-brand-copy,
.wa-chat-head-copy,
.wa-profile-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.wa-brand-copy strong,
.wa-chat-head-copy strong,
.wa-profile-copy strong,
.wa-info-card strong {
  color: var(--text-primary);
  font-size: 15px;
}

.wa-brand-copy span,
.wa-chat-head-copy span,
.wa-profile-copy span,
.wa-info-card span {
  color: var(--text-secondary);
  font-size: 11.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wa-head-actions,
.wa-chat-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.wa-chat-back {
  flex-shrink: 0;
}

.wa-profile-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
}

.wa-info-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.wa-profile-popover {
  position: absolute;
  top: 76px;
  left: 14px;
  right: 14px;
  z-index: 4;
}

.wa-profile-card,
.wa-info-card,
.wa-info-section,
.wa-compose-top,
.wa-chat-search,
.wa-quick-panel,
.wa-action-panel-wrap :deep(.comm-insights),
.wa-action-panel-wrap :deep(.comm-panel) {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  }

.wa-profile-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  background: rgba(10, 17, 28, 0.96);
  border-color: rgba(69, 211, 152, 0.18);
  box-shadow: 0 28px 48px rgba(3, 8, 20, 0.42);
}

.wa-profile-hero {
  display: flex;
  align-items: center;
  gap: 12px;
}

.wa-profile-avatar {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-md);
}

.wa-action-panel-wrap {
  min-height: 0;
}

.wa-search-wrap {
  position: relative;
  padding-top: 2px;
  flex-shrink: 0;
}

.wa-search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
}

.wa-search,
.wa-chat-search-input,
.wa-compose-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--border-default);
  background: var(--bg-elevated);
  color: var(--text-primary);
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
}

.wa-search,
.wa-chat-search-input {
  border-radius: var(--radius-sm);
  padding: 11px 14px 11px 38px;
  font-size: 12px;
}

.wa-search:focus,
.wa-chat-search-input:focus,
.wa-compose-input:focus {
  border-color: rgba(95, 255, 170, 0.36);
  box-shadow: 0 0 0 4px rgba(69, 211, 152, 0.08);
}

.wa-filter-row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  flex-shrink: 0;
}

.wa-sync-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  padding: 6px 10px;
  color: var(--text-secondary);
  font-size: 11px;
  border-left: 2px solid rgba(69, 211, 152, 0.55);
}

.wa-sync-progress.has-error {
  border-left-color: var(--danger, #ef6a6a);
}

/* FIX 3: chat list must flex: 1 with min-height: 0 to scroll inside sidebar */
.wa-chat-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 4px;
}

.wa-chat-list.compact {
  align-items: center;
  gap: 8px;
}

.wa-chat-row {
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-radius: var(--radius-md);
  color: inherit;
  text-align: left;
  background: transparent;
  transition: background 0.15s ease, box-shadow 0.15s ease;
  flex-shrink: 0;
}

.wa-chat-row.compact {
  grid-template-columns: 46px;
  justify-content: center;
  width: 56px;
  padding: 4px 0;
}

.wa-chat-row:hover,
.wa-chat-row.active {
  background: rgba(69, 211, 152, 0.12);
  box-shadow: inset 0 0 0 1px rgba(95, 255, 170, 0.12);
}

.wa-chat-copy {
  min-width: 0;
}

.wa-chat-title-row,
.wa-chat-preview-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.wa-chat-title-row {
  justify-content: space-between;
  margin-bottom: 4px;
}

.wa-chat-title-row strong {
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wa-chat-title-row span,
.wa-chat-kind {
  font-size: 11px;
  color: var(--text-muted);
}

.wa-chat-preview-row p {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wa-chat-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

.wa-chat-badge {
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  border-radius: var(--radius-sm);
  background: #29cf77;
  color: #05230f;
  font-size: 11px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.wa-chat-flag {
  font-size: 10px;
  color: #b4f0cb;
  border: 1px solid rgba(95, 255, 170, 0.16);
  border-radius: var(--radius-sm);
  padding: 2px 6px;
}

.wa-list-state,
.wa-list-empty,
.wa-state-panel,
.wa-thread-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.wa-list-state,
.wa-thread-empty {
  flex-direction: column;
}

.wa-list-state {
  flex: 1;
  padding: 12px 0;
  min-height: 0;
}

.wa-list-state.compact {
  align-items: center;
}

.wa-list-empty {
  flex: 1;
  flex-direction: column;
  gap: 10px;
  padding: 28px 22px;
  min-height: 0;
}

.wa-list-empty strong,
.wa-state-copy strong,
.wa-thread-empty strong {
  color: var(--text-primary);
  font-size: 17px;
}

.wa-list-empty p,
.wa-state-copy p,
.wa-thread-empty p,
.wa-info-section p {
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.5;
}

.wa-empty-orb {
  width: 76px;
  height: 76px;
  border-radius: var(--radius-lg);
  background: rgba(69, 211, 152, 0.2);
  border: 1px solid rgba(95, 255, 170, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #dfffea;
  font-size: 22px;
  font-weight: 700;
}

.wa-empty-spinner {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2px solid rgba(95, 255, 170, 0.25);
  border-top-color: #5fffaa;
  animation: wa-spin 0.9s linear infinite;
  display: inline-block;
}

.wa-chat-skeleton {
  display: grid;
  grid-template-columns: 42px 1fr;
  gap: 12px;
  padding: 12px 16px;
  flex-shrink: 0;
}

.wa-chat-skeleton.compact {
  grid-template-columns: 42px;
  justify-content: center;
}

.wa-chat-skeleton-avatar,
.wa-chat-skeleton-lines span,
.wa-msg-skeleton span,
.wa-state-lines span {
  display: block;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.13), rgba(255, 255, 255, 0.07));
  background-size: 200% 100%;
  animation: wa-shimmer 1.4s linear infinite;
}

.wa-chat-skeleton-avatar {
  width: 42px;
  height: 42px;
  border-radius: var(--radius-md);
}

.wa-chat-skeleton-lines {
  display: grid;
  gap: 8px;
  align-content: center;
}

.wa-chat-skeleton-lines span:first-child {
  width: 68%;
  height: 12px;
  border-radius: var(--radius-sm);
}

.wa-chat-skeleton-lines span:last-child {
  width: 92%;
  height: 10px;
  border-radius: var(--radius-sm);
}

.wa-main {
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background:
    var(--bg-base);
}

.wa-state-panel {
  flex: 1;
  padding: 34px;
  min-height: 0;
}

.wa-state-hero {
  display: grid;
  grid-template-columns: minmax(280px, 420px) minmax(260px, 420px);
  gap: 32px;
  align-items: center;
  justify-content: center;
  min-height: 100%;
}

.wa-state-illustration {
  position: relative;
  min-height: 300px;
}

.wa-state-circle {
  position: absolute;
  border-radius: 50%;
  filter: blur(10px);
}

.wa-state-circle--one {
  width: 180px;
  height: 180px;
  background: rgba(69, 211, 152, 0.12);
  top: 14px;
  left: 18px;
}

.wa-state-circle--two {
  width: 220px;
  height: 220px;
  background: rgba(79, 140, 255, 0.09);
  right: 8px;
  bottom: 10px;
}

.wa-state-card {
  position: absolute;
  inset: 48px 28px 28px 48px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-default);
  background: rgba(13, 20, 33, 0.84);
    padding: 22px;
  display: grid;
  gap: 18px;
}

.wa-state-card-head {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-secondary);
  font-size: 13px;
}

.wa-state-card-dot,
.wa-recording-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #29cf77;
  box-shadow: 0 0 0 8px rgba(41, 207, 119, 0.12);
}

.wa-state-lines {
  display: grid;
  gap: 12px;
}

.wa-state-lines span:nth-child(1) {
  width: 84%;
  height: 16px;
  border-radius: var(--radius-sm);
}

.wa-state-lines span:nth-child(2) {
  width: 68%;
  height: 16px;
  border-radius: var(--radius-sm);
}

.wa-state-lines span:nth-child(3) {
  width: 92%;
  height: 88px;
  border-radius: var(--radius-md);
}

.wa-state-qr img {
  width: 210px;
  height: 210px;
  padding: 14px;
  background: white;
  border-radius: var(--radius-lg);
}

.wa-chat-head {
  padding: 16px 18px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.wa-chat-layout {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.wa-thread-panel {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.wa-load-earlier {
  padding: 14px 18px 0;
  display: flex;
  justify-content: center;
  flex-shrink: 0;
}

/* FIX 1: flex column enables the wa-thread-push spacer to work correctly,
   pushing messages to the bottom when content is shorter than the viewport */
.wa-thread-scroll {
  flex: 1;
  min-height: 0;
  padding: 18px 24px 10px;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
}

/* FIX 1: spacer that collapses when messages overflow, fills space when they don't */
.wa-thread-push {
  flex: 1;
  min-height: 0;
}

.wa-thread-loading {
  display: grid;
  gap: 16px;
}

.wa-msg-skeleton {
  display: flex;
}

.wa-msg-skeleton.is-out {
  justify-content: flex-end;
}

.wa-msg-skeleton span {
  width: min(320px, 62%);
  height: 74px;
  border-radius: var(--radius-lg);
}

.wa-date-divider {
  display: flex;
  justify-content: center;
  margin: 16px 0 12px;
  flex-shrink: 0;
}

.wa-date-divider span {
  padding: 7px 12px;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  color: var(--text-muted);
  font-size: 11px;
  letter-spacing: 0.02em;
}

.wa-message-row {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  margin-bottom: 14px;
  flex-shrink: 0;
}

.wa-message-row.from-me {
  justify-content: flex-end;
}

.wa-message-avatar {
  width: 34px;
  height: 34px;
  font-size: 11px;
}

.wa-message-stack {
  max-width: min(64%, 560px);
}

.wa-message-actions {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
  opacity: 0;
  transform: translateY(4px);
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.wa-message-row:hover .wa-message-actions {
  opacity: 1;
  transform: translateY(0);
}

.wa-bubble {
  padding: 7px 10px 7px;
  /* Authentic WhatsApp bubble tail: incoming messages square the top-left
     corner (the corner nearest the avatar) while the rest stay rounded. */
  border-radius: 8px;
  border-top-left-radius: 0;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  color: var(--text-primary);
  display: flex;
  flex-direction: column;
  gap: 4px;
  /* Hug the bubble to its widest child (image or text). Without this the
     bubble inherited the parent message-stack max-width (560px) and an
     image attachment left a big empty stripe on the right. */
  width: fit-content;
  max-width: 100%;
  min-width: 64px;
}

.wa-bubble > .wa-media-card + .wa-message-text {
  margin-top: 0;
}

.wa-message-row.from-me .wa-bubble {
  background: rgba(69, 211, 152, 0.2);
  border-color: rgba(95, 255, 170, 0.18);
  /* Outgoing bubbles mirror the tail to the top-right corner. */
  border-top-left-radius: 8px;
  border-top-right-radius: 0;
}

.wa-bubble.deleted {
  opacity: 0.75;
}

.wa-message-sender {
  margin-bottom: 6px;
  font-size: 11px;
  font-weight: 700;
  color: #97f3c3;
}

.wa-reply-preview {
  display: grid;
  gap: 4px;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  border-left: 3px solid rgba(95, 255, 170, 0.42);
  margin-bottom: 8px;
}

.wa-reply-preview strong {
  font-size: 11px;
}

.wa-reply-preview span {
  color: var(--text-muted);
  font-size: 12px;
}

.wa-media-card {
  margin-bottom: 6px;
}

.wa-media-card:last-child {
  margin-bottom: 0;
}

.wa-media-card--image img {
  /* Grow to bubble width so a caption underneath sits flush, while still
     capping the image in narrow viewports so it doesn't dominate. */
  width: 100%;
  max-width: 280px;
  max-height: 320px;
  display: block;
  border-radius: var(--radius-md);
  cursor: zoom-in;
  object-fit: cover;
}

.wa-media-card--video video {
  width: min(260px, 100%);
  max-height: 260px;
  border-radius: var(--radius-md);
  display: block;
  background: var(--bg-elevated);
}

.wa-media-card--audio audio {
  width: min(280px, 100%);
}

.wa-audio-pill {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}

.wa-audio-wave {
  width: 42px;
  height: 12px;
  border-radius: var(--radius-sm);
  background: rgba(95, 255, 170, 0.4);
}

.wa-file-card {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  max-width: 320px;
}

.wa-file-card > div {
  flex: 1 1 auto;
  min-width: 0;
}

.wa-file-card strong {
  display: block;
  color: var(--text-primary);
  font-size: 12.5px;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wa-file-card span {
  display: block;
  color: var(--text-muted);
  font-size: 10.5px;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wa-file-card .wa-mini-btn {
  flex-shrink: 0;
  padding: 6px 10px;
  font-size: 11.5px;
  white-space: nowrap;
}

.wa-message-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

.wa-message-text :deep(.wa-link),
.wa-link {
  color: #53bdeb;
  text-decoration: underline;
  word-break: break-all;
}

.wa-reaction-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.wa-reaction-pill {
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  background: var(--bg-elevated);
  color: var(--text-secondary);
}

.wa-message-meta {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
  font-size: 10px;
  color: var(--text-muted);
}

.wa-deleted-copy {
  color: var(--text-muted);
  font-style: italic;
  font-size: 13px;
}

.wa-thread-empty {
  min-height: 220px;
  flex-direction: column;
  gap: 10px;
  flex-shrink: 0;
}

.wa-info-panel {
  width: 320px;
  flex-shrink: 0;
  padding: 18px 18px 18px 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
  overflow-y: auto;
}

.wa-info-card,
.wa-info-section {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wa-info-card {
  align-items: center;
  text-align: center;
}

.wa-info-avatar {
  width: 74px;
  height: 74px;
}

.wa-info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.wa-info-item {
  padding: 12px;
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.wa-info-item span,
.wa-info-label {
  color: var(--text-muted);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.wa-info-item strong {
  color: var(--text-primary);
  font-size: 13px;
  word-break: break-word;
}

.wa-info-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.wa-compose-top {
  margin-bottom: 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.wa-compose-banner,
.wa-composer-notice,
.wa-upload-chip {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
}

.wa-compose-banner {
  justify-content: space-between;
}

.wa-compose-banner-label {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 600;
}

.wa-compose-banner-text {
  flex: 1;
  min-width: 0;
  color: var(--text-secondary);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wa-compose-banner button,
.wa-upload-chip button {
  border: 0;
  background: transparent;
  color: var(--text-muted);
}

.wa-compose-banner--recording .wa-compose-banner-label {
  color: #ffd7d7;
}

.wa-upload-strip {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
  scrollbar-width: thin;
}

.wa-upload-strip::-webkit-scrollbar { height: 4px; }
.wa-upload-strip::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.18);
  border-radius: 2px;
}

.wa-upload-chip {
  flex: 0 0 auto;
  min-width: 0;
  max-width: 240px;
  padding: 8px 10px;
  gap: 8px;
}

.wa-upload-chip > span {
  flex: 1 1 auto;
  min-width: 0;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--text-primary);
}

.wa-upload-chip button {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.wa-upload-thumb {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  overflow: hidden;
  background: var(--bg-elevated);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--text-secondary);
  font-size: 11px;
}

.wa-upload-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.wa-composer-shell {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(7, 12, 22, 0.78);
    padding: 12px 18px 18px;
  flex-shrink: 0;
}

.wa-composer-notice {
  justify-content: space-between;
  color: var(--text-secondary);
  font-size: 12px;
  margin-bottom: 12px;
}

.wa-composer-notice button {
  background: transparent;
  border: 0;
  color: #b4f0cb;
}

.wa-quick-panel {
  margin-bottom: 12px;
  padding: 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: rgba(7, 12, 22, 0.92);
  max-height: 360px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.wa-quick-panel--gif {
  max-height: 380px;
}

.wa-emoji-mart {
  width: 100%;
  height: 320px;
  overflow: hidden;
}

.wa-emoji-mart :deep(em-emoji-picker) {
  width: 100%;
  height: 100%;
  min-height: 320px;
  /* Override emoji-mart's internal --em-emoji-picker-width default (350px)
     so the picker fills the chat panel width instead of leaving a dead
     empty stripe on the right. dynamicWidth on the Picker handles layout
     reflow; this var stops the host element from shrinking back. */
  --em-emoji-picker-width: 100%;
  --rgb-background: 14 22 41;
}

.wa-panel-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: var(--text-muted);
  font-size: 12px;
  margin-bottom: 12px;
}

.wa-panel-head strong {
  color: var(--text-primary);
}

.wa-gif-search {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.wa-gif-search-input {
  flex: 1;
  min-width: 0;
  padding: 8px 12px;
  border-radius: 12px;
  border: 1px solid var(--border-default);
  background: var(--bg-elevated);
  color: var(--text-primary);
  font-size: 13px;
}

.wa-gif-search-input:focus {
  outline: none;
  border-color: rgba(95, 255, 170, 0.32);
}

.wa-gif-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 8px;
  overflow-y: auto;
  flex: 1;
}

.wa-gif-card {
  padding: 0;
  border-radius: 12px;
  overflow: hidden;
  aspect-ratio: 1 / 1;
  background: var(--bg-elevated);
  display: flex;
  align-items: center;
  justify-content: center;
}

.wa-gif-card img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.wa-gif-empty,
.wa-gif-loading {
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
  padding: 24px 12px;
}

.wa-compose {
  display: grid;
  grid-template-columns: auto auto auto auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: end;
}

.wa-icon-btn,
.wa-chip-btn,
.wa-load-btn,
.wa-compose-btn,
.wa-compose-send,
.wa-mini-btn,
.wa-filter-chip,
.wa-primary-btn,
.wa-gif-card {
  border: 1px solid var(--border-default);
  background: var(--bg-elevated);
  color: var(--text-primary);
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}

.wa-icon-btn {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.wa-icon-btn--ghost {
  background: var(--bg-surface);
}

.wa-icon-btn--danger {
  color: #ff8088;
  border-color: rgba(255, 128, 136, 0.25);
}

.wa-icon-btn--danger:hover:not(:disabled) {
  background: rgba(255, 80, 92, 0.18);
  border-color: rgba(255, 80, 92, 0.42);
  color: #ffd0d4;
}

.wa-mini-btn--danger {
  color: #ff8088;
  border-color: rgba(255, 128, 136, 0.25);
}

.wa-mini-btn--danger:hover:not(:disabled) {
  background: rgba(255, 80, 92, 0.18);
  border-color: rgba(255, 80, 92, 0.42);
  color: #ffd0d4;
}

.wa-icon-btn.active,
.wa-icon-btn:hover:not(:disabled),
.wa-chip-btn:hover,
.wa-load-btn:hover,
.wa-compose-btn:hover,
.wa-compose-send:hover,
.wa-mini-btn:hover,
.wa-filter-chip:hover,
.wa-primary-btn:hover,
.wa-gif-card:hover {
  transform: translateY(-1px);
  border-color: rgba(95, 255, 170, 0.22);
  background: rgba(69, 211, 152, 0.12);
  color: var(--text-primary);
}

.wa-icon-btn:disabled,
.wa-compose-btn:disabled,
.wa-compose-send:disabled,
.wa-filter-chip:disabled,
.wa-load-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.wa-chip-btn,
.wa-load-btn {
  padding: 9px 12px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 600;
}

.wa-filter-chip {
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  white-space: nowrap;
  font-size: 12px;
}

.wa-filter-chip.active {
  color: #e6fff1;
  border-color: rgba(95, 255, 170, 0.34);
  background: rgba(69, 211, 152, 0.14);
}

.wa-mini-btn {
  padding: 5px 9px;
  border-radius: var(--radius-sm);
  font-size: 11px;
}

.wa-compose-btn,
.wa-compose-send {
  width: 42px;
  height: 42px;
  border-radius: var(--radius-md);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.wa-compose-btn.is-recording {
  color: #ffe8e8;
  border-color: rgba(255, 95, 116, 0.26);
  background: rgba(255, 95, 116, 0.12);
}

.wa-compose-input {
  min-height: 46px;
  max-height: 150px;
  resize: none;
  box-sizing: border-box;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  font: inherit;
  line-height: 1.45;
}

.wa-compose-send {
  background: rgba(69, 211, 152, 0.9);
  color: #04210f;
  border-color: rgba(95, 255, 170, 0.3);
  /* Circular send button, matching WhatsApp Web's round mic/send affordance. */
  border-radius: 50%;
}

.wa-primary-btn {
  padding: 11px 16px;
  border-radius: var(--radius-md);
}

.wa-hidden-input {
  display: none;
}

.wa-spinner {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.24);
  border-top-color: #9cf4c4;
  animation: wa-spin 0.8s linear infinite;
}

.wa-spinner--sm {
  width: 12px;
  height: 12px;
}

.wa-lightbox {
  position: fixed;
  inset: 0;
  background: rgba(4, 8, 14, 0.88);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  z-index: 40;
}

.wa-lightbox-card {
  max-width: min(84vw, 920px);
  max-height: 86vh;
  padding: 14px;
  border-radius: var(--radius-lg);
  background: rgba(11, 18, 29, 0.96);
  border: 1px solid var(--border-default);
}

.wa-lightbox-card img {
  max-width: 100%;
  max-height: calc(86vh - 90px);
  border-radius: var(--radius-md);
  display: block;
}

.wa-lightbox-actions {
  margin-top: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  color: var(--text-secondary);
  font-size: 12px;
}

.wa-fade-enter-active,
.wa-fade-leave-active {
  transition: opacity 0.18s ease;
}

.wa-fade-enter-from,
.wa-fade-leave-to {
  opacity: 0;
}

/* ── OrionAI-styled confirm modal ──────────────────────────────────────
   Replaces window.confirm. Used for Delete-for-everyone / Delete-for-me /
   Delete-chat prompts so the dialog feels native to OrionAI instead of
   showing the browser's "localhost:5173 says…" alert.
   ────────────────────────────────────────────────────────────────────── */
.wa-confirm-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 16, 0.62);
    display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
  padding: 24px;
}

.wa-confirm-card {
  width: min(420px, 100%);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 20px 22px 18px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.wa-confirm-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.wa-confirm-head strong {
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 700;
}

.wa-confirm-close {
  border: 0;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 14px;
  padding: 4px 8px;
  border-radius: 8px;
  line-height: 1;
}

.wa-confirm-close:hover {
  color: var(--text-primary);
  background: var(--bg-elevated);
}

.wa-confirm-body {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.wa-confirm-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}

.wa-confirm-btn {
  width: 100%;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.12s ease, border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
}

.wa-confirm-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.wa-confirm-btn--default {
  background: var(--bg-elevated);
  border-color: var(--border-default);
  color: var(--text-primary);
}

.wa-confirm-btn--default:hover:not(:disabled) {
  background: rgba(95, 255, 170, 0.12);
  border-color: rgba(95, 255, 170, 0.32);
  transform: translateY(-1px);
}

.wa-confirm-btn--danger {
  background: rgba(255, 80, 92, 0.18);
  border-color: rgba(255, 80, 92, 0.32);
  color: #ffd0d4;
}

.wa-confirm-btn--danger:hover:not(:disabled) {
  background: rgba(255, 80, 92, 0.28);
  border-color: rgba(255, 80, 92, 0.5);
  color: #ffffff;
  transform: translateY(-1px);
}

.wa-confirm-btn--ghost {
  background: transparent;
  border-color: var(--border-subtle);
  color: var(--text-muted);
}

.wa-confirm-btn--ghost:hover:not(:disabled) {
  background: var(--bg-elevated);
  color: var(--text-primary);
}

@keyframes wa-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes wa-shimmer {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -200% 0;
  }
}

@media (max-width: 1280px) {
  .wa-info-panel {
    width: 280px;
  }
}

@media (max-width: 1180px) {
  .wa-shell {
    grid-template-columns: 320px minmax(0, 1fr);
  }

  .wa-shell.is-collapsed {
    grid-template-columns: 88px minmax(0, 1fr);
  }

  .wa-state-hero {
    grid-template-columns: 1fr;
    justify-items: center;
  }

  .wa-message-stack {
    max-width: min(76%, 520px);
  }
}

@media (max-width: 980px) {
  .wa-chat-layout {
    flex-direction: column;
  }

  .wa-info-panel {
    width: auto;
    padding: 0 18px 14px;
  }
}

@media (max-width: 860px) {
  .wa-shell,
  .wa-shell.is-collapsed {
    grid-template-columns: 1fr;
  }

  .wa-sidebar,
  .wa-sidebar.collapsed {
    flex: 1;
    min-height: 0;
    height: 100%;
    border-right: 0;
    padding-inline: 14px;
  }

  .wa-main {
    min-height: 0;
  }

  .wa-chat-row.compact {
    grid-template-columns: 46px minmax(0, 1fr) auto;
    width: 100%;
    padding: 10px 12px;
  }

  .wa-chat-list.compact {
    align-items: stretch;
    gap: 2px;
  }

  .wa-brand-copy {
    display: flex;
  }

  .wa-search-wrap,
  .wa-filter-row,
  .wa-action-panel-wrap {
    display: block;
  }
}

@media (max-width: 640px) {
  .wa-sidebar {
    gap: 8px;
    padding: 12px;
  }

  .wa-state-panel {
    padding: 20px 16px;
  }

  .wa-state-hero {
    gap: 20px;
  }

  .wa-state-illustration {
    min-height: 220px;
  }

  .wa-state-card {
    inset: 28px 12px 12px 28px;
    padding: 18px;
  }

  .wa-empty-orb {
    width: 64px;
    height: 64px;
    border-radius: var(--radius-lg);
    font-size: 18px;
  }

  .wa-list-empty {
    padding: 22px 16px;
  }

  .wa-chat-head,
  .wa-composer-shell,
  .wa-thread-scroll {
    padding-inline: 12px;
  }

  .wa-thread-scroll {
    padding-top: 14px;
  }

  .wa-compose {
    grid-template-columns: auto auto auto minmax(0, 1fr);
  }

  .wa-compose-input {
    grid-column: 1 / -1;
    order: 2;
  }

  .wa-compose-send,
  .wa-compose-btn:last-child {
    order: 3;
  }

  .wa-message-stack {
    max-width: min(86%, 100%);
  }
}
</style>
