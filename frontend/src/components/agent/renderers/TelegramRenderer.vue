<template>
  <div v-if="telegramSteps.length" class="tgr-root">
    <div v-for="step in telegramSteps" :key="step.tool" class="tgr-card">

      <!-- ══ HEADER ══ -->
      <div class="tgr-head">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style="flex-shrink:0">
          <circle cx="12" cy="12" r="12" fill="#229ED9"/>
          <path d="M5.4 11.9l10.2-3.9c.47-.18.88.11.73.8l-1.74 8.2c-.13.58-.47.72-.95.45l-2.63-1.94-1.27 1.22c-.14.14-.26.26-.53.26l.19-2.69 4.87-4.4c.21-.19-.05-.29-.32-.1L7.47 13.9 4.87 13.1c-.56-.17-.57-.56.53-1.2z" fill="white"/>
        </svg>
        <span class="tgr-head-title">
          <template v-if="step.tool==='telegram_get_messages'">💬 {{ step.telegramChatName||'Messages' }}</template>
          <template v-else-if="step.tool==='telegram_get_unread'">🔔 Unread Messages</template>
          <template v-else-if="step.tool==='telegram_list_chats'">📋 Telegram Chats</template>
          <template v-else-if="step.tool==='telegram_search_messages'">🔍 "{{ step.telegramQuery }}"</template>
          <template v-else>Telegram</template>
        </span>
        <span v-if="step.richTelegramMessages?.length" class="tgr-badge">{{ step.richTelegramMessages.length }} msgs</span>
        <span v-else-if="unreadTotal(step)>0" class="tgr-badge red">{{ unreadTotal(step) }} unread</span>
        <span v-else-if="step.telegramChats?.length" class="tgr-badge">{{ step.telegramChats.length }} chats</span>
        <button class="tgr-open-btn" @click="openTelegram()" title="Open Telegram">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          Open Telegram
        </button>
      </div>

      <!-- ══ 1. MESSAGE THREAD (telegram_get_messages) ══ -->
      <template v-if="step.tool==='telegram_get_messages' && step.richTelegramMessages?.length">
        <div class="tgr-thread">
          <div v-for="msg in step.richTelegramMessages.slice(-30)" :key="msg.id"
               :class="['tgr-row', msg.fromMe?'me':'them']">
            <div v-if="!msg.fromMe" class="tgr-av-wrap">
              <img v-if="photos[str(msg.fromId)]" :src="photos[str(msg.fromId)]" class="tgr-av-img"/>
              <div v-else class="tgr-av-txt" :style="{background:avColor(msg.fromName||'')}">{{ avInit(msg.fromName||'') }}</div>
            </div>
            <div class="tgr-bcol">
              <div v-if="!msg.fromMe&&msg.fromName" class="tgr-sender">{{ msg.fromName }}</div>
              <div :class="['tgr-bubble',msg.fromMe?'out':'in']">
                <!-- ✅ FIX 1: Render actual photo image when available -->
                <template v-if="msg.media">
                  <div v-if="msg.media.type==='photo'" class="tgr-photo-wrap">
                    <img v-if="getImg(resolvedChatId(step), msg) && getImg(resolvedChatId(step), msg)!=='loading'"
                         :src="getImg(resolvedChatId(step), msg)"
                         class="tgr-photo-img"
                         @click="lightboxSrc=getImg(resolvedChatId(step), msg)"/>
                    <div v-else-if="getImg(resolvedChatId(step), msg)==='loading'" class="tgr-photo-skel">
                      <div class="tgr-photo-shimmer"></div>
                    </div>
                    <div v-else class="tgr-media-pill" :class="msg.fromMe?'out':''">📷 Photo</div>
                  </div>
                  <div v-else class="tgr-media-pill" :class="msg.fromMe?'out':''">{{ mediaStr(msg.media) }}</div>
                </template>
                <div v-else-if="!msg.text" class="tgr-media-pill" :class="msg.fromMe?'out':''">📎 Attachment</div>
                <div v-if="msg.text" class="tgr-txt">{{ msg.text }}</div>
                <div class="tgr-foot"><span class="tgr-time">{{ fmtTime(msg.date) }}</span><span v-if="msg.fromMe" class="tgr-ticks">✓✓</span></div>
              </div>
            </div>
          </div>
          <!-- Sent locally -->
          <div v-for="sm in ((step.telegramSentMessages || []).concat(sent[resolvedChatId(step)] || []))" :key="sm.id" class="tgr-row me">
            <div class="tgr-bcol">
              <div class="tgr-bubble out">
                <div v-if="sm.fileNames?.length" class="tgr-media-pill out">{{ sm.fileNames.map(n=>'📎 '+n).join(', ') }}</div>
                <div v-if="sm.text" class="tgr-txt">{{ sm.text }}</div>
                <div class="tgr-foot"><span class="tgr-time">{{ fmtTime(sm.date) }}</span><span class="tgr-ticks">✓</span></div>
              </div>
            </div>
          </div>
        </div>
        <!-- ── REPLY BAR ── -->
        <div class="tgr-rbar">
          <div v-if="bar(resolvedChatId(step),'emoji')" class="tgr-emoji-pop">
            <button v-for="e in EMOJIS" :key="e" class="tgr-epick" @click="emojiPick(resolvedChatId(step),e)">{{ e }}</button>
          </div>
          <input type="file" multiple style="display:none"
            :ref="el=>fref(resolvedChatId(step),el)"
            @change="fileChange(resolvedChatId(step),$event)"/>
          <div v-if="bar(resolvedChatId(step),'recording')" class="tgr-rec-ui">
            <button class="tgr-btn tgr-rec-trash" @click="cancelRec(resolvedChatId(step))" title="Cancel recording">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>
            </button>
            <span class="tgr-recdot"></span>
            <span class="tgr-rectime">{{ fmtDur(bar(resolvedChatId(step),'secs')||0) }}</span>
            <span class="tgr-reclabel">Recording…</span>
            <button class="tgr-send active tgr-rec-stop" @click="stopRec(resolvedChatId(step))" title="Stop & send">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="white"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
            </button>
          </div>
          <div v-else class="tgr-rbar-inner">
            <button class="tgr-btn" :class="{act:bar(resolvedChatId(step),'emoji')}"
              @click.stop="toggleEmoji(resolvedChatId(step))" title="Emoji">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
            </button>
            <textarea class="tgr-input"
              :placeholder="'Reply to '+(step.telegramChatName||'chat')+'…'"
              :value="bar(resolvedChatId(step),'draft')"
              rows="1"
              @input="e=>{setBar(resolvedChatId(step),'draft',e.target.value);rz(e)}"
              @keydown.enter.exact.prevent="doSend(resolvedChatId(step))"
              @keydown.escape="setBar(resolvedChatId(step),'emoji',false)"
            ></textarea>
            <!-- ✅ FIX 3: File attach button works with base64 upload -->
            <button class="tgr-btn" @click="fclick(resolvedChatId(step))" title="Attach file">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
            </button>
            <button v-if="!bar(resolvedChatId(step),'draft')&&!bar(resolvedChatId(step),'voice')"
              class="tgr-btn" @click="startRec(resolvedChatId(step))" title="Voice message">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            </button>
            <button class="tgr-send"
              :class="{active: bar(resolvedChatId(step),'draft')||bar(resolvedChatId(step),'files')?.length||bar(resolvedChatId(step),'voice')}"
              @click="doSend(resolvedChatId(step))">
              <span v-if="bar(resolvedChatId(step),'sending')" class="tgr-spin"></span>
              <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
          <div v-if="bar(resolvedChatId(step),'files')?.length" class="tgr-files">
            <div v-for="(f,i) in bar(resolvedChatId(step),'files')" :key="i" class="tgr-filechip">
              📎 {{ f.name }}<button @click="rmFile(resolvedChatId(step),i)">✕</button>
            </div>
          </div>
          <div v-if="bar(resolvedChatId(step),'voice')" class="tgr-voiceprev">
            <button class="tgr-vbtn play" @click="playVoice(resolvedChatId(step))">▶ {{ fmtDur(bar(resolvedChatId(step),'secs')||0) }}</button>
            <button class="tgr-vbtn discard" @click="discardVoice(resolvedChatId(step))">✕ Discard</button>
          </div>
          <transition name="tgr-toast"><div v-if="bar(resolvedChatId(step),'toast')" class="tgr-toast">✓ Sent!</div></transition>
        </div>
      </template>

      <!-- ══ 2. UNREAD CHATS (telegram_get_unread) ══ -->
      <template v-else-if="step.tool==='telegram_get_unread'">
        <div v-if="step.telegramUnreadChats?.length" class="tgr-unread-list">
          <div v-for="chat in step.telegramUnreadChats" :key="chat.chatId" class="tgr-uchat">
            <div class="tgr-uchat-head">
              <img v-if="photos[str(chat.chatId)]" :src="photos[str(chat.chatId)]" class="tgr-av-img sm"/>
              <div v-else class="tgr-av-txt sm" :style="{background:avColor(chat.chatName)}">{{ avInit(chat.chatName) }}</div>
              <span class="tgr-uchat-name">{{ chat.chatName }}</span>
              <span class="tgr-ubadge">{{ chat.unreadCount }}</span>
            </div>
            <div class="tgr-mini-thread">
              <div v-for="msg in chat.messages" :key="msg.id" :class="['tgr-mini-row',msg.fromMe?'me':'them']">
                <div class="tgr-mini-bub" :class="msg.fromMe?'out':'in'">
                  <span v-if="!msg.fromMe&&msg.fromName" class="tgr-mini-sender">{{ msg.fromName }}</span>
                  <!-- ✅ FIX 1: Show actual photo for unread messages -->
                  <template v-if="msg.media">
                    <div v-if="msg.media.type==='photo'" class="tgr-mini-photo-wrap">
                      <img v-if="getImg(str(chat.chatId), msg) && getImg(str(chat.chatId), msg)!=='loading'"
                           :src="getImg(str(chat.chatId), msg)"
                           class="tgr-mini-photo"
                           @click="lightboxSrc=getImg(str(chat.chatId), msg)"/>
                      <div v-else-if="getImg(str(chat.chatId), msg)==='loading'" class="tgr-mini-photo-skel"></div>
                      <span v-else class="tgr-mini-media">📷 Photo</span>
                    </div>
                    <span v-else class="tgr-mini-media">{{ mediaStr(msg.media) }}</span>
                  </template>
                  <span v-else-if="!msg.text" class="tgr-mini-media">📎 Attachment</span>
                  <span v-if="msg.text" class="tgr-mini-txt">{{ msg.text }}</span>
                  <span class="tgr-mini-time">{{ fmtTime(msg.date) }}</span>
                </div>
              </div>
              <!-- Locally sent replies for this chat -->
              <div v-for="sm in (sent[str(chat.chatId)]||[])" :key="sm.id" class="tgr-mini-row me">
                <div class="tgr-mini-bub out">
                  <span v-if="sm.fileNames?.length" class="tgr-mini-media">{{ sm.fileNames.map(n=>'📎 '+n).join(', ') }}</span>
                  <span v-if="sm.text" class="tgr-mini-txt">{{ sm.text }}</span>
                  <span class="tgr-mini-time">{{ fmtTime(sm.date) }} ✓</span>
                </div>
              </div>
            </div>
            <!-- Compact reply bar for each unread chat -->
            <div class="tgr-rbar compact">
              <input type="file" multiple style="display:none"
                :ref="el=>fref(chat.chatId,el)"
                @change="fileChange(chat.chatId,$event)"/>
              <div v-if="bar(chat.chatId,'emoji')" class="tgr-emoji-pop">
                <button v-for="e in EMOJIS" :key="e" class="tgr-epick" @click="emojiPick(chat.chatId,e)">{{ e }}</button>
              </div>
              <div v-if="bar(chat.chatId,'recording')" class="tgr-rec-ui">
                <button class="tgr-btn tgr-rec-trash" @click="cancelRec(chat.chatId)" title="Cancel">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>
                </button>
                <span class="tgr-recdot"></span>
                <span class="tgr-rectime">{{ fmtDur(bar(chat.chatId,'secs')||0) }}</span>
                <span class="tgr-reclabel">Recording…</span>
                <button class="tgr-send active" @click="stopRec(chat.chatId)" title="Stop & send">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                </button>
              </div>
              <div v-else class="tgr-rbar-inner">
                <button class="tgr-btn" :class="{act:bar(chat.chatId,'emoji')}" @click.stop="toggleEmoji(chat.chatId)" title="Emoji">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                </button>
                <textarea class="tgr-input" :placeholder="'Reply to '+chat.chatName+'…'"
                  :value="bar(chat.chatId,'draft')" rows="1"
                  @input="e=>{setBar(chat.chatId,'draft',e.target.value);rz(e)}"
                  @keydown.enter.exact.prevent="doSend(chat.chatId)"
                  @keydown.escape="setBar(chat.chatId,'emoji',false)"
                ></textarea>
                <!-- ✅ FIX 3: Attach button -->
                <button class="tgr-btn" @click="fclick(chat.chatId)" title="Attach file">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
                </button>
                <button v-if="!bar(chat.chatId,'draft')&&!bar(chat.chatId,'voice')"
                  class="tgr-btn" @click="startRec(chat.chatId)" title="Voice message">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                </button>
                <button class="tgr-send"
                  :class="{active:bar(chat.chatId,'draft')||bar(chat.chatId,'files')?.length||bar(chat.chatId,'voice')}"
                  :disabled="bar(chat.chatId,'sending')||(!bar(chat.chatId,'draft')&&!bar(chat.chatId,'files')?.length&&!bar(chat.chatId,'voice'))"
                  @click="doSend(chat.chatId)">
                  <span v-if="bar(chat.chatId,'sending')" class="tgr-spin"></span>
                  <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
              </div>
              <div v-if="bar(chat.chatId,'files')?.length" class="tgr-files">
                <div v-for="(f,i) in bar(chat.chatId,'files')" :key="i" class="tgr-filechip">📎 {{ f.name }}<button @click="rmFile(chat.chatId,i)">✕</button></div>
              </div>
              <transition name="tgr-toast"><div v-if="bar(chat.chatId,'toast')" class="tgr-toast">✓ Sent!</div></transition>
            </div>
          </div>
        </div>
        <div v-else class="tgr-empty">No unread messages 🎉</div>
      </template>

      <!-- ══ 3. CHAT LIST ══ -->
      <template v-else-if="step.tool==='telegram_list_chats'&&step.telegramChats?.length">
        <div class="tgr-chat-list">
          <div v-for="c in step.telegramChats.slice(0,15)" :key="c.id" class="tgr-chat-row">
            <img v-if="photos[str(c.id)]" :src="photos[str(c.id)]" class="tgr-av-img"/>
            <div v-else class="tgr-av-txt" :style="{background:avColor(c.name)}">{{ avInit(c.name) }}</div>
            <div class="tgr-chat-body">
              <div class="tgr-chat-top"><span class="tgr-chat-name">{{ c.name }}</span><span class="tgr-chat-date">{{ fmtDate(c.lastDate) }}</span></div>
              <div class="tgr-chat-prev">{{ c.lastMessage||'…' }}</div>
            </div>
            <span v-if="c.unread>0" class="tgr-ubadge">{{ c.unread>99?'99+':c.unread }}</span>
          </div>
        </div>
      </template>

      <!-- ══ 4. SEARCH RESULTS ══ -->
      <template v-else-if="step.tool==='telegram_search_messages'&&step.telegramSearchResults?.length">
        <div class="tgr-search-list">
          <div v-for="(r,i) in step.telegramSearchResults" :key="i" class="tgr-srow">
            <div class="tgr-av-txt sm" :style="{background:avColor(r.chatName)}">{{ avInit(r.chatName) }}</div>
            <div class="tgr-sbody">
              <div class="tgr-stop"><span class="tgr-schat">{{ r.chatName }}</span><span class="tgr-stime">{{ fmtTime(r.date) }}</span></div>
              <div class="tgr-stext" v-html="hl(r.text,step.telegramQuery)"></div>
            </div>
          </div>
        </div>
      </template>

      <!-- ══ 5. SENT CONFIRMATION ══ -->
      <template v-else-if="step.telegramSent">
        <div class="tgr-sent"><div class="tgr-sent-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg></div>
          <div><div class="tgr-sent-to">Sent to {{ step.telegramSent.to }}</div><div class="tgr-sent-msg">"{{ step.telegramSent.message }}"</div></div>
        </div>
      </template>

      <div v-else class="tgr-empty">{{ step.summary||'No Telegram data' }}</div>
    </div>

    <!-- ✅ Lightbox for full-size photos -->
    <div v-if="lightboxSrc" class="tgr-lightbox" @click="lightboxSrc=null">
      <img :src="lightboxSrc" class="tgr-lightbox-img" @click.stop/>
      <button class="tgr-lightbox-close" @click="lightboxSrc=null">✕</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, reactive } from 'vue'
