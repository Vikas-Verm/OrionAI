<template>
  <div class="tg-root" ref="rootEl">

    <!-- ══════════════════════════════════════════════
         FIXED OVERLAY LAYER  (z:9000+)
         Lives at root level, always on top
    ══════════════════════════════════════════════ -->

    <!-- ── Backdrop ── -->
    <div v-if="showDrawer || modal" class="tg-backdrop"
         :class="{ dim: !!modal }"
         @click="handleBackdropClick">
    </div>

    <!-- ── Drawer (slides from left) ── -->
    <transition name="tg-slide">
      <div v-if="showDrawer" class="tg-drawer" @click.stop>
        <!-- Profile banner -->
        <div class="tg-drawer-banner">
          <button class="tg-drawer-close" @click.stop="showDrawer=false" title="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <div class="tg-drawer-av" :style="{ background: avatarColor(me?.firstName || '') }">
            {{ avatarInitials(((me?.firstName||'') + ' ' + (me?.lastName||'')).trim()) }}
          </div>
          <div class="tg-drawer-info">
            <span class="tg-drawer-name">{{ me?.firstName }} {{ me?.lastName || '' }}</span>
            <span class="tg-drawer-phone">{{ me?.phone ? '+' + me.phone : '' }}</span>
          </div>
        </div>
        <!-- Nav -->
        <nav class="tg-drawer-nav">
          <button class="tg-drawer-item" @click.stop="openModal('addAccount')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7"/><path d="M19 16v6M16 19h6"/></svg>
            Add Account
          </button>
          <button class="tg-drawer-item" @click.stop="openModal('saved')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
            Saved Messages
          </button>
          <button class="tg-drawer-item" @click.stop="openModal('stories')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4" fill="currentColor" opacity=".2"/></svg>
            My Stories
          </button>
          <button class="tg-drawer-item" @click.stop="openModal('contacts')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
            Contacts
          </button>
          <button class="tg-drawer-item" @click.stop="openModal('settings')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
            Settings
          </button>

          <div class="tg-drawer-sep"></div>

          <!-- Accent colours -->
          <div class="tg-drawer-label">Chat colour</div>
          <div class="tg-accent-strip">
            <button v-for="a in ACCENTS" :key="a.id"
              :class="['tg-accent-dot', activeAccent === a.id && 'active']"
              :style="{ background: a.color }"
              @click.stop="applyAccent(a)"
              :title="a.label">
            </button>
          </div>

          <div class="tg-drawer-sep"></div>
          <button class="tg-drawer-item danger" @click.stop="logout">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
            Disconnect
          </button>
        </nav>
      </div>
    </transition>

    <!-- ══ CONTEXT MENU ══ -->
    <teleport to="body">
      <div v-if="ctxMenu.visible" class="tg-ctx-overlay" @click="ctxMenu.visible=false" @contextmenu.prevent="ctxMenu.visible=false">
        <div class="tg-ctx-menu" :style="{top: ctxMenu.y+'px', left: ctxMenu.x+'px'}" @click.stop>
          <button class="tg-ctx-item" @click="ctxReply">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 00-4-4H4"/></svg>
            Reply
          </button>
          <button v-if="ctxMenu.msg?.fromMe" class="tg-ctx-item" @click="ctxEdit">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Edit
          </button>
          <button class="tg-ctx-item" @click="ctxCopy">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            Copy text
          </button>
          <button class="tg-ctx-item" @click="ctxForward">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 014-4h12"/></svg>
            Forward
          </button>
          <button v-if="ctxMenu.msg?.media && ['photo','video','document','audio'].includes(ctxMenu.msg.media.type)" class="tg-ctx-item" @click="ctxDownload">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download
          </button>
          <div class="tg-ctx-sep"></div>
          <button class="tg-ctx-item red" @click="ctxDelete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>
            Delete
          </button>
        </div>
      </div>
    </teleport>

    <!-- ══ LIGHTBOX ══ -->
    <div v-if="lightboxSrc" class="tg-lightbox" @click="lightboxSrc=null">
      <img :src="lightboxSrc" class="tg-lightbox-img" @click.stop/>
      <button class="tg-lightbox-close" @click="lightboxSrc=null">✕</button>
      <a :href="lightboxSrc" :download="lightboxName" class="tg-lightbox-dl" @click.stop>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Download
      </a>
    </div>

    <!-- ══ FORWARD MODAL ══ -->
    <transition name="tg-modal-pop">
      <div v-if="modal==='forward'" class="tg-modal" @click.stop>
        <div class="tg-modal-head">
          <span class="tg-modal-title">Forward to…</span>
          <button class="tg-modal-x" @click="closeModal">✕</button>
        </div>
        <div class="tg-modal-searchbar">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" opacity=".5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input v-model="fwdQ" class="tg-modal-q" placeholder="Search chats…" autofocus/>
        </div>
        <div class="tg-modal-scroll">
          <div v-for="d in fwdFilteredDlgs" :key="d.id" class="tg-contact-row" @click="doForward(d)">
            <div class="tg-contact-av" :style="{background: avatarColor(d.name)}">{{ avatarInitials(d.name) }}</div>
            <div class="tg-contact-body">
              <span class="tg-contact-name">{{ d.name }}</span>
              <span class="tg-contact-hint">{{ d.type }}</span>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <!-- ══ MODAL: Contacts ══ -->
    <transition name="tg-modal-pop">
      <div v-if="modal === 'contacts'" class="tg-modal" @click.stop>
        <div class="tg-modal-head">
          <span class="tg-modal-title">Contacts</span>
          <button class="tg-modal-x" @click="closeModal">✕</button>
        </div>
        <div class="tg-modal-searchbar">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" opacity=".5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input v-model="contactQ" class="tg-modal-q" placeholder="Search contacts…" autofocus/>
        </div>
        <div class="tg-modal-scroll">
          <div v-if="contactsLoading" class="tg-modal-center"><div class="tg-spinner"></div></div>
          <div v-else-if="!filteredContacts.length" class="tg-modal-center tg-modal-empty">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".3"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
            <span>{{ contactQ ? 'No results' : 'No contacts found' }}</span>
          </div>
          <div v-else v-for="c in filteredContacts" :key="c.id" class="tg-contact-row" @click="startChatWithContact(c)">
            <div class="tg-contact-av" :style="{ background: avatarColor(c.firstName + c.lastName) }">
              {{ avatarInitials((c.firstName + ' ' + c.lastName).trim()) }}
            </div>
            <div class="tg-contact-body">
              <span class="tg-contact-name">{{ c.firstName }} {{ c.lastName }}</span>
              <span class="tg-contact-hint">{{ c.username ? '@'+c.username : (c.phone ? '+'+c.phone : 'Telegram user') }}</span>
            </div>
            <svg class="tg-contact-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        </div>
      </div>
    </transition>

    <!-- ══ MODAL: Saved Messages ══ -->
    <transition name="tg-modal-pop">
      <div v-if="modal === 'saved'" class="tg-modal tg-modal-lg" @click.stop>
        <div class="tg-modal-head">
          <div style="display:flex;align-items:center;gap:10px">
            <div class="tg-modal-icon" style="background:#229ED9">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
            </div>
            <div>
              <div class="tg-modal-title">Saved Messages</div>
              <div style="font-size:11px;color:var(--text-muted)">Your private space</div>
            </div>
          </div>
          <button class="tg-modal-x" @click="closeModal">✕</button>
        </div>
        <div class="tg-modal-scroll tg-saved-scroll" ref="savedScrollEl">
          <div v-if="savedLoading" class="tg-modal-center"><div class="tg-spinner"></div></div>
          <div v-else-if="!savedMsgs.length" class="tg-modal-center tg-modal-empty">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".3"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
            <span>Nothing saved yet. Write something!</span>
          </div>
          <template v-else>
            <template v-for="(msg, idx) in savedMsgs" :key="msg.id">
              <div v-if="showSavedDateSep(idx)" class="tg-date-sep"><span>{{ formatDateSep(msg.date) }}</span></div>
              <div class="tg-msg-row from-me">
                <div class="tg-msg-bubble-wrap" style="align-items:flex-end">
                  <div class="tg-msg-bubble bubble-me">
                    <div v-if="msg.text" class="tg-msg-text">{{ msg.text }}</div>
                    <div v-else class="tg-msg-text" style="opacity:.5;font-style:italic">{{ (msg.media || '').replace('MessageMedia','') }}</div>
                    <div class="tg-msg-footer"><span class="tg-msg-time">{{ formatTime(msg.date) }}</span></div>
                  </div>
                </div>
              </div>
            </template>
          </template>
        </div>
        <div class="tg-modal-input">
          <div class="tg-input-wrap">
            <textarea v-model="savedDraft" class="tg-input" placeholder="Save a note to yourself…" rows="1"
              @keydown.enter.exact.prevent="sendSavedMessage" @input="e => autoResize(e)" ref="savedInputEl"></textarea>
            <button class="tg-send-btn" :class="{ active: savedDraft.trim() }" @click="sendSavedMessage" :disabled="!savedDraft.trim() || savingSelf">
              <span v-if="savingSelf" class="tg-send-spinner"></span>
              <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
        </div>
      </div>
    </transition>

    <!-- ══ STORIES VIEWER (full overlay) ══ -->
    <transition name="tg-story-fade">
      <div v-if="storyViewer.open" class="tg-story-viewer" @click.stop tabindex="0">

        <!-- Progress bars -->
        <div class="tg-story-progress-row">
          <div v-for="(seg, si) in storyViewer.segments" :key="si" class="tg-story-seg">
            <div class="tg-story-seg-fill"
              :style="{ width: si < storyViewer.segIdx ? '100%' : si === storyViewer.segIdx ? storyViewer.segPct+'%' : '0%' }">
            </div>
          </div>
        </div>

        <!-- Header -->
        <div class="tg-story-head">
          <div class="tg-story-head-av">
            <img v-if="storyViewer.photo" :src="storyViewer.photo" class="tg-story-head-av-img"/>
            <div v-else class="tg-story-head-av-init" :style="{background: avatarColor(storyViewer.name||'')}">{{ avatarInitials(storyViewer.name||'') }}</div>
          </div>
          <div class="tg-story-head-info">
            <span class="tg-story-head-name">{{ storyViewer.name }}</span>
            <span class="tg-story-head-time">{{ storyViewer.time }}</span>
          </div>
          <button class="tg-story-close" @click.stop="closeStoryViewer">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <!-- Tap zones + card -->
        <div class="tg-story-body">
          <div class="tg-story-tap-prev" @click.stop="storyPrev"></div>
          <div class="tg-story-tap-next" @click.stop="storyNext"></div>
          <div class="tg-story-card" :style="{background: storyViewer.bg}">
            <template v-if="storyViewer.isMe">
              <div class="tg-story-own">
                <div class="tg-story-own-av" :style="{background: avatarColor(me?.firstName||'')}">{{ avatarInitials(((me?.firstName||'') + ' ' + (me?.lastName||'')).trim()) }}</div>
                <div class="tg-story-own-name">{{ me?.firstName }} {{ me?.lastName || '' }}</div>
                <div class="tg-story-own-hint">Your stories are managed in the Telegram app</div>
                <a href="https://web.telegram.org" target="_blank" rel="noopener" class="tg-story-cta" @click.stop>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  Open Telegram Web
                </a>
              </div>
            </template>
            <template v-else>
              <img v-if="storyViewer.mediaUrl" :src="storyViewer.mediaUrl" class="tg-story-img"/>
              <div v-else class="tg-story-placeholder">
                <div class="tg-story-ph-av" :style="{background: avatarColor(storyViewer.name||'')}">{{ avatarInitials(storyViewer.name||'') }}</div>
                <div class="tg-story-ph-name">{{ storyViewer.name }}</div>
                <div class="tg-story-ph-hint">Story · {{ storyViewer.time }}</div>
              </div>
            </template>
          </div>
        </div>

        <!-- Reply bar -->
        <div v-if="!storyViewer.isMe" class="tg-story-reply-bar" @click.stop>
          <div class="tg-story-reply-inner">
            <input v-model="storyReplyDraft" class="tg-story-reply-input" placeholder="Reply to story…" @keydown.enter.stop="sendStoryReply"/>
            <button class="tg-story-reply-send" :disabled="!storyReplyDraft.trim()" @click.stop="sendStoryReply">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
        </div>
      </div>
    </transition>

    <!-- ══ MODAL: Stories list ══ -->
    <transition name="tg-modal-pop">
      <div v-if="modal === 'stories'" class="tg-modal" @click.stop>
        <div class="tg-modal-head">
          <span class="tg-modal-title">Stories</span>
          <button class="tg-modal-x" @click="closeModal">✕</button>
        </div>
        <div class="tg-modal-scroll">
          <!-- My story card -->
          <div class="tg-stories-own-card" @click="closeModal(); openStoryViewer('me')">
            <div class="tg-story-ring unviewed" style="width:52px;height:52px">
              <div class="tg-story-av" :style="{background: avatarColor(me?.firstName||''), width:'44px', height:'44px', fontSize:'15px'}">{{ avatarInitials(((me?.firstName||'') + ' ' + (me?.lastName||'')).trim()) }}</div>
            </div>
            <div class="tg-stories-own-info">
              <div class="tg-stories-own-name">My Story</div>
              <div class="tg-stories-own-sub">Tap to view · manage in Telegram app</div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" opacity=".4"><polyline points="9 18 15 12 9 6"/></svg>
          </div>

          <div class="tg-stories-section-title">Contacts' Stories</div>
          <div v-if="!storiesContacts.length" class="tg-stories-empty">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".25"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4" fill="currentColor" opacity=".3"/></svg>
            <span>No active stories from your contacts</span>
          </div>
          <div v-else v-for="c in storiesContacts" :key="c.id" class="tg-contact-row" @click="closeModal(); openStoryViewer(c)">
            <div class="tg-story-ring" :class="viewedStories.has(c.id) ? 'viewed' : 'unviewed'" style="width:46px;height:46px;flex-shrink:0">
              <img v-if="photoCache[c.id]" :src="photoCache[c.id]" class="tg-story-av-img" style="width:38px;height:38px"/>
              <div v-else class="tg-story-av" :style="{background: avatarColor(c.name), width:'38px', height:'38px', fontSize:'13px'}">{{ avatarInitials(c.name) }}</div>
            </div>
            <div class="tg-contact-body">
              <span class="tg-contact-name">{{ c.name }}</span>
              <span class="tg-contact-hint">Active story</span>
            </div>
            <svg class="tg-contact-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        </div>
      </div>
    </transition>

    <!-- ══ MODAL: Add Account ══ -->
    <transition name="tg-modal-pop">
      <div v-if="modal === 'addAccount'" class="tg-modal" @click.stop>
        <div class="tg-modal-head">
          <span class="tg-modal-title">Add Account</span>
          <button class="tg-modal-x" @click="closeModal">✕</button>
        </div>
        <div class="tg-modal-scroll">
          <div class="tg-stories-view">
            <div class="tg-modal-icon lg" style="background:rgba(34,158,217,.12)">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--tg-accent)" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7"/><path d="M19 16v6M16 19h6"/></svg>
            </div>
            <p class="tg-stories-name">Currently signed in as</p>
            <div class="tg-account-card">
              <div class="tg-account-av" :style="{ background: avatarColor(me?.firstName || '') }">
                {{ avatarInitials(((me?.firstName||'') + ' ' + (me?.lastName||'')).trim()) }}
              </div>
              <div>
                <div style="font-weight:600;font-size:14px">{{ me?.firstName }} {{ me?.lastName || '' }}</div>
                <div style="font-size:12px;color:var(--text-muted)">+{{ me?.phone }}</div>
              </div>
            </div>
            <p class="tg-stories-sub" style="margin-top:8px">To use a different account, sign out first. Multi-account support is managed in the Telegram app.</p>
            <button class="tg-danger-btn" @click="logout">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
              Sign out &amp; switch account
            </button>
          </div>
        </div>
      </div>
    </transition>

    <!-- ══ MODAL: Settings ══ -->
    <transition name="tg-modal-pop">
      <div v-if="modal === 'settings'" class="tg-modal" @click.stop>
        <div class="tg-modal-head">
          <span class="tg-modal-title">Settings</span>
          <button class="tg-modal-x" @click="closeModal">✕</button>
        </div>
        <div class="tg-modal-scroll">
          <!-- Profile -->
          <div class="tg-settings-profile">
            <div class="tg-settings-av" :style="{ background: avatarColor(me?.firstName || '') }">
              {{ avatarInitials(((me?.firstName||'') + ' ' + (me?.lastName||'')).trim()) }}
            </div>
            <div class="tg-settings-pinfo">
              <div class="tg-settings-pname">{{ me?.firstName }} {{ me?.lastName || '' }}</div>
              <div class="tg-settings-pmeta">{{ me?.phone ? '+' + me.phone : '' }}{{ me?.username ? ' · @' + me.username : '' }}</div>
            </div>
          </div>

          <div class="tg-settings-group">
            <div class="tg-settings-label">Chat bubble colour</div>
            <div class="tg-settings-accent-row">
              <button v-for="a in ACCENTS" :key="a.id"
                :class="['tg-accent-dot', activeAccent === a.id && 'active']"
                :style="{ background: a.color }"
                @click.stop="applyAccent(a)"
                :title="a.label">
              </button>
            </div>
          </div>

          <div class="tg-settings-group">
            <div class="tg-settings-label">Message font size</div>
            <div class="tg-settings-row">
              <span class="tg-settings-sample" :style="{ fontSize: fontSize + 'px' }">The quick brown fox</span>
              <div class="tg-stepper">
                <button @click.stop="fontSize = Math.max(11, fontSize - 1)">−</button>
                <span>{{ fontSize }}px</span>
                <button @click.stop="fontSize = Math.min(18, fontSize + 1)">+</button>
              </div>
            </div>
          </div>

          <div class="tg-settings-group">
            <div class="tg-settings-label">Account info</div>
            <div class="tg-settings-info">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" opacity=".6"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.68A2 2 0 012 .18h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.18 6.18l1.29-1.29a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
              +{{ me?.phone }}
            </div>
            <div v-if="me?.username" class="tg-settings-info">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" opacity=".6"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              @{{ me.username }}
            </div>
          </div>

          <div style="padding:0 16px 16px">
            <button class="tg-danger-btn" style="width:100%" @click="logout">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
              Disconnect Telegram
            </button>
          </div>
        </div>
      </div>
    </transition>


    <!-- ══════════════════════════════════════════════
         AUTH SCREEN
    ══════════════════════════════════════════════ -->
    <div v-if="authStep === 'loading'" class="tg-init-screen">
      <div class="tg-spinner"></div>
    </div>

    <div v-else-if="authStep !== 'done'" class="tg-auth-screen">
      <div class="tg-auth-glow"></div>
      <div class="tg-auth-box">
        <svg width="52" height="52" viewBox="0 0 24 24" style="margin-bottom:18px"><circle cx="12" cy="12" r="12" fill="#229ED9"/><path d="M5.4 11.9l10.2-3.9c.47-.18.88.11.73.8l-1.74 8.2c-.13.58-.47.72-.95.45l-2.63-1.94-1.27 1.22c-.14.14-.26.26-.53.26l.19-2.69 4.87-4.4c.21-.19-.05-.29-.32-.1L7.47 13.9 4.87 13.1c-.56-.17-.57-.56.53-1.2z" fill="white"/></svg>
        <h2 class="tg-auth-title">Telegram</h2>
        <p class="tg-auth-sub">Sign in to your account</p>

        <div v-if="authStep === 'phone'" class="tg-auth-fields">
          <label class="tg-auth-label">Phone number</label>
          <input v-model="authPhone" class="tg-auth-input" placeholder="+91 98765 43210" type="tel" @keydown.enter="submitPhone" autofocus/>
          <div class="tg-auth-hint">Include country code · e.g. +91 for India</div>
          <button class="tg-auth-btn" @click="submitPhone" :disabled="authLoading">
            <span v-if="authLoading" class="tg-spin-sm"></span><span v-else>Send Code →</span>
          </button>
          <div v-if="authError" class="tg-auth-err">{{ authError }}</div>
        </div>

        <div v-else-if="authStep === 'code'" class="tg-auth-fields">
          <label class="tg-auth-label">Verification code</label>
          <div class="tg-auth-hint" style="margin-bottom:8px">Sent to {{ authPhone }} via Telegram</div>
          <input v-model="authCode" class="tg-auth-input tg-code-input" placeholder="12345" type="text" maxlength="6" @keydown.enter="submitCode" autofocus/>
          <button class="tg-auth-btn" @click="submitCode" :disabled="authLoading">
            <span v-if="authLoading" class="tg-spin-sm"></span><span v-else>Verify →</span>
          </button>
          <button class="tg-auth-back" @click="authStep='phone'">← Change number</button>
          <div v-if="authError" class="tg-auth-err">{{ authError }}</div>
        </div>

        <div v-else-if="authStep === 'password'" class="tg-auth-fields">
          <label class="tg-auth-label">Two-step password</label>
          <input v-model="authPwd" class="tg-auth-input" placeholder="Password" type="password" @keydown.enter="submitPassword" autofocus/>
          <button class="tg-auth-btn" @click="submitPassword" :disabled="authLoading">
            <span v-if="authLoading" class="tg-spin-sm"></span><span v-else>Sign in →</span>
          </button>
          <div v-if="authError" class="tg-auth-err">{{ authError }}</div>
        </div>
      </div>
    </div>


    <!-- ══════════════════════════════════════════════
         MAIN APP
    ══════════════════════════════════════════════ -->
    <div v-else class="tg-app">

      <!-- ── SIDEBAR ── -->
      <div class="tg-sidebar">
        <div class="tg-sidebar-head">
          <button class="tg-icon-btn" @click="showDrawer = true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <div class="tg-searchbar">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tg-si"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input v-model="dlgQ" class="tg-searchbar-input" placeholder="Search…"/>
          </div>
          <div class="tg-compose-wrap" ref="composeRef">
            <button class="tg-icon-btn" style="color:var(--tg-accent)" @click="showCompose = !showCompose">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <div v-if="showCompose" class="tg-compose-drop" @click.stop>
              <button class="tg-compose-item" @click="newChat('private')">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                New Private Chat
              </button>
              <button class="tg-compose-item" @click="newChat('group')">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
                New Group
              </button>
              <button class="tg-compose-item" @click="newChat('channel')">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>
                New Channel
              </button>
            </div>
          </div>
        </div>

        <div class="tg-filters">
          <button v-for="f in FILTERS" :key="f.v" :class="['tg-fpill', dlgFilter===f.v&&'on']" @click="dlgFilter=f.v">{{ f.l }}</button>
        </div>

        <!-- Stories ring bar -->
        <div v-if="storiesContacts.length || true" class="tg-stories-bar">
          <!-- My story ring -->
          <div class="tg-story-item" @click="openStoryViewer('me')">
            <div class="tg-story-ring" :class="myStoryViewed ? 'viewed' : 'unviewed'">
              <div class="tg-story-av" :style="{background: avatarColor(me?.firstName||'')}">
                {{ avatarInitials(((me?.firstName||'') + ' ' + (me?.lastName||'')).trim()) }}
              </div>
            </div>
            <span class="tg-story-name">My Story</span>
          </div>
          <!-- Contacts with stories -->
          <div v-for="c in storiesContacts" :key="c.id" class="tg-story-item" @click="openStoryViewer(c)">
            <div class="tg-story-ring" :class="viewedStories.has(c.id) ? 'viewed' : 'unviewed'">
              <img v-if="photoCache[c.id]" :src="photoCache[c.id]" class="tg-story-av-img"/>
              <div v-else class="tg-story-av" :style="{background: avatarColor(c.name)}">
                {{ avatarInitials(c.name) }}
              </div>
            </div>
            <span class="tg-story-name">{{ c.name.split(' ')[0] }}</span>
          </div>
        </div>

        <div class="tg-dlg-list">
          <div v-if="dlgsLoading" class="tg-skel-wrap">
            <div v-for="i in 8" :key="i" class="tg-skel-row">
              <div class="tg-skel-av"></div>
              <div class="tg-skel-lines"><div class="tg-skel-name"></div><div class="tg-skel-msg"></div></div>
            </div>
          </div>
          <div v-else-if="!filteredDlgs.length" class="tg-dlg-empty">No chats found</div>
          <div v-else v-for="d in filteredDlgs" :key="d.id"
            :class="['tg-dlg-row', selDlg?.id===d.id&&'active']"
            @click="selectDlg(d)">
            <div class="tg-dlg-av-wrap">
              <img v-if="photoCache[d.id]" :src="photoCache[d.id]" class="tg-dlg-av-img"/>
              <div v-else class="tg-dlg-av" :style="{ background: avatarColor(d.name) }">{{ avatarInitials(d.name) }}</div>
              <span v-if="d.type==='channel'" class="tg-type-pin ch">
                <svg width="8" height="8" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>
              </span>
              <span v-else-if="d.type==='group'" class="tg-type-pin gr">
                <svg width="8" height="8" viewBox="0 0 24 24" fill="white"><path d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05C16.19 13.89 17 15.02 17 16.5V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
              </span>
              <!-- Online status dot -->
              <span v-else-if="d.status?.type==='online'" class="tg-status-dot online"></span>
              <span v-if="d.unreadCount>0 && selDlg?.id!==d.id" class="tg-unread">{{ d.unreadCount > 99 ? '99+' : d.unreadCount }}</span>
            </div>
            <div class="tg-dlg-body">
              <div class="tg-dlg-top">
                <span class="tg-dlg-name">{{ d.name }}</span>
                <span class="tg-dlg-date">{{ fmtDate(d.lastDate) }}</span>
              </div>
              <div class="tg-dlg-prev">{{ d.lastMessage || '…' }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── CHAT PANE ── -->
      <div class="tg-chat-pane">

        <!-- Empty state -->
        <div v-if="!selDlg" class="tg-empty-chat">
          <svg width="64" height="64" viewBox="0 0 24 24" opacity=".15"><circle cx="12" cy="12" r="12" fill="var(--tg-accent)"/><path d="M5.4 11.9l10.2-3.9c.47-.18.88.11.73.8l-1.74 8.2c-.13.58-.47.72-.95.45l-2.63-1.94-1.27 1.22c-.14.14-.26.26-.53.26l.19-2.69 4.87-4.4c.21-.19-.05-.29-.32-.1L7.47 13.9 4.87 13.1c-.56-.17-.57-.56.53-1.2z" fill="white"/></svg>
          <p style="font-size:15px;font-weight:600;color:var(--text-secondary);margin:8px 0 4px">Select a chat</p>
          <p style="font-size:13px;color:var(--text-muted)">Choose from your conversations</p>
        </div>

        <template v-else>
          <!-- Pinned message bar -->
          <div v-if="pinnedMsg" class="tg-pinned-bar" @click="scrollToMsg2(pinnedMsg.id)">
            <div class="tg-pinned-line"></div>
            <div class="tg-pinned-body">
              <span class="tg-pinned-label">📌 Pinned Message</span>
              <span class="tg-pinned-text">{{ pinnedMsg.text || '📎 Attachment' }}</span>
            </div>
            <button class="tg-pinned-close" @click.stop="pinnedMsg=null">✕</button>
          </div>

          <!-- Header -->
          <div class="tg-chat-head">
            <div class="tg-chat-head-av-wrap" style="cursor:pointer" @click="showInfoPanel=true">
              <img v-if="photoCache[selDlg.id]" :src="photoCache[selDlg.id]" class="tg-chat-head-av-img"/>
              <div v-else class="tg-chat-head-av" :style="{ background: avatarColor(selDlg.name) }">{{ avatarInitials(selDlg.name) }}</div>
            </div>
            <div class="tg-chat-head-info" style="cursor:pointer" @click="showInfoPanel=true">
              <div class="tg-chat-head-name">{{ selDlg.name }}</div>
              <div class="tg-chat-head-sub" :class="selDlg.status?.type==='online' && 'online'">
                <span v-if="typingText">{{ typingText }}</span>
                <span v-else>{{ dlgSubtitle }}</span>
              </div>
            </div>
            <div class="tg-chat-head-btns">
              <button class="tg-hbtn" :class="chatSearch&&'on'" @click="toggleSearch">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              </button>
              <button class="tg-hbtn" @click="loadMsgs(selDlg, true)">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
              </button>
              <div class="tg-more-wrap" ref="moreRef">
                <button class="tg-hbtn" @click="showMore = !showMore">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
                </button>
                <div v-if="showMore" class="tg-more-menu" @click.stop>
                  <button class="tg-more-item" @click="clearHist">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>
                    Clear history
                  </button>
                  <button class="tg-more-item" @click="copyLink">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
                    Copy link
                  </button>
                  <div class="tg-more-sep"></div>
                  <button class="tg-more-item red" @click="logout">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
                    Disconnect
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- In-chat search -->
          <div v-if="chatSearch" class="tg-csearch">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" opacity=".4"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input v-model="csQ" class="tg-csinput" placeholder="Search in conversation…" autofocus/>
            <span v-if="csQ && csResults.length" class="tg-cs-count">{{ csIdx+1 }}/{{ csResults.length }}</span>
            <button v-if="csQ" class="tg-icon-btn" @click="csNav(-1)">↑</button>
            <button v-if="csQ" class="tg-icon-btn" @click="csNav(1)">↓</button>
            <button class="tg-icon-btn" @click="chatSearch=false;csQ=''">✕</button>
          </div>

          <!-- Messages area -->
          <div class="tg-msgs-area" ref="msgsEl" @scroll="onMsgsScroll">
            <div v-if="msgsLoading" class="tg-msgs-center"><div class="tg-spinner"></div></div>
            <div v-else-if="!msgs.length" class="tg-msgs-center" style="font-size:13px;color:var(--text-muted)">No messages yet</div>
            <div v-else class="tg-msgs-list">
              <div v-if="canMore" class="tg-load-more">
                <button @click="loadMore" :disabled="loadingMore">
                  <span v-if="loadingMore" class="tg-spinner sm"></span><span v-else>↑ Load earlier</span>
                </button>
              </div>
              <template v-for="(msg, idx) in msgs" :key="msg.id">
                <div v-if="showDSep(idx)" class="tg-date-sep"><span>{{ formatDateSep(msg.date) }}</span></div>
                <div v-if="isUnreadDivider(idx)" class="tg-unread-divider"><span>Unread messages</span></div>
                <div :class="['tg-msg-row', msg.fromMe ? 'from-me' : 'from-them']" :id="'m'+msg.id">

                  <div v-if="!msg.fromMe && selDlg.type !== 'user'" class="tg-av-col">
                    <template v-if="isLast(idx)">
                      <img v-if="photoCache[msg.fromId]" :src="photoCache[msg.fromId]" class="tg-av-sm-img"/>
                      <div v-else class="tg-av-sm" :style="{ background: avatarColor(msg.fromName||msg.fromId) }">{{ avatarInitials(msg.fromName||'?') }}</div>
                    </template>
                  </div>

                  <div :class="['tg-bubble-wrap', isFirst(idx) && 'grp-first']">
                    <div v-if="!msg.fromMe && selDlg.type!=='user' && isFirst(idx)" class="tg-sender" :style="{ color: senderCol(msg.fromId) }">{{ msg.fromName||'Unknown' }}</div>
                    <!-- Hover action bar -->
                    <div class="tg-msg-actions" :class="msg.fromMe ? 'me' : 'them'">
                      <button class="tg-act-btn" title="Reply" @click.stop="setReply(msg)">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 00-4-4H4"/></svg>
                      </button>
                      <button class="tg-act-btn" title="React" @click.stop="toggleReactionPicker(msg.id)">😊</button>
                      <button class="tg-act-btn" title="More" @click.stop="openCtxMenu($event, msg)">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
                      </button>
                    </div>
                    <!-- Reaction picker -->
                    <div v-if="reactionPickerId===msg.id" class="tg-reaction-picker" :class="msg.fromMe ? 'me' : 'them'" @click.stop>
                      <button v-for="e in REACTIONS" :key="e" class="tg-re-btn" @click="sendReaction(msg.id, e)">{{ e }}</button>
                    </div>
                    <div :class="['tg-bubble', msg.fromMe ? 'bme' : 'bthem', !isLast(idx)&&!msg.fromMe&&'no-tail', csResults.includes(idx)&&idx===csResults[csIdx]&&'cs-hl']"
                         @contextmenu.prevent="openCtxMenu($event, msg)">
                      <!-- Forwarded label -->
                      <div v-if="msg.forwarded" class="tg-forwarded">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 014-4h12"/></svg>
                        Forwarded from <span>{{ msg.forwardedFrom || 'Unknown' }}</span>
                      </div>
                      <!-- Reply quote block -->
                      <div v-if="msg.replyTo" class="tg-quote" @click="scrollToReply(msg.replyTo)">
                        <div class="tg-quote-bar"></div>
                        <div class="tg-quote-body">
                          <span class="tg-quote-name">{{ msg.replyToName || 'Message' }}</span>
                          <span class="tg-quote-text">{{ msg.replyToText || '📎 Attachment' }}</span>
                        </div>
                      </div>

                      <template v-if="msg.media">
                        <!-- Photo: load on demand -->
                        <div v-if="msg.media.type==='photo'" class="tg-m-photo-wrap">
                          <img v-if="mediaCache[msg.id]" :src="mediaCache[msg.id]" class="tg-m-photo" @click="openLightbox(msg.id)"/>
                          <div v-else-if="mediaCache[msg.id]==='loading'" class="tg-m-photo-skel">
                            <div class="tg-photo-shimmer"></div>
                          </div>
                          <div v-else class="tg-m-photo-placeholder" @click="loadMsgMedia(msg.id, msg.media.msgId)">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                            <span>Tap to load</span>
                          </div>
                        </div>
                        <!-- Video -->
                        <div v-else-if="msg.media.type==='video'" class="tg-m-video-wrap" @click="downloadAttachment(msg)">
                          <div class="tg-m-video-inner">
                            <div class="tg-play-btn-lg">
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                            </div>
                            <div class="tg-m-video-meta">
                              <span v-if="msg.media.duration" class="tg-m-video-dur">{{ fmtDur(msg.media.duration) }}</span>
                              <span v-if="msg.media.size" class="tg-m-video-size">{{ fmtSize(msg.media.size) }}</span>
                            </div>
                            <div class="tg-m-video-dl">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                              Download video
                            </div>
                          </div>
                        </div>
                        <!-- Voice -->
                        <div v-else-if="msg.media.type==='voice'" class="tg-m-voice">
                          <button class="tg-voice-play-btn"
                            :class="{ playing: playingVoiceId === msg.id }"
                            @click="toggleVoice(msg)">
                            <svg v-if="playingVoiceId !== msg.id" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                            <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                          </button>
                          <div class="tg-voice-progress" @click="seekVoice($event, msg)">
                            <div class="tg-wave">
                              <div v-for="i in 24" :key="i" class="tg-wbar"
                                :class="{ played: (voiceProgress[msg.id]||0) > i/24 }"
                                :style="{height:(28+Math.sin(i*0.8+msg.id%10)*20)+'%'}">
                              </div>
                            </div>
                            <div class="tg-voice-prog-bar" :style="{width: ((voiceProgress[msg.id]||0)*100)+'%'}"></div>
                          </div>
                          <span class="tg-voice-dur">{{ voiceDuration[msg.id] ? fmtDur(Math.round(voiceDuration[msg.id])) : (msg.media.duration ? fmtDur(msg.media.duration) : '0:00') }}</span>
                        </div>
                        <!-- Document / File / Audio -->
                        <div v-else-if="['document','audio'].includes(msg.media.type)" class="tg-m-file">
                          <div class="tg-ficon" :style="{background:fIconCol(msg.media.fileName)}">{{ fExt(msg.media.fileName) }}</div>
                          <div class="tg-finfo">
                            <span class="tg-fname">{{ msg.media.fileName || 'File' }}</span>
                            <span class="tg-fsize">{{ fmtSize(msg.media.size) }}</span>
                          </div>
                        </div>
                        <!-- GIF -->
                        <div v-else-if="msg.media.type==='gif'" class="tg-m-thumb">
                          <span class="tg-gif-badge">GIF</span>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".6"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                        </div>
                        <!-- Sticker -->
                        <div v-else-if="msg.media.type==='sticker'" class="tg-m-generic">
                          {{ msg.media.emoji || '🎭' }} Sticker
                        </div>
                        <!-- Location -->
                        <div v-else-if="msg.media.type==='location'" class="tg-m-generic">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                          Location
                        </div>
                        <!-- Contact -->
                        <div v-else-if="msg.media.type==='contact'" class="tg-m-file">
                          <div class="tg-ficon" style="background:#6366f1"><svg width="13" height="13" viewBox="0 0 24 24" fill="white"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4" fill="white"/></svg></div>
                          <div class="tg-finfo"><span class="tg-fname">{{ msg.media.name }}</span><span class="tg-fsize">{{ msg.media.phone }}</span></div>
                        </div>
                        <!-- Poll -->
                        <div v-else-if="msg.media.type==='poll'" class="tg-m-generic">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                          {{ msg.media.question || 'Poll' }}
                        </div>
                        <!-- Webpage / Link preview -->
                        <div v-else-if="msg.media.type==='webpage'" class="tg-m-web">
                          <span v-if="msg.media.title" class="tg-web-title">{{ msg.media.title }}</span>
                          <span v-if="msg.media.description" class="tg-web-desc">{{ msg.media.description }}</span>
                          <a v-if="msg.media.url" :href="msg.media.url" target="_blank" class="tg-web-url">{{ msg.media.url }}</a>
                        </div>
                        <!-- Fallback for everything else -->
                        <div v-else class="tg-m-generic">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" opacity=".6"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
                          {{ msg.media.type || 'Attachment' }}
                        </div>
                      </template>

                      <div v-if="msg.text" class="tg-msg-text" :style="{fontSize:fontSize+'px'}" v-html="csHighlight(msg.text, idx)"></div>
                      <div class="tg-msg-foot">
                        <span v-if="msg.views" class="tg-views"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>{{ fmtViews(msg.views) }}</span>
                        <span class="tg-msg-time">{{ fmtTime(msg.date) }}</span>
                        <span v-if="msg.fromMe" class="tg-ticks">✓✓</span>
                      </div>
                    </div>
                  </div>
                </div>
              </template>
              <div ref="msgsBottom"></div>
            </div>
          </div>

          <!-- Scroll to bottom FAB -->
          <transition name="tg-fade-up">
            <button v-if="showScrollBtn" class="tg-scroll-btn" @click="scrollBottomNow">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
              <span v-if="unreadScrollCount > 0" class="tg-scroll-badge">{{ unreadScrollCount }}</span>
            </button>
          </transition>

          <!-- Reply banner above input -->
          <div v-if="replyTo" class="tg-reply-banner">
            <div class="tg-reply-bar"></div>
            <div class="tg-reply-info">
              <span class="tg-reply-name">{{ replyTo.fromMe ? "You" : (replyTo.fromName || "Unknown") }}</span>
              <span class="tg-reply-preview">{{ replyTo.text || (replyTo.media ? "📎 " + replyTo.media.type : "Message") }}</span>
            </div>
            <button class="tg-reply-cancel" @click="replyTo=null">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <!-- Edit banner above input -->
          <div v-if="editingMsg" class="tg-reply-banner edit">
            <div class="tg-reply-bar" style="background:#10b981"></div>
            <div class="tg-reply-info">
              <span class="tg-reply-name" style="color:#10b981">Edit message</span>
              <span class="tg-reply-preview">{{ editingMsg.text }}</span>
            </div>
            <button class="tg-reply-cancel" @click="cancelEdit">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <!-- Input / channel bar -->
          <div v-if="selDlg.type !== 'channel'" class="tg-input-bar">
            <!-- Emoji picker popup -->
            <div v-if="showEmojiPicker" class="tg-emoji-picker" @click.stop>
              <div class="tg-emoji-tabs">
                <button v-for="cat in EMOJI_CATS" :key="cat.name"
                  :class="['tg-emoji-tab', emojiCat===cat.name&&'on']"
                  @click="emojiCat=cat.name">{{ cat.icon }}</button>
              </div>
              <div class="tg-emoji-grid">
                <button v-for="e in currentEmojis" :key="e" class="tg-epick-btn" @click="insertEmoji(e)">{{ e }}</button>
              </div>
            </div>
            <!-- File upload input (hidden) -->
            <input type="file" ref="fileInputEl" style="display:none" multiple @change="handleFileUpload"/>
            <div class="tg-input-wrap" :class="{recording: isRecording}">
              <button class="tg-emoji-btn" :class="{on: showEmojiPicker}" @click.stop="toggleEmojiPicker">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
              </button>
              <!-- Recording UI -->
              <div v-if="isRecording" class="tg-recording-ui">
                <button class="tg-rec-cancel" @click="cancelRecording" title="Cancel recording">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>
                </button>
                <span class="tg-rec-dot"></span>
                <span class="tg-rec-time">{{ fmtDur(recSeconds) }}</span>
                <span class="tg-rec-hint">● Recording…</span>
              </div>
              <textarea v-else v-model="draft" class="tg-input" placeholder="Message…" rows="1"
                @keydown.enter.exact.prevent="sendMsg"
                @keydown.escape="replyTo=null;editingMsg&&cancelEdit()"
                @input="autoResize" ref="inputEl"></textarea>
              <button class="tg-attach-btn" @click="fileInputEl?.click()">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
              </button>
              <!-- Send OR Mic button -->
              <button v-if="draft.trim() || isRecording" class="tg-send-btn"
                :class="{active: draft.trim() || isRecording, recording: isRecording}"
                @click="isRecording ? stopRecording() : sendMsg()"
                :disabled="sending">
                <span v-if="sending" class="tg-send-spinner"></span>
                <svg v-else-if="isRecording" width="16" height="16" viewBox="0 0 24 24" fill="white"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
              <button v-else class="tg-mic-btn" @click="startRecording" title="Voice message">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
              </button>
            </div>
          </div>
          <div v-else class="tg-ch-footer">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            Channel · view only
          </div>
        </template>
      </div>

      <!-- ── INFO PANEL (slides from right) ── -->
      <transition name="tg-info-slide">
        <div v-if="showInfoPanel" class="tg-info-panel">
          <div class="tg-info-head">
            <button class="tg-icon-btn" @click="showInfoPanel=false">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <span style="font-weight:700;font-size:15px">{{ selDlg?.type === 'group' || selDlg?.type === 'channel' ? 'Group Info' : 'Profile' }}</span>
          </div>
          <div class="tg-info-body">
            <!-- Avatar -->
            <div class="tg-info-av-wrap">
              <img v-if="photoCache[selDlg?.id]" :src="photoCache[selDlg?.id]" class="tg-info-av"/>
              <div v-else class="tg-info-av-init" :style="{background: avatarColor(selDlg?.name||'')}">{{ avatarInitials(selDlg?.name||'') }}</div>
            </div>
            <div class="tg-info-name">{{ selDlg?.name }}</div>
            <div class="tg-info-sub" :class="selDlg?.status?.type==='online'&&'online'">{{ dlgSubtitle }}</div>

            <!-- Details rows -->
            <div class="tg-info-rows">
              <div v-if="selDlg?.username" class="tg-info-row">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <div><div class="tg-info-row-val">@{{ selDlg.username }}</div><div class="tg-info-row-label">Username</div></div>
              </div>
              <div class="tg-info-row">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
                <div><div class="tg-info-row-val">{{ selDlg?.type === 'user' ? 'Private' : selDlg?.type }}</div><div class="tg-info-row-label">Type</div></div>
              </div>
            </div>

            <!-- Action buttons -->
            <div class="tg-info-btns">
              <button class="tg-info-btn" @click="showInfoPanel=false;loadMsgs(selDlg,true)">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
                Refresh
              </button>
              <button class="tg-info-btn" @click="openCtxSearch">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                Search
              </button>
              <button class="tg-info-btn red" @click="showInfoPanel=false;logout()">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
                Leave
              </button>
            </div>

            <!-- Shared media section -->
            <div class="tg-info-section-title">Shared Media</div>
            <div v-if="sharedPhotos.length" class="tg-info-grid">
              <div v-for="m in sharedPhotos.slice(0,9)" :key="m.id" class="tg-info-thumb" @click="openLightbox(m.id)">
                <img v-if="mediaCache[m.id] && mediaCache[m.id]!=='loading'" :src="mediaCache[m.id]" class="tg-info-thumb-img"/>
                <div v-else class="tg-info-thumb-ph">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".4"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                </div>
              </div>
            </div>
            <div v-else class="tg-info-empty">No shared photos</div>
          </div>
        </div>
      </transition>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import api from '../services/api'
import { useWebSocket } from '../composables/useWebSocket'

// ── Auth ──────────────────────────────────────────────────────────────
const authStep = ref('loading')
const authPhone = ref(''), authCode = ref(''), authPwd = ref('')
const authLoading = ref(false), authError = ref('')

// ── Core data ──────────────────────────────────────────────────────────
const me = ref(null)
const dialogs = ref([]), dlgsLoading = ref(false)
const msgs = ref([]), msgsLoading = ref(false)
const loadingMore = ref(false), canMore = ref(false)
const selDlg = ref(null)
const draft = ref(''), sending = ref(false)
const dlgQ = ref(''), dlgFilter = ref('all')
const photoCache = ref({})
const { unreadByApp } = useWebSocket()

// ── Modal & Drawer state ──────────────────────────────────────────────
const showDrawer = ref(false)
const modal = ref(null)   // null | 'contacts' | 'saved' | 'stories' | 'addAccount' | 'settings'

// ── Compose dropdown ──────────────────────────────────────────────────
const showCompose = ref(false), showMore = ref(false)

// ── In-chat search ────────────────────────────────────────────────────
const chatSearch = ref(false), csQ = ref(''), csIdx = ref(0)

// ── Contacts modal ────────────────────────────────────────────────────
const contactsList = ref([]), contactsLoading = ref(false), contactQ = ref('')

// ── Saved messages modal ──────────────────────────────────────────────
const savedMsgs = ref([]), savedLoading = ref(false)
const savedDraft = ref(''), savingSelf = ref(false)
const savedScrollEl = ref(null), savedInputEl = ref(null)

// ── Settings ──────────────────────────────────────────────────────────
const activeAccent = ref(localStorage.getItem('tg-accent') || 'blue')
const fontSize = ref(parseInt(localStorage.getItem('tg-font') || '14'))
watch(fontSize, v => localStorage.setItem('tg-font', String(v)))

// ── DOM refs ──────────────────────────────────────────────────────────
const msgsEl = ref(null), msgsBottom = ref(null), inputEl = ref(null)
const moreRef = ref(null), composeRef = ref(null), rootEl = ref(null)

// ── Media / reactions ─────────────────────────────────────────────────
const mediaCache = ref({})
const lightboxSrc = ref(null), lightboxName = ref('photo.jpg')
const reactionPickerId = ref(null)
const REACTIONS = ['👍','❤️','😂','😮','😢','🔥','👏','🎉','🙏','💯']

// ── Reply / Edit / Forward ────────────────────────────────────────────
const replyTo = ref(null)        // message being replied to
const editingMsg = ref(null)     // message being edited
const fwdMsg = ref(null)         // message being forwarded
const fwdQ = ref('')             // forward search query

// ── Context menu ──────────────────────────────────────────────────────
const ctxMenu = ref({ visible: false, x: 0, y: 0, msg: null })

// ── Scroll-to-bottom ──────────────────────────────────────────────────
const showScrollBtn = ref(false)
const unreadScrollCount = ref(0)

// ── Stories ───────────────────────────────────────────────────────────
const viewedStories = ref(new Set())
const myStoryViewed = ref(false)
const storyReplyDraft = ref('')
const storyViewer = ref({
  open: false, isMe: false, name: '', photo: null, time: '',
  bg: 'linear-gradient(135deg,#1a1a2e,#16213e)',
  mediaUrl: null, segments: [1], segIdx: 0, segPct: 0,
})
let storyTimer = null, storyInterval = null
const STORY_DURATION = 5000  // ms per segment

// Seed some contacts from dialogs as "story holders" (simulated — real Telegram stories API is not available via gramjs yet)
const storiesContacts = computed(() => {
  // Use first 6 user-type dialogs that have an unreadCount or photo as story holders
  return dialogs.value
    .filter(d => d.type === 'user')
    .slice(0, 6)
    .map(d => ({ id: d.id, name: d.name, username: d.username }))
})

// ── Info panel ────────────────────────────────────────────────────────
const showInfoPanel = ref(false)
const sharedPhotos = computed(() => msgs.value.filter(m => m.media?.type === 'photo'))
const pinnedMsg = ref(null)
const typingText = ref('')

// ── Emoji picker ──────────────────────────────────────────────────────
const showEmojiPicker = ref(false)
const emojiCat = ref('smileys')
const EMOJI_CATS = [
  { name: 'smileys', icon: '😀', emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','☺️','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','💫','🤯','🤠','🥸','😎','🤓','🧐','😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖'] },
  { name: 'gestures', icon: '👋', emojis: ['👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦵','🦶','👂','🦻','👃','🫀','🫁','🧠','🦷','🦴','👀','👁️','👅','👄','💋','🩸'] },
  { name: 'hearts', icon: '❤️', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉️','✡️','🔯','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','⚛️','🉑','☢️','☣️','📴','📳','🈶','🈚','🈸','🈺','🈷️','✴️','🆚','💮','🉐','㊙️','㊗️','🈴','🈵','🈹','🈲','🅰️','🅱️','🆎','🆑','🅾️','🆘','❌','⭕','🛑','⛔','📛','🚫','💯','💢','♨️','🚷','🚯','🚳','🚱','🔞','📵','🚭'] },
  { name: 'nature', icon: '🐶', emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐽','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🐣','🐥','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🪲','🦟','🦗','🪳','🕷️','🦂','🐢','🐍','🦎','🐊','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🦧','🦣','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🦬','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮','🐕‍🦺','🐈','🐈‍⬛','🪶','🐓','🦃','🦤','🦚','🦜','🦢','🦩','🕊️','🐇','🦝','🦨','🦡','🦫','🦦','🦥','🐁','🐀','🐿️','🦔','🐾','🐉','🐲','🌵','🎄','🌲','🌳','🌴','🪵','🌱','🌿','☘️','🍀','🎍','🪴','🎋','🍃','🍂','🍁','🪺','🪹','🍄','🌾','💐','🌷','🌹','🥀','🪷','🌺','🌸','🌼','🌻','🌞','🌝','🌛','🌜','🌚','🌕','🌖','🌗','🌘','🌑','🌒','🌓','🌔','🌙','🌟','⭐','🌠','🌌','☀️','🌤️','⛅','🌥️','☁️','🌦️','🌧️','⛈️','🌩️','🌨️','❄️','☃️','⛄','🌬️','💨','💧','💦','🫧','☔','☂️','🌊','🌫️'] },
  { name: 'food', icon: '🍕', emojis: ['🍕','🍔','🍟','🌭','🥪','🥙','🧆','🌮','🌯','🫔','🥗','🥘','🫕','🥫','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥮','🍢','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🍯','🧃','🥤','🧋','☕','🍵','🫖','🍺','🍻','🥂','🍷','🫗','🥃','🍸','🍹','🧉','🍾','🧊','🥄','🍴','🍽️','🥢','🧂'] },
  { name: 'travel', icon: '✈️', emojis: ['✈️','🚀','🛸','🚁','🛶','⛵','🚤','🛥️','🛳️','🚢','🚂','🚃','🚄','🚅','🚆','🚇','🚈','🚉','🚊','🚝','🚞','🚋','🚌','🚍','🚎','🚐','🚑','🚒','🚓','🚔','🚕','🚖','🚗','🚘','🚙','🛻','🚚','🚛','🚜','🏎️','🏍️','🛵','🦽','🦼','🛺','🚲','🛴','🛹','🛼','🚏','🛣️','🛤️','⛽','🚧','⚓','🪝','⛵','🚦','🚥','🗺️','🗿','🗽','🗼','🏰','🏯','🏟️','🎡','🎢','🎠','⛲','🎪','🏕️','🏖️','🏜️','🏝️','🏞️','🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏬','🏭','🏗️','🧱','🪨','🪵','⛏️','🪚','🔧','🪛','🔩','⚙️','🗜️','🔗','⛓️','🪝','🧰','🪤','🪣','🔑','🗝️','🔐','🔏','🔒','🔓'] },
  { name: 'symbols', icon: '💥', emojis: ['💥','✨','🌟','⚡','🔥','🌈','🎉','🎊','🎈','🎁','🎀','🎗️','🎟️','🎫','🏆','🥇','🥈','🥉','🏅','🎖️','🏵️','🎗️','📯','🔔','🔕','🎵','🎶','🎼','🎤','🎧','📻','🎷','🪗','🎸','🎹','🎺','🎻','🪕','🥁','🪘','📱','💻','⌨️','🖥️','🖨️','🖱️','🖲️','💾','💿','📀','📷','📸','📹','🎥','📽️','🎞️','📞','☎️','📟','📠','📺','📡','🔭','🔬','🕯️','💡','🔦','🏮','🪔','📔','📒','📕','📗','📘','📙','📚','📓','📃','📄','📑','🗒️','🗓️','📆','📅','🗑️','📁','📂','🗂️','🗃️','🗳️','🗄️','🗑️','🔒','🔓','🔏','🔐','🔑','🗝️'] },
]
const currentEmojis = computed(() => EMOJI_CATS.find(c => c.name === emojiCat.value)?.emojis || [])

// ── Voice recording ───────────────────────────────────────────────────
const fileInputEl = ref(null)
const isRecording = ref(false)
const recSeconds = ref(0)
let mediaRecorder = null, recChunks = [], recTimer = null

// ── Voice playback ────────────────────────────────────────────────────
const voiceBlobUrls = ref({})    // msgId → object URL
const playingVoiceId = ref(null) // currently playing msgId
const voiceProgress  = ref({})   // msgId → 0..1
const voiceDuration  = ref({})   // msgId → seconds
let   activeAudio    = null      // HTMLAudioElement

// ── Constants ─────────────────────────────────────────────────────────
const FILTERS = [
  { l: 'All', v: 'all' }, { l: 'Personal', v: 'user' },
  { l: 'Groups', v: 'group' }, { l: 'Channels', v: 'channel' }, { l: 'Unread', v: 'unread' },
]
const ACCENTS = [
  { id: 'blue',   label: 'Blue',   color: '#229ED9', bubble: '#2b5278' },
  { id: 'teal',   label: 'Teal',   color: '#14b8a6', bubble: '#0f4f4a' },
  { id: 'purple', label: 'Purple', color: '#8b5cf6', bubble: '#3b2570' },
  { id: 'green',  label: 'Green',  color: '#10b981', bubble: '#0d4a30' },
  { id: 'rose',   label: 'Rose',   color: '#f43f5e', bubble: '#5a1a2a' },
  { id: 'orange', label: 'Orange', color: '#f97316', bubble: '#5a2d0a' },
]

// ── Boot ──────────────────────────────────────────────────────────────
// ── Live unread count polling ──────────────────────────────────────────
let _pollTimer = null

function startPolling() {
  stopPolling()
  _pollTimer = setInterval(async () => {
    // Only poll dialogs when user is on a chat (not actively typing)
    if (authStep.value !== 'done') return
    try {
      const r = await api.get('/api/telegram/dialogs?limit=80')
      const fresh = r.data.dialogs
      // Merge unread counts + lastMessage into existing list without full re-render
      for (const d of fresh) {
        const existing = dialogs.value.find(x => x.id === d.id)
        if (existing) {
          // Only update unread if the current chat is NOT open (don't re-badge active chat)
          if (selDlg.value?.id !== d.id) {
            existing.unreadCount = d.unreadCount
          }
          existing.lastMessage = d.lastMessage
          existing.lastDate    = d.lastDate
        }
      }
      // Add any new chats that appeared
      for (const d of fresh) {
        if (!dialogs.value.find(x => x.id === d.id)) {
          dialogs.value.unshift(d)
        }
      }
    } catch { /* silent — polling should never break the UI */ }
  }, 15000)  // every 15 seconds
}

function stopPolling() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null }
}

function applyLiveUnreadBadges() {
  const entry = unreadByApp.telegram
  const liveItems = Array.isArray(entry?.items) ? entry.items : []
  if (!dialogs.value.length || !liveItems.length) return

  const liveMap = new Map(
    liveItems
      .filter((item) => item?.name)
      .map((item) => [String(item.name).trim().toLowerCase(), Number(item.unread || 0) || 0])
  )

  dialogs.value.forEach((dialog) => {
    if (!dialog?.name || selDlg.value?.id === dialog.id) return
    const nextUnread = liveMap.get(String(dialog.name).trim().toLowerCase())
    if (Number.isFinite(nextUnread) && nextUnread > 0) {
      dialog.unreadCount = Math.max(Number(dialog.unreadCount || 0), nextUnread)
    }
  })
}

onMounted(async () => {
  const a = ACCENTS.find(x => x.id === activeAccent.value) || ACCENTS[0]
  applyAccent(a)

  try {
    const r = await api.get('/api/telegram/me')
    if (r.data?.authorized) { me.value = r.data; authStep.value = 'done'; loadDlgs(); startPolling() }
    else authStep.value = 'phone'
  } catch { authStep.value = 'phone' }

  document.addEventListener('click', docClick)
})
onUnmounted(() => {
  document.removeEventListener('click', docClick)
  stopPolling()
})

// Wire scroll listener after selDlg is set
watch(selDlg, () => {
  nextTick(() => {
    if (msgsEl.value) {
      msgsEl.value.removeEventListener('scroll', onMsgsScroll)
      msgsEl.value.addEventListener('scroll', onMsgsScroll, { passive: true })
    }
  })
})

function docClick(e) {
  if (moreRef.value && !moreRef.value.contains(e.target)) showMore.value = false
  if (composeRef.value && !composeRef.value.contains(e.target)) showCompose.value = false
  if (reactionPickerId.value && !e.target.closest('.tg-reaction-picker') && !e.target.closest('.tg-act-btn')) {
    reactionPickerId.value = null
  }
  if (ctxMenu.value.visible && !e.target.closest('.tg-ctx-menu')) {
    ctxMenu.value.visible = false
  }
  if (showEmojiPicker.value && !e.target.closest('.tg-emoji-picker') && !e.target.closest('.tg-emoji-btn')) {
    showEmojiPicker.value = false
  }
}

// ── Backdrop handler ──────────────────────────────────────────────────
function handleBackdropClick() {
  if (modal.value) { closeModal(); return }
  showDrawer.value = false
}

// ── Modal helpers ─────────────────────────────────────────────────────
function openModal(name) {
  modal.value = name
  showDrawer.value = false
  if (name === 'contacts') fetchContacts()
  if (name === 'saved')    fetchSaved()
}
function closeModal() {
  modal.value = null
  contactQ.value = ''
}

// ── Accent ────────────────────────────────────────────────────────────
function applyAccent(a) {
  activeAccent.value = a.id
  localStorage.setItem('tg-accent', a.id)
  // Set on the component root element so scoped CSS vars are overridden correctly
  const el = rootEl.value || document.querySelector('.tg-root')
  if (el) {
    el.style.setProperty('--tg-accent', a.color)
    el.style.setProperty('--tg-bubble-me', a.bubble)
  }
}

// ── Auth ──────────────────────────────────────────────────────────────
async function submitPhone() {
  authError.value = ''; authLoading.value = true
  try { await api.post('/api/telegram/auth/phone', { phoneNumber: authPhone.value }); authStep.value = 'code' }
  catch (e) { authError.value = e.response?.data?.error || 'Failed to send code' }
  finally { authLoading.value = false }
}
async function submitCode() {
  authError.value = ''; authLoading.value = true
  try {
    const r = await api.post('/api/telegram/auth/code', { code: authCode.value })
    if (r.data.needsPassword) authStep.value = 'password'
    else { me.value = r.data; authStep.value = 'done'; loadDlgs() }
  } catch (e) { authError.value = e.response?.data?.error || 'Invalid code' }
  finally { authLoading.value = false }
}
async function submitPassword() {
  authError.value = ''; authLoading.value = true
  try { const r = await api.post('/api/telegram/auth/password', { password: authPwd.value }); me.value = r.data; authStep.value = 'done'; loadDlgs() }
  catch (e) { authError.value = e.response?.data?.error || 'Wrong password' }
  finally { authLoading.value = false }
}
async function logout() {
  closeModal(); showDrawer.value = false; showMore.value = false
  try { await api.delete('/api/telegram/session') } catch {}
  me.value = null; dialogs.value = []; msgs.value = []; selDlg.value = null; authStep.value = 'phone'
}

// ── Contacts ──────────────────────────────────────────────────────────
async function fetchContacts() {
  if (contactsList.value.length) return
  contactsLoading.value = true
  try { const r = await api.get('/api/telegram/contacts'); contactsList.value = r.data.contacts }
  catch (e) { console.error('contacts:', e) }
  finally { contactsLoading.value = false }
}
const filteredContacts = computed(() => {
  if (!contactQ.value.trim()) return contactsList.value
  const q = contactQ.value.toLowerCase()
  return contactsList.value.filter(c => (c.firstName + ' ' + c.lastName + c.username + c.phone).toLowerCase().includes(q))
})
function startChatWithContact(c) {
  closeModal()
  const existing = dialogs.value.find(d => d.id === c.id || (c.username && d.username === c.username))
  if (existing) { selectDlg(existing); return }
  const fake = { id: c.id, name: (c.firstName + ' ' + c.lastName).trim(), type: 'user', username: c.username || '', unreadCount: 0, lastDate: null, lastMessage: '' }
  dialogs.value.unshift(fake)
  selectDlg(fake)
}

// ── Saved Messages ────────────────────────────────────────────────────
async function fetchSaved() {
  savedLoading.value = true
  try { const r = await api.get('/api/telegram/saved-messages?limit=50'); savedMsgs.value = r.data.messages }
  catch (e) { console.error('saved:', e) }
  finally { savedLoading.value = false; await nextTick(); scrollSaved() }
}
function scrollSaved() { if (savedScrollEl.value) savedScrollEl.value.scrollTop = savedScrollEl.value.scrollHeight }
async function sendSavedMessage() {
  const text = savedDraft.value.trim(); if (!text || savingSelf.value) return
  savingSelf.value = true
  try {
    await api.post('/api/telegram/dialogs/me/send', { text })
    savedMsgs.value.push({ id: Date.now().toString(), text, fromMe: true, date: new Date().toISOString(), media: null })
    savedDraft.value = ''
    await nextTick(); scrollSaved()
    if (savedInputEl.value) savedInputEl.value.style.height = 'auto'
  } catch (e) { console.error(e) }
  finally { savingSelf.value = false }
}
function showSavedDateSep(idx) {
  if (!idx) return true
  const c = savedMsgs.value[idx]?.date, p = savedMsgs.value[idx - 1]?.date
  return c && p ? new Date(c).toDateString() !== new Date(p).toDateString() : false
}

// ── Compose ────────────────────────────────────────────────────────────
function newChat(type) {
  showCompose.value = false
  if (type === 'private') { openModal('contacts'); return }
  window.open('https://web.telegram.org', '_blank')
}

// ── Dialogs ────────────────────────────────────────────────────────────
async function loadDlgs() {
  dlgsLoading.value = true
  try {
    const r = await api.get('/api/telegram/dialogs?limit=80')
    dialogs.value = r.data.dialogs
    applyLiveUnreadBadges()
    batchPhotos(r.data.dialogs)
  } catch (e) { console.error(e) }
  finally { dlgsLoading.value = false }
}
async function batchPhotos(list) {
  for (let i = 0; i < list.length; i += 5) {
    await Promise.allSettled(list.slice(i, i + 5).map(d => loadPhoto(d.id)))
    await new Promise(r => setTimeout(r, 180))
  }
}
async function loadPhoto(id) {
  if (!id || photoCache.value[id] !== undefined) return
  photoCache.value[id] = null
  try { const r = await api.get(`/api/telegram/photo/${encodeURIComponent(id)}`); if (r.data.photo) photoCache.value[id] = r.data.photo } catch {}
}
const filteredDlgs = computed(() => {
  let list = dialogs.value
  if (dlgFilter.value !== 'all')
    list = dlgFilter.value === 'unread' ? list.filter(d => d.unreadCount > 0) : list.filter(d => d.type === dlgFilter.value)
  if (dlgQ.value.trim()) {
    const q = dlgQ.value.toLowerCase()
    list = list.filter(d => d.name.toLowerCase().includes(q) || d.username?.toLowerCase().includes(q))
  }
  return list
})
const dlgSubtitle = computed(() => {
  if (!selDlg.value) return ''
  const { type, username, status } = selDlg.value
  if (type === 'channel') return 'Channel'
  if (type === 'group') return 'Group'
  // Show live status for private chats
  if (status?.type === 'online') return 'Online'
  if (status?.type === 'offline' && status.wasOnline) {
    return 'Last seen ' + fmtRelative(status.wasOnline)
  }
  if (status?.type === 'recently') return 'Last seen recently'
  if (status?.type === 'lastWeek') return 'Last seen within a week'
  if (status?.type === 'lastMonth') return 'Last seen within a month'
  return username ? '@' + username : ''
})

// ── Messages ───────────────────────────────────────────────────────────
async function selectDlg(d) {
  selDlg.value = d; msgs.value = []; canMore.value = false
  chatSearch.value = false; csQ.value = ''; showMore.value = false
  showInfoPanel.value = false; replyTo.value = null; editingMsg.value = null
  const dl = dialogs.value.find(x => x.id === d.id)
  const unread = dl?.unreadCount || 0
  if (dl) dl.unreadCount = 0          // clear immediately in UI
  await loadMsgsReturn(d, unread)
  // Tell Telegram server to mark messages as read — so unread count
  // stays 0 on the next loadDlgs() refresh
  if (unread > 0) {
    api.post(`/api/telegram/dialogs/${encodeURIComponent(d.id)}/read`).catch(() => {})
  }
}

watch(
  () => unreadByApp.telegram?.items,
  () => {
    applyLiveUnreadBadges()
  },
  { deep: true }
)
async function loadMsgsReturn(dlg, unreadCount = 0) {
  msgsLoading.value = true; msgs.value = []
  try {
    const r = await api.get(`/api/telegram/dialogs/${encodeURIComponent(dlg.id)}/messages?limit=50`)
    msgs.value = r.data.messages; canMore.value = r.data.messages.length >= 50
    // Mark unread divider position
    if (unreadCount > 0 && msgs.value.length > unreadCount) {
      unreadStartIdx.value = msgs.value.length - unreadCount
    } else { unreadStartIdx.value = -1 }
    if (dlg.type !== 'user') {
      const ids = [...new Set(r.data.messages.filter(m => !m.fromMe && m.fromId).map(m => m.fromId))]
      ids.forEach(id => loadPhoto(id))
    }
    scrollBottom()
    autoLoadMediaBatch(r.data.messages, dlg.id)
  } catch (e) { console.error(e) }
  finally { msgsLoading.value = false }
}
async function loadMsgs(dlg, refresh = false) {
  msgsLoading.value = true; if (refresh) msgs.value = []
  try {
    const r = await api.get(`/api/telegram/dialogs/${encodeURIComponent(dlg.id)}/messages?limit=50`)
    msgs.value = r.data.messages; canMore.value = r.data.messages.length >= 50
    if (dlg.type !== 'user') {
      const ids = [...new Set(r.data.messages.filter(m => !m.fromMe && m.fromId).map(m => m.fromId))]
      ids.forEach(id => loadPhoto(id))
    }
    scrollBottom()
    autoLoadMediaBatch(r.data.messages, dlg.id)
  } catch (e) { console.error(e) }
  finally { msgsLoading.value = false }
}

// Load photos/videos automatically in the background after messages render
async function autoLoadMediaBatch(messages, dialogId) {
  const toLoad = messages.filter(m =>
    m.media?.msgId && ['photo'].includes(m.media.type) && !mediaCache.value[m.id]
  )
  // Load up to 6 at a time to avoid hammering
  for (let i = 0; i < toLoad.length; i += 3) {
    const batch = toLoad.slice(i, i + 3)
    await Promise.allSettled(batch.map(async m => {
      mediaCache.value[m.id] = 'loading'
      try {
        const r = await api.get(`/api/telegram/media/${encodeURIComponent(dialogId)}/${m.media.msgId}`)
        mediaCache.value[m.id] = r.data.data || null
      } catch { mediaCache.value[m.id] = null }
    }))
    // Small pause between batches so UI stays responsive
    await new Promise(r => setTimeout(r, 300))
  }
}
async function loadMore() {
  if (!selDlg.value || !msgs.value.length) return
  loadingMore.value = true
  try {
    const r = await api.get(`/api/telegram/dialogs/${encodeURIComponent(selDlg.value.id)}/messages?limit=50&offsetId=${msgs.value[0]?.id || 0}`)
    msgs.value = [...r.data.messages, ...msgs.value]; canMore.value = r.data.messages.length >= 50
    await nextTick(); if (msgsEl.value) msgsEl.value.scrollTop = 220
  } catch {} finally { loadingMore.value = false }
}
async function sendMsg() {
  const text = draft.value.trim(); if (!text || !selDlg.value || sending.value) return

  // Editing an existing message
  if (editingMsg.value) {
    const orig = editingMsg.value
    draft.value = ''; cancelEdit()
    try {
      await api.post(`/api/telegram/dialogs/${encodeURIComponent(selDlg.value.id)}/messages/${orig.id}/edit`, { text })
      const m = msgs.value.find(x => x.id === orig.id); if (m) m.text = text
    } catch (e) { console.error('edit:', e) }
    return
  }

  sending.value = true
  const opt = {
    id: Date.now(), text, fromMe: true,
    fromName: me.value?.firstName || 'Me', fromId: null,
    date: new Date().toISOString(), media: null,
    replyTo: replyTo.value?.id || null,
    replyToName: replyTo.value ? (replyTo.value.fromMe ? 'You' : replyTo.value.fromName) : null,
    replyToText: replyTo.value?.text || null,
  }
  const rep = replyTo.value
  replyTo.value = null
  msgs.value.push(opt); draft.value = ''
  await nextTick(); scrollBottom()
  if (inputEl.value) inputEl.value.style.height = 'auto'
  try {
    await api.post(`/api/telegram/dialogs/${encodeURIComponent(selDlg.value.id)}/send`, {
      text,
      replyToMsgId: rep?.id || undefined,
    })
  } catch { msgs.value = msgs.value.filter(m => m.id !== opt.id) }
  finally { sending.value = false }
}

// ── In-chat search ─────────────────────────────────────────────────────
const csResults = computed(() => {
  if (!csQ.value.trim()) return []
  const q = csQ.value.toLowerCase()
  return msgs.value.map((m, i) => m.text?.toLowerCase().includes(q) ? i : -1).filter(i => i >= 0)
})
watch(csResults, res => {
  csIdx.value = res.length ? res.length - 1 : 0
  if (res.length) scrollToMsg(res[res.length - 1])
})
function toggleSearch() { chatSearch.value = !chatSearch.value; if (!chatSearch.value) csQ.value = '' }
function csNav(dir) { const r = csResults.value; if (!r.length) return; csIdx.value = (csIdx.value + dir + r.length) % r.length; scrollToMsg(r[csIdx.value]) }
function scrollToMsg(idx) { nextTick(() => msgsEl.value?.querySelector(`#m${msgs.value[idx]?.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })) }
function csHighlight(text, idx) {
  if (!csQ.value || !csResults.value.includes(idx)) return escHtml(text)
  const q = csQ.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return escHtml(text).replace(new RegExp(escHtml(q), 'gi'), m => `<mark class="tg-hl">${m}</mark>`)
}
function escHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

function clearHist() { msgs.value = []; showMore.value = false }
function copyLink() { const u = selDlg.value?.username; navigator.clipboard?.writeText(u ? `https://t.me/${u}` : selDlg.value?.name || ''); showMore.value = false }


// ── Load message media (photo/video) ─────────────────────────────────
async function loadMsgMedia(msgId, mediaMsgId) {
  if (!selDlg.value || !mediaMsgId) return
  mediaCache.value[msgId] = 'loading'
  try {
    const r = await api.get(`/api/telegram/media/${encodeURIComponent(selDlg.value.id)}/${mediaMsgId}`)
    mediaCache.value[msgId] = r.data.data
  } catch { mediaCache.value[msgId] = null }
}
function openLightbox(msgId) {
  lightboxSrc.value = mediaCache.value[msgId] || null
  lightboxName.value = 'photo_' + msgId + '.jpg'
}

// ── Download attachment ───────────────────────────────────────────────
async function downloadAttachment(msg) {
  if (!msg.media?.msgId || !selDlg.value) return
  try {
    // If already cached use it; otherwise fetch
    let dataUrl = mediaCache.value[msg.id]
    if (!dataUrl || dataUrl === 'loading') {
      const r = await api.get(`/api/telegram/media/${encodeURIComponent(selDlg.value.id)}/${msg.media.msgId}`)
      dataUrl = r.data.data
      mediaCache.value[msg.id] = dataUrl
    }
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = msg.media.fileName || ('file_' + msg.id)
    a.click()
  } catch (e) { console.error('download:', e) }
}

// ── Delete message ────────────────────────────────────────────────────
async function deleteMsg(msgId) {
  if (!selDlg.value) return
  try {
    await api.delete(`/api/telegram/dialogs/${encodeURIComponent(selDlg.value.id)}/messages/${msgId}`)
    msgs.value = msgs.value.filter(m => m.id !== msgId)
  } catch (e) { console.error('delete:', e) }
}

// ── Reactions ─────────────────────────────────────────────────────────
function toggleReactionPicker(msgId) {
  reactionPickerId.value = reactionPickerId.value === msgId ? null : msgId
}
async function sendReaction(msgId, emoticon) {
  reactionPickerId.value = null
  if (!selDlg.value) return
  try {
    await api.post(`/api/telegram/dialogs/${encodeURIComponent(selDlg.value.id)}/messages/${msgId}/react`, { emoticon })
  } catch (e) { console.error('react:', e) }
}

// ── Relative time for status ──────────────────────────────────────────
function fmtRelative(iso) {
  const d = new Date(iso), now = new Date(), diff = Math.floor((now - d) / 1000)
  if (diff < 60)  return 'just now'
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago'
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago'
  const days = Math.floor(diff / 86400)
  if (days === 1) return 'yesterday'
  if (days < 7)  return days + 'd ago'
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' })
}

// ── Reply ─────────────────────────────────────────────────────────────
function setReply(msg) {
  replyTo.value = msg; editingMsg.value = null
  nextTick(() => inputEl.value?.focus())
}

// ── Edit ──────────────────────────────────────────────────────────────
function startEdit(msg) {
  editingMsg.value = msg; replyTo.value = null
  draft.value = msg.text
  nextTick(() => { inputEl.value?.focus(); autoResizeEl(inputEl.value) })
}
function cancelEdit() { editingMsg.value = null; draft.value = '' }
function autoResizeEl(el) { if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 140) + 'px' }

// ── Scroll to quoted message ──────────────────────────────────────────
function scrollToReply(replyId) {
  const el = msgsEl.value?.querySelector('#m' + replyId)
  if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('tg-flash'); setTimeout(() => el.classList.remove('tg-flash'), 1200) }
}

// ── Scroll to bottom btn ──────────────────────────────────────────────
function onMsgsScroll() {
  const el = msgsEl.value; if (!el) return
  const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
  showScrollBtn.value = fromBottom > 200
}
function scrollBottomNow() {
  const el = msgsEl.value; if (el) el.scrollTop = el.scrollHeight
  unreadScrollCount.value = 0
}

// ── Context menu ──────────────────────────────────────────────────────
function openCtxMenu(e, msg) {
  const root = rootEl.value?.getBoundingClientRect() || { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
  let x = e.clientX - root.left
  let y = e.clientY - root.top
  if (x + 180 > root.width)  x = root.width  - 190
  if (y + 260 > root.height) y = root.height - 270
  if (x < 0) x = 4
  if (y < 0) y = 4
  ctxMenu.value = { visible: true, x, y, msg }
}
function ctxReply()    { setReply(ctxMenu.value.msg);               ctxMenu.value.visible = false }
function ctxEdit()     { startEdit(ctxMenu.value.msg);              ctxMenu.value.visible = false }
function ctxCopy()     { navigator.clipboard?.writeText(ctxMenu.value.msg?.text || ''); ctxMenu.value.visible = false }
function ctxForward()  { fwdMsg.value = ctxMenu.value.msg; fwdQ.value = ''; openModal('forward'); ctxMenu.value.visible = false }
function ctxDownload() { downloadAttachment(ctxMenu.value.msg);     ctxMenu.value.visible = false }
function ctxDelete()   { deleteMsg(ctxMenu.value.msg?.id);          ctxMenu.value.visible = false }

// ── Forward ───────────────────────────────────────────────────────────
const fwdFilteredDlgs = computed(() => {
  if (!fwdQ.value.trim()) return dialogs.value.slice(0, 30)
  const q = fwdQ.value.toLowerCase()
  return dialogs.value.filter(d => d.name.toLowerCase().includes(q)).slice(0, 30)
})
async function doForward(targetDlg) {
  const msg = fwdMsg.value; if (!msg || !selDlg.value) return
  closeModal()
  try {
    await api.post(`/api/telegram/dialogs/${encodeURIComponent(targetDlg.id)}/send`, {
      text: msg.text || '',
      forwardFromId: selDlg.value.id,
      forwardMsgId:  msg.id,
    })
  } catch (e) { console.error('forward:', e) }
}

// ── Emoji picker ──────────────────────────────────────────────────────
function toggleEmojiPicker() {
  showEmojiPicker.value = !showEmojiPicker.value
}
function insertEmoji(e) {
  const el = inputEl.value
  if (!el) { draft.value += e; return }
  const start = el.selectionStart ?? draft.value.length
  const end   = el.selectionEnd   ?? draft.value.length
  draft.value = draft.value.slice(0, start) + e + draft.value.slice(end)
  nextTick(() => {
    el.focus()
    el.setSelectionRange(start + e.length, start + e.length)
    autoResizeEl(el)
  })
}

// ── Voice recording ────────────────────────────────────────────────────
async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia) {
    alert('Microphone not available in this browser'); return
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    recChunks = []; recSeconds.value = 0; isRecording.value = true
    mediaRecorder = new MediaRecorder(stream)
    mediaRecorder.ondataavailable = e => { if (e.data.size) recChunks.push(e.data) }
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop())
      isRecording.value = false
      clearInterval(recTimer)
      if (!recChunks.length) return  // cancelled
      const blob   = new Blob(recChunks, { type: 'audio/webm' })
      const dur    = recSeconds.value
      const msgId  = Date.now()
      const objUrl = URL.createObjectURL(blob)
      voiceBlobUrls.value[msgId] = objUrl
      voiceDuration.value[msgId] = dur
      const fakeMsg = {
        id: msgId, text: '', fromMe: true,
        fromName: me.value?.firstName || 'Me', fromId: null,
        date: new Date().toISOString(), media: { type: 'voice', duration: dur },
      }
      msgs.value.push(fakeMsg)
      nextTick(() => scrollBottom())
    }
    mediaRecorder.start(200)
    recTimer = setInterval(() => recSeconds.value++, 1000)
  } catch (e) { isRecording.value = false; console.error('mic:', e) }
}
function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop()
  clearInterval(recTimer)
}
function cancelRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    // Null the onstop so it won't produce a message
    mediaRecorder.ondataavailable = () => {}
    mediaRecorder.onstop = () => {
      mediaRecorder?.stream?.getTracks().forEach(t => t.stop())
      isRecording.value = false
    }
    mediaRecorder.stop()
  } else {
    isRecording.value = false
  }
  recChunks = []
  clearInterval(recTimer)
  recSeconds.value = 0
}

