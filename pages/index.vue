<template>
  <div class="chat-page">
    <div
      v-if="isMobile && isMobileSidebarOpen"
      class="mobile-backdrop"
      @click="closeMobileSidebar"
    />

    <!-- 左侧会话列表 -->
    <div class="session-list" :class="{ 'session-list--open': isMobileSidebarOpen }">
      <div class="session-list__header">
        <span class="session-list__title">会话列表</span>
        <el-button
          v-if="isMobile"
          text
          class="session-list__close"
          @click="closeMobileSidebar"
        >
          关闭
        </el-button>
      </div>

      <el-button icon="Plus" type="primary" class="session-list__create" @click="handleCreateSession">
        新建会话
      </el-button>

      <el-card class="session-list__content">
        <div ref="sessionListRef" class="session-list__scroll" @scroll="handleSessionListScroll">
          <p v-for="session in chatStore.sessionList" :key="session.id"
            :class="{ active: session.id === chatStore.activeSessionId }" @click="handleSelectSession(session.id)"
            class="session-item">
            {{ session.title }}
            <el-button type="text" size="small" :icon="Delete" @click.stop="chatStore.deleteSession(session.id)"
              style="color: #999; margin-left: 8px;" @mouseenter="(e) => e.target.style.color = '#ff4d4f'"
              @mouseleave="(e) => e.target.style.color = '#999'" />
          </p>
          <div v-if="chatStore.sessionListLoading" class="session-list__loading">
            <el-skeleton :rows="3" animated />
          </div>
          <div v-else-if="!chatStore.sessionList.length" class="session-list__empty">
            暂无历史会话
          </div>
          <div v-else-if="chatStore.sessionListHasMore" class="session-list__more">
            下滑加载更多
          </div>
        </div>
      </el-card>
    </div>

    <!-- 右侧聊天区域 -->
    <div class="chat-content">
      <div class="auth-entry-bar">
        <template v-if="auth.isLoggedIn.value && auth.currentUser.value">
          <span class="auth-entry-bar__name">你好，{{ auth.currentUser.value.name }}</span>
          <el-button text @click="handleLogout">退出登录</el-button>
        </template>
        <template v-else>
          <NuxtLink class="auth-entry-bar__link" to="/login">登录</NuxtLink>
          <NuxtLink class="auth-entry-bar__link auth-entry-bar__link--primary" to="/register">注册</NuxtLink>
        </template>
      </div>

      <div class="mobile-toolbar">
        <el-button text class="mobile-toolbar__menu" @click="openMobileSidebar">
          会话
        </el-button>
        <div class="mobile-toolbar__title">{{ activeSessionTitle }}</div>
        <el-button text class="mobile-toolbar__create" @click="handleCreateSession">
          新建
        </el-button>
      </div>

      <!-- 消息列表 -->
      <div class="message-list" ref="messageListRef" @scroll="handleMessageScroll">
        <!-- 未输入时的提示 -->
        <div v-if="!hasMessage" class="welcome-tip">
          <div class="welcome-icon">💬</div>
          <div class="welcome-text">你有什么想问我的？</div>
          <div class="welcome-subtext">输入问题并发送，我会尽力解答</div>
        </div>

        <!-- 聊天记录 -->
        <template v-else>
          <div v-if="canLoadMoreHistory" class="history-loader">
            <el-button text :loading="chatStore.currentSession?.historyLoading" @click="loadOlderMessages">
              加载更早消息
            </el-button>
          </div>

          <div v-for="msg in visibleMessages" :key="msg.id">
            <!-- 用户消息 -->
            <div class="message-item user" v-if="msg.role === 'user'">
              <div class="message-content">{{ msg.content }}</div>
              <div class="message-time">{{ msg.time }}</div>
            </div>
            <!-- AI消息：全程Markdown渲染（核心改造） -->
            <div class="message-item ai" v-if="msg.role === 'ai'">
              <div class="message-content markdown-content" 
                   v-html="renderMarkdown(msg)"></div>
              <div v-if="msg.status === 'interrupted'" class="message-status interrupted">
                回答已手动停止，以上是已生成的内容。
              </div>
              <div v-if="msg.status === 'error'" class="message-status error">
                网络中断或服务异常，以上是已加载到的内容。
              </div>
              <div class="message-time">{{ msg.time }}</div>
            </div>
          </div>

          <!-- AI加载中骨架屏 -->
          <div v-if="chatStore.loading" class="message-item ai">
            <el-skeleton :rows="3" width="80%" />
          </div>
        </template>
      </div>

      <!-- 输入区域 -->
      <div class="input-area">
        <el-input v-model="chatStore.inputMessage" type="textarea" :disabled="chatStore.loading"
          placeholder="请输入你的问题..." @keyup.enter="handleEnterSend" :autosize="{ minRows: 1, maxRows: 5 }" />
        <div class="action-row">
          <el-button
            v-if="chatStore.loading"
            type="danger"
            @click="chatStore.stopResponse()"
            style="margin-top: 10px; width: 100%">
            停止回答
          </el-button>
          <el-button
            v-else
            type="primary"
            @click="handleSendMessage"
            style="margin-top: 10px; width: 100%"
            :disabled="!chatStore.inputMessage.trim()">
            发送
          </el-button>
        </div>
      </div>
    </div>

    <el-dialog
      v-model="showLoginPrompt"
      width="420px"
      :close-on-click-modal="false"
      :show-close="false"
      class="login-required-dialog"
    >
      <template #header>
        <span class="login-required-dialog__title">请先登录</span>
      </template>
      <p class="login-required-dialog__desc">
        使用问答功能前需要先登录账号。未登录时发送请求会被拦截。
      </p>
      <template #footer>
        <div class="login-required-dialog__actions">
          <el-button @click="showLoginPrompt = false">稍后再说</el-button>
          <el-button type="primary" @click="goLogin">去登录</el-button>
          <el-button type="success" plain @click="goRegister">去注册</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed, onMounted, onBeforeUnmount } from 'vue'