import { API_BASE } from '../../../services/api.js'

const props = defineProps({ steps:{type:Array,default:()=>[]}, msg:{type:Object,default:()=>({})} })
const emit  = defineEmits(['reply'])

const TG_TOOLS = ['telegram_get_messages','telegram_get_unread','telegram_list_chats',
  'telegram_send_message','telegram_reply_message','telegram_search_messages','telegram_get_contact_info']
const telegramSteps = computed(()=> props.steps.filter(s=>TG_TOOLS.includes(s.tool)))

// ── Profile photos ───────────────────────────────────────────────
const photos   = reactive({})
const fetching = new Set()
function str(id){ return id == null ? '' : String(id) }

async function loadPhoto(id){
  const sid = str(id); if(!sid||photos[sid]!==undefined||fetching.has(sid)) return
  fetching.add(sid); photos[sid] = ''
  try{
    const r = await fetch(`${API_BASE}/api/telegram/photo/${encodeURIComponent(sid)}`,
      {headers:{Authorization:`Bearer ${localStorage.getItem('token')}`}})
    const j = await r.json(); if(j.photo) photos[sid]=j.photo
  }catch{}finally{fetching.delete(sid)}
}
function collectPhotos(steps){
  for(const s of steps){
    if(s.richTelegramMessages?.length)
      [...new Set(s.richTelegramMessages.filter(m=>!m.fromMe&&m.fromId).map(m=>str(m.fromId)))].forEach(loadPhoto)
    if(s.telegramUnreadChats?.length) s.telegramUnreadChats.forEach(c=>loadPhoto(str(c.chatId)))
    if(s.telegramChats?.length)       s.telegramChats.slice(0,15).forEach(c=>loadPhoto(str(c.id)))
  }
}