// ── File upload ────────────────────────────────────────────────────────
async function handleFileUpload(e) {
  const files = [...(e.target.files || [])]
  if (!files.length || !selDlg.value) return
  e.target.value = ''

  for (const file of files) {
    const isImage = file.type.startsWith('image/')
    const isVideo = file.type.startsWith('video/')

    // Show optimistic fake message immediately
    const fakeId  = Date.now() + Math.random()
    const fakeMsg = {
      id: fakeId, text: '', fromMe: true,
      fromName: me.value?.firstName || 'Me', fromId: null,
      date: new Date().toISOString(),
      media: isImage
        ? { type: 'photo',    msgId: null, _sending: true }
        : isVideo
          ? { type: 'video',  msgId: null, _sending: true, fileName: file.name }
          : { type: 'document', fileName: file.name, size: file.size, mimeType: file.type, msgId: null, _sending: true },
    }
    msgs.value.push(fakeMsg)
    nextTick(() => scrollBottom())

    // Read as base64 and POST to backend
    try {
      const b64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload  = ev => resolve(ev.target.result.split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      await api.post(`/api/telegram/dialogs/${encodeURIComponent(selDlg.value.id)}/upload`, {
        fileName:    file.name,
        mimeType:    file.type,
        base64:      b64,
        caption:     '',
      })

      // Mark as sent — remove _sending flag
      const idx = msgs.value.findIndex(m => m.id === fakeId)
      if (idx !== -1) {
        const updated = { ...msgs.value[idx] }
        if (updated.media) updated.media = { ...updated.media, _sending: false }
        msgs.value.splice(idx, 1, updated)
      }
    } catch(err) {
      console.error('File upload failed:', err)
      // Show error on the fake message
      const idx = msgs.value.findIndex(m => m.id === fakeId)
      if (idx !== -1) {
        const updated = { ...msgs.value[idx], text: '⚠️ Upload failed' }
        msgs.value.splice(idx, 1, updated)
      }
    }
  }
}

// ── Info panel helpers ─────────────────────────────────────────────────
function openCtxSearch() { showInfoPanel.value = false; toggleSearch() }
function scrollToMsg2(id) {
  const el = msgsEl.value?.querySelector('#m' + id)
  if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('tg-flash'); setTimeout(() => el.classList.remove('tg-flash'), 1200) }
}