import { Delete } from '@element-plus/icons-vue'
import MarkdownIt from 'markdown-it'
import { ElMessage } from 'element-plus'

// 1. 初始化MarkdownIt（适配流式渲染）
const md = new MarkdownIt({
  breaks: true,        // 换行符转为<br>
  linkify: true,       // 自动识别链接
  typographer: true,   // 优化排版
  highlight: function (str: string, lang: string) {
    const languageClass = lang ? `language-${lang}` : ''
    const languageLabel = lang || 'code'
    return `<pre class="code-block"><div class="code-block__header">${md.utils.escapeHtml(languageLabel)}</div><code class="${languageClass}">${md.utils.escapeHtml(str)}</code></pre>`
  }
})

type ChatMessage = {
  id: string
  content: string
  role: 'user' | 'ai'
  time: string
  status?: 'streaming' | 'done' | 'error' | 'interrupted'
}

const normalizeMarkdown = (content: string, isStreaming: boolean) => {
  if (!content) return ''

  let normalized = content.replace(/\r\n/g, '\n')

  if (!isStreaming) {
    return normalized
  }

  const fenceCount = normalized.match(/```/g)?.length || 0
  if (fenceCount % 2 !== 0) {
    normalized += '\n```'
  }

  const boldCount = normalized.match(/\*\*/g)?.length || 0
  if (boldCount % 2 !== 0) {
    normalized += '**'
  }

  return normalized
}