// ── ✅ FIX 1: Photo image loading for actual photos ───────────────
const mediaImages = reactive({})   // `${chatId}:${msgId}` → dataUrl | 'loading' | null
const lightboxSrc = ref(null)

function getImg(chatId, msg) {
  return mediaImages[`${str(chatId)}:${msg.id}`]
}

async function loadImg(chatId, msg) {
  if (!chatId || !msg?.id) return
  if (msg.media?.type !== 'photo') return
  const key = `${str(chatId)}:${msg.id}`
  if (mediaImages[key] !== undefined) return
  mediaImages[key] = 'loading'
  try {
    // msgId from media object if available, otherwise use the message id
    const msgId = msg.media?.msgId || msg.id
    const r = await fetch(
      `${API_BASE}/api/telegram/media/${encodeURIComponent(chatId)}/${msgId}`,
      { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
    )
    const j = await r.json()
    mediaImages[key] = j.data || null
  } catch { mediaImages[key] = null }
}

function autoLoadImages(steps) {
  for (const s of steps) {
    const cid = resolvedChatId(s)
    if (s.richTelegramMessages?.length) {
      s.richTelegramMessages
        .filter(m => m.media?.type === 'photo')
        .forEach(m => loadImg(cid, m))
    }
    if (s.telegramUnreadChats?.length) {
      for (const c of s.telegramUnreadChats) {
        const cid2 = str(c.chatId)
        ;(c.messages || [])
          .filter(m => m.media?.type === 'photo')
          .forEach(m => loadImg(cid2, m))
      }
    }
  }
}

onMounted(() => {
  collectPhotos(telegramSteps.value)
  autoLoadImages(telegramSteps.value)
})
watch(telegramSteps, v => {
  collectPhotos(v)
  autoLoadImages(v)
}, {deep:true})

// ── ✅ FIX 2: Sent messages — localStorage + backend persistence ──────────────
const SK = 'tgr_sent_v4'
const TTL = 12 * 60 * 60 * 1000

function loadSent() {
  try {
    const raw = JSON.parse(localStorage.getItem(SK) || '{}')
    const now = Date.now()
    const out = {}
    for (const [cid, msgs] of Object.entries(raw)) {
      const fresh = msgs.filter(m => (now - new Date(m.date).getTime()) < TTL)
      if (fresh.length) out[cid] = fresh
    }
    return out
  } catch { return {} }
}
function saveSent(obj) {
  try {
    const out = {}
    Object.entries(obj).slice(-30).forEach(([k,v]) => { out[k] = v.slice(-20) })
    localStorage.setItem(SK, JSON.stringify(out))
  } catch {}
}
const sent = reactive(loadSent())

// Persist sent reply to backend so it survives across sessions
async function persistReplyToBackend(chatId, text, fileNames) {
  const sessionId = localStorage.getItem('orion_session') || ''
  if (!sessionId) return
  const base = API_BASE || 'http://localhost:3000'
  const token = localStorage.getItem('token')
  try {
    await fetch(`${base}/api/agent/telegram-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ sessionId, chatId: str(chatId), text, fileNames: fileNames || [] })
    })
  } catch(e) { console.warn('persist reply failed (non-fatal):', e.message) }
}

// ── "Open Telegram" button ───────────────────────────────────────
function openTelegram(){
  try { document.dispatchEvent(new CustomEvent('orion:open-telegram',{bubbles:true,detail:{}})) } catch{}
  try { if(window.__orion?.setModule) { window.__orion.setModule('telegram'); return } } catch{}
  try {
    const btn = [...document.querySelectorAll('[data-module],[data-app]')]
      .find(el => el.textContent?.toLowerCase().includes('telegram') || el.dataset.module==='telegram' || el.dataset.app==='telegram')
    if(btn){ btn.click(); return }
  } catch{}
  try { window.location.hash = '#telegram' } catch{}
}

// ── Resolve chatId ────────────────────────────────────────────────
function resolvedChatId(step){
  if(step.telegramChatId) return str(step.telegramChatId)
  const msgs = step.richTelegramMessages || []
  const other = msgs.find(m => !m.fromMe)
  if(other?.fromId) return str(other.fromId)
  return ''
}

// ── Media string ─────────────────────────────────────────────────
function mediaStr(m){
  if(m == null || m === '') return ''
  if(typeof m==='object'){
    const t=(m.type||'').toLowerCase()
    if(t==='photo')    return '📷 Photo'
    if(t==='video')    return '🎥 Video'+(m.duration?' · '+fmtDur(m.duration):'')
    if(t==='voice')    return '🎤 Voice'+(m.duration?' · '+fmtDur(m.duration):'')
    if(t==='document') return '📎 '+(m.fileName||'File')+(m.size?' · '+fmtSize(m.size):'')
    if(t==='sticker')  return (m.emoji||'🎭')+' Sticker'
    if(t==='gif')      return '🎞 GIF'
    if(t==='audio')    return '🎵 '+(m.fileName||'Audio')
    if(t==='location') return '📍 Location'
    if(t==='poll')     return '📊 '+(m.question||'Poll')
    if(t==='webpage')  return '🔗 '+(m.title||m.url||'Link')
    if(t)              return '📎 '+t
    return '📎 Attachment'
  }
  if(typeof m==='string'){
    const s=m.toLowerCase()
    if(s.includes('photo'))    return '📷 Photo'
    if(s.includes('video'))    return '🎥 Video'
    if(s.includes('document')) return '📎 File'
    if(s.includes('voice'))    return '🎤 Voice'
    if(s.includes('audio'))    return '🎵 Audio'
    if(s.includes('sticker'))  return '🎭 Sticker'
    if(s.includes('geo'))      return '📍 Location'
    if(s.includes('poll'))     return '📊 Poll'
    if(s.includes('webpage'))  return '🔗 Link'
    if(m.length>0)             return '📎 '+m.replace(/MessageMedia/i,'')
  }
  return '📎 Attachment'
}

// ── Per-chatId bar state ─────────────────────────────────────────
const bars  = reactive({})
const frefs = reactive({})
const recs  = {}

function ensureBar(cid){
  const k = str(cid)
  if(!k) return
  if(!bars[k]) bars[k]={ draft:'',emoji:false,files:[],voice:null,recording:false,secs:0,sending:false,toast:false }
}
function bar(cid, field){
  const k=str(cid)
  if(!k) return field==='files'?[]:'';
  ensureBar(k)
  return bars[k]?.[field] ?? (field==='files'?[]:false)
}
function setBar(cid,field,val){ const k=str(cid); if(!k) return; ensureBar(k); if(bars[k]) bars[k][field]=val }

const EMOJIS=['😀','😂','❤️','👍','🙏','😊','🔥','✅','💯','🎉','😎','🤔','😅','🥹','😭','🤣','💪','👏','🚀','⭐','😍','🤩','😤','🥳','😴','🤗','👀','🫡','💙']
function toggleEmoji(cid){ setBar(cid,'emoji',!bar(cid,'emoji')) }
function emojiPick(cid,e){ setBar(cid,'draft',bar(cid,'draft')+e); setBar(cid,'emoji',false) }
function rz(ev){ const el=ev.target; el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,100)+'px' }

function fref(cid,el){ if(cid) frefs[str(cid)]=el }
function fclick(cid){ const el=frefs[str(cid)]; if(el) el.click() }
function fileChange(cid,ev){ setBar(cid,'files',[...(bar(cid,'files')||[]),...ev.target.files]); ev.target.value='' }
function rmFile(cid,i){ const f=[...(bar(cid,'files')||[])]; f.splice(i,1); setBar(cid,'files',f) }

async function startRec(cid){
  if(!navigator.mediaDevices?.getUserMedia){alert('Mic not available');return}
  const stream=await navigator.mediaDevices.getUserMedia({audio:true})
  const k=str(cid); ensureBar(k)
  bars[k].recording=true; bars[k].secs=0
  const mr=new MediaRecorder(stream); const chunks=[]
  recs[k]={mr,chunks,timer:setInterval(()=>bars[k].secs++,1000)}
  mr.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)}
  mr.onstop=()=>{ stream.getTracks().forEach(t=>t.stop()); bars[k].recording=false; clearInterval(recs[k]?.timer); if(chunks.length) bars[k].voice=new Blob(chunks,{type:'audio/webm'}) }
  mr.start(200)
}
function stopRec(cid){ const k=str(cid); if(recs[k]?.mr?.state!=='inactive') recs[k].mr.stop() }
function cancelRec(cid){
  const k=str(cid); if(!recs[k]) return
  recs[k].chunks=[]; clearInterval(recs[k].timer)
  if(recs[k].mr?.state!=='inactive'){recs[k].mr.ondataavailable=()=>{};recs[k].mr.onstop=()=>{recs[k].mr?.stream?.getTracks().forEach(t=>t.stop());bars[k].recording=false};recs[k].mr.stop()}
  else{if(bars[k])bars[k].recording=false}
  if(bars[k]){bars[k].secs=0;bars[k].voice=null}
}
function playVoice(cid){ const v=bar(cid,'voice'); if(v)new Audio(URL.createObjectURL(v)).play() }
function discardVoice(cid){ setBar(cid,'voice',null); setBar(cid,'secs',0) }

// ── ✅ FIX 3: Send — uses base64 for file uploads (matches backend expectation) ──
async function doSend(cid){
  const k=str(cid); if(!k){console.warn('TelegramRenderer: no chatId');return}
  ensureBar(k)
  const b=bars[k]
  const text=(b.draft||'').trim()
  const files=b.files||[]
  if(!text&&!files.length&&!b.voice){return}
  b.sending=true
  try{
    const token=localStorage.getItem('token')
    const base=API_BASE||'http://localhost:3000'

    // Send text message
    if(text){
      const res=await fetch(`${base}/api/telegram/dialogs/${encodeURIComponent(k)}/send`,
        {method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({text})})
      if(!res.ok) throw new Error(await res.text().catch(()=>res.status))
    }

    // ✅ FIX 3: Upload files as base64 JSON (backend expects { fileName, mimeType, base64, caption })
    for(const f of files){
      const b64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload  = ev => resolve(ev.target.result.split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(f)
      })
      const res = await fetch(`${base}/api/telegram/dialogs/${encodeURIComponent(k)}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fileName: f.name, mimeType: f.type, base64: b64, caption: '' })
      })
      if(!res.ok) throw new Error(await res.text().catch(()=>res.status))
    }

    // Build sent payload
    const payload={id:Date.now(),chatId:k,text,fileNames:files.map(f=>f.name),fromMe:true,date:new Date().toISOString()}
    if(!sent[k]) sent[k]=[]
    sent[k].push(payload)
    saveSent(sent)

    // ✅ FIX 2: Persist reply to backend DB so it survives page refresh
    await persistReplyToBackend(k, text, files.map(f => f.name))

    b.draft=''; b.files=[]; b.voice=null
    b.toast=true; setTimeout(()=>{b.toast=false},2500)
    emit('reply',payload)
  }catch(e){console.error('TelegramRenderer send:',e)}
  finally{b.sending=false}
}