// ── Unread divider ─────────────────────────────────────────────────────
// Show "Unread messages" banner at the first unread message
const unreadStartIdx = ref(-1)
function isUnreadDivider(idx) { return idx === unreadStartIdx.value && idx > 0 }




// ── Voice playback ────────────────────────────────────────────────────
function toggleVoice(msg) {
  const msgId = msg.id
  // If already playing this message — pause
  if (playingVoiceId.value === msgId) {
    activeAudio?.pause()
    playingVoiceId.value = null
    return
  }
  // Stop any current audio
  if (activeAudio) { activeAudio.pause(); activeAudio = null }
  playingVoiceId.value = msgId

  const url = voiceBlobUrls.value[msgId]
  if (!url) {
    // No local blob — try fetching from backend if msgId exists
    if (msg.media?.msgId && selDlg.value) {
      fetchAndPlayVoice(msg)
    } else {
      playingVoiceId.value = null
    }
    return
  }
  playAudioUrl(msgId, url)
}

async function fetchAndPlayVoice(msg) {
  try {
    const r = await api.get(`/api/telegram/media/${encodeURIComponent(selDlg.value.id)}/${msg.media.msgId}`)
    // Convert base64 data URL → blob URL
    const dataUrl = r.data.data
    const res  = await fetch(dataUrl)
    const blob = await res.blob()
    const url  = URL.createObjectURL(blob)
    voiceBlobUrls.value[msg.id] = url
    playAudioUrl(msg.id, url)
  } catch (e) {
    console.error('voice fetch:', e)
    playingVoiceId.value = null
  }
}