const sanitizeRenderedHtml = (html: string) => {
  if (!process.client) return html

  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const allowedTags = new Set([
    'a', 'p', 'br', 'pre', 'code', 'strong', 'em', 'ul', 'ol', 'li',
    'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr',
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'div'
  ])
  const allowedAttrs = new Set(['href', 'target', 'rel', 'class'])

  const walk = (node: Node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement
      const tagName = el.tagName.toLowerCase()

      if (!allowedTags.has(tagName)) {
        el.replaceWith(...Array.from(el.childNodes))
        return
      }

      Array.from(el.attributes).forEach((attr) => {
        if (!allowedAttrs.has(attr.name)) {
          el.removeAttribute(attr.name)
        }
      })

      if (tagName === 'a') {
        const href = el.getAttribute('href') || ''
        const isSafeLink = /^(https?:|mailto:|tel:|\/)/i.test(href)
        if (!isSafeLink) {
          el.removeAttribute('href')
        } else {
          el.setAttribute('target', '_blank')
          el.setAttribute('rel', 'noopener noreferrer nofollow')
        }
      }
    }

    Array.from(node.childNodes).forEach(walk)
  }

  Array.from(doc.body.childNodes).forEach(walk)
  return doc.body.innerHTML
}

// 原有逻辑（保留+优化）
const chatStore = useChatStore()
const auth = useAuth()
const router = useRouter()
const sessionListRef = ref<HTMLDivElement>()
const messageListRef = ref<HTMLDivElement>()
const showLoginPrompt = ref(false)
const isPrependingHistory = ref(false)
const previousScrollHeight = ref(0)
const MOBILE_BREAKPOINT = 768
const isMobile = ref(false)
const isMobileSidebarOpen = ref(false)

watch(() => chatStore.activeSessionId, async () => {
  await nextTick()
  scrollToBottom()
})

const allMessages = computed(() => chatStore.currentSession?.messages || [])

const visibleMessages = computed(() => {
  return allMessages.value
})

const currentStreamingAiMessageId = computed(() => {
  const messages = chatStore.currentSession?.messages || []
  const lastMessage = messages[messages.length - 1]

  if (chatStore.loading && lastMessage?.role === 'ai') {
    return lastMessage.id
  }

  return ''
})

const renderMarkdown = (msg: ChatMessage) => {
  const isStreaming = msg.id === currentStreamingAiMessageId.value
  return sanitizeRenderedHtml(md.render(normalizeMarkdown(msg.content, isStreaming)))
}

const canLoadMoreHistory = computed(() => {
  return !!chatStore.currentSession?.hasMoreHistory
})

const hasMessage = computed(() => {
  if (!chatStore.currentSession) return false
  return chatStore.currentSession.messages.some(msg =>
    msg.role === 'user' || msg.role === 'ai'
  )
})

const activeSessionTitle = computed(() => {
  return chatStore.currentSession?.title || '新会话'
})

const syncViewport = () => {
  if (!process.client) return
  isMobile.value = window.innerWidth <= MOBILE_BREAKPOINT
  if (!isMobile.value) {
    isMobileSidebarOpen.value = false
  }
}

const openMobileSidebar = () => {
  if (!isMobile.value) return
  isMobileSidebarOpen.value = true
}

const closeMobileSidebar = () => {
  isMobileSidebarOpen.value = false
}

const handleLogout = async () => {
  auth.logout()
  chatStore.clearChatState()
  await chatStore.initSessions(true)
  ElMessage.success('已退出登录')
  showLoginPrompt.value = true
}

const goLogin = () => {
  showLoginPrompt.value = false
  router.push('/login')
}

const goRegister = () => {
  showLoginPrompt.value = false
  router.push('/register')
}

const ensureLoggedInOrPrompt = () => {
  if (auth.isLoggedIn.value) {
    return true
  }

  showLoginPrompt.value = true
  ElMessage.warning('请先登录后再发起问答')
  return false
}

const handleSendMessage = async () => {
  if (!chatStore.inputMessage.trim()) return
  if (!ensureLoggedInOrPrompt()) return
  await chatStore.sendMessage()
}

const handleCreateSession = async () => {
  if (!ensureLoggedInOrPrompt()) return
  await chatStore.createNewSession()
  closeMobileSidebar()
}

const handleSelectSession = async (sessionId: string) => {
  await chatStore.selectSession(sessionId)
  closeMobileSidebar()
}

