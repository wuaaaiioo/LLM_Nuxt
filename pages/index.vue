<template>
  <div class="chat-page">
    <!-- 左侧会话列表 -->
    <div class="session-list">
      <el-button icon="Plus" type="primary" style="margin-bottom: 10px; width: 100%"
        @click="chatStore.createNewSession()">
        新建会话
      </el-button>

      <el-card class="session-list__content">
        <p v-for="session in chatStore.sessionList" :key="session.id"
          :class="{ active: session.id === chatStore.activeSessionId }" @click="chatStore.activeSessionId = session.id"
          class="session-item">
          {{ session.title }}
          <el-button type="text" size="small" :icon="Delete" @click.stop="chatStore.deleteSession(session.id)"
            style="color: #999; margin-left: 8px;" @mouseenter="(e) => e.target.style.color = '#ff4d4f'"
            @mouseleave="(e) => e.target.style.color = '#999'" />
        </p>
      </el-card>
    </div>

    <!-- 右侧聊天区域 -->
    <div class="chat-content">
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
            <el-button text @click="loadOlderMessages">加载更早消息</el-button>
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
        <el-button type="primary" :loading="chatStore.loading" @click="chatStore.sendMessage()"
          style="margin-top: 10px; width: 100%" :disabled="!chatStore.inputMessage.trim()">
          发送
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue'
import { Delete } from '@element-plus/icons-vue'
import MarkdownIt from 'markdown-it'

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
const messageListRef = ref<HTMLDivElement>()
const INITIAL_MESSAGE_COUNT = 30
const LOAD_MORE_COUNT = 20
const visibleMessageCount = ref(INITIAL_MESSAGE_COUNT)
const isPrependingHistory = ref(false)
const previousScrollHeight = ref(0)

// 切换会话时重置可见窗口
watch(() => chatStore.activeSessionId, () => {
  visibleMessageCount.value = INITIAL_MESSAGE_COUNT
  nextTick(() => scrollToBottom())
})

const allMessages = computed(() => chatStore.currentSession?.messages || [])

const visibleMessages = computed(() => {
  return allMessages.value.slice(-visibleMessageCount.value)
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
  return allMessages.value.length > visibleMessages.value.length
})

const hasMessage = computed(() => {
  if (!chatStore.currentSession) return false
  return chatStore.currentSession.messages.some(msg =>
    msg.role === 'user' || msg.role === 'ai'
  )
})

const scrollToBottom = () => {
  if (!messageListRef.value || !hasMessage.value) return
  messageListRef.value.scrollTop = messageListRef.value.scrollHeight
}

const loadOlderMessages = async () => {
  if (!messageListRef.value || !canLoadMoreHistory.value || isPrependingHistory.value) return

  isPrependingHistory.value = true
  previousScrollHeight.value = messageListRef.value.scrollHeight
  visibleMessageCount.value += LOAD_MORE_COUNT

  await nextTick()

  if (messageListRef.value) {
    const newScrollHeight = messageListRef.value.scrollHeight
    messageListRef.value.scrollTop = newScrollHeight - previousScrollHeight.value
  }

  isPrependingHistory.value = false
}

const handleMessageScroll = () => {
  if (!messageListRef.value || isPrependingHistory.value) return

  if (messageListRef.value.scrollTop <= 20 && canLoadMoreHistory.value) {
    loadOlderMessages()
  }
}

const handleEnterSend = (e: KeyboardEvent) => {
  if (!e.shiftKey && chatStore.inputMessage.trim()) {
    e.preventDefault()
    chatStore.sendMessage()
  }
}

watch(
  () => chatStore.currentSession?.messages.length,
  async (newLength, oldLength) => {
    if (!newLength || isPrependingHistory.value) return

    const delta = newLength - (oldLength || 0)
    if (delta > 0 && visibleMessageCount.value < newLength) {
      visibleMessageCount.value = Math.min(newLength, visibleMessageCount.value + delta)
      await nextTick()
    }

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
</script>

<style scoped>
/* 基础样式（保留原有） */
.chat-page {
  display: flex;
  height: calc(100vh - 20px);
  gap: 10px;
  padding: 10px;
}

.session-list {
  width: 240px;
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
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  border: 1px solid #e6e6e6;
  border-radius: 12px;
  position: relative;
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

.message-item.ai .message-time {
  align-self: flex-start;
}

.input-area {
  display: flex;
  flex-direction: column;
  gap: 10px;
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
</style>