function playAudioUrl(msgId, url) {
  const audio = new Audio(url)
  activeAudio = audio
  voiceProgress.value[msgId] = 0

  audio.addEventListener('loadedmetadata', () => {
    voiceDuration.value[msgId] = audio.duration
  })
  audio.addEventListener('timeupdate', () => {
    if (audio.duration) {
      voiceProgress.value[msgId] = audio.currentTime / audio.duration
    }
  })
  audio.addEventListener('ended', () => {
    playingVoiceId.value = null
    voiceProgress.value[msgId] = 0
    activeAudio = null
  })
  audio.play().catch(() => { playingVoiceId.value = null })
}

function seekVoice(e, msg) {
  if (!activeAudio || playingVoiceId.value !== msg.id) return
  const rect = e.currentTarget.getBoundingClientRect()
  const pct  = (e.clientX - rect.left) / rect.width
  activeAudio.currentTime = pct * activeAudio.duration
  voiceProgress.value[msg.id] = pct
}

// ── Stories viewer ────────────────────────────────────────────────────
function openStoryViewer(contact) {
  showDrawer.value = false
  const isMe = contact === 'me'
  const segments = isMe ? [1] : [1, 2, 3].slice(0, 1 + Math.floor(Math.random() * 2))
  const BG_GRADIENTS = [
    'linear-gradient(135deg,#1a1a2e,#16213e)',
    'linear-gradient(135deg,#0f3460,#533483)',
    'linear-gradient(135deg,#2d1b69,#11998e)',
    'linear-gradient(135deg,#1e3c72,#2a5298)',
    'linear-gradient(135deg,#4a0072,#8e0e00)',
    'linear-gradient(135deg,#134e5e,#71b280)',
  ]
  const bgIdx = isMe ? 0 : (contact.id.charCodeAt(0) % BG_GRADIENTS.length)

  storyViewer.value = {
    open: true, isMe,
    name: isMe ? ((me.value?.firstName||'') + ' ' + (me.value?.lastName||'')).trim() : contact.name,
    photo: isMe ? null : (photoCache.value[contact.id] || null),
    time: isMe ? 'now' : 'recently',
    bg: BG_GRADIENTS[bgIdx],
    mediaUrl: isMe ? null : (photoCache.value[contact.id] || null),
    segments, segIdx: 0, segPct: 0,
  }
  if (!isMe) {
    viewedStories.value.add(isMe ? 'me' : contact.id)
    viewedStories.value = new Set(viewedStories.value)  // trigger reactivity
  } else {
    myStoryViewed.value = true
  }
  startStoryTimer()
}