const handleSessionListScroll = () => {
  const container = sessionListRef.value
  if (!container || chatStore.sessionListLoading || !chatStore.sessionListHasMore) return

  const threshold = 120
  const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight
  if (distanceToBottom <= threshold) {
    chatStore.loadMoreSessions()
  }
}

const scrollToBottom = () => {
  if (!messageListRef.value || !hasMessage.value) return
  messageListRef.value.scrollTop = messageListRef.value.scrollHeight
}

const loadOlderMessages = async () => {
  if (!messageListRef.value || !canLoadMoreHistory.value || isPrependingHistory.value) return

  isPrependingHistory.value = true
  previousScrollHeight.value = messageListRef.value.scrollHeight

  await chatStore.loadOlderMessages()
  await nextTick()

  if (messageListRef.value) {
    const newScrollHeight = messageListRef.value.scrollHeight
    messageListRef.value.scrollTop = newScrollHeight - previousScrollHeight.value
  }

  isPrependingHistory.value = false
}

const handleMessageScroll = () => {
  if (!messageListRef.value || isPrependingHistory.value) return

  if (messageListRef.value.scrollTop <= 120 && canLoadMoreHistory.value) {
    loadOlderMessages()
  }
}

const handleEnterSend = (e: KeyboardEvent) => {
  if (!e.shiftKey && chatStore.inputMessage.trim()) {
    e.preventDefault()
    handleSendMessage()
  }
}

watch(
  () => auth.isLoggedIn.value,
  async (loggedIn) => {
    if (loggedIn) {
      showLoginPrompt.value = false
      await chatStore.initSessions(true)
      return
    }

    await chatStore.initSessions(true)
    showLoginPrompt.value = true
  }
)

watch(
  () => chatStore.currentSession?.messages.length,
  async (newLength, oldLength) => {
    if (!newLength || isPrependingHistory.value) return

    nextTick(() => {
      if (messageListRef.value && hasMessage.value) {
        messageListRef.value.scrollTop = messageListRef.value.scrollHeight
      }
    })
  }
)

watch(
  visibleMessages,
  () => {
    if (isPrependingHistory.value) return

    nextTick(() => {
      if (messageListRef.value && hasMessage.value) {
        messageListRef.value.scrollTop = messageListRef.value.scrollHeight
      }
    })
  },
  { deep: true }
)

onMounted(async () => {
  auth.initAuth()
  await chatStore.initSessions()
  showLoginPrompt.value = !auth.isLoggedIn.value
  syncViewport()
  window.addEventListener('resize', syncViewport)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncViewport)
})
</script>

<style scoped>
/* 基础样式（保留原有） */
.chat-page {
  display: flex;
  min-height: 100dvh;
  height: 100dvh;
  gap: 10px;
  padding: 10px;
  box-sizing: border-box;
  background: #f8fafc;
}

.session-list {
  width: 240px;
  flex-shrink: 0;
}

.session-list__header {
  display: none;
}

.session-list__title {
  font-size: 16px;
  font-weight: 600;
  color: #0f172a;
}

.session-list__create {
  width: 100%;
  margin-bottom: 10px;
}

.session-list__content {
  height: calc(100dvh - 92px);
}

.session-list__scroll {
  height: 100%;
  overflow-y: auto;
}

.session-list__loading,
.session-list__more,
.session-list__empty {
  padding: 12px 0 4px;
}

.session-list__more {
  display: flex;
  justify-content: center;
  color: #94a3b8;
}

.session-list__empty {
  text-align: center;
  color: #94a3b8;
}

.session-item {
  padding: 8px 12px;
  cursor: pointer;
  border-radius: 4px;
  margin: 4px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.session-item.active {
  background-color: #e8f4ff;
  color: #409eff;
}

.chat-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.auth-entry-bar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
}

.auth-entry-bar__name {
  color: #334155;
  font-size: 14px;
}

.auth-entry-bar__link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  padding: 0 12px;
  border-radius: 8px;
  color: #2563eb;
  text-decoration: none;
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  transition: all 0.2s ease;
}