// ── Helpers ──────────────────────────────────────────────────────
const AV=['#6366f1','#8b5cf6','#ec4899','#06b6d4','#10b981','#f59e0b','#ef4444','#229ED9']
function avColor(n=''){ let x=0;for(let i=0;i<n.length;i++)x=n.charCodeAt(i)+((x<<5)-x);return AV[Math.abs(x)%AV.length] }
function avInit(n=''){ const w=(n||'').trim().split(/\s+/);return w.length>=2?(w[0][0]+w[1][0]).toUpperCase():(n.slice(0,2)||'?').toUpperCase() }
function fmtTime(iso){ if(!iso)return '';return new Date(iso).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) }
function fmtDate(iso){
  if(!iso)return '';const d=new Date(iso),now=new Date(),diff=Math.floor((now-d)/86400000)
  if(diff===0)return fmtTime(iso);if(diff===1)return 'Yesterday'
  if(diff<7)return d.toLocaleDateString([],{weekday:'short'})
  return d.toLocaleDateString([],{day:'numeric',month:'short'})
}
function fmtDur(s){ return `${Math.floor(s/60)}:${String(Math.floor(s)%60).padStart(2,'0')}` }
function fmtSize(b){ if(!b)return '';if(b<1024)return b+'B';if(b<1048576)return(b/1024).toFixed(1)+'KB';return(b/1048576).toFixed(1)+'MB' }
function unreadTotal(step){ return(step.telegramUnreadChats||[]).reduce((s,c)=>s+(c.unreadCount||0),0) }
function esc(s){ return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }
function hl(text,q){
  if(!text||!q)return esc(text||'')
  const r=q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
  return esc(text).replace(new RegExp(r,'gi'),m=>`<mark class="tgr-hl">${m}</mark>`)
}
</script>

