<template>
  <div class="sl-root" @click="closeAllPopups">

    <!-- ═══════════════ SIDEBAR ═══════════════ -->
    <div class="sl-sidebar" @click.stop :style="sidebarStyle">

      <!-- Workspace Header -->
      <div class="sl-ws-header">
        <div class="sl-ws-btn" @click.stop="wsMenuOpen = !wsMenuOpen">
          <div class="sl-ws-icon-box">
            <svg width="14" height="14" viewBox="0 0 24 24">
              <path fill="#E01E5A" d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313z"/>
              <path fill="#36C5F0" d="M8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.527 2.527 0 012.521 2.522v2.52H8.834zM8.834 6.313a2.527 2.527 0 012.521 2.521 2.527 2.527 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312z"/>
              <path fill="#2EB67D" d="M18.956 8.834a2.528 2.528 0 012.522-2.521A2.528 2.528 0 0124 8.834a2.527 2.527 0 01-2.522 2.521h-2.522V8.834zM17.688 8.834a2.527 2.527 0 01-2.521 2.521 2.527 2.527 0 01-2.521-2.521V2.522A2.528 2.528 0 0115.167 0a2.528 2.528 0 012.521 2.522v6.312z"/>
              <path fill="#ECB22E" d="M15.167 18.956a2.528 2.528 0 012.521 2.522A2.528 2.528 0 0115.167 24a2.527 2.527 0 01-2.521-2.522v-2.522h2.521zM15.167 17.688a2.527 2.527 0 01-2.521-2.523 2.527 2.527 0 012.521-2.52h6.313A2.528 2.528 0 0124 15.165a2.528 2.528 0 01-2.522 2.523h-6.311z"/>
            </svg>
          </div>
          <span class="sl-ws-name">{{ me?.teamName || 'Slack' }}</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-left:auto;flex-shrink:0;opacity:0.5"><polyline points="6 9 12 15 18 9"/></svg>
        </div>

        <!-- FIX 1: Workspace dropdown — has Add workspace, NO profile items -->
        <transition name="sl-pop">
          <div v-if="wsMenuOpen" class="sl-ws-dropdown" @click.stop>
            <div class="sl-dd-workspace-info">
              <div class="sl-dd-ws-icon">
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path fill="#E01E5A" d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52z"/>
                  <path fill="#36C5F0" d="M8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.527 2.527 0 012.521 2.522v2.52H8.834z"/>
                  <path fill="#2EB67D" d="M18.956 8.834a2.528 2.528 0 012.522-2.521A2.528 2.528 0 0124 8.834a2.527 2.527 0 01-2.522 2.521h-2.522V8.834z"/>
                  <path fill="#ECB22E" d="M15.167 18.956a2.528 2.528 0 012.521 2.522A2.528 2.528 0 0115.167 24a2.527 2.527 0 01-2.521-2.522v-2.522h2.521z"/>
                </svg>
              </div>
              <div>
                <div style="font-size:13px;font-weight:700;color:var(--text-primary)">{{ me?.teamName }}</div>
                <div style="font-size:11px;color:var(--text-muted)">{{ me?.email }}</div>
              </div>
            </div>
            <div class="sl-dd-divider"></div>
            <div class="sl-dd-item" @click="openModal('invitePeople');wsMenuOpen=false">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
              Invite people
            </div>
            <div class="sl-dd-item" @click="openModal('createChannel');wsMenuOpen=false">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>
              Create a channel
            </div>
            <div class="sl-dd-divider"></div>
            <!-- FIX 1: Add workspace ONLY here -->
            <div class="sl-dd-item" @click="openModal('addWorkspace');wsMenuOpen=false">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add a workspace
            </div>
          </div>
        </transition>
      </div>

      <!-- FIX 6: Sidebar action buttons — Channel, Message, Huddle like real Slack -->
      <div class="sl-sidebar-actions">
        <button class="sl-sidebar-action-btn" title="New channel" @click="openModal('createChannel')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>
          <span>Channel</span>
        </button>
        <button class="sl-sidebar-action-btn" title="New message" @click="openModal('newDM')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          <span>Message</span>
        </button>
        <button class="sl-sidebar-action-btn" :class="{active: huddleActive}" title="Start huddle" @click="startHuddle">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/></svg>
          <span>Huddle</span>
        </button>
      </div>

      <!-- Search -->
      <div class="sl-search-wrap">
        <svg class="sl-search-ico" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input v-model="searchQuery" class="sl-search" :placeholder="`Search ${me?.teamName || 'Slack'}`" @input="onSearchInput"/>
        <button v-if="searchQuery" class="sl-search-clear" @click="clearSearch">×</button>
      </div>

      <div class="sl-action-panel-wrap">
        <CommunicationInsightsWidget
          title="OrionAI insights"
          panel-title="Reply / Action Required"
          :panel-headline="'Slack conversations currently waiting on your execution'"
          :summary-text="slackActionSummary"
          :counts="slackActionCounts"
          :items="slackActionItems"
          :groups="slackActionGroups"
          :loading="slackActionsLoading"
          :selected-conversation-id="activeChannelId"
          @refresh="refreshSlackActions"
          @open="openSlackActionConversation"
          @draft="draftSlackActionConversation"
          @done="completeSlackAction"
          @snooze="snoozeSlackAction"
          @dismiss="dismissSlackAction"
        />
      </div>

      <div class="sl-sidebar-list-scroll">
        <!-- Channels -->
        <div class="sl-section-hdr" @click="sectionsOpen.channels = !sectionsOpen.channels">
          <svg :class="['sl-chevron', sectionsOpen.channels ? 'open' : '']" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          <span class="sl-section-label">Channels</span>
          <span v-if="channelUnread > 0" class="sl-badge-pill">{{ channelUnread }}</span>
          <button class="sl-section-plus" @click.stop="openModal('createChannel')" title="New channel">+</button>
        </div>
        <transition name="sl-expand">
          <div v-if="sectionsOpen.channels" class="sl-ch-list">
            <div v-if="channelsList.length === 0 && !loading" class="sl-ch-empty">No channels yet</div>
            <div v-for="ch in channelsList" :key="ch.id"
              :class="['sl-ch-item', activeChannelId === ch.id ? 'active' : '']"
              @click="openChannel(ch)">
              <span class="sl-ch-sigil">{{ ch.type === 'private' ? '🔒' : '#' }}</span>
              <span class="sl-ch-label" :class="{bold: ch.unread > 0}">{{ ch.name.replace(/^#/, '') }}</span>
              <span v-if="slackActionState(ch.id)" class="sl-action-chip" :class="`state-${slackActionState(ch.id).actionState}`">
                {{ slackActionState(ch.id).actionStateLabel }}
              </span>
              <span v-if="ch.unread > 0" class="sl-badge-red">{{ ch.unread }}</span>
            </div>
            <div class="sl-ch-item sl-ch-add" @click="openModal('browseChannels')">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <span class="sl-ch-label" style="color:var(--text-muted)">Browse channels</span>
            </div>
            <div class="sl-ch-item sl-ch-add" @click="openModal('createChannel')">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span class="sl-ch-label" style="color:var(--text-muted)">Add a channel</span>
            </div>
          </div>
        </transition>

        <!-- DMs -->
        <div class="sl-section-hdr" @click="sectionsOpen.dms = !sectionsOpen.dms">
          <svg :class="['sl-chevron', sectionsOpen.dms ? 'open' : '']" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          <span class="sl-section-label">Direct messages</span>
          <span v-if="dmUnread > 0" class="sl-badge-pill">{{ dmUnread }}</span>
          <button class="sl-section-plus" @click.stop="openModal('newDM')" title="New DM">+</button>
        </div>
        <transition name="sl-expand">
          <div v-if="sectionsOpen.dms" class="sl-ch-list">
            <div v-if="dmsList.length === 0 && !loading" class="sl-ch-empty">No DMs yet</div>
            <div v-for="ch in dmsList" :key="ch.id"
              :class="['sl-ch-item sl-dm-item', activeChannelId === ch.id ? 'active' : '']"
              @click="openChannel(ch)">
              <div class="sl-dm-ava" :style="{background: avatarColor(ch.name)}">{{ ch.name.slice(0,1).toUpperCase() }}</div>
              <span class="sl-ch-label" :class="{bold: ch.unread > 0}">{{ ch.name }}</span>
              <span v-if="slackActionState(ch.id)" class="sl-action-chip" :class="`state-${slackActionState(ch.id).actionState}`">
                {{ slackActionState(ch.id).actionStateLabel }}
              </span>
              <span v-if="ch.unread > 0" class="sl-badge-red">{{ ch.unread }}</span>
            </div>
            <div class="sl-ch-item sl-ch-add" @click="openModal('newDM')">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span class="sl-ch-label" style="color:var(--text-muted)">Add teammates</span>
            </div>
          </div>
        </transition>

        <div v-if="loading" class="sl-sidebar-loading"><span class="sl-spin"></span> Loading…</div>
      </div>

      <!-- FIX 1+2: User bar — opens profile popup WITHOUT Add Workspace -->
      <div class="sl-user-bar" @click.stop="profileMenuOpen = !profileMenuOpen">
        <div class="sl-user-ava" :style="{background: avatarColor(me?.displayName || 'U')}">{{ (me?.displayName || me?.userName || 'U').slice(0,1).toUpperCase() }}</div>
        <div class="sl-user-info">
          <div class="sl-user-name">{{ me?.displayName || me?.userName || 'You' }}</div>
          <div class="sl-user-status">
            <span :class="['sl-dot', isAway ? 'yellow' : 'green']"></span>
            {{ isAway ? 'Away' : userStatus.text || 'Active' }}
          </div>
        </div>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left:auto;flex-shrink:0;opacity:0.5"><polyline points="18 15 12 9 6 15"/></svg>

        <!-- FIX 1+2+3+4+5: Profile popup — NO Add Workspace, full data, working actions -->
        <transition name="sl-pop">
          <div v-if="profileMenuOpen" class="sl-profile-popup" @click.stop>
            <!-- Header with full profile data -->
            <div class="sl-pp-header">
              <div class="sl-pp-ava" :style="{background: avatarColor(me?.displayName || 'U')}">{{ (me?.displayName || me?.userName || 'U').slice(0,1).toUpperCase() }}</div>
              <div>
                <div class="sl-pp-name">{{ me?.realName || me?.displayName || me?.userName }}</div>
                <div class="sl-pp-team">{{ me?.teamName }}</div>
              </div>
            </div>
            <!-- Status row — clickable to update -->
            <div class="sl-pp-status-row" @click="openStatusModal">
              <span v-if="userStatus.emoji" style="font-size:14px">{{ userStatus.emoji }}</span>
              <span v-else :class="['sl-dot', isAway ? 'yellow' : 'green']"></span>
              <span class="sl-pp-status-txt">{{ userStatus.text || (isAway ? 'Away' : 'Active') }}</span>
              <button class="sl-pp-update-btn">Update</button>
            </div>
            <div class="sl-dd-divider"></div>
            <!-- View full profile -->
            <div class="sl-dd-item" @click="openModal('myProfile'); profileMenuOpen = false">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              View profile
            </div>
            <!-- FIX 3: Preferences — opens functional modal -->
            <div class="sl-dd-item" @click="openModal('preferences'); profileMenuOpen = false">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>
              Preferences
            </div>
            <!-- FIX 4: Set away — actually toggles -->
            <div class="sl-dd-item" @click="toggleAway(); profileMenuOpen = false">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
              {{ isAway ? 'Set yourself as active' : 'Set yourself as away' }}
            </div>
            <div class="sl-dd-divider"></div>
            <!-- Sign out -->
            <div class="sl-dd-item sl-dd-danger" @click="profileMenuOpen = false">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              Sign out of {{ me?.teamName }}
            </div>
          </div>
        </transition>
      </div>
    </div>

    <!-- ═══════════════ MAIN PANE ═══════════════ -->
    <div class="sl-main">

      <!-- Search results -->
      <template v-if="searchMode && searchQuery">
        <div class="sl-topbar">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <span>Results for "{{ searchQuery }}"</span>
          <span v-if="searchLoading" class="sl-spin sm" style="margin-left:8px"></span>
          <button class="sl-hdr-btn" style="margin-left:auto;padding:0 10px;width:auto;font-size:12px" @click="clearSearch">Clear</button>
        </div>
        <div class="sl-search-results-pane">
          <div v-if="!searchLoading && searchResults.length === 0" class="sl-center-state">
            <p class="sl-state-title">No results for "{{ searchQuery }}"</p>
          </div>
          <div v-for="r in searchResults" :key="r.id" class="sl-sr-card" @click="jumpToChannel(r)">
            <div class="sl-sr-meta">
              <span class="sl-sr-ch"># {{ r.channelName }}</span>
              <span class="sl-sr-from">{{ r.fromName }}</span>
              <span class="sl-sr-time">{{ formatTime(r.date) }}</span>
            </div>
            <div class="sl-sr-text">{{ r.text }}</div>
          </div>
        </div>
      </template>

      <!-- Empty pick state -->
      <div v-else-if="!activeChannel" class="sl-center-state" style="flex:1">
        <svg width="52" height="52" viewBox="0 0 24 24">
          <path fill="#E01E5A" opacity="0.1" d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313z"/>
          <path fill="#36C5F0" opacity="0.1" d="M8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.527 2.527 0 012.521 2.522v2.52H8.834zM8.834 6.313a2.527 2.527 0 012.521 2.521 2.527 2.527 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312z"/>
        </svg>
        <p class="sl-state-title">Pick a conversation</p>
        <p class="sl-state-sub">Select a channel or DM to start messaging</p>
        <div style="display:flex;gap:10px;margin-top:8px">
          <button class="sl-ghost-btn" @click="openModal('createChannel')">+ New channel</button>
          <button class="sl-ghost-btn" @click="openModal('newDM')">+ New DM</button>
        </div>
      </div>

      <!-- Active channel -->
      <template v-else>

        <!-- Chat header -->
        <div class="sl-chat-header">
          <div v-if="activeChannel.type === 'dm'" class="sl-ch-ava-sm" :style="{background: avatarColor(activeChannel.name)}">{{ activeChannel.name.slice(0,1).toUpperCase() }}</div>
          <span v-else class="sl-ch-hash">{{ activeChannel.type === 'private' ? '🔒' : '#' }}</span>
          <div class="sl-chat-hdr-info">
            <div class="sl-chat-hdr-name">{{ activeChannel.type === 'dm' ? activeChannel.name : activeChannel.name.replace(/^#/, '') }}</div>
            <div class="sl-chat-hdr-sub">{{ activeChannel.type === 'dm' ? 'Direct message' : activeChannel.type === 'private' ? 'Private channel' : 'Public channel' }} · {{ messages.length }} messages</div>
          </div>
          <div class="sl-chat-hdr-actions">
            <!-- Subtle auto-refresh indicator — just a dot, no text -->
            <span class="sl-live-dot-only" :class="{active: prefs.autoRefresh}" :title="prefs.autoRefresh ? 'Auto-refresh on' : 'Auto-refresh off'"></span>
            <button :class="['sl-hdr-btn', huddleActive ? 'huddle-on' : '']" @click="startHuddle" title="Start huddle">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/></svg>
              {{ huddleActive ? 'In huddle' : 'Huddle' }}
            </button>
            <button class="sl-hdr-icon-btn" @click="refreshMessages" title="Refresh">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
            </button>
            <a :href="`slack://channel?team=${me?.teamId || ''}&id=${activeChannel.id}`" class="sl-hdr-icon-btn" title="Open in Slack">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>
          </div>
        </div>

        <!-- Huddle banner -->
        <transition name="sl-slide-down">
          <div v-if="huddleActive" class="sl-huddle-banner">
            <span class="sl-dot green"></span>
            <span>Huddle active in {{ activeChannel.name }}</span>
            <a :href="`https://app.slack.com/huddle/${me?.teamId || ''}/${activeChannel.id}`" target="_blank" class="sl-huddle-join-btn">Join in Slack ↗</a>
            <button class="sl-huddle-leave-btn" @click="huddleActive = false">Leave</button>
          </div>
        </transition>

        <!-- Messages -->
        <div class="sl-messages" ref="messagesRef">
          <div v-if="messagesLoading" class="sl-center-state"><span class="sl-spin"></span></div>
          <div v-else-if="messages.length === 0" class="sl-welcome">
            <div class="sl-welcome-ava" :style="{background: activeChannel.type === 'dm' ? avatarColor(activeChannel.name) : 'var(--accent-dim)'}">
              <span v-if="activeChannel.type === 'dm'" style="font-size:24px;font-weight:700;color:white">{{ activeChannel.name.slice(0,1).toUpperCase() }}</span>
              <span v-else style="font-size:20px;color:var(--accent)">{{ activeChannel.type === 'private' ? '🔒' : '#' }}</span>
            </div>
            <div class="sl-welcome-title">{{ activeChannel.type === 'dm' ? `This is your DM with ${activeChannel.name}` : `Welcome to #${activeChannel.name.replace(/^#/, '')}!` }}</div>
            <div class="sl-welcome-sub">{{ activeChannel.type === 'dm' ? 'Send a message to get started.' : 'This is the very beginning of this channel.' }}</div>
          </div>
          <template v-else>
            <div v-for="(msg, i) in messages" :key="msg.id">
              <div v-if="showDateSep(i)" class="sl-date-sep"><span>{{ formatDate(msg.date) }}</span></div>
              <!-- Reply context -->
              <div v-if="msg.replyTo" class="sl-reply-ctx" @click="scrollToMsg(msg.replyTo.id)">
                <div class="sl-reply-bar"></div>
                <div class="sl-reply-ava-xs" :style="{background: avatarColor(msg.replyTo.fromName)}">{{ msg.replyTo.fromName?.slice(0,1).toUpperCase() }}</div>
                <span class="sl-reply-name">{{ msg.replyTo.fromName }}</span>
                <span class="sl-reply-preview">{{ msg.replyTo.text?.slice(0, 60) }}</span>
              </div>
              <!-- Message row -->
              <div :class="['sl-msg', msg.fromMe ? 'mine' : '']" :id="`msg-${msg.id}`"
                @mouseenter="hoveredMsg = msg.id" @mouseleave="hoveredMsg = null">
                <div class="sl-msg-ava" :style="{background: avatarColor(msg.fromName)}">{{ msg.fromName?.slice(0,1).toUpperCase() }}</div>
                <div class="sl-msg-body">
                  <div class="sl-msg-hdr">
                    <span class="sl-msg-name" :style="{color: msg.fromMe ? 'var(--accent)' : senderColor(msg.fromName)}">{{ msg.fromMe ? 'You' : msg.fromName }}</span>
                    <span class="sl-msg-ts">{{ formatTime(msg.date) }}</span>
                    <span v-if="msg.isPinned" class="sl-pin-badge">📌</span>
                  </div>
                  <!-- Attachment -->
                  <div v-if="msg.file" class="sl-msg-file">
                    <div class="sl-file-icon-sm">{{ fileEmoji(msg.file.name) }}</div>
                    <div><div class="sl-file-name-sm">{{ msg.file.name }}</div><div class="sl-file-size-sm">{{ msg.file.size }}</div></div>
                    <a :href="msg.file.url" target="_blank" class="sl-btn-xs">↓</a>
                  </div>
                  <div v-if="msg.text" class="sl-msg-txt" v-html="formatSlackText(msg.text)"></div>
                  <!-- Reactions -->
                  <div v-if="msg.reactions?.length" class="sl-reactions">
                    <span v-for="r in msg.reactions" :key="r.name" class="sl-reaction" @click="addReaction(msg.id, r.name)" :title="r.name">
                      <img v-if="customEmojis[r.name]" :src="customEmojis[r.name]" class="sl-custom-emoji" :alt="r.name"/>
                      <span v-else>{{ emojiMap[r.name] || `:${r.name}:` }}</span>
                      {{ r.count }}
                    </span>
                    <button class="sl-reaction sl-add-reaction" @click.stop="emojiFor = msg.id">+</button>
                  </div>
                  <!-- Thread count -->
                  <div v-if="msg.threadCount > 0" class="sl-thread-link">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                    {{ msg.threadCount }} {{ msg.threadCount === 1 ? 'reply' : 'replies' }} · View thread
                  </div>
                </div>
                <!-- Hover toolbar -->
                <transition name="sl-fade">
                  <div v-if="hoveredMsg === msg.id" class="sl-msg-toolbar" @click.stop>
                    <button class="sl-tb-btn" title="React" @click="emojiFor = msg.id">😊</button>
                    <button class="sl-tb-btn" title="Reply" @click="setReplyTo(msg)">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 00-4-4H4"/></svg>
                    </button>
                    <button class="sl-tb-btn" :title="msg.isPinned ? 'Unpin' : 'Pin'" @click="msg.isPinned ? unpinMsg(msg.id) : pinMsg(msg)">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V6h1a2 2 0 000-4H8a2 2 0 000 4h1v4.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V17z"/></svg>
                    </button>
                    <button class="sl-tb-btn" title="More" @click.stop="openMsgMenu(msg, $event)">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
                    </button>
                  </div>
                </transition>
                <!-- Full emoji picker -->
                <div v-if="emojiFor === msg.id" class="sl-emoji-pop" @click.stop>
                  <input v-model="emojiSearch" class="sl-emoji-search" placeholder="Search emoji…" @input="filterEmojis" ref="emojiSearchRef"/>
                  <div class="sl-emoji-categories" v-if="!emojiSearch">
                    <button v-for="cat in emojiCategories" :key="cat.id" class="sl-emoji-cat-btn"
                      :title="cat.name" @click="scrollToCategory(cat.id)">{{ cat.icon }}</button>
                  </div>
                  <div class="sl-emoji-scroll" ref="emojiScrollRef">
                    <template v-if="emojiSearch">
                      <div class="sl-emoji-cat-label">Results</div>
                      <div class="sl-emoji-grid">
                        <span v-for="e in filteredEmojiList" :key="e.n" class="sl-emoji-btn"
                          :title="e.n" @click="addReaction(msg.id, e.n); emojiFor = null; emojiSearch = ''">{{ e.e }}</span>
                      </div>
                    </template>
                    <template v-else>
                      <div v-for="cat in emojiCategories" :key="cat.id" :id="`emoji-cat-${cat.id}`">
                        <div class="sl-emoji-cat-label">{{ cat.name }}</div>
                        <div class="sl-emoji-grid">
                          <span v-for="e in cat.emojis" :key="e.n" class="sl-emoji-btn"
                            :title="e.n" @click="addReaction(msg.id, e.n); emojiFor = null">{{ e.e }}</span>
                        </div>
                      </div>
                    </template>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </div>

        <!-- Send bar -->
        <div class="sl-sendbar">
          <!-- Reply banner -->
          <transition name="sl-slide-down">
            <div v-if="replyingTo" class="sl-reply-banner">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 00-4-4H4"/></svg>
              Replying to <strong style="margin:0 4px">{{ replyingTo.fromName }}</strong>: {{ replyingTo.text?.slice(0, 50) }}…
              <button class="sl-reply-cancel" @click="replyingTo = null">✕</button>
            </div>
          </transition>
          <!-- Formatting toolbar — Real Slack style -->
          <div class="sl-fmt-toolbar">
            <button class="sl-fmt-btn" :class="{active: fmtBold}" title="Bold" @click="wrapText('*','*')"><b>B</b></button>
            <button class="sl-fmt-btn" :class="{active: fmtItalic}" title="Italic" @click="wrapText('_','_')"><i>I</i></button>
            <button class="sl-fmt-btn" :class="{active: fmtStrike}" title="Strikethrough" @click="wrapText('~','~')"><s>S</s></button>
            <button class="sl-fmt-btn" title="Code" @click="wrapText('`','`')">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
            </button>
            <div class="sl-fmt-sep"></div>
            <button class="sl-fmt-btn" title="Bullet list" @click="insertBullet">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1" fill="currentColor"/><circle cx="3" cy="12" r="1" fill="currentColor"/><circle cx="3" cy="18" r="1" fill="currentColor"/></svg>
            </button>
            <div class="sl-fmt-sep"></div>
            <button class="sl-fmt-btn" title="Emoji" @click.stop="emojiFor = 'send'">😊</button>
            <button class="sl-fmt-btn" title="Attach file" @click="fileInputRef?.click()">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
            </button>
          </div>
          <!-- Input -->
          <div class="sl-send-box" :class="{focused: inputFocused}">
            <!-- Attachment chips -->
            <div v-if="attachments.length > 0" class="sl-att-chips">
              <div v-for="(a, i) in attachments" :key="i" class="sl-att-chip">
                {{ fileEmoji(a.name) }} {{ a.name }}
                <button @click="attachments.splice(i, 1)">×</button>
              </div>
            </div>
            <textarea
              v-model="sendText"
              class="sl-send-ta"
              :placeholder="`Message ${activeChannel.type === 'dm' ? activeChannel.name : '#' + activeChannel.name.replace(/^#/, '')}`"
              ref="sendInputRef"
              rows="1"
              @keydown.enter.exact.prevent="sendMessage"
              @keydown.enter.shift.exact="() => {}"
              @keydown.escape="replyingTo = null"
              @input="autoResize"
              @focus="inputFocused = true"
              @blur="inputFocused = false"
            />
            <div class="sl-send-foot">
              <span class="sl-send-hint">↵ send · ⇧↵ newline</span>
              <button class="sl-send-btn" :disabled="(!sendText.trim() && !attachments.length) || sending" @click="sendMessage">
                <svg v-if="!sending" width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M22 2L15 22 11 13 2 9l20-7z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <span v-else class="sl-spin sm"></span>
              </button>
            </div>
          </div>
          <!-- Full send emoji picker -->
          <div v-if="emojiFor === 'send'" class="sl-emoji-pop send-pos" @click.stop>
            <input v-model="emojiSearch" class="sl-emoji-search" placeholder="Search emoji…" @input="filterEmojis"/>
            <div class="sl-emoji-categories" v-if="!emojiSearch">
              <button v-for="cat in emojiCategories" :key="cat.id" class="sl-emoji-cat-btn"
                :title="cat.name" @click="scrollToCategory(cat.id)">{{ cat.icon }}</button>
            </div>
            <div class="sl-emoji-scroll">
              <template v-if="emojiSearch">
                <div class="sl-emoji-cat-label">Results</div>
                <div class="sl-emoji-grid">
                  <span v-for="e in filteredEmojiList" :key="e.n" class="sl-emoji-btn"
                    :title="e.n" @click="insertEmoji(e.e); emojiFor = null; emojiSearch = ''">{{ e.e }}</span>
                </div>
              </template>
              <template v-else>
                <div v-for="cat in emojiCategories" :key="cat.id">
                  <div class="sl-emoji-cat-label">{{ cat.name }}</div>
                  <div class="sl-emoji-grid">
                    <span v-for="e in cat.emojis" :key="e.n" class="sl-emoji-btn"
                      :title="e.n" @click="insertEmoji(e.e); emojiFor = null">{{ e.e }}</span>
                  </div>
                </div>
              </template>
            </div>
          </div>
          <input type="file" ref="fileInputRef" class="sl-file-input" multiple @change="onFileChange"/>
        </div>
      </template>
    </div>

    <!-- Message context menu -->
    <teleport to="body">
      <div v-if="msgMenu.open" class="sl-ctx-menu" :style="{top: msgMenu.y + 'px', left: msgMenu.x + 'px'}" @click.stop>
        <div class="sl-ctx-item" @click="copyMsg">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          Copy text
        </div>
        <div class="sl-ctx-item" @click="setReplyTo(msgMenu.msg); msgMenu.open = false">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 00-4-4H4"/></svg>
          Reply
        </div>
        <div class="sl-ctx-item" @click="msgMenu.msg?.isPinned ? unpinMsg(msgMenu.msg.id) : pinMsg(msgMenu.msg); msgMenu.open = false">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V6h1a2 2 0 000-4H8a2 2 0 000 4h1v4.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V17z"/></svg>
          {{ msgMenu.msg?.isPinned ? 'Unpin' : 'Pin message' }}
        </div>
        <div class="sl-ctx-divider"></div>
        <div class="sl-ctx-item danger" @click="deleteMsg">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
          Delete message
        </div>
      </div>
    </teleport>

    <!-- ═══════════════ MODALS ═══════════════ -->

    <!-- FIX 2: Full profile modal -->
    <transition name="sl-modal-anim">
      <div v-if="modal === 'myProfile'" class="sl-modal-bg" @click.self="modal = null">
        <div class="sl-modal">
          <div class="sl-modal-hdr"><span>Profile</span><button class="sl-modal-close" @click="modal = null">✕</button></div>
          <div class="sl-modal-body" style="padding:0;gap:0">
            <div style="height:72px;background:var(--accent-dim);flex-shrink:0"></div>
            <div style="padding:0 20px 20px">
              <div class="sl-full-profile-ava" :style="{background: avatarColor(me?.displayName || 'U')}">{{ (me?.displayName || me?.userName || 'U').slice(0,1).toUpperCase() }}</div>
              <div class="sl-full-profile-name">{{ me?.realName || me?.displayName || me?.userName }}</div>
              <div class="sl-full-profile-status">
                <span v-if="userStatus.emoji" style="font-size:14px">{{ userStatus.emoji }}</span>
                <span v-else :class="['sl-dot', isAway ? 'yellow' : 'green']"></span>
                {{ userStatus.text || (isAway ? 'Away' : 'Active') }}
              </div>
              <div class="sl-profile-fields">
                <div class="sl-profile-field"><div class="sl-pf-label">Display name</div><div class="sl-pf-val">{{ me?.displayName || '—' }}</div></div>
                <div class="sl-profile-field"><div class="sl-pf-label">Username</div><div class="sl-pf-val">@{{ me?.userName || '—' }}</div></div>
                <div class="sl-profile-field"><div class="sl-pf-label">Email</div><div class="sl-pf-val">{{ me?.email || '—' }}</div></div>
                <div class="sl-profile-field"><div class="sl-pf-label">Workspace</div><div class="sl-pf-val">{{ me?.teamName || '—' }}</div></div>
                <div class="sl-profile-field" style="border:none"><div class="sl-pf-label">Member since</div><div class="sl-pf-val">{{ me?.memberSince || 'Connected via OrionAI' }}</div></div>
              </div>
              <a :href="`https://app.slack.com/client/${me?.teamId || ''}/profile`" target="_blank"
                class="sl-btn-primary" style="margin-top:14px;text-decoration:none;display:flex;justify-content:center">
                Edit profile in Slack ↗
              </a>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <!-- FIX 3: Preferences modal — only auto-refresh + notifications -->
    <transition name="sl-modal-anim">
      <div v-if="modal === 'preferences'" class="sl-modal-bg" @click.self="modal = null">
        <div class="sl-modal">
          <div class="sl-modal-hdr"><span>Preferences</span><button class="sl-modal-close" @click="modal = null">✕</button></div>
          <div class="sl-modal-body">
            <!-- Auto-refresh -->
            <div class="sl-pref-section">
              <div class="sl-pref-title">Real-time messages</div>
              <div class="sl-toggle-row">
                <div>
                  <div style="font-size:13px;color:var(--text-primary);font-weight:500">Auto-refresh</div>
                  <div class="sl-hint">Poll for new messages automatically</div>
                </div>
                <button :class="['sl-toggle', prefs.autoRefresh ? 'on' : '']" @click="toggleAutoRefresh"><span class="sl-toggle-knob"></span></button>
              </div>
              <div v-if="prefs.autoRefresh" style="margin-top:10px">
                <label class="sl-lbl">Refresh every</label>
                <select v-model.number="prefs.pollInterval" class="sl-input" style="margin-top:5px" @change="resetPoll">
                  <option :value="3">3 seconds (fastest)</option>
                  <option :value="5">5 seconds</option>
                  <option :value="10">10 seconds</option>
                  <option :value="30">30 seconds</option>
                </select>
              </div>
            </div>
            <!-- Notifications -->
            <div class="sl-pref-section" style="border:none;margin:0;padding:0">
              <div class="sl-pref-title">Notifications</div>
              <div class="sl-toggle-row">
                <div>
                  <div style="font-size:13px;color:var(--text-primary);font-weight:500">Browser notifications</div>
                  <div class="sl-hint">Show alerts when window is not focused</div>
                </div>
                <button :class="['sl-toggle', prefs.notifications ? 'on' : '']" @click="toggleNotifications"><span class="sl-toggle-knob"></span></button>
              </div>
            </div>
          </div>
          <div class="sl-modal-footer">
            <button class="sl-btn-primary" @click="savePrefs(); modal = null">Save preferences</button>
          </div>
        </div>
      </div>
    </transition>

    <!-- FIX 5: Update status modal -->
    <transition name="sl-modal-anim">
      <div v-if="modal === 'updateStatus'" class="sl-modal-bg" @click.self="modal = null">
        <div class="sl-modal">
          <div class="sl-modal-hdr"><span>Update your status</span><button class="sl-modal-close" @click="modal = null">✕</button></div>
          <div class="sl-modal-body">
            <label class="sl-lbl">Status emoji</label>
            <div class="sl-status-emojis">
              <span v-for="e in statusEmojis" :key="e"
                :class="['sl-status-emoji', statusDraft.emoji === e ? 'active' : '']"
                @click="statusDraft.emoji = e">{{ e }}</span>
              <span class="sl-status-emoji" :class="{active: !statusDraft.emoji}" @click="statusDraft.emoji = ''" title="None">✕</span>
            </div>
            <label class="sl-lbl mt">Status text</label>
            <input v-model="statusDraft.text" class="sl-input" placeholder="What's your status?" maxlength="100"/>
            <label class="sl-lbl mt">Quick select</label>
            <div class="sl-status-presets">
              <div v-for="p in statusPresets" :key="p.text" class="sl-status-preset" @click="statusDraft.emoji = p.emoji; statusDraft.text = p.text">
                <span>{{ p.emoji }}</span>
                <span style="font-size:13px;color:var(--text-primary)">{{ p.text }}</span>
              </div>
            </div>
          </div>
          <div class="sl-modal-footer">
            <button class="sl-btn-ghost" @click="clearStatus(); modal = null">Clear status</button>
            <button class="sl-btn-primary" @click="saveStatus(); modal = null">Save</button>
          </div>
        </div>
      </div>
    </transition>

    <!-- Create channel modal -->
    <transition name="sl-modal-anim">
      <div v-if="modal === 'createChannel'" class="sl-modal-bg" @click.self="modal = null">
        <div class="sl-modal">
          <div class="sl-modal-hdr"><span>Create a channel</span><button class="sl-modal-close" @click="modal = null">✕</button></div>
          <div class="sl-modal-body">
            <label class="sl-lbl">Channel name</label>
            <div class="sl-input-prefix-wrap"><span class="sl-input-prefix">#</span><input v-model="newCh.name" class="sl-input" placeholder="e.g. project-updates" @keydown.enter="createChannel"/></div>
            <label class="sl-lbl mt">Description <span style="opacity:0.5;font-weight:400">(optional)</span></label>
            <input v-model="newCh.desc" class="sl-input" placeholder="What's this channel about?"/>
            <div class="sl-toggle-row mt">
              <div><div class="sl-lbl" style="margin:0">Private channel</div><div class="sl-hint">Only invited members can see it</div></div>
              <button :class="['sl-toggle', newCh.private ? 'on' : '']" @click="newCh.private = !newCh.private"><span class="sl-toggle-knob"></span></button>
            </div>
          </div>
          <div class="sl-modal-footer">
            <button class="sl-btn-ghost" @click="modal = null">Cancel</button>
            <button class="sl-btn-primary" :disabled="!newCh.name.trim() || creatingCh" @click="createChannel">
              <span v-if="creatingCh" class="sl-spin sm"></span><span v-else>Create</span>
            </button>
          </div>
        </div>
      </div>
    </transition>

    <!-- New DM modal -->
    <transition name="sl-modal-anim">
      <div v-if="modal === 'newDM'" class="sl-modal-bg" @click.self="modal = null">
        <div class="sl-modal">
          <div class="sl-modal-hdr"><span>New message</span><button class="sl-modal-close" @click="modal = null">✕</button></div>
          <div class="sl-modal-body">
            <label class="sl-lbl">To</label>
            <input v-model="newDmUser" class="sl-input" placeholder="@username" @keydown.enter="startDM"/>
            <div class="sl-hint mt">Enter the Slack username to start a conversation</div>
          </div>
          <div class="sl-modal-footer">
            <button class="sl-btn-ghost" @click="modal = null">Cancel</button>
            <button class="sl-btn-primary" :disabled="!newDmUser.trim() || startingDM" @click="startDM">
              <span v-if="startingDM" class="sl-spin sm"></span><span v-else>Go</span>
            </button>
          </div>
        </div>
      </div>
    </transition>

    <!-- Browse channels modal -->
    <transition name="sl-modal-anim">
      <div v-if="modal === 'browseChannels'" class="sl-modal-bg" @click.self="modal = null">
        <div class="sl-modal lg">
          <div class="sl-modal-hdr"><span>Browse channels</span><button class="sl-modal-close" @click="modal = null">✕</button></div>
          <div class="sl-modal-body">
            <input v-model="browseQ" class="sl-input" placeholder="Search channels…"/>
            <div class="sl-browse-list">
              <div v-for="ch in filteredBrowse" :key="ch.id" class="sl-browse-row">
                <span style="color:var(--text-muted);font-size:14px">#</span>
                <div style="flex:1"><div style="font-size:13px;font-weight:600;color:var(--text-primary)">{{ ch.name.replace(/^#/, '') }}</div><div style="font-size:11.5px;color:var(--text-muted)">{{ ch.lastMessage || 'No recent messages' }}</div></div>
                <button class="sl-btn-primary" style="padding:5px 14px;font-size:12px" @click="openChannel(ch); modal = null">Open</button>
              </div>
              <div v-if="filteredBrowse.length === 0" style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">No channels found</div>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <!-- Add workspace modal -->
    <transition name="sl-modal-anim">
      <div v-if="modal === 'addWorkspace'" class="sl-modal-bg" @click.self="modal = null">
        <div class="sl-modal">
          <div class="sl-modal-hdr"><span>Add a workspace</span><button class="sl-modal-close" @click="modal = null">✕</button></div>
          <div class="sl-modal-body">
            <p style="font-size:13.5px;color:var(--text-secondary);line-height:1.6">To connect another Slack workspace, go to <strong>Integrations → Slack</strong> and connect an additional account. Each workspace needs its own OAuth connection.</p>
            <button class="sl-btn-primary" style="margin-top:12px" @click="modal = null; $emit('openIntegrations')">Go to Integrations ↗</button>
          </div>
        </div>
      </div>
    </transition>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import api from '../services/api'
import CommunicationInsightsWidget from '../components/communications/CommunicationInsightsWidget.vue'
import { useCommunicationActions, emitCommunicationPriorityRefresh } from '../composables/useCommunicationActions'
import { store, setModuleContext } from '../stores/app'

 defineEmits(['close', 'openIntegrations'])

// ── Core state ──────────────────────────────────────────────
const me = ref(null)
const channels = ref([])
const loading = ref(false)
const activeChannelId = ref(null)
const activeChannel = ref(null)
const messages = ref([])
const messagesLoading = ref(false)
const sendText = ref('')
const sending = ref(false)
const messagesRef = ref(null)
const sendInputRef = ref(null)
const fileInputRef = ref(null)
const inputFocused = ref(false)
const sectionsOpen = ref({ channels: true, dms: true })
const attachments = ref([])
const {
  actionableItems: slackActionItems,
  counts: slackActionCounts,
  groups: slackActionGroups,
  loading: slackActionsLoading,
  summaryText: slackActionSummary,
  stateByConversationId: slackActionMap,
  refresh: refreshSlackActions,
  recordAction: recordSlackAction,
} = useCommunicationActions('slack')

// ── Search ──────────────────────────────────────────────────
const searchQuery = ref('')
const searchMode = ref(false)
const searchResults = ref([])
const searchLoading = ref(false)
let searchTimer = null

// ── UI popups/menus ─────────────────────────────────────────
const wsMenuOpen = ref(false)
const profileMenuOpen = ref(false)
const hoveredMsg = ref(null)
const emojiFor = ref(null)
const modal = ref(null)
const msgMenu = ref({ open: false, msg: null, x: 0, y: 0 })

// ── Formatting ──────────────────────────────────────────────
const fmtBold = ref(false)
const fmtItalic = ref(false)
const fmtStrike = ref(false)

// ── Reply ───────────────────────────────────────────────────
const replyingTo = ref(null)

// ── Huddle ──────────────────────────────────────────────────
const huddleActive = ref(false)

// ── Status (Fix 4+5) ────────────────────────────────────────
const isAway = ref(false)
const userStatus = ref({ emoji: '', text: '' })
const statusDraft = ref({ emoji: '', text: '' })
const statusEmojis = ['🏃', '🍕', '🎧', '💻', '📵', '🤒', '🏖️', '✈️', '🗓️', '📞', '🔕', '🏠', '🎉', '🔍']
const statusPresets = [
  { emoji: '🎧', text: 'In a meeting' },
  { emoji: '🍕', text: 'Out for lunch' },
  { emoji: '🏠', text: 'Working remotely' },
  { emoji: '🤒', text: 'Out sick' },
  { emoji: '✈️', text: 'Travelling' },
  { emoji: '🔕', text: 'Do not disturb' },
  { emoji: '📵', text: 'On vacation' },
  { emoji: '💻', text: 'Heads down' },
]

// ── Preferences (Fix 3+8) ───────────────────────────────────
const prefs = ref({
  theme: localStorage.getItem('orionai-theme') || 'dark',
  autoRefresh: true,
  pollInterval: 5,
  notifications: false,
  slackTheme: 'orion',
})

// ── New channel/DM form ─────────────────────────────────────
const newCh = ref({ name: '', desc: '', private: false })
const creatingCh = ref(false)
const newDmUser = ref('')
const startingDM = ref(false)
const browseQ = ref('')

// ── Polling (Fix 8) ─────────────────────────────────────────
let pollTimer = null
const lastMsgTs = ref(null)

// ── Emoji search state ──────────────────────────────────────
const emojiSearch = ref('')
const emojiSearchRef = ref(null)
const emojiScrollRef = ref(null)
const filteredEmojiList = ref([])

function filterEmojis() {
  if (!emojiSearch.value.trim()) { filteredEmojiList.value = []; return }
  const q = emojiSearch.value.toLowerCase()
  filteredEmojiList.value = emojiCategories.flatMap(c => c.emojis).filter(e => e.n.includes(q)).slice(0, 60)
}

function scrollToCategory(id) {
  const el = document.getElementById(`emoji-cat-${id}`)
  if (el && emojiScrollRef.value) emojiScrollRef.value.scrollTo({ top: el.offsetTop - 4, behavior: 'smooth' })
}

// ── Full emoji dataset by category ─────────────────────────
const emojiCategories = [
  { id: 'frequent', name: 'Frequently used', icon: '🕐', emojis: [
    {n:'thumbsup',e:'👍'},{n:'heart',e:'❤️'},{n:'laugh',e:'😂'},{n:'fire',e:'🔥'},{n:'eyes',e:'👀'},{n:'rocket',e:'🚀'},{n:'check',e:'✅'},{n:'clap',e:'👏'},{n:'wave',e:'👋'},{n:'tada',e:'🎉'},
  ]},
  { id: 'smileys', name: 'Smileys & People', icon: '😀', emojis: [
    {n:'grinning',e:'😀'},{n:'smiley',e:'😃'},{n:'smile',e:'😄'},{n:'grin',e:'😁'},{n:'laughing',e:'😆'},{n:'sweat_smile',e:'😅'},{n:'rofl',e:'🤣'},{n:'joy',e:'😂'},{n:'slightly_smiling',e:'🙂'},{n:'upside_down',e:'🙃'},
    {n:'wink',e:'😉'},{n:'blush',e:'😊'},{n:'innocent',e:'😇'},{n:'heart_eyes',e:'😍'},{n:'kissing_heart',e:'😘'},{n:'kissing',e:'😗'},{n:'kissing_smiling',e:'😙'},{n:'kissing_closed',e:'😚'},{n:'yum',e:'😋'},{n:'stuck_out_tongue',e:'😛'},
    {n:'stuck_tongue_wink',e:'😜'},{n:'stuck_tongue_closed',e:'😝'},{n:'money_mouth',e:'🤑'},{n:'hug',e:'🤗'},{n:'thinking',e:'🤔'},{n:'zipper_mouth',e:'🤐'},{n:'raised_eyebrow',e:'🤨'},{n:'neutral',e:'😐'},{n:'expressionless',e:'😑'},{n:'no_mouth',e:'😶'},
    {n:'smirk',e:'😏'},{n:'unamused',e:'😒'},{n:'roll_eyes',e:'🙄'},{n:'grimacing',e:'😬'},{n:'lying',e:'🤥'},{n:'relieved',e:'😌'},{n:'pensive',e:'😔'},{n:'sleepy',e:'😪'},{n:'drooling',e:'🤤'},{n:'sleeping',e:'😴'},
    {n:'mask',e:'😷'},{n:'face_thermometer',e:'🤒'},{n:'face_bandage',e:'🤕'},{n:'nauseated',e:'🤢'},{n:'sneezing',e:'🤧'},{n:'hot',e:'🥵'},{n:'cold',e:'🥶'},{n:'woozy',e:'🥴'},{n:'dizzy',e:'😵'},{n:'exploding_head',e:'🤯'},
    {n:'cowboy',e:'🤠'},{n:'partying',e:'🥳'},{n:'sunglasses',e:'😎'},{n:'nerd',e:'🤓'},{n:'monocle',e:'🧐'},{n:'confused',e:'😕'},{n:'worried',e:'😟'},{n:'slightly_frowning',e:'🙁'},{n:'frowning',e:'😮'},{n:'open_mouth',e:'😮'},
    {n:'hushed',e:'😯'},{n:'astonished',e:'😲'},{n:'flushed',e:'😳'},{n:'pleading',e:'🥺'},{n:'anguished',e:'😧'},{n:'fearful',e:'😨'},{n:'cold_sweat',e:'😰'},{n:'disappointed_relieved',e:'😥'},{n:'cry',e:'😢'},{n:'sob',e:'😭'},
    {n:'scream',e:'😱'},{n:'confounded',e:'😖'},{n:'persevere',e:'😣'},{n:'disappointed',e:'😞'},{n:'sweat',e:'😓'},{n:'weary',e:'😩'},{n:'tired',e:'😫'},{n:'yawning',e:'🥱'},{n:'triumph',e:'😤'},{n:'rage',e:'😡'},
    {n:'angry',e:'😠'},{n:'skull',e:'💀'},{n:'poop',e:'💩'},{n:'clown',e:'🤡'},{n:'japanese_ogre',e:'👹'},{n:'ghost',e:'👻'},{n:'alien',e:'👽'},{n:'robot',e:'🤖'},{n:'wave_hand',e:'👋'},{n:'raised_back',e:'🤚'},
    {n:'hand',e:'✋'},{n:'vulcan',e:'🖖'},{n:'ok_hand',e:'👌'},{n:'pinching',e:'🤌'},{n:'fingers_crossed',e:'🤞'},{n:'love_you',e:'🤟'},{n:'metal',e:'🤘'},{n:'call_me',e:'🤙'},{n:'point_left',e:'👈'},{n:'point_right',e:'👉'},
    {n:'point_up',e:'☝️'},{n:'point_down',e:'👇'},{n:'+1',e:'👍'},{n:'-1',e:'👎'},{n:'fist',e:'✊'},{n:'facepunch',e:'👊'},{n:'left_fist',e:'🤛'},{n:'right_fist',e:'🤜'},{n:'clapping',e:'👏'},{n:'raised_hands',e:'🙌'},
    {n:'open_hands',e:'👐'},{n:'pray',e:'🙏'},{n:'handshake',e:'🤝'},{n:'muscle',e:'💪'},{n:'ear',e:'👂'},{n:'nose',e:'👃'},{n:'eyes_em',e:'👀'},{n:'eye',e:'👁️'},{n:'brain',e:'🧠'},{n:'tongue',e:'👅'},
  ]},
  { id: 'nature', name: 'Animals & Nature', icon: '🐶', emojis: [
    {n:'dog',e:'🐶'},{n:'cat',e:'🐱'},{n:'mouse',e:'🐭'},{n:'hamster',e:'🐹'},{n:'rabbit',e:'🐰'},{n:'fox',e:'🦊'},{n:'bear',e:'🐻'},{n:'panda',e:'🐼'},{n:'koala',e:'🐨'},{n:'tiger',e:'🐯'},
    {n:'lion',e:'🦁'},{n:'cow',e:'🐮'},{n:'pig',e:'🐷'},{n:'frog',e:'🐸'},{n:'monkey',e:'🐵'},{n:'chicken',e:'🐔'},{n:'penguin',e:'🐧'},{n:'bird',e:'🐦'},{n:'baby_chick',e:'🐤'},{n:'duck',e:'🦆'},
    {n:'eagle',e:'🦅'},{n:'owl',e:'🦉'},{n:'bat',e:'🦇'},{n:'wolf',e:'🐺'},{n:'boar',e:'🐗'},{n:'horse',e:'🐴'},{n:'unicorn',e:'🦄'},{n:'bee',e:'🐝'},{n:'bug',e:'🐛'},{n:'butterfly',e:'🦋'},
    {n:'snail',e:'🐌'},{n:'shell',e:'🐚'},{n:'beetle',e:'🐞'},{n:'ant',e:'🐜'},{n:'mosquito',e:'🦟'},{n:'cricket',e:'🦗'},{n:'spider',e:'🕷️'},{n:'turtle',e:'🐢'},{n:'snake',e:'🐍'},{n:'lizard',e:'🦎'},
    {n:'dragon',e:'🐉'},{n:'dino',e:'🦕'},{n:'t-rex',e:'🦖'},{n:'whale',e:'🐳'},{n:'dolphin',e:'🐬'},{n:'fish',e:'🐟'},{n:'blowfish',e:'🐡'},{n:'shark',e:'🦈'},{n:'octopus',e:'🐙'},{n:'crab',e:'🦀'},
    {n:'lobster',e:'🦞'},{n:'shrimp',e:'🦐'},{n:'squid',e:'🦑'},{n:'rose',e:'🌹'},{n:'sunflower',e:'🌻'},{n:'blossom',e:'🌸'},{n:'tulip',e:'🌷'},{n:'seedling',e:'🌱'},{n:'tree',e:'🌲'},{n:'palm',e:'🌴'},
  ]},
  { id: 'food', name: 'Food & Drink', icon: '🍕', emojis: [
    {n:'pizza',e:'🍕'},{n:'hamburger',e:'🍔'},{n:'fries',e:'🍟'},{n:'hotdog',e:'🌭'},{n:'sandwich',e:'🥪'},{n:'taco',e:'🌮'},{n:'burrito',e:'🌯'},{n:'salad',e:'🥗'},{n:'spaghetti',e:'🍝'},{n:'ramen',e:'🍜'},
    {n:'sushi',e:'🍣'},{n:'bento',e:'🍱'},{n:'dumpling',e:'🥟'},{n:'egg',e:'🥚'},{n:'cooking',e:'🍳'},{n:'waffle',e:'🧇'},{n:'pancakes',e:'🥞'},{n:'cheese',e:'🧀'},{n:'bread',e:'🍞'},{n:'croissant',e:'🥐'},
    {n:'apple',e:'🍎'},{n:'banana',e:'🍌'},{n:'grapes',e:'🍇'},{n:'strawberry',e:'🍓'},{n:'watermelon',e:'🍉'},{n:'peach',e:'🍑'},{n:'cherries',e:'🍒'},{n:'pineapple',e:'🍍'},{n:'mango',e:'🥭'},{n:'coconut',e:'🥥'},
    {n:'coffee',e:'☕'},{n:'tea',e:'🍵'},{n:'milk',e:'🥛'},{n:'juice',e:'🧃'},{n:'beer',e:'🍺'},{n:'wine',e:'🍷'},{n:'cocktail',e:'🍹'},{n:'champagne',e:'🍾'},{n:'cake',e:'🎂'},{n:'cupcake',e:'🧁'},
    {n:'cookie',e:'🍪'},{n:'donut',e:'🍩'},{n:'ice_cream',e:'🍦'},{n:'chocolate',e:'🍫'},{n:'candy',e:'🍬'},{n:'lollipop',e:'🍭'},{n:'popcorn',e:'🍿'},{n:'salt',e:'🧂'},{n:'hotpot',e:'🍲'},{n:'bowl',e:'🥣'},
  ]},
  { id: 'travel', name: 'Travel & Places', icon: '✈️', emojis: [
    {n:'car',e:'🚗'},{n:'taxi',e:'🚕'},{n:'bus',e:'🚌'},{n:'train',e:'🚂'},{n:'airplane',e:'✈️'},{n:'rocket_ship',e:'🚀'},{n:'helicopter',e:'🚁'},{n:'ship',e:'🚢'},{n:'sailboat',e:'⛵'},{n:'bike',e:'🚲'},
    {n:'house',e:'🏠'},{n:'building',e:'🏢'},{n:'hospital',e:'🏥'},{n:'school',e:'🏫'},{n:'bank',e:'🏦'},{n:'hotel',e:'🏨'},{n:'stadium',e:'🏟️'},{n:'church',e:'⛪'},{n:'mosque',e:'🕌'},{n:'temple',e:'🛕'},
    {n:'mountain',e:'⛰️'},{n:'volcano',e:'🌋'},{n:'camping',e:'🏕️'},{n:'beach',e:'🏖️'},{n:'desert',e:'🏜️'},{n:'park',e:'🏞️'},{n:'sunrise',e:'🌅'},{n:'sunset',e:'🌇'},{n:'city',e:'🌃'},{n:'fireworks',e:'🎆'},
    {n:'globe',e:'🌍'},{n:'world_map',e:'🗺️'},{n:'compass',e:'🧭'},{n:'thermometer',e:'🌡️'},{n:'sunny',e:'☀️'},{n:'cloudy',e:'⛅'},{n:'rain',e:'🌧️'},{n:'snow',e:'❄️'},{n:'lightning',e:'⚡'},{n:'rainbow',e:'🌈'},
  ]},
  { id: 'activity', name: 'Activities', icon: '⚽', emojis: [
    {n:'soccer',e:'⚽'},{n:'basketball',e:'🏀'},{n:'football',e:'🏈'},{n:'baseball',e:'⚾'},{n:'tennis',e:'🎾'},{n:'volleyball',e:'🏐'},{n:'rugby',e:'🏉'},{n:'flying_disc',e:'🥏'},{n:'8ball',e:'🎱'},{n:'ping_pong',e:'🏓'},
    {n:'badminton',e:'🏸'},{n:'goal',e:'🥅'},{n:'hockey',e:'🏒'},{n:'lacrosse',e:'🥍'},{n:'cricket_game',e:'🏏'},{n:'golf',e:'⛳'},{n:'bow_arrow',e:'🏹'},{n:'fishing',e:'🎣'},{n:'boxing',e:'🥊'},{n:'martial',e:'🥋'},
    {n:'trophy',e:'🏆'},{n:'medal',e:'🥇'},{n:'silver',e:'🥈'},{n:'bronze',e:'🥉'},{n:'ticket',e:'🎫'},{n:'circus',e:'🎪'},{n:'art',e:'🎨'},{n:'dice',e:'🎲'},{n:'game',e:'🎮'},{n:'joystick',e:'🕹️'},
    {n:'music',e:'🎵'},{n:'notes',e:'🎶'},{n:'microphone',e:'🎤'},{n:'headphones',e:'🎧'},{n:'guitar',e:'🎸'},{n:'piano',e:'🎹'},{n:'violin',e:'🎻'},{n:'drum',e:'🥁'},{n:'movie',e:'🎬'},{n:'clapper',e:'🎞️'},
  ]},
  { id: 'objects', name: 'Objects', icon: '💡', emojis: [
    {n:'bulb',e:'💡'},{n:'flashlight',e:'🔦'},{n:'candle',e:'🕯️'},{n:'money_bag',e:'💰'},{n:'credit_card',e:'💳'},{n:'gem',e:'💎'},{n:'lock',e:'🔒'},{n:'unlock',e:'🔓'},{n:'key',e:'🔑'},{n:'hammer',e:'🔨'},
    {n:'wrench',e:'🔧'},{n:'screwdriver',e:'🪛'},{n:'gear',e:'⚙️'},{n:'link',e:'🔗'},{n:'paperclip',e:'📎'},{n:'scissors',e:'✂️'},{n:'pen',e:'🖊️'},{n:'pencil',e:'✏️'},{n:'memo',e:'📝'},{n:'book',e:'📖'},
    {n:'books',e:'📚'},{n:'label',e:'🏷️'},{n:'envelope',e:'✉️'},{n:'email',e:'📧'},{n:'inbox',e:'📥'},{n:'outbox',e:'📤'},{n:'package',e:'📦'},{n:'calendar',e:'📅'},{n:'clipboard',e:'📋'},{n:'chart',e:'📊'},
    {n:'bar_chart',e:'📈'},{n:'phone',e:'📱'},{n:'computer',e:'💻'},{n:'keyboard',e:'⌨️'},{n:'printer',e:'🖨️'},{n:'camera',e:'📷'},{n:'video',e:'📹'},{n:'tv',e:'📺'},{n:'radio',e:'📻'},{n:'battery',e:'🔋'},
    {n:'electric_plug',e:'🔌'},{n:'magnifying',e:'🔍'},{n:'microscope',e:'🔬'},{n:'telescope',e:'🔭'},{n:'syringe',e:'💉'},{n:'pill',e:'💊'},{n:'bandage',e:'🩹'},{n:'stethoscope',e:'🩺'},{n:'test_tube',e:'🧪'},{n:'dna',e:'🧬'},
  ]},
  { id: 'symbols', name: 'Symbols', icon: '❤️', emojis: [
    {n:'heart',e:'❤️'},{n:'orange_heart',e:'🧡'},{n:'yellow_heart',e:'💛'},{n:'green_heart',e:'💚'},{n:'blue_heart',e:'💙'},{n:'purple_heart',e:'💜'},{n:'black_heart',e:'🖤'},{n:'broken_heart',e:'💔'},{n:'two_hearts',e:'💕'},{n:'sparkling_heart',e:'💖'},
    {n:'heartpulse',e:'💗'},{n:'cupid',e:'💘'},{n:'revolving_hearts',e:'💞'},{n:'heartbeat',e:'💓'},{n:'mending_heart',e:'❤️‍🩹'},{n:'100',e:'💯'},{n:'anger',e:'💢'},{n:'boom',e:'💥'},{n:'dizzy_star',e:'💫'},{n:'speech',e:'💬'},
    {n:'thought',e:'💭'},{n:'zzz',e:'💤'},{n:'wave_sym',e:'🌊'},{n:'droplet',e:'💧'},{n:'fire_sym',e:'🔥'},{n:'star',e:'⭐'},{n:'star2',e:'🌟'},{n:'sparkles',e:'✨'},{n:'zap',e:'⚡'},{n:'sunny_sym',e:'☀️'},
    {n:'check_mark',e:'✅'},{n:'x',e:'❌'},{n:'o',e:'⭕'},{n:'stop',e:'🛑'},{n:'no_entry',e:'⛔'},{n:'warning',e:'⚠️'},{n:'up',e:'⬆️'},{n:'down',e:'⬇️'},{n:'left',e:'⬅️'},{n:'right',e:'➡️'},
    {n:'arrow_up',e:'🔼'},{n:'arrow_down',e:'🔽'},{n:'rewind',e:'⏪'},{n:'fast_forward',e:'⏩'},{n:'repeat',e:'🔁'},{n:'shuffle',e:'🔀'},{n:'new',e:'🆕'},{n:'free',e:'🆓'},{n:'cool_sym',e:'🆒'},{n:'ok_sym',e:'🆗'},
  ]},
]

// ── Emoji map — reaction name → emoji character ─────────────
// Made reactive (ref) so custom workspace emojis can be merged in
const emojiMap = ref({
  thumbsup:'👍', '-1':'👎', heart:'❤️', laugh:'😂', fire:'🔥', eyes:'👀',
  rocket:'🚀', check:'✅', clap:'👏', wave:'👋', tada:'🎉', muscle:'💪',
  think:'🤔', pray:'🙏', hundred:'💯', cry:'😢', wow:'😮', star:'⭐',
  cool:'😎', joy:'😂', sob:'😭', grinning:'😀', smile:'😄', wink:'😉',
  blush:'😊', heart_eyes:'😍', sunglasses:'😎', rage:'😡', confused:'😕',
  sweat_smile:'😅', raised_hands:'🙌', ok_hand:'👌', point_up:'☝️',
  v:'✌️', fist:'✊', handshake:'🤝', skull:'💀', ghost:'👻', robot:'🤖',
  pizza:'🍕', beer:'🍺', coffee:'☕', cake:'🎂', trophy:'🏆', bomb:'💣',
  bulb:'💡', moneybag:'💰', gem:'💎', lock:'🔒', key:'🔑', link:'🔗',
  white_check_mark:'✅', x:'❌', warning:'⚠️', no_entry:'⛔', sos:'🆘',
  new:'🆕', cool_sym:'🆒', information_source:'ℹ️', mega:'📣', loudspeaker:'📢',
})

const slackThemes = ref([
  { id: 'aubergine',  name: 'Aubergine',  sidebarBg: '#4A154B', activeItem: '#1164A3', textColor: '#CFC3CF', mainBg: 'var(--bg-base)' },
  { id: 'ocean',      name: 'Ocean',      sidebarBg: '#1264A3', activeItem: '#0b4c8c', textColor: '#C9DEF0', mainBg: 'var(--bg-base)' },
  { id: 'forest',     name: 'Forest',     sidebarBg: '#1B4332', activeItem: '#40916C', textColor: '#B7E4C7', mainBg: 'var(--bg-base)' },
  { id: 'midnight',   name: 'Midnight',   sidebarBg: '#0F1729', activeItem: '#1264A3', textColor: '#9EAABB', mainBg: 'var(--bg-base)' },
  { id: 'slate',      name: 'Slate',      sidebarBg: '#2C3849', activeItem: '#1164A3', textColor: '#C2CAD4', mainBg: 'var(--bg-base)' },
  { id: 'crimson',    name: 'Crimson',    sidebarBg: '#7B0D1E', activeItem: '#E01E5A', textColor: '#F5C2C7', mainBg: 'var(--bg-base)' },
  { id: 'orion',      name: 'Orion',      sidebarBg: '#0d0d1a', activeItem: '#6366f1', textColor: '#b0b0cc', mainBg: 'var(--bg-base)' },
  { id: 'banana',     name: 'Banana',     sidebarBg: '#F2C94C', activeItem: '#E0A800', textColor: '#1C1C00', mainBg: 'var(--bg-base)' },
  { id: 'clementine', name: 'Clementine', sidebarBg: '#F0541E', activeItem: '#C04000', textColor: '#FDE8E0', mainBg: 'var(--bg-base)' },
  { id: 'jade',       name: 'Jade',       sidebarBg: '#007A5A', activeItem: '#148567', textColor: '#C6EFDF', mainBg: 'var(--bg-base)' },
])
// ── Custom workspace emojis from Slack API ──────────────────
// { 'emoji-name': 'https://...image-url' }
const customEmojis = ref({})

// ── Computed ────────────────────────────────────────────────
const channelsList   = computed(() => channels.value.filter(c => ['public','private','group'].includes(c.type)))
const dmsList        = computed(() => channels.value.filter(c => c.type === 'dm'))
const channelUnread  = computed(() => channelsList.value.reduce((s, c) => s + (c.unread || 0), 0))
const dmUnread       = computed(() => dmsList.value.reduce((s, c) => s + (c.unread || 0), 0))
// const totalUnread    = computed(() => channelUnread.value + dmUnread.value)
const filteredBrowse = computed(() => { const q = browseQ.value.toLowerCase(); return channelsList.value.filter(c => !q || c.name.toLowerCase().includes(q)) })

// ── Load workspace ──────────────────────────────────────────
async function loadAll() {
  loading.value = true
  try {
    const [meRes, chRes, emojiRes] = await Promise.all([
      api.get('/api/slack/me').catch(() => ({ data: null })),
      api.get('/api/slack/channels'),
      api.get('/api/slack/emojis').catch(() => ({ data: { emojis: {} } }))
    ])
    me.value       = meRes.data
    channels.value = chRes.data.channels || []

    // Merge custom workspace emojis into emojiMap
    // Custom emojis are images (URLs) — stored separately for <img> rendering
    const customs = emojiRes.data?.emojis || {}
    customEmojis.value = customs
    for (const name of Object.keys(customs)) {
      if (!emojiMap.value[name]) emojiMap.value[name] = `:${name}:`
    }
  } catch(e) {
    channels.value = []
    console.log(e)
  } finally {
    loading.value = false
  }
}

async function applyModuleContext() {
  const context = store.moduleContext
  if (!context || context.module !== 'slack') return

  if (context.channelId) {
    const channel = channels.value.find((item) => String(item.id) === String(context.channelId))
    if (channel) {
      await openChannel(channel)
    }
  }

  setModuleContext(null)
}

function slackActionState(conversationId) {
  return slackActionMap.value[String(conversationId)] || null
}


// ── Open channel ────────────────────────────────────────────
async function openChannel(ch) {
  if (activeChannelId.value === ch.id) return
  searchMode.value = false
  searchQuery.value = ''
  const previousUnread = Number(ch.unread || 0)
  activeChannelId.value = ch.id
  activeChannel.value = ch
  messages.value = []
  replyingTo.value = null
  messagesLoading.value = true
  const idx = channels.value.findIndex(c => c.id === ch.id)
  if (idx !== -1) channels.value[idx] = { ...channels.value[idx], unread: 0 }
  await nextTick()
  try {
    const res = await api.get(`/api/slack/channels/${ch.id}/messages`, { params: { limit: 50 } })
    messages.value = res.data.messages || []
    if (messages.value.length > 0) lastMsgTs.value = messages.value[messages.value.length - 1].id
    await nextTick(); scrollToBottom()
    if (previousUnread > 0) {
      emitCommunicationPriorityRefresh('communication_read', {
        sourceApp: 'slack',
        conversationId: ch.id,
      })
      refreshSlackActions({ silent: true }).catch(() => {})
    }
  } catch(e) { console.error(e) } finally { messagesLoading.value = false }
}

async function refreshMessages() {
  if (!activeChannelId.value) return
  try {
    const res = await api.get(`/api/slack/channels/${activeChannelId.value}/messages`, { params: { limit: 50 } })
    messages.value = res.data.messages || []
    if (messages.value.length > 0) lastMsgTs.value = messages.value[messages.value.length - 1].id
    await nextTick(); scrollToBottom()
  } catch(e) {console.log(e)}
}

async function openSlackActionConversation(state) {
  let channel = channels.value.find((item) => String(item.id) === String(state.conversationId))
  if (!channel) {
    await loadAll()
    channel = channels.value.find((item) => String(item.id) === String(state.conversationId))
  }
  if (channel) {
    await openChannel(channel)
  }
}

async function draftSlackActionConversation(state) {
  await openSlackActionConversation(state)
  nextTick(() => sendInputRef.value?.focus())
}

async function completeSlackAction(state) {
  try {
    await recordSlackAction(state, 'approved')
  } catch (err) {
    console.error('Failed to complete Slack action:', err.message)
  }
}

async function snoozeSlackAction(state) {
  try {
    await recordSlackAction(state, 'snoozed', { snoozeMinutes: 60 })
  } catch (err) {
    console.error('Failed to snooze Slack action:', err.message)
  }
}

async function dismissSlackAction(state) {
  try {
    await recordSlackAction(state, 'dismissed')
  } catch (err) {
    console.error('Failed to dismiss Slack action:', err.message)
  }
}

// ── FIX 8: Smart polling for real-time messages ─────────────
function startPolling() {
  stopPolling()
  if (!prefs.value.autoRefresh || !activeChannelId.value) return
  pollTimer = setInterval(async () => {
    if (!activeChannelId.value) return
    try {
      const params = { limit: 10 }
      if (lastMsgTs.value) params.oldest = lastMsgTs.value
      const res = await api.get(`/api/slack/channels/${activeChannelId.value}/messages`, { params })
      const newMsgs = (res.data.messages || []).filter(m => !messages.value.find(e => e.id === m.id))
      if (newMsgs.length > 0) {
        messages.value = [...messages.value, ...newMsgs]
        lastMsgTs.value = newMsgs[newMsgs.length - 1].id
        await nextTick()
        const el = messagesRef.value
        if (el) {
          const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
          if (nearBottom) scrollToBottom()
        }
        // Browser notification if window not focused
        if (prefs.value.notifications && document.hidden) {
          showBrowserNotif(newMsgs[newMsgs.length - 1])
        }
      }
      // Also update unread counts in channel list
      const unreadRes = await api.get('/api/slack/unread').catch(() => null)
      if (unreadRes?.data?.unreadChannels) {
        for (const u of unreadRes.data.unreadChannels) {
          const idx = channels.value.findIndex(c => c.id === u.id)
          if (idx !== -1 && u.id !== activeChannelId.value) {
            channels.value[idx] = { ...channels.value[idx], unread: u.unread }
          }
        }
      }
    } catch(e) {console.log(e)}
  }, prefs.value.pollInterval * 1000)
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

function resetPoll() {
  if (prefs.value.autoRefresh) startPolling()
}

function toggleAutoRefresh() {
  prefs.value.autoRefresh = !prefs.value.autoRefresh
  prefs.value.autoRefresh ? startPolling() : stopPolling()
}

watch(activeChannelId, (newId) => {
  lastMsgTs.value = null
  if (newId && prefs.value.autoRefresh) startPolling()
  else stopPolling()
})

function showBrowserNotif(msg) {
  if (Notification.permission !== 'granted') return
  new Notification(`${msg.fromName} in ${activeChannel.value?.name || 'Slack'}`, {
    body: msg.text?.slice(0, 80) || 'New message',
    icon: '/favicon.ico',
    tag: 'slack-orion',
  })
}

async function toggleNotifications() {
  prefs.value.notifications = !prefs.value.notifications
  if (prefs.value.notifications && 'Notification' in window) {
    await Notification.requestPermission()
  }
}

// ── Send message ────────────────────────────────────────────
async function sendMessage() {
  const text = sendText.value.trim()
  if ((!text && !attachments.value.length) || sending.value) return
  sending.value = true
  const tmpId = `tmp_${Date.now()}`
  messages.value.push({
    id: tmpId, text, date: new Date().toISOString(),
    fromMe: true, fromName: me.value?.displayName || 'You',
    replyTo: replyingTo.value ? { id: replyingTo.value.id, fromName: replyingTo.value.fromName, text: replyingTo.value.text } : null,
    file: attachments.value[0] ? { name: attachments.value[0].name, size: formatFileSize(attachments.value[0].size), url: '#' } : null,
  })
  const savedReply = replyingTo.value
  sendText.value = ''; replyingTo.value = null; attachments.value = []
  resetHeight(); await nextTick(); scrollToBottom()
  try {
    const res = await api.post(`/api/slack/channels/${activeChannelId.value}/send`, { message: text, replyTo: savedReply })
    const idx = messages.value.findIndex(m => m.id === tmpId)
    if (idx !== -1 && res.data.message) messages.value.splice(idx, 1, { ...res.data.message, replyTo: savedReply })
    if (messages.value.length > 0) lastMsgTs.value = messages.value[messages.value.length - 1].id
    emitCommunicationPriorityRefresh('communication_replied', {
      sourceApp: 'slack',
      conversationId: activeChannelId.value,
    })
    refreshSlackActions({ silent: true }).catch(() => {})
  } catch(e) {
    messages.value = messages.value.filter(m => m.id !== tmpId)
    sendText.value = text
    console.log(e)
  } finally { sending.value = false }
}

// ── Pin / Unpin ─────────────────────────────────────────────
async function pinMsg(msg) {
  try {
    await api.post(`/api/slack/channels/${activeChannelId.value}/pin`, { ts: msg.id })
    const m = messages.value.find(m => m.id === msg.id); if (m) m.isPinned = true
  } catch(e) { console.error(e) }
}
async function unpinMsg(msgId) {
  try {
    await api.post(`/api/slack/channels/${activeChannelId.value}/unpin`, { ts: msgId })
    const m = messages.value.find(m => m.id === msgId); if (m) m.isPinned = false
  } catch(e) { console.error(e) }
}

// ── Reactions ───────────────────────────────────────────────
async function addReaction(msgId, name) {
  emojiFor.value = null
  try {
    await api.post(`/api/slack/messages/${msgId}/react`, { emoji: name, channelId: activeChannelId.value })
    await refreshMessages()
  } catch(e) {console.log(e)}
}

// ── Reply ───────────────────────────────────────────────────
function setReplyTo(msg) {
  replyingTo.value = msg
  nextTick(() => sendInputRef.value?.focus())
}

// ── File attachment ─────────────────────────────────────────
function onFileChange(e) {
  for (const f of e.target.files) attachments.value.push({ name: f.name, size: f.size, file: f })
  e.target.value = ''
}

// ── Huddle (Fix 7) ──────────────────────────────────────────
async function startHuddle() {
  if (!activeChannel.value) { alert('Open a channel or DM first to start a huddle.'); return }
  huddleActive.value = !huddleActive.value
  if (huddleActive.value) {
    try {
      const res = await api.post('/api/slack/huddle/start', { channelId: activeChannelId.value })
      if (res.data.webUrl) window.open(res.data.webUrl, '_blank')
    } catch(e) {
      // Fallback: open Slack deep link
      const url = `https://app.slack.com/huddle/${me.value?.teamId || ''}/${activeChannelId.value}`
      window.open(url, '_blank')
      console.log(e)
    }
  }
}

// ── FIX 3: Status actions ───────────────────────────────────
function openStatusModal() {
  statusDraft.value = { ...userStatus.value }
  modal.value = 'updateStatus'
  profileMenuOpen.value = false
}
async function saveStatus() {
  userStatus.value = { ...statusDraft.value }
  try { await api.post('/api/slack/status/update', statusDraft.value) } catch(e) {console.log(e)}
}
async function clearStatus() {
  userStatus.value = { emoji: '', text: '' }
  statusDraft.value = { emoji: '', text: '' }
  try { await api.post('/api/slack/status/update', { emoji: '', text: '' }) } catch(e) {console.log(e) }
}

// ── FIX 4: Away toggle ──────────────────────────────────────
async function toggleAway() {
  isAway.value = !isAway.value
  try { await api.post('/api/slack/status/away', { away: isAway.value }) } catch(e) {console.log(e)}
}

// ── Preferences ─────────────────────────────────────────────
function savePrefs() {
  localStorage.setItem('orion_slack_prefs', JSON.stringify(prefs.value))
  resetPoll()
}
function loadPrefs() {
  try {
    const s = JSON.parse(localStorage.getItem('orion_slack_prefs') || '{}')
    prefs.value = { ...prefs.value, ...s }
    // Restore saved slack theme
    if (prefs.value.slackTheme) {
      const t = slackThemes.value.find(t => t.id === prefs.value.slackTheme)
      const activeTheme = computed(() =>
  slackThemes.value.find(t => t.id === prefs.value.slackTheme) || slackThemes.value[0]
)
      if (t) activeTheme.value = t
    }
  } catch {console.log('Failed to load preferences')}
}

// ── Create channel / DM ─────────────────────────────────────
async function createChannel() {
  if (!newCh.value.name.trim()) return
  creatingCh.value = true
  try {
    const name = newCh.value.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '')
    await api.post('/api/slack/channels/create', { name, description: newCh.value.desc, isPrivate: newCh.value.private })
    modal.value = null; newCh.value = { name: '', desc: '', private: false }; await loadAll()
  } catch(e) { alert(`Failed: ${e.response?.data?.error || e.message}`) } finally { creatingCh.value = false }
}
async function startDM() {
  if (!newDmUser.value.trim()) return
  startingDM.value = true
  try {
    const res = await api.post('/api/slack/dm/open', { username: newDmUser.value })
    modal.value = null; newDmUser.value = ''; await loadAll()
    const ch = channels.value.find(c => c.id === res.data.channelId); if (ch) openChannel(ch)
  } catch(e) { alert(`Failed: ${e.response?.data?.error || e.message}`) } finally { startingDM.value = false }
}

// ── Message menu ────────────────────────────────────────────
function openMsgMenu(msg, e) {
  msgMenu.value = { open: true, msg, x: Math.min(e.clientX, window.innerWidth - 190), y: Math.min(e.clientY, window.innerHeight - 180) }
}
function copyMsg() { navigator.clipboard.writeText(msgMenu.value.msg?.text || '').catch(() => {}); msgMenu.value.open = false }
function deleteMsg() { messages.value = messages.value.filter(m => m.id !== msgMenu.value.msg?.id); msgMenu.value.open = false }

// ── Search ──────────────────────────────────────────────────
function onSearchInput() {
  clearTimeout(searchTimer)
  if (!searchQuery.value.trim()) { searchMode.value = false; searchResults.value = []; return }
  searchMode.value = true; searchLoading.value = true
  searchTimer = setTimeout(async () => {
    try { const res = await api.get('/api/slack/search', { params: { q: searchQuery.value } }); searchResults.value = res.data.messages || [] }
    catch { searchResults.value = [] } finally { searchLoading.value = false }
  }, 400)
}
function clearSearch() { searchQuery.value = ''; searchMode.value = false; searchResults.value = [] }
async function jumpToChannel(r) {
  const ch = channels.value.find(c => c.id === r.channelId) || { id: r.channelId, name: r.channelName, type: 'channel' }
  clearSearch(); await openChannel(ch)
}

// ── Formatting helpers ──────────────────────────────────────
function wrapText(b, a) {
  if (!sendInputRef.value) return
  const el = sendInputRef.value, s = el.selectionStart, e = el.selectionEnd
  const sel = sendText.value.slice(s, e) || 'text'
  sendText.value = sendText.value.slice(0, s) + b + sel + a + sendText.value.slice(e)
  nextTick(() => { el.focus(); el.setSelectionRange(s + b.length, s + b.length + sel.length) })
}
function insertBullet() {
  sendText.value += (sendText.value.endsWith('\n') || !sendText.value ? '' : '\n') + '• '
  nextTick(() => sendInputRef.value?.focus())
}
function insertEmoji(em) { sendText.value += em; nextTick(() => sendInputRef.value?.focus()) }

// ── Modal helper ────────────────────────────────────────────
function openModal(name) { modal.value = name; wsMenuOpen.value = false; profileMenuOpen.value = false }

// ── Close all popups ────────────────────────────────────────
function closeAllPopups() {
  wsMenuOpen.value = false
  profileMenuOpen.value = false
  msgMenu.value.open = false
  emojiFor.value = null
}

// ── Scroll ──────────────────────────────────────────────────
function scrollToBottom() { if (messagesRef.value) messagesRef.value.scrollTop = messagesRef.value.scrollHeight }
function scrollToMsg(id) { const el = document.getElementById(`msg-${id}`); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
function autoResize(e) { const el = e?.target || sendInputRef.value; if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 140) + 'px' }
function resetHeight() { if (sendInputRef.value) sendInputRef.value.style.height = 'auto' }

// ── Date / time ─────────────────────────────────────────────
function showDateSep(i) { if (i === 0) return true; return new Date(messages.value[i-1].date).toDateString() !== new Date(messages.value[i].date).toDateString() }
function formatDate(iso) { if (!iso) return ''; const d = new Date(iso), t = new Date(); if (d.toDateString() === t.toDateString()) return 'Today'; const y = new Date(t); y.setDate(t.getDate()-1); if (d.toDateString() === y.toDateString()) return 'Yesterday'; return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) }
function formatTime(iso) { if (!iso) return ''; return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) }
function formatFileSize(b) { if (!b) return ''; if (b < 1024) return b + 'B'; if (b < 1048576) return (b/1024).toFixed(1)+'KB'; return (b/1048576).toFixed(1)+'MB' }
function fileEmoji(n = '') { const e = n.split('.').pop().toLowerCase(); const m = {pdf:'📄',doc:'📝',docx:'📝',xls:'📊',xlsx:'📊',ppt:'📑',pptx:'📑',png:'🖼️',jpg:'🖼️',jpeg:'🖼️',gif:'🎞️',mp4:'🎬',mp3:'🎵',zip:'📦',js:'⚙️',ts:'⚙️',py:'🐍',json:'🗂️',csv:'📋',txt:'📃',sql:'🗄️'}; return m[e] || '📎' }
function formatSlackText(text) {
  if (!text) return ''
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*(.+?)\*/g,'<strong>$1</strong>').replace(/_(.+?)_/g,'<em>$1</em>')
    .replace(/`(.+?)`/g,'<code>$1</code>').replace(/~(.+?)~/g,'<del>$1</del>')
    .replace(/^> (.+)/gm,'<blockquote>$1</blockquote>').replace(/\n/g,'<br/>')
    .replace(/&lt;(https?:\/\/[^|>]+)\|([^>]+)&gt;/g,'<a href="$1" target="_blank" rel="noopener">$2</a>')
    .replace(/&lt;(https?:\/\/[^>]+)&gt;/g,'<a href="$1" target="_blank" rel="noopener">$1</a>')
}

const COLORS  = ['#E01E5A','#36C5F0','#2EB67D','#ECB22E','#6366f1','#1264A3','#e67e22','#9b59b6']
const SCOLORS = ['#36C5F0','#2EB67D','#ECB22E','#E01E5A','#a78bfa','#34d399','#f472b6','#60a5fa']
function avatarColor(n) { if (!n) return '#6366f1'; let h = 0; for (const c of n) h = (h*31+c.charCodeAt(0))&0xffffffff; return COLORS[Math.abs(h)%COLORS.length] }
function senderColor(n) { if (!n) return 'var(--text-primary)'; let h = 0; for (const c of n) h = (h*31+c.charCodeAt(0))&0xffffffff; return SCOLORS[Math.abs(h)%SCOLORS.length] }

// ── Keyboard shortcuts ──────────────────────────────────────
function onKeyDown(e) {
  if (e.key === 'Escape') { closeAllPopups(); modal.value = null; replyingTo.value = null }
}

onMounted(async () => {
  await loadAll()
  await refreshSlackActions()
  await applyModuleContext()
  loadPrefs()
  document.addEventListener('keydown', onKeyDown)
  if (prefs.value.autoRefresh && activeChannelId.value) startPolling()
})
onUnmounted(() => {
  document.removeEventListener('keydown', onKeyDown)
  stopPolling()
})
</script>

<style scoped>
/* Root */
.sl-root {
  height:100%;
  display:flex;
  overflow:hidden;
  background:
    radial-gradient(circle at 16% 10%, rgba(82, 212, 255, 0.08), transparent 24%),
    linear-gradient(180deg, var(--bg-base-alt, var(--bg-base)), var(--bg-base));
  font-family:var(--font-ui);
  position:relative;
  color:var(--text-primary);
}

/* ── Sidebar ─────────────────────────────────────────────── */
.sl-sidebar { width:258px; flex-shrink:0; background:rgba(8, 13, 28, 0.64); border-right:1px solid var(--border-subtle); display:flex; flex-direction:column; overflow:hidden; backdrop-filter:blur(20px); }
.sl-sidebar-list-scroll { flex:1; min-height:0; overflow-y:auto; padding-bottom:4px; scrollbar-width:thin; }
.sl-action-panel-wrap { padding: 0 10px 8px; flex-shrink:0; }
.sl-sidebar :deep(.comm-insights) { background: var(--bg-base); }
.sl-sidebar :deep(.comm-panel) { background: var(--bg-base); }
.sl-action-chip {
  display:inline-flex; align-items:center; justify-content:center;
  padding:3px 7px; border-radius:999px;
  font-size:9px; font-weight:700;
  background:rgba(148,163,184,.16);
  color:var(--text-secondary);
}
.sl-action-chip.state-waiting_on_your_reply { background:rgba(245,158,11,.14); color:#b45309; }
.sl-action-chip.state-needs_approval { background:rgba(239,68,68,.14); color:#b91c1c; }
.sl-action-chip.state-needs_follow_up { background:rgba(14,165,233,.14); color:#0369a1; }
.sl-action-chip.state-waiting_on_others { background:rgba(16,185,129,.14); color:#047857; }

/* Workspace header */
.sl-ws-header { padding:8px 10px 6px; border-bottom:1px solid var(--border-subtle); flex-shrink:0; position:relative; }
.sl-ws-btn { display:flex; align-items:center; gap:8px; padding:5px 7px; border-radius:7px; cursor:pointer; transition:background 0.1s; }
.sl-ws-btn:hover { background:rgba(255,255,255,0.05); }
.sl-ws-icon-box { width:26px; height:26px; background:rgba(224,30,90,0.1); border-radius:5px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.sl-ws-name { font-size:13px; font-weight:700; color:var(--text-primary); flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.sl-ws-dropdown { position:absolute; top:calc(100% + 4px); left:8px; right:8px; background:var(--surface-glass-strong); border:1px solid var(--border-default); border-radius:18px; padding:8px; z-index:100; box-shadow:var(--shadow-lg); backdrop-filter:blur(20px); }
.sl-dd-workspace-info { display:flex; align-items:center; gap:10px; padding:8px 10px 6px; }
.sl-dd-ws-icon { width:32px; height:32px; background:rgba(224,30,90,0.1); border-radius:7px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.sl-dd-item { display:flex; align-items:center; gap:9px; padding:7px 10px; border-radius:6px; cursor:pointer; font-size:13px; color:var(--text-primary); transition:background 0.1s; }
.sl-dd-item:hover { background:rgba(255,255,255,0.06); }
.sl-dd-danger { color:var(--danger); }
.sl-dd-danger:hover { background:rgba(239,68,68,0.08); }
.sl-dd-divider { height:1px; background:var(--border-subtle); margin:5px 0; }

/* FIX 6: Sidebar action buttons */
.sl-sidebar-actions { display:flex; gap:5px; padding:8px 10px 6px; border-bottom:1px solid var(--border-subtle); flex-shrink:0; }
.sl-sidebar-action-btn { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; padding:7px 4px; background:rgba(255,255,255,.03); border:1px solid var(--border-default); border-radius:14px; color:var(--text-muted); cursor:pointer; font-family:inherit; transition:all 0.1s; }
.sl-sidebar-action-btn:hover { background:rgba(255,255,255,0.05); color:var(--text-primary); border-color:var(--border-strong); }
.sl-sidebar-action-btn.active { background:rgba(82,212,255,0.1); color:var(--accent-hover); border-color:rgba(82,212,255,0.22); }
.sl-sidebar-action-btn span { font-size:10px; font-weight:500; }

/* Search */
.sl-search-wrap { position:relative; padding:7px 9px 5px; flex-shrink:0; display:flex; align-items:center; }
.sl-search-ico { position:absolute; left:17px; color:var(--text-muted); pointer-events:none; }
.sl-search { width:100%; padding:8px 22px 8px 24px; background:rgba(255,255,255,.045); border:1px solid var(--border-default); border-radius:999px; color:var(--text-primary); font-size:11.5px; outline:none; box-sizing:border-box; transition:border-color 0.15s, box-shadow 0.15s; backdrop-filter:blur(14px); }
.sl-search:focus { border-color:rgba(82,212,255,0.24); box-shadow:0 0 0 4px rgba(82,212,255,0.08); }
.sl-search::placeholder { color:var(--text-muted); }
.sl-search-clear { position:absolute; right:14px; background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:12px; }

/* Sections */
.sl-section-hdr { display:flex; align-items:center; gap:5px; padding:6px 9px 2px; cursor:pointer; font-size:10.5px; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; flex-shrink:0; }
.sl-section-hdr:hover { color:var(--text-primary); }
.sl-section-hdr:hover .sl-section-plus { opacity:1; }
.sl-section-label { flex:1; }
.sl-chevron { transition:transform 0.15s; flex-shrink:0; }
.sl-chevron:not(.open) { transform:rotate(-90deg); }
.sl-badge-pill { background:rgba(99,102,241,0.2); color:var(--accent); font-size:9px; font-weight:700; min-width:15px; height:15px; border-radius:7.5px; display:flex; align-items:center; justify-content:center; padding:0 3px; }
.sl-badge-red { background:rgba(224,30,90,0.15); color:#E01E5A; font-size:9px; font-weight:700; min-width:15px; height:15px; border-radius:7.5px; display:flex; align-items:center; justify-content:center; padding:0 3px; flex-shrink:0; }
.sl-section-plus { width:16px; height:16px; background:none; border:none; color:var(--text-muted); cursor:pointer; border-radius:3px; opacity:0; font-size:16px; display:flex; align-items:center; justify-content:center; line-height:1; transition:opacity 0.1s, background 0.1s; }
.sl-section-plus:hover { background:rgba(255,255,255,0.08); color:var(--text-primary); }

/* Channel list */
.sl-ch-list { overflow:visible; flex-shrink:0; max-height:none; }
.sl-ch-empty { padding:4px 13px; font-size:11px; color:var(--text-muted); }
.sl-ch-item { display:flex; align-items:center; gap:5px; padding:3px 9px; cursor:pointer; border-radius:5px; margin:0 4px; transition:background 0.1s; min-height:26px; }
.sl-ch-item:hover { background:rgba(255,255,255,0.04); }
.sl-ch-item.active { background:rgba(82,212,255,.1); }
.sl-ch-item.active .sl-ch-label { color:var(--text-primary); font-weight:600; }
.sl-ch-sigil { font-size:12px; color:var(--text-muted); flex-shrink:0; }
.sl-ch-label { flex:1; font-size:12.5px; color:var(--text-secondary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.sl-ch-label.bold { color:var(--text-primary); font-weight:600; }
.sl-ch-add { opacity:0.6; }
.sl-ch-add:hover { opacity:1; }
.sl-dm-item { gap:7px; }
.sl-dm-ava { width:20px; height:20px; border-radius:4px; display:flex; align-items:center; justify-content:center; font-size:9px; font-weight:700; color:white; flex-shrink:0; }
.sl-sidebar-loading { padding:10px 13px; font-size:12px; color:var(--text-muted); display:flex; align-items:center; gap:7px; }

/* User bar */
.sl-user-bar { margin-top:auto; display:flex; align-items:center; gap:8px; padding:8px 10px; border-top:1px solid var(--border-subtle); cursor:pointer; transition:background 0.1s; flex-shrink:0; position:relative; }
.sl-user-bar:hover { background:rgba(255,255,255,0.03); }
.sl-user-ava { width:27px; height:27px; border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; color:white; flex-shrink:0; }
.sl-user-name { font-size:12.5px; font-weight:600; color:var(--text-primary); }
.sl-user-status { display:flex; align-items:center; gap:4px; font-size:10px; color:var(--text-muted); }
.sl-dot { width:7px; height:7px; border-radius:50%; display:inline-block; flex-shrink:0; background:var(--text-muted); }
.sl-dot.green { background:#2EB67D; }
.sl-dot.yellow { background:#ECB22E; }

/* Profile popup */
.sl-profile-popup { position:absolute; bottom:calc(100% + 6px); left:0; right:0; background:var(--surface-glass-strong); border:1px solid var(--border-default); border-radius:18px; padding:8px; z-index:100; box-shadow:var(--shadow-lg); backdrop-filter:blur(20px); }
.sl-pp-header { display:flex; align-items:center; gap:10px; padding:7px 8px; }
.sl-pp-ava { width:36px; height:36px; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:15px; font-weight:700; color:white; flex-shrink:0; }
.sl-pp-name { font-size:13.5px; font-weight:700; color:var(--text-primary); }
.sl-pp-team { font-size:11px; color:var(--text-muted); }
.sl-pp-status-row { display:flex; align-items:center; gap:7px; padding:6px 8px; cursor:pointer; border-radius:6px; transition:background 0.1s; }
.sl-pp-status-row:hover { background:rgba(255,255,255,0.05); }
.sl-pp-status-txt { flex:1; font-size:12px; color:var(--text-secondary); }
.sl-pp-update-btn { font-size:11px; color:var(--accent); background:none; border:1px solid var(--border-default); border-radius:5px; padding:2px 8px; cursor:pointer; white-space:nowrap; }

/* ── Main area ───────────────────────────────────────────── */
.sl-main { flex:1; display:flex; flex-direction:column; overflow:hidden; }

/* Topbar */
.sl-topbar { display:flex; align-items:center; gap:8px; padding:10px 16px; background:rgba(8, 13, 28, 0.48); border-bottom:1px solid var(--border-subtle); flex-shrink:0; min-height:46px; font-size:12.5px; color:var(--text-muted); backdrop-filter:blur(16px); }

/* Chat header */
.sl-chat-header { display:flex; align-items:center; gap:9px; padding:10px 15px; background:rgba(8, 13, 28, 0.42); border-bottom:1px solid var(--border-subtle); flex-shrink:0; backdrop-filter:blur(16px); }
.sl-ch-ava-sm { width:24px; height:24px; border-radius:5px; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:700; color:white; flex-shrink:0; }
.sl-ch-hash { font-size:17px; font-weight:300; color:var(--text-muted); flex-shrink:0; line-height:1; }
.sl-chat-hdr-info { flex:1; min-width:0; }
.sl-chat-hdr-name { font-size:13.5px; font-weight:700; color:var(--text-primary); }
.sl-chat-hdr-sub { font-size:10.5px; color:var(--text-muted); }
.sl-chat-hdr-actions { display:flex; align-items:center; gap:5px; flex-shrink:0; }
.sl-hdr-btn { display:flex; align-items:center; gap:6px; padding:6px 11px; background:rgba(255,255,255,.035); border:1px solid var(--border-default); border-radius:999px; color:var(--text-secondary); font-size:12px; cursor:pointer; font-family:inherit; transition:all 0.1s; white-space:nowrap; }
.sl-hdr-btn:hover { background:rgba(255,255,255,0.05); color:var(--text-primary); border-color:var(--border-strong); }
.sl-hdr-btn.huddle-on { background:rgba(46,182,125,0.15); border-color:#2EB67D; color:#2EB67D; }
.sl-hdr-icon-btn { width:31px; height:31px; background:rgba(255,255,255,.035); border:1px solid var(--border-default); border-radius:999px; color:var(--text-muted); cursor:pointer; display:flex; align-items:center; justify-content:center; text-decoration:none; transition:all 0.1s; }
.sl-hdr-icon-btn:hover { background:rgba(255,255,255,0.06); color:var(--text-primary); border-color:var(--border-strong); }

/* Huddle banner */
.sl-huddle-banner { display:flex; align-items:center; gap:10px; padding:8px 16px; background:rgba(46,182,125,0.1); border-bottom:1px solid rgba(46,182,125,0.3); font-size:13px; color:#2EB67D; flex-shrink:0; }
.sl-huddle-join-btn { margin-left:auto; padding:4px 12px; background:rgba(46,182,125,0.2); border:1px solid rgba(46,182,125,0.4); border-radius:6px; color:#2EB67D; font-size:12px; text-decoration:none; cursor:pointer; }
.sl-huddle-leave-btn { padding:4px 12px; background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.3); border-radius:6px; color:#ef4444; font-size:12px; cursor:pointer; }

/* Search results */
.sl-search-results-pane { flex:1; overflow-y:auto; padding:8px; }
.sl-sr-card { padding:10px 12px; background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:8px; margin-bottom:6px; cursor:pointer; transition:border-color 0.1s; }
.sl-sr-card:hover { border-color:var(--accent); }
.sl-sr-meta { display:flex; align-items:center; gap:8px; margin-bottom:3px; }
.sl-sr-ch { font-size:11px; font-weight:600; color:var(--accent); }
.sl-sr-from { font-size:11px; font-weight:600; color:var(--text-primary); }
.sl-sr-time { font-size:10px; color:var(--text-muted); margin-left:auto; }
.sl-sr-text { font-size:12.5px; color:var(--text-secondary); line-height:1.4; }

/* Messages */
.sl-messages { flex:1; overflow-y:auto; padding:12px 16px; display:flex; flex-direction:column; gap:0; scrollbar-width:thin; }
.sl-welcome { padding:20px 0 30px; }
.sl-welcome-ava { width:52px; height:52px; border-radius:11px; display:flex; align-items:center; justify-content:center; margin-bottom:10px; }
.sl-welcome-title { font-size:19px; font-weight:700; color:var(--text-primary); margin-bottom:5px; }
.sl-welcome-sub { font-size:13px; color:var(--text-muted); }
.sl-date-sep { display:flex; align-items:center; gap:10px; padding:12px 0 6px; font-size:10.5px; color:var(--text-muted); font-weight:600; text-transform:uppercase; letter-spacing:0.05em; }
.sl-date-sep::before,.sl-date-sep::after { content:''; flex:1; height:1px; background:var(--border-subtle); }

/* Reply context bar */
.sl-reply-ctx { display:flex; align-items:center; gap:7px; padding:2px 8px 0 10px; cursor:pointer; font-size:11.5px; color:var(--text-muted); margin-left:38px; }
.sl-reply-ctx:hover { color:var(--text-primary); }
.sl-reply-bar { width:3px; height:13px; background:var(--border-strong); border-radius:2px; flex-shrink:0; }
.sl-reply-ava-xs { width:15px; height:15px; border-radius:3px; display:flex; align-items:center; justify-content:center; font-size:8px; font-weight:700; color:white; flex-shrink:0; }
.sl-reply-name { font-weight:600; color:var(--text-secondary); }
.sl-reply-preview { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

/* Message */
.sl-msg { display:flex; gap:9px; align-items:flex-start; padding:3px 5px; border-radius:7px; transition:background 0.1s; position:relative; }
.sl-msg:hover { background:rgba(255,255,255,0.04); }
.sl-msg-ava { width:29px; height:29px; border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; color:white; flex-shrink:0; margin-top:2px; }
.sl-msg-body { flex:1; min-width:0; padding-right:82px; }
.sl-msg-hdr { display:flex; align-items:baseline; gap:7px; margin-bottom:2px; }
.sl-msg-name { font-size:13px; font-weight:700; cursor:pointer; }
.sl-msg-name:hover { text-decoration:underline; }
.sl-msg-ts { font-size:10px; color:var(--text-muted); }
.sl-pin-badge { font-size:10px; }
.sl-msg-txt { font-size:13.5px; color:var(--text-primary); line-height:1.5; word-break:break-word; }
.sl-msg-txt :deep(code) { background:rgba(255,255,255,0.08); padding:1px 5px; border-radius:3px; font-size:12px; font-family:var(--font-mono); }
.sl-msg-txt :deep(a) { color:#36C5F0; text-decoration:none; }
.sl-msg-txt :deep(a:hover) { text-decoration:underline; }
.sl-msg-txt :deep(strong) { color:var(--text-primary); }
.sl-msg-txt :deep(blockquote) { border-left:3px solid var(--border-strong); padding-left:10px; color:var(--text-secondary); margin:3px 0; }

/* File in message */
.sl-msg-file { display:flex; align-items:center; gap:9px; background:var(--bg-elevated); border:1px solid var(--border-subtle); border-radius:8px; padding:8px 11px; margin-top:5px; max-width:300px; }
.sl-file-icon-sm { font-size:20px; flex-shrink:0; }
.sl-file-name-sm { font-size:12.5px; font-weight:600; color:var(--text-primary); }
.sl-file-size-sm { font-size:11px; color:var(--text-muted); }
.sl-btn-xs { padding:3px 9px; background:var(--bg-overlay); border:1px solid var(--border-default); border-radius:5px; color:var(--text-primary); font-size:11.5px; text-decoration:none; cursor:pointer; white-space:nowrap; }

/* Reactions */
.sl-reactions { display:flex; flex-wrap:wrap; gap:4px; margin-top:4px; }
.sl-reaction { background:rgba(255,255,255,0.06); border:1px solid var(--border-subtle); border-radius:11px; padding:2px 7px; font-size:12px; cursor:pointer; transition:background 0.1s; display:flex; align-items:center; gap:3px; }
.sl-reaction:hover { background:var(--accent-dim); border-color:var(--accent); }
.sl-add-reaction { padding:2px 8px; color:var(--text-muted); font-size:14px; }
.sl-thread-link { display:flex; align-items:center; gap:4px; margin-top:4px; font-size:11.5px; color:#36C5F0; cursor:pointer; font-weight:600; }
.sl-thread-link:hover { text-decoration:underline; }

/* Message toolbar */
.sl-msg-toolbar { position:absolute; right:5px; top:2px; display:flex; gap:2px; background:var(--surface-glass-strong); border:1px solid var(--border-default); border-radius:14px; padding:4px; box-shadow:var(--shadow-md); z-index:10; backdrop-filter:blur(18px); }
.sl-tb-btn { width:26px; height:26px; background:none; border:none; cursor:pointer; border-radius:5px; color:var(--text-muted); font-size:13px; display:flex; align-items:center; justify-content:center; transition:background 0.1s; }
.sl-tb-btn:hover { background:rgba(255,255,255,0.08); color:var(--text-primary); }

/* Send bar */
.sl-sendbar { flex-shrink:0; background:rgba(8, 13, 28, 0.52); border-top:1px solid var(--border-subtle); padding:8px 13px 12px; position:relative; backdrop-filter:blur(18px); }
.sl-reply-banner { display:flex; align-items:center; gap:7px; padding:5px 10px; background:var(--accent-dim); border:1px solid rgba(99,102,241,0.2); border-radius:7px; margin-bottom:6px; font-size:12px; color:var(--text-secondary); }
.sl-reply-cancel { background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:14px; margin-left:auto; padding:0 2px; }
.sl-reply-cancel:hover { color:var(--text-primary); }
.sl-fmt-toolbar { display:flex; align-items:center; gap:2px; margin-bottom:5px; flex-wrap:wrap; }
.sl-fmt-btn { width:26px; height:24px; background:none; border:none; cursor:pointer; border-radius:4px; color:var(--text-muted); display:flex; align-items:center; justify-content:center; font-size:12px; transition:background 0.1s; font-family:inherit; }
.sl-fmt-btn:hover,.sl-fmt-btn.active { background:rgba(255,255,255,0.08); color:var(--text-primary); }
.sl-fmt-sep { width:1px; height:14px; background:var(--border-subtle); margin:0 3px; }
.sl-send-box { background:rgba(255,255,255,.04); border:1px solid var(--border-default); border-radius:20px; overflow:hidden; transition:border-color 0.15s, box-shadow 0.15s; backdrop-filter:blur(16px); }
.sl-send-box.focused { border-color:rgba(82,212,255,0.24); box-shadow:0 0 0 4px rgba(82,212,255,0.08); }
.sl-att-chips { display:flex; flex-wrap:wrap; gap:5px; padding:7px 12px 0; }
.sl-att-chip { display:flex; align-items:center; gap:5px; background:var(--bg-overlay); border:1px solid var(--border-default); border-radius:18px; padding:3px 9px; font-size:12px; color:var(--text-secondary); }
.sl-att-chip button { background:none; border:none; cursor:pointer; color:var(--text-muted); font-size:12px; margin-left:2px; }
.sl-send-ta { width:100%; padding:9px 13px 4px; background:transparent; border:none; outline:none; color:var(--text-primary); font-size:13.5px; resize:none; line-height:1.5; min-height:34px; max-height:140px; box-sizing:border-box; font-family:inherit; }
.sl-send-ta::placeholder { color:var(--text-muted); }
.sl-send-foot { display:flex; align-items:center; justify-content:space-between; padding:3px 8px 8px 13px; }
.sl-send-hint { font-size:10px; color:var(--text-muted); }
.sl-send-btn { width:34px; height:34px; background:linear-gradient(135deg, rgba(82,212,255,.94), rgba(139,125,255,.84)); border:1px solid rgba(255,255,255,.12); border-radius:999px; color:white; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:opacity 0.15s, transform 0.1s; }
.sl-send-btn:hover:not(:disabled) { opacity:0.92; transform:translateY(-1px) scale(1.02); }
.sl-send-btn:disabled { opacity:0.3; cursor:not-allowed; transform:none; }
.sl-file-input { display:none; }

/* Context menu */
.sl-ctx-menu { position:fixed; z-index:1000; background:var(--surface-glass-strong); border:1px solid var(--border-default); border-radius:18px; padding:6px; box-shadow:var(--shadow-lg); min-width:175px; backdrop-filter:blur(18px); }
.sl-ctx-item { display:flex; align-items:center; gap:9px; padding:7px 11px; border-radius:6px; cursor:pointer; font-size:13px; color:var(--text-primary); transition:background 0.1s; }
.sl-ctx-item:hover { background:rgba(255,255,255,0.06); }
.sl-ctx-item.danger { color:var(--danger); }
.sl-ctx-item.danger:hover { background:rgba(239,68,68,0.1); }
.sl-ctx-divider { height:1px; background:var(--border-subtle); margin:4px 0; }

/* Modals */
.sl-modal-bg { position:absolute; inset:0; z-index:200; background:rgba(0,0,0,0.65); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; }
.sl-modal { background:var(--surface-glass-strong); border:1px solid var(--border-default); border-radius:22px; width:450px; max-width:90vw; box-shadow:var(--shadow-lg); overflow:hidden; backdrop-filter:blur(20px); }
.sl-modal.lg { width:560px; }
.sl-modal-hdr { display:flex; align-items:center; justify-content:space-between; padding:15px 20px; border-bottom:1px solid var(--border-subtle); font-size:15px; font-weight:700; color:var(--text-primary); }
.sl-modal-close { background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:16px; padding:2px 6px; border-radius:5px; }
.sl-modal-close:hover { background:rgba(255,255,255,0.06); }
.sl-modal-body { padding:20px; display:flex; flex-direction:column; gap:6px; }
.sl-modal-footer { display:flex; justify-content:flex-end; gap:10px; padding:14px 20px; border-top:1px solid var(--border-subtle); }
.sl-lbl { font-size:12px; font-weight:600; color:var(--text-primary); display:block; margin-bottom:4px; }
.sl-lbl.mt,.sl-lbl.mt { margin-top:12px; }
.sl-hint { font-size:11px; color:var(--text-muted); }
.sl-hint.mt { margin-top:8px; }
.sl-input { width:100%; padding:8px 11px; background:var(--bg-base); border:1px solid var(--border-default); border-radius:7px; color:var(--text-primary); font-size:13px; outline:none; box-sizing:border-box; transition:border-color 0.15s; font-family:inherit; }
.sl-input:focus { border-color:var(--accent); }
.sl-input-prefix-wrap { display:flex; align-items:center; background:var(--bg-base); border:1px solid var(--border-default); border-radius:7px; overflow:hidden; }
.sl-input-prefix { padding:0 9px; color:var(--text-muted); font-size:13px; flex-shrink:0; }
.sl-input-prefix-wrap .sl-input { border:none; background:transparent; padding:8px 9px; }
.sl-toggle-row { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:12px; }
.sl-toggle-row.mt { margin-top:14px; }
.sl-toggle { width:38px; height:21px; background:var(--border-default); border:none; border-radius:10.5px; cursor:pointer; position:relative; transition:background 0.2s; flex-shrink:0; padding:0; }
.sl-toggle.on { background:var(--accent); }
.sl-toggle-knob { position:absolute; top:2.5px; left:2.5px; width:16px; height:16px; background:white; border-radius:50%; transition:left 0.2s; display:block; }
.sl-toggle.on .sl-toggle-knob { left:19.5px; }
.sl-browse-list { max-height:300px; overflow-y:auto; margin-top:10px; display:flex; flex-direction:column; gap:5px; }
.sl-browse-row { display:flex; align-items:center; gap:10px; padding:9px; background:var(--bg-base); border-radius:8px; }

/* FIX 2: Full profile modal */
.sl-full-profile-ava { width:68px; height:68px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:28px; font-weight:700; color:white; margin-top:-34px; border:3px solid var(--bg-elevated); }
.sl-full-profile-name { font-size:19px; font-weight:700; color:var(--text-primary); margin:10px 0 4px; }
.sl-full-profile-status { display:flex; align-items:center; gap:6px; font-size:12.5px; color:var(--text-muted); margin-bottom:14px; }
.sl-profile-fields { border:1px solid var(--border-subtle); border-radius:9px; overflow:hidden; }
.sl-profile-field { padding:10px 14px; border-bottom:1px solid var(--border-subtle); }
.sl-profile-field:last-child { border-bottom:none; }
.sl-pf-label { font-size:10.5px; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:3px; }
.sl-pf-val { font-size:13.5px; color:var(--text-primary); }

/* FIX 3: Preferences */
.sl-pref-section { margin-bottom:16px; padding-bottom:16px; border-bottom:1px solid var(--border-subtle); }
.sl-pref-section:last-child { border-bottom:none; margin-bottom:0; padding-bottom:0; }
.sl-pref-title { font-size:11.5px; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:10px; }
.sl-pref-options { display:flex; gap:8px; }
.sl-pref-opt { flex:1; display:flex; flex-direction:column; align-items:center; gap:5px; padding:10px; background:var(--bg-base); border:1px solid var(--border-default); border-radius:8px; cursor:pointer; transition:border-color 0.15s, background 0.15s; }
.sl-pref-opt:hover { border-color:var(--border-strong); }
.sl-pref-opt.active { border-color:var(--accent); background:var(--accent-dim); }

/* FIX 5: Status */
.sl-status-emojis { display:flex; flex-wrap:wrap; gap:5px; margin-bottom:6px; }
.sl-status-emoji { width:34px; height:34px; display:flex; align-items:center; justify-content:center; font-size:18px; border-radius:7px; cursor:pointer; background:var(--bg-base); border:1px solid var(--border-subtle); transition:all 0.1s; }
.sl-status-emoji.active { border-color:var(--accent); background:var(--accent-dim); }
.sl-status-emoji:hover { background:rgba(255,255,255,0.06); }
.sl-status-presets { display:flex; flex-direction:column; gap:3px; margin-top:6px; }
.sl-status-preset { display:flex; align-items:center; gap:10px; padding:7px 9px; border-radius:7px; cursor:pointer; transition:background 0.1s; }
.sl-status-preset:hover { background:rgba(255,255,255,0.05); }

/* Buttons */
.sl-btn-primary { padding:8px 18px; background:var(--accent); border:none; border-radius:8px; color:white; font-size:13px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:7px; transition:opacity 0.15s; font-family:inherit; }
.sl-btn-primary:hover:not(:disabled) { opacity:0.85; }
.sl-btn-primary:disabled { opacity:0.4; cursor:not-allowed; }
.sl-btn-ghost { padding:7px 15px; background:none; border:1px solid var(--border-default); border-radius:8px; color:var(--text-secondary); font-size:13px; cursor:pointer; font-family:inherit; transition:background 0.1s; }
.sl-btn-ghost:hover { background:rgba(255,255,255,0.05); }
.sl-ghost-btn { padding:7px 14px; background:var(--bg-elevated); border:1px solid var(--border-default); border-radius:8px; color:var(--text-primary); font-size:13px; cursor:pointer; font-family:inherit; display:flex; align-items:center; gap:6px; transition:border-color 0.15s; }
.sl-ghost-btn:hover { border-color:var(--accent); }

/* Center state */
.sl-center-state { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:9px; padding:40px; flex:1; text-align:center; }
.sl-state-title { font-size:15px; font-weight:600; color:var(--text-primary); margin:0; }
.sl-state-sub { font-size:13px; color:var(--text-muted); margin:0; max-width:280px; }

/* Subtle live dot — no text */
.sl-live-dot-only { width:8px; height:8px; border-radius:50%; background:var(--text-muted); opacity:0.4; transition:all 0.3s; flex-shrink:0; }
.sl-live-dot-only.active { background:#2EB67D; opacity:1; animation:sl-pulse 2s infinite; }
@keyframes sl-pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }

/* Slack sidebar themes — override sidebar vars only, not main area */
.sl-sidebar .sl-ws-name { color: var(--sl-sidebar-text, var(--text-primary)); }
.sl-sidebar .sl-user-name { color: var(--sl-sidebar-text, var(--text-primary)); }
.sl-sidebar .sl-ch-label { color: var(--sl-sidebar-muted, var(--text-secondary)); }
.sl-sidebar .sl-section-label { color: var(--sl-sidebar-muted, var(--text-muted)); }
.sl-sidebar .sl-user-status { color: var(--sl-sidebar-muted, var(--text-muted)); }
.sl-sidebar .sl-ws-status { color: var(--sl-sidebar-muted, var(--text-muted)); }
.sl-sidebar .sl-ch-item.active { background: var(--sl-active-bg, var(--accent-dim)) !important; }
.sl-sidebar .sl-section-hdr { border-color: var(--sl-sidebar-border, var(--border-subtle)); }
.sl-sidebar .sl-user-bar { border-color: var(--sl-sidebar-border, var(--border-subtle)); }
.sl-sidebar .sl-sidebar-sep { background: var(--sl-sidebar-border, var(--border-subtle)); }
.sl-sidebar .sl-ws-header { border-color: var(--sl-sidebar-border, var(--border-subtle)); }
.sl-sidebar .sl-sidebar-actions { border-color: var(--sl-sidebar-border, var(--border-subtle)); }
.sl-sidebar .sl-ch-label.bold { color: var(--sl-sidebar-text, var(--text-primary)); }

/* Theme swatch grid */
.sl-theme-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:8px; margin-top:4px; }
.sl-theme-swatch { cursor:pointer; border-radius:8px; overflow:hidden; border:2px solid transparent; transition:border-color 0.15s; }
.sl-theme-swatch.active { border-color:var(--accent); }
.sl-theme-swatch:hover { border-color:var(--border-strong); }
.sl-theme-preview { display:flex; height:40px; border-radius:6px; overflow:hidden; }
.sl-theme-sidebar { width:30px; flex-shrink:0; padding:6px 4px; display:flex; flex-direction:column; gap:3px; }
.sl-theme-line { height:3px; border-radius:2px; }
.sl-theme-main { flex:1; }
.sl-theme-name { font-size:10px; color:var(--text-muted); text-align:center; padding:3px 0 2px; }
.sl-pref-base-title { font-size:11.5px; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; }

/* Full emoji picker */
.sl-emoji-pop { background:var(--bg-elevated); border:1px solid var(--border-default); border-radius:12px; overflow:hidden; width:320px; box-shadow:var(--shadow-lg); z-index:20; display:flex; flex-direction:column; margin-left:38px; margin-bottom:3px; max-height:380px; }
.sl-emoji-pop.send-pos { position:absolute; bottom:calc(100% + 6px); left:0; margin-left:0; }
.sl-emoji-search { padding:8px 12px; background:var(--bg-base); border:none; border-bottom:1px solid var(--border-subtle); outline:none; color:var(--text-primary); font-size:13px; font-family:inherit; width:100%; box-sizing:border-box; }
.sl-emoji-search::placeholder { color:var(--text-muted); }
.sl-emoji-categories { display:flex; align-items:center; gap:2px; padding:5px 8px; border-bottom:1px solid var(--border-subtle); background:var(--bg-base); overflow-x:auto; scrollbar-width:none; }
.sl-emoji-cat-btn { background:none; border:none; cursor:pointer; font-size:16px; padding:4px; border-radius:6px; transition:background 0.1s; flex-shrink:0; }
.sl-emoji-cat-btn:hover { background:rgba(255,255,255,0.08); }
.sl-emoji-scroll { flex:1; overflow-y:auto; padding:8px; scrollbar-width:thin; }
.sl-emoji-cat-label { font-size:10.5px; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; padding:4px 2px 6px; }
.sl-emoji-grid { display:grid; grid-template-columns:repeat(8,1fr); gap:2px; margin-bottom:8px; }
.sl-emoji-btn { font-size:20px; cursor:pointer; padding:4px; border-radius:5px; transition:background 0.1s; text-align:center; line-height:1.3; }
.sl-emoji-btn:hover { background:rgba(255,255,255,0.08); }
.sl-custom-emoji { width:18px; height:18px; object-fit:contain; vertical-align:middle; }
.sl-spin { display:inline-block; width:16px; height:16px; border:2px solid rgba(99,102,241,0.2); border-top-color:var(--accent); border-radius:50%; animation:sl-anim 0.7s linear infinite; flex-shrink:0; }
.sl-spin.sm { width:12px; height:12px; border-width:1.5px; }
@keyframes sl-anim { to { transform:rotate(360deg); } }

/* Transitions */
.sl-fade-enter-active,.sl-fade-leave-active { transition:opacity 0.12s; }
.sl-fade-enter-from,.sl-fade-leave-to { opacity:0; }
.sl-pop-enter-active,.sl-pop-leave-active { transition:opacity 0.15s, transform 0.15s; }
.sl-pop-enter-from,.sl-pop-leave-to { opacity:0; transform:scale(0.95) translateY(-4px); }
.sl-slide-down-enter-active,.sl-slide-down-leave-active { transition:max-height 0.2s, opacity 0.15s; overflow:hidden; }
.sl-slide-down-enter-from,.sl-slide-down-leave-to { max-height:0; opacity:0; }
.sl-expand-enter-active,.sl-expand-leave-active { transition:opacity 0.15s; }
.sl-expand-enter-from,.sl-expand-leave-to { opacity:0; }
.sl-modal-anim-enter-active,.sl-modal-anim-leave-active { transition:opacity 0.18s; }
.sl-modal-anim-enter-active .sl-modal,.sl-modal-anim-leave-active .sl-modal { transition:transform 0.18s; }
.sl-modal-anim-enter-from,.sl-modal-anim-leave-to { opacity:0; }
.sl-modal-anim-enter-from .sl-modal,.sl-modal-anim-leave-to .sl-modal { transform:scale(0.96) translateY(7px); }
</style>