.auth-entry-bar__link:hover {
  background: #dbeafe;
}

.auth-entry-bar__link--primary {
  color: #fff;
  background: #2563eb;
  border-color: #2563eb;
}

.auth-entry-bar__link--primary:hover {
  background: #1d4ed8;
}

.login-required-dialog__title {
  font-size: 18px;
  font-weight: 600;
  color: #0f172a;
}

.login-required-dialog__desc {
  margin: 0;
  color: #475569;
  line-height: 1.7;
}

.login-required-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.mobile-toolbar {
  display: none;
}

.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  border: 1px solid #e6e6e6;
  border-radius: 12px;
  position: relative;
  background: #fff;
}

.history-loader {
  display: flex;
  justify-content: center;
  margin-bottom: 12px;
}

.welcome-tip {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #666;
  text-align: center;
}

.welcome-icon {
  font-size: 64px;
  margin-bottom: 20px;
  opacity: 0.8;
}

.welcome-text {
  font-size: 24px;
  font-weight: 500;
  margin-bottom: 10px;
  color: #333;
}

.welcome-subtext {
  font-size: 16px;
  color: #999;
}

.message-item {
  margin: 15px 0;
  display: flex;
  flex-direction: column;
  width: 100%;
}

.message-item.user {
  align-items: flex-end;
}

.message-item.user .message-content {
  max-width: 68%;
  padding: 12px 16px;
  border-radius: 18px 18px 6px 18px;
  background: linear-gradient(135deg, #2563eb 0%, #3b82f6 55%, #60a5fa 100%);
  color: #fff;
  box-shadow: 0 10px 24px rgba(37, 99, 235, 0.18);
  white-space: pre-wrap;
  word-break: break-word;
}

.message-item.ai {
  align-items: flex-start;
}

.message-item.ai .message-content {
  background-color: #f5f5f5;
  color: #333;
  max-width: 70%;
  padding: 10px 16px;
  border-radius: 12px;
  word-wrap: break-word;
}

.message-time {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
  align-self: flex-end;
}

.message-status {
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.5;
}

.message-status.error {
  color: #c2410c;
}

.message-status.interrupted {
  color: #2563eb;
}

.message-item.ai .message-time {
  align-self: flex-start;
}

.input-area {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid #e6e6e6;
  border-radius: 12px;
  background: #fff;
}

.action-row {
  width: 100%;
}

/* Markdown核心样式（新增/完善） */
.markdown-content {
  line-height: 1.8;
  font-size: 14px;
  white-space: normal;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3),
.markdown-content :deep(h4),
.markdown-content :deep(h5),
.markdown-content :deep(h6) {
  margin: 1em 0 0.5em;
  line-height: 1.35;
  color: #111827;
  font-weight: 700;
}

.markdown-content :deep(h1) {
  font-size: 28px;
}

.markdown-content :deep(h2) {
  font-size: 24px;
}

.markdown-content :deep(h3) {
  font-size: 20px;
}

.markdown-content :deep(h4) {
  font-size: 18px;
}

.markdown-content :deep(h5) {
  font-size: 16px;
}

.markdown-content :deep(h6) {
  font-size: 14px;
  color: #4b5563;
}

.markdown-content :deep(p) {
  margin: 0.75em 0;
}

/* 加粗样式 */
.markdown-content strong {
  font-weight: 700;
  color: #222;
  margin: 0 2px;
}

.markdown-content :deep(em) {
  font-style: italic;
}

/* 列表样式 */
.markdown-content ol,
.markdown-content ul {
  padding-left: 24px;
  margin: 10px 0;
}

.markdown-content li {
  margin: 8px 0;
  line-height: 1.7;
}

.markdown-content :deep(pre) {
  margin: 12px 0;
  white-space: pre;
}

.markdown-content :deep(code) {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
}

.markdown-content :deep(:not(pre) > code) {
  background: #eef2f7;
  color: #c2410c;
  padding: 2px 6px;
  border-radius: 6px;
  font-size: 13px;
}

/* 链接样式 */
.markdown-content a {
  color: #409eff;
  text-decoration: none;
}

.markdown-content a:hover {
  text-decoration: underline;
}

/* 代码块样式（和主流AI平台一致） */
.markdown-content :deep(.code-block) {
  display: block;
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 12px;
  overflow-x: auto;
  margin: 14px 0;
  padding: 0;
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.14);
}