<style scoped>
.tgr-root{display:flex;flex-direction:column;gap:10px;font-size:13px;}
.tgr-card{background:rgba(34,158,217,.06);border:1px solid rgba(34,158,217,.18);border-radius:14px;overflow:hidden;}
/* Head */
.tgr-head{display:flex;align-items:center;gap:8px;padding:9px 13px;background:rgba(34,158,217,.1);border-bottom:1px solid rgba(34,158,217,.15);}
.tgr-head-title{flex:1;font-size:13px;font-weight:700;color:#e2e8f0;}
.tgr-badge{font-size:11px;font-weight:700;background:rgba(34,158,217,.2);color:#7dd3fc;padding:2px 8px;border-radius:12px;}
.tgr-badge.red{background:rgba(239,68,68,.18);color:#fca5a5;}
.tgr-open-btn{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:600;color:#7dd3fc;background:rgba(34,158,217,.15);border:1px solid rgba(34,158,217,.3);border-radius:12px;padding:4px 10px;cursor:pointer;white-space:nowrap;flex-shrink:0;transition:background .12s;}
.tgr-open-btn:hover{background:rgba(34,158,217,.3);color:#fff;}
/* Avatars */
.tgr-av-img{width:34px;height:34px;border-radius:50%;object-fit:cover;flex-shrink:0;}
.tgr-av-img.sm{width:26px;height:26px;}
.tgr-av-txt{width:34px;height:34px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;}
.tgr-av-txt.sm{width:26px;height:26px;font-size:10px;}
/* Thread */
.tgr-thread{display:flex;flex-direction:column;gap:5px;padding:10px 12px;max-height:320px;overflow-y:auto;scrollbar-width:thin;}
.tgr-row{display:flex;gap:7px;align-items:flex-end;}
.tgr-row.me{flex-direction:row-reverse;}
.tgr-av-wrap{flex-shrink:0;}
.tgr-bcol{display:flex;flex-direction:column;max-width:76%;}
.tgr-row.me .tgr-bcol{align-items:flex-end;}
.tgr-sender{font-size:11px;font-weight:700;color:#38bdf8;margin-bottom:2px;padding-left:2px;}
.tgr-bubble{padding:7px 10px 5px;border-radius:14px;line-height:1.45;word-break:break-word;}
.tgr-bubble.in{background:rgba(255,255,255,.09);border-bottom-left-radius:4px;}
.tgr-bubble.out{background:rgba(34,158,217,.28);border-bottom-right-radius:4px;}
/* ✅ Photo display */
.tgr-photo-wrap{margin-bottom:4px;border-radius:10px;overflow:hidden;max-width:260px;}
.tgr-photo-img{width:100%;max-width:260px;max-height:220px;object-fit:cover;border-radius:10px;cursor:zoom-in;display:block;}
.tgr-photo-skel{width:200px;height:140px;border-radius:10px;background:rgba(255,255,255,.07);overflow:hidden;}
.tgr-photo-shimmer{width:100%;height:100%;background:linear-gradient(90deg,rgba(255,255,255,.04) 25%,rgba(255,255,255,.1) 50%,rgba(255,255,255,.04) 75%);background-size:200% 100%;animation:photoShimmer 1.4s ease infinite;}
@keyframes photoShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
/* Media pill */
.tgr-media-pill{display:inline-block;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.3);border-radius:8px;padding:4px 10px;margin-bottom:4px;font-size:12.5px;font-weight:600;color:#fff;}
.tgr-media-pill.out{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.2);}
.tgr-txt{color:#e2e8f0;}
.tgr-txt.muted{color:#64748b;font-style:italic;}
.tgr-foot{display:flex;align-items:center;justify-content:flex-end;gap:3px;margin-top:3px;}
.tgr-time{font-size:10.5px;color:rgba(255,255,255,.38);}
.tgr-ticks{font-size:11px;color:#38bdf8;}
/* Unread */
.tgr-unread-list{display:flex;flex-direction:column;}
.tgr-uchat{padding:10px 12px 6px;border-bottom:1px solid rgba(255,255,255,.06);}
.tgr-uchat:last-child{border-bottom:none;}
.tgr-uchat-head{display:flex;align-items:center;gap:8px;margin-bottom:7px;}
.tgr-uchat-name{flex:1;font-size:13px;font-weight:700;color:#e2e8f0;}
.tgr-ubadge{min-width:20px;height:20px;border-radius:10px;background:#229ED9;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 5px;}
.tgr-mini-thread{display:flex;flex-direction:column;gap:4px;margin-left:34px;margin-bottom:6px;}
.tgr-mini-row{display:flex;}
.tgr-mini-row.me{justify-content:flex-end;}
.tgr-mini-bub{max-width:82%;padding:5px 9px 4px;border-radius:12px;display:flex;flex-direction:column;}
.tgr-mini-bub.in{background:rgba(255,255,255,.08);}
.tgr-mini-bub.out{background:rgba(34,158,217,.22);}
.tgr-mini-sender{font-size:10.5px;font-weight:700;color:#38bdf8;margin-bottom:1px;}
.tgr-mini-media{font-size:12px;font-weight:600;color:#e2e8f0;background:rgba(255,255,255,.12);border-radius:6px;padding:2px 7px;margin-bottom:2px;display:inline-block;}
.tgr-mini-txt{font-size:12.5px;color:#e2e8f0;word-break:break-word;}
.tgr-mini-txt.muted{color:#64748b;font-style:italic;}
.tgr-mini-time{font-size:10px;color:rgba(255,255,255,.3);text-align:right;margin-top:2px;}
/* ✅ Mini photo in unread view */
.tgr-mini-photo-wrap{margin-bottom:3px;}
.tgr-mini-photo{width:160px;max-height:120px;object-fit:cover;border-radius:8px;display:block;cursor:zoom-in;}
.tgr-mini-photo-skel{width:160px;height:80px;border-radius:8px;background:rgba(255,255,255,.07);animation:photoShimmer 1.4s ease infinite;}
/* Chat list */
.tgr-chat-list{display:flex;flex-direction:column;}
.tgr-chat-row{display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.05);}
.tgr-chat-row:last-child{border-bottom:none;}
.tgr-chat-body{flex:1;min-width:0;}
.tgr-chat-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;}
.tgr-chat-name{font-size:13px;font-weight:600;color:#e2e8f0;}
.tgr-chat-date{font-size:11px;color:#64748b;}
.tgr-chat-prev{font-size:12px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
/* Search */
.tgr-search-list{display:flex;flex-direction:column;}
.tgr-srow{display:flex;gap:9px;align-items:flex-start;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.05);}
.tgr-srow:last-child{border-bottom:none;}
.tgr-sbody{flex:1;min-width:0;}
.tgr-stop{display:flex;justify-content:space-between;margin-bottom:3px;}
.tgr-schat{font-size:11.5px;font-weight:700;color:#38bdf8;}
.tgr-stime{font-size:11px;color:#64748b;}
.tgr-stext{font-size:12.5px;color:#cbd5e1;line-height:1.4;}
.tgr-hl{background:rgba(250,204,21,.3);color:#fde68a;border-radius:2px;padding:0 2px;}
/* Sent confirmation */
.tgr-sent{display:flex;gap:10px;align-items:flex-start;padding:12px;}
.tgr-sent-icon{width:34px;height:34px;border-radius:50%;background:rgba(34,197,94,.1);display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.tgr-sent-to{font-size:13px;font-weight:700;color:#e2e8f0;}
.tgr-sent-msg{font-size:12px;color:#94a3b8;margin-top:3px;font-style:italic;}
/* Empty */
.tgr-empty{display:flex;align-items:center;gap:8px;padding:14px 12px;color:#64748b;}
/* ═══ REPLY BAR ═══ */
.tgr-rbar{border-top:1px solid rgba(255,255,255,.07);background:rgba(0,0,0,.18);padding:8px 10px;position:relative;}
.tgr-rbar.compact{padding:6px 10px;}
.tgr-rbar-inner{display:flex;align-items:flex-end;gap:6px;}
.tgr-btn{width:34px;height:34px;border-radius:50%;border:none;flex-shrink:0;background:rgba(255,255,255,.07);color:#94a3b8;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .12s,color .12s;}
.tgr-btn:hover{background:rgba(255,255,255,.12);color:#e2e8f0;}
.tgr-btn.act{color:#229ED9;background:rgba(34,158,217,.12);}
.tgr-input{flex:1;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:8px 12px;color:#e2e8f0;font-size:13px;outline:none;resize:none;min-height:34px;max-height:100px;line-height:1.4;font-family:inherit;transition:border-color .15s;}
.tgr-input::placeholder{color:#64748b;}
.tgr-input:focus{border-color:rgba(34,158,217,.5);background:rgba(34,158,217,.05);}
.tgr-send{width:34px;height:34px;border-radius:50%;border:none;flex-shrink:0;background:rgba(34,158,217,.3);color:rgba(255,255,255,.4);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s,color .15s;}
.tgr-send.active{background:#229ED9;color:#fff;}
.tgr-send:disabled{cursor:default;}
.tgr-spin{width:12px;height:12px;border-radius:50%;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;animation:sp .6s linear infinite;}
@keyframes sp{to{transform:rotate(360deg)}}
.tgr-emoji-pop{position:absolute;bottom:calc(100% + 4px);left:8px;right:8px;background:#1e293b;border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:8px;z-index:50;box-shadow:0 8px 24px rgba(0,0,0,.45);display:grid;grid-template-columns:repeat(10,1fr);gap:2px;}
.tgr-epick{width:32px;height:32px;border:none;background:transparent;font-size:18px;border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .1s,transform .1s;}
.tgr-epick:hover{background:rgba(255,255,255,.08);transform:scale(1.2);}
.tgr-rec-ui{display:flex;align-items:center;gap:8px;padding:2px 0;}
.tgr-rec-trash{color:#ef4444 !important;background:rgba(239,68,68,.1) !important;}
.tgr-rec-trash:hover{background:rgba(239,68,68,.2) !important;}
.tgr-rec-stop{flex-shrink:0;}
.tgr-recdot{width:8px;height:8px;border-radius:50%;background:#ef4444;animation:rp 1s ease infinite;flex-shrink:0;}
@keyframes rp{0%,100%{opacity:1}50%{opacity:.1}}
.tgr-rectime{font-weight:700;color:#ef4444;font-size:13px;font-variant-numeric:tabular-nums;min-width:36px;}
.tgr-reclabel{flex:1;font-size:12px;color:rgba(255,255,255,.4);}
.tgr-files{display:flex;flex-wrap:wrap;gap:5px;padding:5px 2px 0;}
.tgr-filechip{display:flex;align-items:center;gap:5px;background:rgba(255,255,255,.07);border-radius:16px;padding:3px 8px;font-size:12px;color:#94a3b8;}
.tgr-filechip button{background:none;border:none;color:#64748b;cursor:pointer;}
.tgr-voiceprev{display:flex;align-items:center;gap:8px;padding:5px 2px 0;}
.tgr-vbtn{border:none;border-radius:12px;padding:4px 10px;cursor:pointer;font-size:12px;}
.tgr-vbtn.play{background:rgba(34,158,217,.2);color:#7dd3fc;}
.tgr-vbtn.discard{background:rgba(239,68,68,.1);color:#fca5a5;}
/* Toast */
.tgr-toast{position:absolute;bottom:calc(100% + 6px);right:12px;background:#22c55e;color:#fff;font-size:12px;font-weight:700;padding:5px 14px;border-radius:20px;box-shadow:0 4px 12px rgba(34,197,94,.35);z-index:10;}
.tgr-toast-enter-active,.tgr-toast-leave-active{transition:opacity .2s,transform .2s;}
.tgr-toast-enter-from,.tgr-toast-leave-to{opacity:0;transform:translateY(4px);}
/* ✅ Lightbox */
.tgr-lightbox{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.92);display:flex;align-items:center;justify-content:center;}
.tgr-lightbox-img{max-width:90vw;max-height:88vh;border-radius:8px;object-fit:contain;}
.tgr-lightbox-close{position:absolute;top:16px;right:20px;background:rgba(255,255,255,.12);border:none;color:#fff;width:36px;height:36px;border-radius:50%;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;}
.tgr-lightbox-close:hover{background:rgba(255,255,255,.22);}
</style>