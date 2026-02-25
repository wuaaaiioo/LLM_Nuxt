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

    <!-- 右侧聊天区域（修复DOM嵌套） -->
    <div class="chat-content">
      <!-- 消息列表：核心逻辑 -->
      <div class="message-list" ref="messageListRef">
        <!-- 未输入时的大提示 -->
        <div v-if="!hasMessage" class="welcome-tip">
          <div class="welcome-icon">💬</div>
          <div class="welcome-text">你有什么想问我的？</div>
          <div class="welcome-subtext">输入问题并发送，我会尽力解答</div>
        </div>

        <!-- 有消息时显示聊天记录（修复v-for范围） -->
        <template v-else>
          <!-- 循环只包含消息，不包含加载态/输入区 -->
          <div v-for="(msg, index) in chatStore.currentSession?.messages" :key="msg.id + '_' + index">
            <!-- 用户消息 -->
            <div class="message-item user" v-if="msg.role === 'user'">
              <div class="message-content">{{ msg.content }}</div>
              <div class="message-time">{{ msg.time }}</div>
            </div>
            <!-- AI消息（修复Markdown渲染） -->
<div class="message-item ai" v-if="msg.role === 'ai'">
  <div class="message-content markdown-content">
    <!-- 
      正在加载中 → 显示纯文本（保证流式不乱）
      加载结束 → 渲染 Markdown
    -->
    <div v-if="chatStore.loading && msg.content.length < fullAiContentLength">
      {{ msg.content }}
    </div>
    <div v-else v-html="renderMarkdown(msg.content)"></div>
  </div>
  <div class="message-time">{{ msg.time }}</div>
</div>
          </div>

          <!-- AI加载中（移到v-for外面） -->
          <div v-if="chatStore.loading" class="message-item ai">
            <el-skeleton :rows="3" width="80%" />
          </div>
        </template>
      </div>

      <!-- 输入区域（移到message-list外面，修复嵌套） -->
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

// 看当前这条 AI 消息是不是正在输出的最后一条
const fullAiContentLength = computed(() => {
  if (!chatStore.currentSession) return 0
  const msgs = chatStore.currentSession.messages
  const last = msgs.at(-1)
  return last?.role === 'ai' ? last.content.length : 0
})

// 正常解析 markdown（不用任何脏正则）
const renderMarkdown = (content) => {
  if (!content) return ''
  return md.render(content)
}
// 1. 初始化markdown-it（极简配置，适配流式）

const md = new MarkdownIt({
  breaks: true,
  linkify: true
})
// 2. 核心：适配流式的Markdown解析函数（逐段拼接也能正确渲染）
const renderStreamMarkdown = (content: string) => {
  if (!content) return ''

  // 步骤1：清理流式拼接导致的畸形符号（针对你的文本定制）
  let cleanContent = content
    // 清理多余的*：*  * → **、*  内容  * → **内容**
    .replace(/\*\s*\*/g, '**')                // *  * → **
    .replace(/\*\s+([^*\n]+?)\s+\*/g, '**$1**') // *  内容  * → **内容**
    .replace(/(?<=\s)\*(?=\s)/g, '')           // 单独的*（前后是空格）→ 删掉
    .replace(/\*{3,}/g, '**')                 // 三个及以上* → 简化为**
    // 步骤2：修复列表格式（流式拼接可能导致列表断行）
    .replace(/(\d+)\.\s+\*/g, '$1. ')         // 1. * → 1. 
    // 步骤3：保留正常换行
    .replace(/\n+/g, '\n')

  // 步骤4：解析为HTML（流式每段都会重新解析，实时渲染）
  return md.render(cleanContent)
}

// 原有代码完全保留（修复scrollTop拼写错误）
const chatStore = useChatStore()
const messageListRef = ref<HTMLDivElement>()

const hasMessage = computed(() => {
  if (!chatStore.currentSession) return false
  return chatStore.currentSession.messages.some(msg =>
    msg.role === 'user' || msg.role === 'ai'
  )
})

const handleEnterSend = (e: KeyboardEvent) => {
  if (!e.shiftKey && chatStore.inputMessage.trim()) {
    e.preventDefault()
    chatStore.sendMessage()
  }
}

watch(
  () => chatStore.currentSession?.messages,
  () => {
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
/* 保留所有原有样式，只补充这行关键样式 */
.markdown-content {
  line-height: 1.8;
  font-size: 14px;
  white-space: pre-wrap;
  /* 关键：让流式渲染的Markdown换行正常 */
  word-break: break-all;
}

/* 其他样式（加粗、列表、代码块等）完全保留 */
.markdown-content strong {
  font-weight: 700;
  color: #222;
  margin: 0 2px;
}

.markdown-content ol,
.markdown-content ul {
  padding-left: 24px;
  margin: 10px 0;
}

.markdown-content li {
  margin: 8px 0;
  line-height: 1.7;
}

/* 其余样式不变 */
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
  background-color: #409eff;
  color: white;
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

.message-item.ai .message-time {
  align-self: flex-start;
}

.input-area {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
</style>