.markdown-content :deep(.code-block__header) {
  display: flex;
  align-items: center;
  min-height: 38px;
  padding: 0 14px;
  background: rgba(148, 163, 184, 0.14);
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
  color: #cbd5e1;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.markdown-content :deep(.code-block > code) {
  display: block;
  padding: 16px;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 13px;
  line-height: 1.65;
  white-space: pre;
  word-break: normal;
  overflow-x: auto;
}

/* 引用块样式 */
.markdown-content blockquote {
  border-left: 4px solid #e6e6e6;
  padding-left: 12px;
  color: #666;
  margin: 10px 0;
}

.markdown-content :deep(hr) {
  border: 0;
  border-top: 1px solid #e5e7eb;
  margin: 16px 0;
}

.markdown-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
}

.markdown-content :deep(th),
.markdown-content :deep(td) {
  border: 1px solid #e5e7eb;
  padding: 8px 10px;
  text-align: left;
}

.mobile-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.38);
  z-index: 29;
}

@media (max-width: 768px) {
  .chat-page {
    padding: 0;
    gap: 0;
    overflow: hidden;
  }

  .session-list {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: min(82vw, 320px);
    padding: 16px 12px 12px;
    background: #fff;
    box-shadow: 18px 0 40px rgba(15, 23, 42, 0.16);
    transform: translateX(-100%);
    transition: transform 0.24s ease;
    z-index: 30;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
  }

  .session-list--open {
    transform: translateX(0);
  }

  .session-list__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .session-list__close {
    color: #64748b;
  }

  .session-list__content {
    flex: 1;
    height: auto;
    min-height: 0;
  }

  .session-list__scroll {
    min-height: 0;
  }

  .chat-content {
    width: 100%;
    padding: 10px;
    box-sizing: border-box;
  }

  .auth-entry-bar {
    gap: 8px;
    padding-top: 2px;
  }

  .auth-entry-bar__name {
    font-size: 13px;
  }

  .auth-entry-bar__link {
    height: 30px;
    padding: 0 10px;
  }

  .mobile-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 4px 2px 8px;
  }

  .mobile-toolbar__menu,
  .mobile-toolbar__create {
    flex-shrink: 0;
    padding: 8px 10px;
    border-radius: 10px;
    background: #e2e8f0;
    color: #0f172a;
  }

  .mobile-toolbar__title {
    flex: 1;
    min-width: 0;
    text-align: center;
    font-size: 15px;
    font-weight: 600;
    color: #0f172a;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .message-list {
    padding: 14px;
    border-radius: 16px;
  }

  .welcome-icon {
    font-size: 48px;
    margin-bottom: 16px;
  }

  .welcome-text {
    font-size: 20px;
  }

  .welcome-subtext {
    font-size: 14px;
  }

  .message-item {
    margin: 12px 0;
  }

  .message-item.user .message-content,
  .message-item.ai .message-content {
    max-width: 88%;
    padding: 10px 12px;
  }

  .message-time {
    font-size: 11px;
  }

  .input-area {
    gap: 8px;
    padding: 12px;
    border-radius: 16px;
  }

  .markdown-content {
    font-size: 13px;
    line-height: 1.7;
  }

  .markdown-content :deep(h1) {
    font-size: 22px;
  }

  .markdown-content :deep(h2) {
    font-size: 20px;
  }

  .markdown-content :deep(h3) {
    font-size: 18px;
  }

  .markdown-content ol,
  .markdown-content ul {
    padding-left: 18px;
  }

  .markdown-content :deep(.code-block > code) {
    padding: 14px;
    font-size: 12px;
  }
}
</style>