function closeStoryViewer() {
  clearStoryTimers()
  storyViewer.value.open = false
  storyReplyDraft.value = ''
}

function startStoryTimer() {
  clearStoryTimers()
  const start = Date.now()
  storyViewer.value.segPct = 0
  storyInterval = setInterval(() => {
    const elapsed = Date.now() - start
    storyViewer.value.segPct = Math.min((elapsed / STORY_DURATION) * 100, 100)
    if (elapsed >= STORY_DURATION) storyNext()
  }, 50)
}

function clearStoryTimers() {
  clearInterval(storyInterval)
  clearTimeout(storyTimer)
  storyInterval = null; storyTimer = null
}

function storyNext() {
  const sv = storyViewer.value
  if (sv.segIdx < sv.segments.length - 1) {
    sv.segIdx++; sv.segPct = 0
    startStoryTimer()
  } else {
    closeStoryViewer()
  }
}

function storyPrev() {
  const sv = storyViewer.value
  if (sv.segIdx > 0) {
    sv.segIdx--; sv.segPct = 0; startStoryTimer()
  } else {
    sv.segPct = 0; startStoryTimer()
  }
}

function storyViewerTap(e) {
  // Tap right half → next, left half → prev  (handled by tap zones)
}

async function sendStoryReply() {
  const text = storyReplyDraft.value.trim()
  if (!text || !storyViewer.value.name) return
  // Find the dialog for this contact and send a message
  const dlg = dialogs.value.find(d => d.name === storyViewer.value.name)
  storyReplyDraft.value = ''
  closeStoryViewer()
  if (dlg) {
    selectDlg(dlg)
    await nextTick()
    draft.value = text
    sendMsg()
  }
}

// ── Helpers ────────────────────────────────────────────────────────────
function autoResize(e) { const el = e.target; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 140) + 'px' }
function scrollBottom() {
  nextTick(() => {
    nextTick(() => {
      const el = msgsEl.value
      if (el) { el.scrollTop = el.scrollHeight }
    })
  })
}
function isFirst(idx) { if (!idx) return true; const c = msgs.value[idx], p = msgs.value[idx - 1]; return !c || !p || c.fromId !== p.fromId || c.fromMe !== p.fromMe }
function isLast(idx)  { const c = msgs.value[idx], n = msgs.value[idx + 1]; return !n || c.fromId !== n.fromId || c.fromMe !== n.fromMe }
function showDSep(idx) { if (!idx) return true; const c = msgs.value[idx]?.date, p = msgs.value[idx - 1]?.date; return !c || !p ? false : new Date(c).toDateString() !== new Date(p).toDateString() }
const AV = ['#6366f1','#8b5cf6','#ec4899','#06b6d4','#10b981','#f59e0b','#ef4444','#229ED9','#0ea5e9','#14b8a6']
const SC = ['#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#DDA0DD','#98D8C8','#F7DC6F','#BB8FCE','#85C1E9','#F0A500']
function hsh(s) { let x = 0; for (let i = 0; i < s.length; i++) x = s.charCodeAt(i) + ((x << 5) - x); return Math.abs(x) }
function avatarColor(n = '') { return AV[hsh(n) % AV.length] }
function senderCol(id = '') { return SC[hsh(id) % SC.length] }
function avatarInitials(n = '') { const w = n.trim().split(/\s+/); return w.length >= 2 ? (w[0][0] + w[1][0]).toUpperCase() : (n.slice(0, 2) || '?').toUpperCase() }
function fmtDate(iso) { if (!iso) return ''; const d = new Date(iso), now = new Date(), diff = Math.floor((now - d) / 86400000); if (diff === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); if (diff === 1) return 'Yesterday'; if (diff < 7) return d.toLocaleDateString([], { weekday: 'short' }); return d.toLocaleDateString([], { day: 'numeric', month: 'short' }) }
function fmtTime(iso) { if (!iso) return ''; return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
function formatDateSep(iso) { if (!iso) return ''; const d = new Date(iso), now = new Date(), diff = Math.floor((now - d) / 86400000); if (diff === 0) return 'Today'; if (diff === 1) return 'Yesterday'; return d.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' }) }
function fmtDur(s) { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
function fmtSize(b) { if (!b) return ''; if (b < 1024) return b + 'B'; if (b < 1048576) return (b / 1024).toFixed(1) + 'KB'; return (b / 1048576).toFixed(1) + 'MB' }
function fmtViews(v) { if (!v) return ''; if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M'; if (v >= 1000) return (v / 1000).toFixed(1) + 'K'; return String(v) }
function fExt(n = '') { return (n.split('.').pop() || '?').slice(0, 4).toUpperCase() }
const EX = { pdf: '#e44', doc: '#2b7', docx: '#2b7', xls: '#1a9', xlsx: '#1a9', zip: '#fa0', rar: '#fa0', mp4: '#a5f', mp3: '#59f', png: '#06c', jpg: '#06c', jpeg: '#06c' }
function fIconCol(n = '') { return EX[(n.split('.').pop() || '').toLowerCase()] || '#888' }
</script>

<style scoped>
/* ── ROOT ── */
.tg-root {
  position: relative; display: flex; flex-direction: column;
  height: 100%; overflow: hidden;
  background: var(--bg-base); color: var(--text-primary); font-size: 14px;
  --tg-accent: #229ED9; --tg-bubble-me: #2b5278;
}

/* ── FIXED LAYER (backdrop + drawer + modals) ── */
.tg-backdrop {
  position: absolute; inset: 0; z-index: 900;
  background: rgba(0,0,0,.45);
}
.tg-backdrop:not(.dim) { background: transparent; }

/* ── DRAWER ── */
.tg-drawer {
  position: absolute; top: 0; left: 0; bottom: 0; width: 280px;
  background: var(--bg-surface); border-right: 1px solid var(--border-subtle);
  z-index: 950; display: flex; flex-direction: column; overflow: hidden;
}
.tg-drawer-banner {
  background: linear-gradient(145deg, var(--tg-bubble-me), var(--tg-accent));
  padding: 28px 18px 20px; display: flex; flex-direction: column; gap: 12px; flex-shrink: 0;
}
.tg-drawer-av {
  width: 56px; height: 56px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; font-weight: 700; color: #fff;
  border: 2.5px solid rgba(255,255,255,.25);
}
.tg-drawer-name { font-size: 16px; font-weight: 700; color: #fff; }
.tg-drawer-phone { font-size: 12.5px; color: rgba(255,255,255,.72); }
.tg-drawer-nav { flex: 1; overflow-y: auto; padding: 10px 8px; }
.tg-drawer-item {
  width: 100%; display: flex; align-items: center; gap: 15px;
  padding: 12px 12px; border: none; background: transparent;
  color: var(--text-primary); font-size: 14px; cursor: pointer;
  border-radius: 10px; text-align: left; transition: background .12s;
}
.tg-drawer-item:hover { background: var(--bg-elevated); }
.tg-drawer-item svg { color: var(--text-secondary); flex-shrink: 0; }
.tg-drawer-item.danger { color: #ef4444; }
.tg-drawer-item.danger svg { color: #ef4444; }
.tg-drawer-sep { height: 1px; background: var(--border-subtle); margin: 8px 4px; }
.tg-drawer-label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: .5px; font-weight: 600; padding: 4px 12px; }
.tg-accent-strip { display: flex; gap: 10px; padding: 6px 12px 10px; }
.tg-accent-dot {
  width: 26px; height: 26px; border-radius: 50%;
  border: 2.5px solid transparent; cursor: pointer; transition: all .15s;
}
.tg-accent-dot:hover { transform: scale(1.2); }
.tg-accent-dot.active {
  border-color: var(--text-primary);
  box-shadow: 0 0 0 2px var(--bg-surface), 0 0 0 4px var(--text-primary);
}

/* Drawer transition */
.tg-slide-enter-active, .tg-slide-leave-active { transition: transform .22s cubic-bezier(.4,0,.2,1); }
.tg-slide-enter-from, .tg-slide-leave-to { transform: translateX(-100%); }

/* ── MODALS ── */
.tg-modal {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  z-index: 1000; width: calc(100% - 32px); max-width: 460px;
  max-height: 85vh; min-height: 300px;
  background: var(--bg-surface); border: 1px solid var(--border-subtle);
  border-radius: 18px; display: flex; flex-direction: column; overflow: hidden;
  box-shadow: 0 24px 64px rgba(0,0,0,.5);
}
.tg-modal-lg { max-width: 560px; max-height: 80vh; }

.tg-modal-pop-enter-active, .tg-modal-pop-leave-active {
  transition: opacity .18s, transform .18s cubic-bezier(.4,0,.2,1);
}
.tg-modal-pop-enter-from, .tg-modal-pop-leave-to {
  opacity: 0; transform: translate(-50%, calc(-50% + 12px)) scale(.96);
}

.tg-modal-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; border-bottom: 1px solid var(--border-subtle); flex-shrink: 0;
}
.tg-modal-title { font-size: 15px; font-weight: 700; }
.tg-modal-x {
  background: none; border: none; color: var(--text-muted);
  cursor: pointer; width: 28px; height: 28px; border-radius: 7px;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; transition: all .15s;
}
.tg-modal-x:hover { background: var(--bg-elevated); color: var(--text-primary); }
.tg-modal-searchbar {
  display: flex; align-items: center; gap: 8px;
  padding: 9px 14px; border-bottom: 1px solid var(--border-subtle); flex-shrink: 0;
}
.tg-modal-q {
  flex: 1; background: transparent; border: none; outline: none;
  color: var(--text-primary); font-size: 13px;
}
.tg-modal-q::placeholder { color: var(--text-muted); }
.tg-modal-scroll { flex: 1; overflow-y: auto; }
.tg-modal-scroll::-webkit-scrollbar { width: 3px; }
.tg-modal-scroll::-webkit-scrollbar-thumb { background: var(--border-subtle); }
.tg-modal-center { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 48px 20px; gap: 10px; }
.tg-modal-empty { font-size: 13px; color: var(--text-muted); }
.tg-modal-input { padding: 7px 10px 9px; border-top: 1px solid var(--border-subtle); background: var(--bg-surface); flex-shrink: 0; }
.tg-modal-icon {
  width: 40px; height: 40px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.tg-modal-icon.lg { width: 80px; height: 80px; border-radius: 50%; }

/* Contacts */
.tg-contact-row {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 16px; cursor: pointer; transition: background .1s;
}
.tg-contact-row:hover { background: var(--bg-elevated); }
.tg-contact-av {
  width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 15px; font-weight: 700; color: #fff;
}
.tg-contact-body { flex: 1; min-width: 0; }
.tg-contact-name { display: block; font-size: 14px; font-weight: 600; }
.tg-contact-hint { display: block; font-size: 12px; color: var(--text-muted); }
.tg-contact-arrow { color: var(--text-muted); flex-shrink: 0; }

/* Saved scroll */
.tg-saved-scroll { padding: 10px 14px; display: flex; flex-direction: column; gap: 2px; }

/* Stories / Add Account / common centered content */
.tg-stories-view {
  display: flex; flex-direction: column; align-items: center;
  padding: 32px 24px; gap: 14px; text-align: center;
}
.tg-stories-ring {
  padding: 3px; border-radius: 50%;
  background: conic-gradient(var(--tg-accent), #8b5cf6, var(--tg-accent));
}
.tg-stories-av {
  width: 72px; height: 72px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 26px; font-weight: 700; color: #fff;
  border: 3px solid var(--bg-surface);
}
.tg-stories-name { font-size: 16px; font-weight: 700; margin: 0; }
.tg-stories-sub { font-size: 13px; color: var(--text-muted); line-height: 1.65; margin: 0; max-width: 320px; }
.tg-cta-btn {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 10px 20px; background: var(--tg-accent); color: #fff;
  border-radius: 10px; font-size: 13px; font-weight: 600; text-decoration: none;
}
.tg-cta-btn:hover { opacity: .88; }
.tg-danger-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  padding: 10px 20px; background: rgba(239,68,68,.09); border: 1px solid rgba(239,68,68,.25);
  border-radius: 10px; color: #ef4444; font-size: 13px; font-weight: 600; cursor: pointer;
}
.tg-danger-btn:hover { background: rgba(239,68,68,.16); }
.tg-account-card {
  display: flex; align-items: center; gap: 12px;
  background: var(--bg-elevated); border: 1px solid var(--border-subtle);
  border-radius: 12px; padding: 12px 16px; width: 100%; text-align: left;
}
.tg-account-av {
  width: 40px; height: 40px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 700; color: #fff; flex-shrink: 0;
}

/* Settings */
.tg-settings-profile {
  display: flex; align-items: center; gap: 14px;
  padding: 18px 16px 14px; border-bottom: 1px solid var(--border-subtle);
}
.tg-settings-av {
  width: 58px; height: 58px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; font-weight: 700; color: #fff; flex-shrink: 0;
}
.tg-settings-pname { font-size: 15px; font-weight: 700; }
.tg-settings-pmeta { font-size: 12.5px; color: var(--text-muted); margin-top: 2px; }
.tg-settings-group { padding: 14px 16px 4px; }
.tg-settings-label { font-size: 11px; text-transform: uppercase; letter-spacing: .5px; font-weight: 600; color: var(--text-muted); margin-bottom: 10px; }
.tg-settings-accent-row { display: flex; gap: 12px; }
.tg-settings-accent-row .tg-accent-dot { width: 30px; height: 30px; }
.tg-settings-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.tg-settings-sample { color: var(--text-secondary); transition: font-size .1s; }
.tg-stepper { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.tg-stepper button {
  width: 30px; height: 30px; border-radius: 8px;
  border: 1px solid var(--border-default); background: var(--bg-elevated);
  color: var(--text-primary); cursor: pointer; font-size: 17px;
  display: flex; align-items: center; justify-content: center;
}
.tg-stepper button:hover { border-color: var(--tg-accent); color: var(--tg-accent); }
.tg-stepper span { font-size: 13px; min-width: 36px; text-align: center; color: var(--text-secondary); }
.tg-settings-info { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--text-secondary); padding: 7px 0 2px; }

/* ── AUTH ── */
.tg-init-screen { flex: 1; display: flex; align-items: center; justify-content: center; }
.tg-auth-screen { flex: 1; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; }
.tg-auth-glow { position: absolute; width: 600px; height: 600px; background: radial-gradient(circle, rgba(34,158,217,.07) 0%, transparent 70%); top: 50%; left: 50%; transform: translate(-50%,-50%); pointer-events: none; }
.tg-auth-box { background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 20px; padding: 40px 36px; width: 100%; max-width: 380px; display: flex; flex-direction: column; align-items: center; position: relative; z-index: 1; }
.tg-auth-title { font-size: 22px; font-weight: 700; margin: 0 0 6px; }
.tg-auth-sub { font-size: 13px; color: var(--text-muted); margin: 0 0 28px; }
.tg-auth-fields { width: 100%; display: flex; flex-direction: column; gap: 12px; }
.tg-auth-label { font-size: 11px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: .5px; }
.tg-auth-input { background: var(--bg-elevated); border: 1.5px solid var(--border-default); border-radius: 10px; padding: 11px 14px; color: var(--text-primary); font-size: 14px; outline: none; transition: border-color .2s; }
.tg-auth-input:focus { border-color: var(--tg-accent); box-shadow: 0 0 0 3px rgba(34,158,217,.1); }
.tg-code-input { font-size: 22px; letter-spacing: 8px; text-align: center; }
.tg-auth-hint { font-size: 12px; color: var(--text-muted); }
.tg-auth-btn { width: 100%; padding: 12px; background: var(--tg-accent); color: #fff; border: none; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; }
.tg-auth-btn:hover:not(:disabled) { opacity: .88; } .tg-auth-btn:disabled { opacity: .5; cursor: not-allowed; }
.tg-auth-back { background: none; border: none; color: var(--text-muted); font-size: 13px; cursor: pointer; } .tg-auth-back:hover { color: var(--tg-accent); }
.tg-auth-err { font-size: 12.5px; color: #ef4444; text-align: center; padding: 6px 12px; background: rgba(239,68,68,.08); border-radius: 8px; }

/* ── MAIN LAYOUT ── */
.tg-app { flex: 1; display: flex; overflow: hidden; }

/* ── SIDEBAR ── */
.tg-sidebar { width: 300px; flex-shrink: 0; display: flex; flex-direction: column; border-right: 1px solid var(--border-subtle); background: var(--bg-surface); overflow: hidden; }
.tg-sidebar-head { display: flex; align-items: center; gap: 6px; padding: 9px 10px 7px; border-bottom: 1px solid var(--border-subtle); }
.tg-searchbar { flex: 1; position: relative; }
.tg-si { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--text-muted); pointer-events: none; }
.tg-searchbar-input { width: 100%; background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: 20px; padding: 7px 12px 7px 28px; font-size: 13px; color: var(--text-primary); outline: none; }
.tg-searchbar-input:focus { border-color: var(--tg-accent); }
.tg-searchbar-input::placeholder { color: var(--text-muted); }
.tg-icon-btn { background: none; border: none; color: var(--text-muted); cursor: pointer; width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; transition: all .15s; flex-shrink: 0; }
.tg-icon-btn:hover { background: var(--bg-elevated); color: var(--text-primary); }
.tg-compose-wrap { position: relative; }
.tg-compose-drop { position: absolute; top: 36px; right: 0; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 10px; padding: 5px; z-index: 100; min-width: 180px; box-shadow: 0 8px 28px rgba(0,0,0,.28); }
.tg-compose-item { width: 100%; display: flex; align-items: center; gap: 10px; padding: 9px 10px; border: none; background: transparent; color: var(--text-primary); font-size: 13px; cursor: pointer; border-radius: 7px; text-align: left; transition: background .1s; }
.tg-compose-item:hover { background: var(--bg-elevated); }
.tg-compose-item svg { color: var(--text-secondary); }
.tg-filters { display: flex; gap: 5px; padding: 7px 10px; flex-shrink: 0; overflow-x: auto; scrollbar-width: none; border-bottom: 1px solid var(--border-subtle); }
.tg-filters::-webkit-scrollbar { display: none; }
.tg-fpill { padding: 4px 11px; border: 1px solid var(--border-subtle); border-radius: 20px; background: transparent; color: var(--text-muted); font-size: 12px; cursor: pointer; white-space: nowrap; transition: all .15s; }
.tg-fpill.on { background: rgba(34,158,217,.1); border-color: var(--tg-accent); color: var(--tg-accent); font-weight: 600; }
.tg-dlg-list { flex: 1; overflow-y: auto; scrollbar-width: thin; }
.tg-dlg-list::-webkit-scrollbar { width: 3px; } .tg-dlg-list::-webkit-scrollbar-thumb { background: var(--border-subtle); }
.tg-skel-wrap { padding: 6px 0; }
.tg-skel-row { display: flex; gap: 11px; align-items: center; padding: 9px 13px; }
.tg-skel-av { width: 44px; height: 44px; border-radius: 50%; background: var(--bg-elevated); animation: shimmer 1.4s ease infinite; flex-shrink: 0; }
.tg-skel-lines { flex: 1; display: flex; flex-direction: column; gap: 7px; }
.tg-skel-name { height: 12px; border-radius: 6px; background: var(--bg-elevated); width: 52%; animation: shimmer 1.4s ease infinite; }
.tg-skel-msg  { height: 10px; border-radius: 6px; background: var(--bg-elevated); width: 72%; animation: shimmer 1.4s ease infinite .2s; }
@keyframes shimmer { 0%,100%{opacity:.35}50%{opacity:.8} }
.tg-dlg-empty { display: flex; align-items: center; justify-content: center; padding: 40px; font-size: 13px; color: var(--text-muted); }
.tg-dlg-row { display: flex; align-items: center; gap: 11px; padding: 7px 12px; cursor: pointer; transition: background .1s; }
.tg-dlg-row:hover { background: var(--bg-elevated); } .tg-dlg-row.active { background: rgba(34,158,217,.09); }
.tg-dlg-av-wrap { position: relative; flex-shrink: 0; width: 46px; height: 46px; }
.tg-dlg-av-img { width: 46px; height: 46px; border-radius: 50%; object-fit: cover; }
.tg-dlg-av { width: 46px; height: 46px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 700; color: #fff; }
.tg-type-pin { position: absolute; bottom: -1px; right: -1px; width: 16px; height: 16px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid var(--bg-surface); }
.tg-type-pin.ch { background: var(--tg-accent); } .tg-type-pin.gr { background: #10b981; }
.tg-unread { position: absolute; top: -2px; right: -2px; min-width: 18px; height: 18px; border-radius: 9px; background: var(--tg-accent); color: #fff; font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center; padding: 0 4px; }
.tg-dlg-body { flex: 1; min-width: 0; }
.tg-dlg-top { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 2px; gap: 8px; }
.tg-dlg-name { font-size: 13.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tg-dlg-date { font-size: 11px; color: var(--text-muted); flex-shrink: 0; }
.tg-dlg-prev { font-size: 12.5px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ── CHAT PANE ── */
.tg-chat-pane { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: var(--bg-base); }
.tg-empty-chat { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0; }
.tg-chat-head { display: flex; align-items: center; gap: 11px; padding: 9px 14px; border-bottom: 1px solid var(--border-subtle); background: var(--bg-surface); flex-shrink: 0; }
.tg-chat-head-av-wrap { flex-shrink: 0; }
.tg-chat-head-av-img { width: 38px; height: 38px; border-radius: 50%; object-fit: cover; }
.tg-chat-head-av { width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: #fff; }
.tg-chat-head-info { flex: 1; }
.tg-chat-head-name { font-size: 14px; font-weight: 700; }
.tg-chat-head-sub { font-size: 11.5px; color: var(--text-muted); margin-top: 1px; }
.tg-chat-head-btns { display: flex; gap: 3px; }
.tg-hbtn { width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--border-subtle); background: transparent; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all .15s; }
.tg-hbtn:hover, .tg-hbtn.on { background: var(--bg-elevated); color: var(--text-primary); }
.tg-more-wrap { position: relative; }
.tg-more-menu { position: absolute; top: 38px; right: 0; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 10px; padding: 5px; z-index: 200; min-width: 175px; box-shadow: 0 8px 24px rgba(0,0,0,.3); }
.tg-more-item { width: 100%; display: flex; align-items: center; gap: 9px; padding: 8px 10px; border: none; background: transparent; color: var(--text-primary); font-size: 13px; cursor: pointer; border-radius: 7px; text-align: left; transition: background .1s; }
.tg-more-item:hover { background: var(--bg-elevated); } .tg-more-item.red { color: #ef4444; }
.tg-more-sep { height: 1px; background: var(--border-subtle); margin: 4px 0; }
.tg-csearch { display: flex; align-items: center; gap: 7px; padding: 7px 14px; background: var(--bg-surface); border-bottom: 1px solid var(--border-subtle); flex-shrink: 0; }
.tg-csinput { flex: 1; background: transparent; border: none; outline: none; color: var(--text-primary); font-size: 13px; }
.tg-csinput::placeholder { color: var(--text-muted); }
.tg-cs-count { font-size: 11px; color: var(--text-muted); white-space: nowrap; }
.tg-msgs-area { flex: 1; overflow-y: auto; padding: 10px 14px 6px; }
.tg-msgs-area::-webkit-scrollbar { width: 4px; } .tg-msgs-area::-webkit-scrollbar-thumb { background: var(--border-subtle); border-radius: 2px; }
.tg-msgs-center { display: flex; align-items: center; justify-content: center; height: 100%; }
.tg-msgs-list { display: flex; flex-direction: column; gap: 2px; }
.tg-load-more { display: flex; justify-content: center; padding: 4px 0 10px; }
.tg-load-more button { padding: 5px 15px; border: 1px solid var(--border-default); border-radius: 20px; background: var(--bg-elevated); color: var(--text-secondary); font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 7px; }
.tg-load-more button:hover:not(:disabled) { border-color: var(--tg-accent); color: var(--tg-accent); }
.tg-date-sep { display: flex; align-items: center; justify-content: center; padding: 7px 0; }
.tg-date-sep span { font-size: 11.5px; color: var(--text-muted); background: var(--bg-elevated); border: 1px solid var(--border-subtle); padding: 3px 12px; border-radius: 12px; }
.tg-msg-row { display: flex; align-items: flex-end; gap: 5px; margin-bottom: 2px; }
.tg-msg-row.from-me { justify-content: flex-end; } .tg-msg-row.from-them { justify-content: flex-start; }
.tg-av-col { width: 30px; flex-shrink: 0; align-self: flex-end; }
.tg-av-sm-img { width: 30px; height: 30px; border-radius: 50%; object-fit: cover; }
.tg-av-sm { width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; color: #fff; }
.tg-bubble-wrap { max-width: 72%; display: flex; flex-direction: column; }
.from-me .tg-bubble-wrap { align-items: flex-end; }
.tg-sender { font-size: 12px; font-weight: 700; margin-bottom: 3px; padding-left: 2px; }
.tg-bubble { padding: 7px 11px 5px; border-radius: 18px; position: relative; word-break: break-word; min-width: 70px; }
.bthem { background: var(--bg-elevated); border: 1px solid var(--border-subtle); color: var(--text-primary); border-radius: 4px 18px 18px 18px; }
.bthem.no-tail { border-radius: 18px; }
.bme { background: var(--tg-bubble-me); color: #e8f4fd; border-radius: 18px 18px 4px 18px; }
.cs-hl { outline: 2px solid #f59e0b; outline-offset: 1px; }
.tg-msg-text { line-height: 1.5; white-space: pre-wrap; }
.tg-msg-foot { display: flex; align-items: center; justify-content: flex-end; gap: 3px; margin-top: 3px; float: right; margin-left: 8px; margin-bottom: -2px; }
.tg-msg-time { font-size: 11px; opacity: .6; }
.tg-views { display: flex; align-items: center; gap: 2px; font-size: 11px; opacity: .6; }
.tg-ticks { font-size: 11px; opacity: .7; letter-spacing: -3px; padding-right: 3px; }
:deep(.tg-hl) { background: rgba(245,158,11,.35); border-radius: 2px; padding: 0 1px; }
/* Media */
.tg-m-thumb { width: 190px; height: 120px; border-radius: 10px; background: rgba(0,0,0,.2); display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 4px; font-size: 12px; opacity: .8; position: relative; margin-bottom: 3px; }
.tg-play { width: 38px; height: 38px; border-radius: 50%; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; }
.tg-dur { font-size: 11px; font-weight: 600; position: absolute; bottom: 5px; left: 7px; background: rgba(0,0,0,.55); padding: 1px 5px; border-radius: 4px; color: #fff; }
.tg-m-voice { display: flex; align-items: center; gap: 7px; min-width: 140px; padding: 3px 0; }
.tg-m-mic { width: 28px; height: 28px; border-radius: 50%; background: var(--tg-accent); display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: #fff; }
.tg-wave { display: flex; align-items: center; gap: 1.5px; flex: 1; height: 26px; }
.tg-wbar { flex: 1; background: rgba(34,158,217,.5); border-radius: 2px; min-height: 15%; }
.tg-gif-badge { position: absolute; top: 5px; left: 6px; background: rgba(0,0,0,.65); color: #fff; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; }
.tg-m-file { display: flex; align-items: center; gap: 9px; min-width: 160px; padding: 2px 0; }
.tg-ficon { width: 34px; height: 34px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 8px; font-weight: 700; color: #fff; flex-shrink: 0; }
.tg-finfo { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.tg-fname { font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tg-fsize { font-size: 11px; opacity: .6; }
.tg-m-web { border-left: 3px solid var(--tg-accent); padding: 3px 8px; display: flex; flex-direction: column; gap: 2px; margin-bottom: 3px; }
.tg-web-title { font-size: 13px; font-weight: 600; color: var(--tg-accent); }
.tg-web-desc { font-size: 12px; opacity: .75; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.tg-web-url { font-size: 11px; color: var(--tg-accent); opacity: .7; text-decoration: none; }
.tg-m-generic { display: flex; align-items: center; gap: 5px; font-size: 13px; padding: 3px 0; color: var(--text-secondary); }
/* Input */
.tg-input-bar { padding: 7px 10px 9px; border-top: 1px solid var(--border-subtle); background: var(--bg-surface); flex-shrink: 0; position: relative; }
.tg-input-wrap { display: flex; align-items: flex-end; gap: 4px; background: var(--bg-elevated); border: 1px solid var(--border-default); border-radius: 24px; padding: 5px; transition: border-color .2s; }
.tg-input-wrap:focus-within { border-color: var(--tg-accent); }
.tg-emoji-btn, .tg-attach-btn { width: 34px; height: 34px; border-radius: 50%; border: none; background: transparent; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; }
.tg-emoji-btn:hover, .tg-attach-btn:hover { color: var(--tg-accent); }
.tg-input { flex: 1; background: transparent; border: none; outline: none; color: var(--text-primary); font-size: 14px; font-family: inherit; line-height: 1.5; resize: none; min-height: 22px; max-height: 140px; padding: 5px 4px; scrollbar-width: none; }
.tg-input::placeholder { color: var(--text-muted); }
.tg-send-btn { width: 36px; height: 36px; border-radius: 50%; border: none; background: var(--bg-elevated); color: var(--text-muted); cursor: pointer; flex-shrink: 0; display: flex; align-items: center; justify-content: center; transition: all .2s; }
.tg-send-btn.active { background: var(--tg-accent); color: #fff; box-shadow: 0 2px 10px rgba(34,158,217,.3); }
.tg-send-btn:disabled { opacity: .4; cursor: not-allowed; }
.tg-ch-footer { display: flex; align-items: center; justify-content: center; gap: 7px; padding: 12px; border-top: 1px solid var(--border-subtle); background: var(--bg-surface); color: var(--text-muted); font-size: 13px; flex-shrink: 0; }
/* Spinners */
.tg-spinner { width: 28px; height: 28px; border: 2.5px solid rgba(34,158,217,.2); border-top-color: var(--tg-accent); border-radius: 50%; animation: spin .7s linear infinite; display: inline-block; }
.tg-spinner.sm { width: 13px; height: 13px; border-width: 2px; }
.tg-send-spinner { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,.3); border-top-color: #fff; border-radius: 50%; animation: spin .65s linear infinite; display: inline-block; }
.tg-spin-sm { width: 15px; height: 15px; border: 2px solid rgba(255,255,255,.3); border-top-color: #fff; border-radius: 50%; animation: spin .65s linear infinite; display: inline-block; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ── STATUS ── */
.tg-status-dot {
  position: absolute; bottom: 0; right: 0;
  width: 11px; height: 11px; border-radius: 50%;
  border: 2px solid var(--bg-surface);
}
.tg-status-dot.online { background: #22c55e; }
.tg-chat-head-sub.online { color: #22c55e; font-weight: 500; }

/* ── PHOTO MEDIA ── */
/* Photo */
.tg-m-photo-wrap { border-radius: 12px; overflow: hidden; max-width: 300px; margin-bottom: 3px; }
.tg-m-photo { width: 100%; max-width: 300px; max-height: 340px; object-fit: cover; border-radius: 12px; cursor: zoom-in; display: block; transition: opacity .2s; }
.tg-m-photo:hover { opacity: .92; }
/* Shimmer skeleton while loading */
.tg-m-photo-skel { width: 240px; height: 180px; border-radius: 12px; overflow: hidden; margin-bottom: 3px; }
.tg-photo-shimmer { width: 100%; height: 100%; background: linear-gradient(90deg, var(--bg-elevated) 25%, rgba(255,255,255,.06) 50%, var(--bg-elevated) 75%); background-size: 200% 100%; animation: photoShimmer 1.4s ease infinite; }
@keyframes photoShimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
/* Tap-to-load placeholder */
.tg-m-photo-placeholder { width: 200px; height: 140px; border-radius: 12px; background: var(--bg-elevated); border: 1.5px dashed rgba(255,255,255,.12); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px; font-size: 12px; color: var(--text-muted); cursor: pointer; margin-bottom: 3px; transition: background .15s; }
.tg-m-photo-placeholder:hover { background: rgba(255,255,255,.06); }
/* Old thumb fallback */
.tg-m-thumb { width: 200px; height: 140px; border-radius: 12px; background: var(--bg-elevated); display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 6px; font-size: 12px; color: var(--text-muted); position: relative; margin-bottom: 3px; }
/* Video */
.tg-m-video-wrap { width: 260px; border-radius: 12px; background: rgba(0,0,0,.55); cursor: pointer; margin-bottom: 3px; overflow: hidden; transition: background .15s; }
.tg-m-video-wrap:hover { background: rgba(0,0,0,.7); }
.tg-m-video-inner { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 28px 20px 18px; }
.tg-play-btn-lg { width: 52px; height: 52px; border-radius: 50%; background: rgba(255,255,255,.18); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; border: 1.5px solid rgba(255,255,255,.3); }
.tg-m-video-meta { display: flex; align-items: center; gap: 10px; }
.tg-m-video-dur { font-size: 14px; font-weight: 700; color: #fff; }
.tg-m-video-size { font-size: 11px; color: rgba(255,255,255,.55); }
.tg-m-video-dl { display: flex; align-items: center; gap: 5px; font-size: 11px; color: rgba(255,255,255,.6); border: 1px solid rgba(255,255,255,.2); border-radius: 20px; padding: 3px 10px; }

/* ── MESSAGE ACTIONS (hover bar) ── */
.tg-bubble-wrap { position: relative; }
.tg-msg-actions {
  position: absolute; top: -28px; display: none;
  background: var(--bg-surface); border: 1px solid var(--border-subtle);
  border-radius: 20px; padding: 2px 4px; gap: 2px;
  align-items: center; box-shadow: 0 3px 10px rgba(0,0,0,.25); z-index: 10;
}
.tg-bubble-wrap:hover .tg-msg-actions { display: flex; }
.tg-msg-actions.me  { right: 0; }
.tg-msg-actions.them { left: 0; }
.tg-act-btn {
  width: 26px; height: 26px; border-radius: 50%; border: none;
  background: transparent; cursor: pointer; font-size: 13px;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-secondary); transition: background .12s;
}
.tg-act-btn:hover { background: var(--bg-elevated); }
.tg-act-btn.red:hover { color: #ef4444; background: rgba(239,68,68,.1); }
.tg-act-btn svg { pointer-events: none; }

/* ── REACTION PICKER ── */
.tg-reaction-picker {
  position: absolute; top: -64px;
  background: var(--bg-surface); border: 1px solid var(--border-subtle);
  border-radius: 28px; padding: 5px 8px; display: flex; gap: 2px;
  box-shadow: 0 6px 20px rgba(0,0,0,.35); z-index: 20;
}
.tg-reaction-picker.me   { right: 0; }
.tg-reaction-picker.them { left: 0; }
.tg-re-btn {
  width: 30px; height: 30px; border-radius: 50%; border: none;
  background: transparent; cursor: pointer; font-size: 17px;
  display: flex; align-items: center; justify-content: center; transition: transform .12s;
}
.tg-re-btn:hover { transform: scale(1.3); background: var(--bg-elevated); }

/* ── LIGHTBOX ── */
.tg-lightbox {
  position: absolute; inset: 0; z-index: 2000;
  background: rgba(0,0,0,.9); display: flex; align-items: center; justify-content: center;
}
.tg-lightbox-img { max-width: 92vw; max-height: 88vh; border-radius: 8px; box-shadow: 0 20px 60px rgba(0,0,0,.6); object-fit: contain; }
.tg-lightbox-close {
  position: absolute; top: 16px; right: 20px;
  background: rgba(255,255,255,.12); border: none; color: #fff;
  width: 36px; height: 36px; border-radius: 50%; cursor: pointer; font-size: 16px;
  display: flex; align-items: center; justify-content: center;
}
.tg-lightbox-close:hover { background: rgba(255,255,255,.22); }
.tg-lightbox-dl {
  position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 7px; color: #fff;
  background: rgba(255,255,255,.12); padding: 8px 18px; border-radius: 20px;
  font-size: 13px; text-decoration: none; backdrop-filter: blur(4px);
}
.tg-lightbox-dl:hover { background: rgba(255,255,255,.22); }

/* ── SCROLL TO BOTTOM BUTTON ── */
.tg-scroll-btn {
  position: absolute; bottom: 70px; right: 18px;
  width: 38px; height: 38px; border-radius: 50%;
  background: var(--bg-surface); border: 1px solid var(--border-subtle);
  box-shadow: 0 4px 14px rgba(0,0,0,.3); color: var(--text-primary);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  z-index: 50;
}
.tg-scroll-btn:hover { background: var(--bg-elevated); }
.tg-scroll-badge {
  position: absolute; top: -5px; right: -5px;
  background: var(--tg-accent); color: #fff;
  font-size: 10px; font-weight: 700; min-width: 18px; height: 18px;
  border-radius: 9px; padding: 0 4px; display: flex; align-items: center; justify-content: center;
}
.tg-fade-up-enter-active, .tg-fade-up-leave-active { transition: opacity .18s, transform .18s; }
.tg-fade-up-enter-from, .tg-fade-up-leave-to { opacity: 0; transform: translateY(8px); }

/* ── REPLY BANNER ── */
.tg-reply-banner {
  display: flex; align-items: center; gap: 10px;
  padding: 7px 14px; background: var(--bg-surface);
  border-top: 1px solid var(--border-subtle);
  animation: slideUp .15s ease;
}
@keyframes slideUp { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:none } }
.tg-reply-bar { width: 3px; height: 34px; border-radius: 2px; background: var(--tg-accent); flex-shrink: 0; }
.tg-reply-info { flex: 1; min-width: 0; }
.tg-reply-name { display: block; font-size: 12px; font-weight: 700; color: var(--tg-accent); }
.tg-reply-preview { display: block; font-size: 12px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tg-reply-cancel { background: none; border: none; color: var(--text-muted); cursor: pointer; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.tg-reply-cancel:hover { background: var(--bg-elevated); color: var(--text-primary); }

/* ── REPLY QUOTE IN BUBBLE ── */
.tg-quote {
  display: flex; gap: 8px; cursor: pointer;
  background: rgba(0,0,0,.15); border-radius: 8px;
  padding: 6px 8px; margin-bottom: 5px;
  transition: background .12s;
}
.tg-quote:hover { background: rgba(0,0,0,.25); }
.tg-quote-bar { width: 3px; border-radius: 2px; background: var(--tg-accent); flex-shrink: 0; }
.tg-quote-body { flex: 1; min-width: 0; }
.tg-quote-name { display: block; font-size: 11px; font-weight: 700; color: var(--tg-accent); margin-bottom: 2px; }
.tg-quote-text { display: block; font-size: 12px; color: rgba(255,255,255,.65); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bme .tg-quote { background: rgba(0,0,0,.2); }
.bthem .tg-quote-text { color: var(--text-muted); }

/* Flash highlight when jumping to replied message */
@keyframes flashMsg { 0%,100%{background:transparent} 30%,70%{background:rgba(34,158,217,.25)} }
.tg-flash .tg-bubble { animation: flashMsg 1.2s ease; }

/* ── CONTEXT MENU ── */
.tg-ctx-overlay { position: absolute; inset: 0; z-index: 3000; }
.tg-ctx-menu {
  position: absolute; z-index: 3001;
  background: var(--bg-surface); border: 1px solid var(--border-subtle);
  border-radius: 12px; padding: 5px; min-width: 180px;
  box-shadow: 0 12px 40px rgba(0,0,0,.5);
  animation: ctxPop .12s ease;
}
@keyframes ctxPop { from { opacity:0; transform:scale(.94) } to { opacity:1; transform:none } }
.tg-ctx-item {
  width: 100%; display: flex; align-items: center; gap: 10px;
  padding: 9px 12px; border: none; background: transparent;
  color: var(--text-primary); font-size: 13.5px; cursor: pointer;
  border-radius: 8px; text-align: left; transition: background .1s;
}
.tg-ctx-item:hover { background: var(--bg-elevated); }
.tg-ctx-item.red { color: #ef4444; }
.tg-ctx-item.red:hover { background: rgba(239,68,68,.08); }
.tg-ctx-item svg { color: var(--text-secondary); flex-shrink: 0; }
.tg-ctx-item.red svg { color: #ef4444; }
.tg-ctx-sep { height: 1px; background: var(--border-subtle); margin: 4px 0; }

/* ── CHAT PANE relative for scroll btn ── */
.tg-chat-pane { position: relative; }

/* ── MIC / RECORDING ── */
.tg-mic-btn {
  width: 40px; height: 40px; border-radius: 50%; border: none;
  background: var(--bg-elevated); color: var(--text-secondary);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; flex-shrink: 0; transition: background .15s, color .15s;
}
.tg-mic-btn:hover { background: var(--tg-accent); color: #fff; }
.tg-input-wrap.recording { border-color: #ef4444; }
.tg-send-btn.recording { background: #ef4444 !important; }
.tg-recording-ui {
  flex: 1; display: flex; align-items: center; gap: 8px;
  padding: 0 4px; min-width: 0;
}
.tg-rec-cancel {
  width: 30px; height: 30px; border-radius: 50%; border: none;
  background: rgba(239,68,68,.12); color: #ef4444;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; flex-shrink: 0; transition: background .12s;
}
.tg-rec-cancel:hover { background: rgba(239,68,68,.25); }
.tg-rec-dot {
  width: 9px; height: 9px; border-radius: 50%;
  background: #ef4444; flex-shrink: 0;
  animation: recPulse 1s ease infinite;
}
@keyframes recPulse { 0%,100%{opacity:1} 50%{opacity:.2} }
.tg-rec-time { font-size: 15px; font-weight: 700; color: var(--text-primary); min-width: 36px; font-variant-numeric: tabular-nums; }
.tg-rec-hint { font-size: 12px; color: #ef4444; opacity: .8; }

/* ── VOICE PLAYER BUBBLE ── */
.tg-m-voice {
  display: flex; align-items: center; gap: 8px;
  min-width: 200px; max-width: 280px; padding: 2px 0 3px;
}
.tg-voice-play-btn {
  width: 38px; height: 38px; border-radius: 50%; border: none; flex-shrink: 0;
  background: var(--tg-accent); color: #fff;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: transform .12s, background .12s;
}
.tg-voice-play-btn:hover { transform: scale(1.08); }
.tg-voice-play-btn.playing { background: #10b981; }
.tg-voice-progress {
  flex: 1; position: relative; cursor: pointer; height: 32px;
  display: flex; align-items: center;
}
.tg-wave { display: flex; align-items: center; gap: 2px; height: 100%; width: 100%; }
.tg-wbar {
  flex: 1; border-radius: 1px; min-height: 3px;
  background: rgba(255,255,255,.35); transition: background .15s;
}
.tg-wbar.played { background: rgba(255,255,255,.85); }
.bme .tg-wbar { background: rgba(255,255,255,.3); }
.bme .tg-wbar.played { background: rgba(255,255,255,.9); }
.bthem .tg-wbar { background: rgba(255,255,255,.25); }
.bthem .tg-wbar.played { background: var(--tg-accent); }
.tg-voice-prog-bar {
  position: absolute; bottom: 0; left: 0; height: 2px;
  background: var(--tg-accent); border-radius: 1px; pointer-events: none; transition: width .1s linear;
}
.tg-voice-dur { font-size: 11px; color: rgba(255,255,255,.7); flex-shrink: 0; min-width: 28px; font-variant-numeric: tabular-nums; }

/* ── EMOJI PICKER ── */
.tg-emoji-picker {
  position: absolute; bottom: 100%; left: 0; right: 0;
  background: var(--bg-surface); border: 1px solid var(--border-subtle);
  border-radius: 16px 16px 0 0;
  box-shadow: 0 -8px 30px rgba(0,0,0,.35);
  z-index: 200; display: flex; flex-direction: column; max-height: 320px;
  margin-bottom: 0;
}
.tg-emoji-tabs {
  display: flex; gap: 2px; padding: 10px 10px 6px;
  border-bottom: 1px solid var(--border-subtle); overflow-x: auto; flex-shrink: 0;
}
.tg-emoji-tab {
  padding: 5px 8px; border-radius: 8px; border: none;
  background: transparent; cursor: pointer; font-size: 18px;
  transition: background .12s; flex-shrink: 0;
}
.tg-emoji-tab.on { background: var(--bg-elevated); }
.tg-emoji-tab:hover { background: var(--bg-elevated); }
.tg-emoji-grid {
  display: grid; grid-template-columns: repeat(auto-fill, 36px);
  gap: 2px; padding: 8px; overflow-y: auto; flex: 1;
}
.tg-epick-btn {
  width: 36px; height: 36px; border: none; background: transparent;
  border-radius: 6px; cursor: pointer; font-size: 20px;
  display: flex; align-items: center; justify-content: center;
  transition: background .1s;
}
.tg-epick-btn:hover { background: var(--bg-elevated); transform: scale(1.2); }
.tg-emoji-btn.on { color: var(--tg-accent); }

/* ── PINNED MESSAGE BAR ── */
.tg-pinned-bar {
  display: flex; align-items: center; gap: 10px;
  padding: 7px 14px; background: var(--bg-surface);
  border-bottom: 1px solid var(--border-subtle); cursor: pointer;
  transition: background .12s;
}
.tg-pinned-bar:hover { background: var(--bg-elevated); }
.tg-pinned-line { width: 3px; height: 30px; background: var(--tg-accent); border-radius: 2px; flex-shrink: 0; }
.tg-pinned-body { flex: 1; min-width: 0; }
.tg-pinned-label { display: block; font-size: 11px; font-weight: 700; color: var(--tg-accent); }
.tg-pinned-text { display: block; font-size: 12.5px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tg-pinned-close { background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 4px; border-radius: 50%; font-size: 13px; }
.tg-pinned-close:hover { background: var(--bg-elevated); }

/* ── FORWARDED LABEL ── */
.tg-forwarded {
  display: flex; align-items: center; gap: 5px;
  font-size: 11.5px; color: var(--tg-accent); font-style: italic;
  margin-bottom: 4px; opacity: .85;
}
.tg-forwarded span { font-weight: 700; font-style: normal; }

/* ── UNREAD DIVIDER ── */
.tg-unread-divider {
  display: flex; align-items: center; justify-content: center;
  padding: 6px 16px; margin: 8px 0;
}
.tg-unread-divider span {
  background: rgba(34,158,217,.18); color: var(--tg-accent);
  font-size: 12px; font-weight: 600; padding: 4px 14px;
  border-radius: 12px; border: 1px solid rgba(34,158,217,.25);
}

/* ── INFO PANEL ── */
.tg-info-panel {
  position: absolute; top: 0; right: 0; bottom: 0; width: 320px;
  background: var(--bg-surface); border-left: 1px solid var(--border-subtle);
  display: flex; flex-direction: column; z-index: 80; overflow: hidden;
}
.tg-info-head {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 16px; border-bottom: 1px solid var(--border-subtle); flex-shrink: 0;
}
.tg-info-body { flex: 1; overflow-y: auto; padding-bottom: 24px; }
.tg-info-av-wrap { display: flex; justify-content: center; padding: 28px 0 12px; }
.tg-info-av { width: 90px; height: 90px; border-radius: 50%; object-fit: cover; }
.tg-info-av-init {
  width: 90px; height: 90px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 32px; font-weight: 700; color: #fff;
}
.tg-info-name { text-align: center; font-size: 18px; font-weight: 700; padding: 0 16px 4px; }
.tg-info-sub { text-align: center; font-size: 13px; color: var(--text-muted); padding-bottom: 20px; }
.tg-info-sub.online { color: #22c55e; }
.tg-info-rows { padding: 0 16px; border-top: 1px solid var(--border-subtle); }
.tg-info-row {
  display: flex; align-items: center; gap: 14px;
  padding: 14px 0; border-bottom: 1px solid var(--border-subtle);
  color: var(--text-secondary);
}
.tg-info-row-val { font-size: 14px; color: var(--text-primary); font-weight: 500; }
.tg-info-row-label { font-size: 11.5px; color: var(--text-muted); margin-top: 2px; }
.tg-info-btns { display: flex; justify-content: center; gap: 20px; padding: 20px 16px; }
.tg-info-btn {
  display: flex; flex-direction: column; align-items: center; gap: 5px;
  background: var(--bg-elevated); border: none; border-radius: 12px;
  color: var(--tg-accent); font-size: 11px; font-weight: 600;
  padding: 12px 18px; cursor: pointer; min-width: 64px; transition: background .12s;
}
.tg-info-btn:hover { background: rgba(255,255,255,.08); }
.tg-info-btn.red { color: #ef4444; }
.tg-info-section-title { padding: 14px 16px 8px; font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: .6px; }
.tg-info-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 3px; padding: 0 16px; }
.tg-info-thumb { aspect-ratio: 1; border-radius: 8px; overflow: hidden; cursor: pointer; background: var(--bg-elevated); }
.tg-info-thumb-img { width: 100%; height: 100%; object-fit: cover; transition: opacity .15s; }
.tg-info-thumb-img:hover { opacity: .85; }
.tg-info-thumb-ph { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
.tg-info-empty { padding: 12px 16px; font-size: 13px; color: var(--text-muted); }
/* Slide animation */
.tg-info-slide-enter-active, .tg-info-slide-leave-active { transition: transform .22s cubic-bezier(.25,.46,.45,.94); }
.tg-info-slide-enter-from, .tg-info-slide-leave-to { transform: translateX(100%); }
/* Shrink chat pane when info panel open */
.tg-chat-pane { position: relative; flex: 1; display: flex; flex-direction: column; overflow: hidden; }

/* ── TYPING INDICATOR ── */
.tg-typing-dots {
  display: inline-flex; gap: 3px; align-items: center; height: 14px;
}
.tg-typing-dots span {
  width: 5px; height: 5px; border-radius: 50%;
  background: var(--tg-accent); animation: typingBounce 1.2s ease infinite;
}
.tg-typing-dots span:nth-child(2) { animation-delay: .2s; }
.tg-typing-dots span:nth-child(3) { animation-delay: .4s; }
@keyframes typingBounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-4px)} }


/* ── DRAWER CLOSE BUTTON ── */
.tg-drawer-banner { position: relative; }
.tg-drawer-close {
  position: absolute; top: 10px; right: 10px;
  width: 30px; height: 30px; border-radius: 50%; border: none;
  background: rgba(255,255,255,.15); color: #fff; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background .15s;
}
.tg-drawer-close:hover { background: rgba(255,255,255,.28); }

/* ── STORIES BAR ── */
.tg-stories-bar {
  display: flex; align-items: flex-start; gap: 2px;
  padding: 10px 8px 8px; overflow-x: auto;
  border-bottom: 1px solid var(--border-subtle); flex-shrink: 0;
}
.tg-stories-bar::-webkit-scrollbar { display: none; }
.tg-story-item {
  display: flex; flex-direction: column; align-items: center;
  gap: 5px; cursor: pointer; flex-shrink: 0; width: 60px;
  transition: opacity .15s;
}
.tg-story-item:hover { opacity: .82; }
.tg-story-ring {
  border-radius: 50%; padding: 2.5px;
  display: flex; align-items: center; justify-content: center;
  width: 50px; height: 50px;
}
.tg-story-ring.unviewed {
  background: conic-gradient(var(--tg-accent) 0%, #f59e0b 50%, #ec4899 100%);
}
.tg-story-ring.viewed { background: var(--border-subtle); }
.tg-story-av {
  border-radius: 50%; background: var(--bg-surface);
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; color: #fff; font-size: 15px;
  width: 43px; height: 43px; flex-shrink: 0;
  border: 2px solid var(--bg-surface);
}
.tg-story-av-img {
  width: 43px; height: 43px; border-radius: 50%; object-fit: cover;
  border: 2px solid var(--bg-surface);
}
.tg-story-name {
  font-size: 10.5px; color: var(--text-muted); text-align: center;
  max-width: 56px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* ── STORIES VIEWER ── */
.tg-story-viewer {
  position: absolute; inset: 0; z-index: 1800;
  background: #000; display: flex; flex-direction: column; overflow: hidden;
}
.tg-story-fade-enter-active, .tg-story-fade-leave-active { transition: opacity .2s; }
.tg-story-fade-enter-from, .tg-story-fade-leave-to { opacity: 0; }

/* Progress bars row */
.tg-story-progress-row {
  display: flex; gap: 4px; padding: 10px 12px 0;
  position: absolute; top: 0; left: 0; right: 0; z-index: 10;
}
.tg-story-seg {
  flex: 1; height: 3px; border-radius: 2px;
  background: rgba(255,255,255,.3); overflow: hidden;
}
.tg-story-seg-fill { height: 100%; background: #fff; border-radius: 2px; transition: width .05s linear; }

/* Story header */
.tg-story-head {
  display: flex; align-items: center; gap: 10px;
  padding: 22px 14px 10px; position: absolute; top: 0; left: 0; right: 0;
  z-index: 9; background: linear-gradient(to bottom,rgba(0,0,0,.55),transparent);
}
.tg-story-head-av { width: 38px; height: 38px; border-radius: 50%; overflow: hidden; flex-shrink: 0; border: 2px solid rgba(255,255,255,.6); }
.tg-story-head-av-img { width: 100%; height: 100%; object-fit: cover; }
.tg-story-head-av-init { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: #fff; }
.tg-story-head-info { flex: 1; min-width: 0; }
.tg-story-head-name { display: block; font-size: 14px; font-weight: 700; color: #fff; }
.tg-story-head-time { font-size: 11.5px; color: rgba(255,255,255,.65); }
.tg-story-close { background: rgba(0,0,0,.35); border: none; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.tg-story-close:hover { background: rgba(0,0,0,.55); }

/* Story body */
.tg-story-body { flex: 1; position: relative; display: flex; align-items: center; justify-content: center; }
.tg-story-tap-prev { position: absolute; left: 0; top: 0; width: 35%; height: 100%; z-index: 5; cursor: pointer; }
.tg-story-tap-next { position: absolute; right: 0; top: 0; width: 35%; height: 100%; z-index: 5; cursor: pointer; }
.tg-story-card {
  width: 100%; height: 100%; display: flex; align-items: center;
  justify-content: center; overflow: hidden;
}
.tg-story-img { width: 100%; height: 100%; object-fit: cover; }

/* Own story placeholder */
.tg-story-own {
  display: flex; flex-direction: column; align-items: center; gap: 14px;
  padding: 24px;
}
.tg-story-own-av {
  width: 88px; height: 88px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 30px; font-weight: 700; color: #fff;
  border: 3px solid rgba(255,255,255,.3);
}
.tg-story-own-name { font-size: 20px; font-weight: 700; color: #fff; }
.tg-story-own-hint { font-size: 13px; color: rgba(255,255,255,.55); text-align: center; }
.tg-story-cta {
  display: flex; align-items: center; gap: 7px;
  background: rgba(255,255,255,.15); backdrop-filter: blur(8px);
  color: #fff; text-decoration: none; padding: 10px 20px;
  border-radius: 24px; font-size: 13px; font-weight: 600;
  border: 1px solid rgba(255,255,255,.25); transition: background .15s; margin-top: 4px;
}
.tg-story-cta:hover { background: rgba(255,255,255,.25); }

/* Other user placeholder */
.tg-story-placeholder {
  display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 24px;
}
.tg-story-ph-av {
  width: 80px; height: 80px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 28px; font-weight: 700; color: #fff;
}
.tg-story-ph-name { font-size: 18px; font-weight: 700; color: #fff; }
.tg-story-ph-hint { font-size: 12px; color: rgba(255,255,255,.5); }

/* Reply bar */
.tg-story-reply-bar {
  padding: 10px 12px 14px;
  background: linear-gradient(to top,rgba(0,0,0,.6),transparent);
  position: absolute; bottom: 0; left: 0; right: 0;
  z-index: 9;
}
.tg-story-reply-inner {
  display: flex; align-items: center; gap: 8px;
  background: rgba(255,255,255,.12); border-radius: 28px;
  padding: 8px 8px 8px 16px; border: 1px solid rgba(255,255,255,.2);
  backdrop-filter: blur(6px);
}
.tg-story-reply-input {
  flex: 1; background: transparent; border: none; outline: none;
  color: #fff; font-size: 14px;
}
.tg-story-reply-input::placeholder { color: rgba(255,255,255,.5); }
.tg-story-reply-send {
  width: 34px; height: 34px; border-radius: 50%; border: none;
  background: var(--tg-accent); display: flex; align-items: center; justify-content: center;
  cursor: pointer; flex-shrink: 0; transition: opacity .15s;
}
.tg-story-reply-send:disabled { opacity: .4; cursor: default; }

/* Stories modal list */
.tg-stories-own-card {
  display: flex; align-items: center; gap: 12px; padding: 14px 16px;
  cursor: pointer; border-bottom: 1px solid var(--border-subtle);
  transition: background .12s;
}
.tg-stories-own-card:hover { background: var(--bg-elevated); }
.tg-stories-own-info { flex: 1; }
.tg-stories-own-name { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.tg-stories-own-sub { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
.tg-stories-section-title { font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: .6px; padding: 12px 16px 6px; }
.tg-stories-empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 32px 16px; color: var(--text-muted); font-size: 13px; }

</style>
