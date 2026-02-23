<template>
  <!-- 页面外层容器 -->
  <div class="chat-page">
    <!-- 1. 左侧会话列表（只做新建会话功能） -->
    <div class="session-list">
      <!-- 新建会话按钮：绑定 createNewSession 方法 -->
      <el-button 
        icon="Plus" 
        type="primary"
        style="margin-bottom: 10px"
        @click="chatStore.createNewSession()"
      >
        新建会话
      </el-button>

      <!-- 会话列表：动态渲染 sessionList -->
      <el-card
        :data="chatStore.sessionList" 
        class="session-list__content"
      >
  <p
    v-for="session in chatStore.sessionList"
    :key="session.id"
    :class="{ active: session.id === chatStore.activeSessionId }"
    @click="chatStore.activeSessionId = session.id"
    class="session-item" 
  >
    {{ session.title }}
  </p>
      </el-card>
    </div>

    <!-- 2. 右侧区域暂时留空（先不处理） -->
<div class="chat-content">
      <!-- 2.1 消息列表：动态渲染当前会话的消息 -->
      <div class="message-list">
        <!-- 渲染用户/AI消息 -->
        <div v-if="chatStore.currentSession">
          <div
            v-for="msg in chatStore.currentSession.messages"
            :key="msg.id"
            :class="['message-item', msg.role]"
          >
            <div class="message-content">{{ msg.content }}</div>
            <div class="message-time">{{ msg.time }}</div>
          </div>
        </div>

        <!-- 加载中提示：AI回复时显示骨架屏 -->
        <div v-if="chatStore.loading" class="message-item ai">
          <el-skeleton :rows="3" width="80%" />
        </div>
      </div>

      <!-- 2.2 输入区域：输入框+发送按钮 -->
      <div class="input-area">
        <el-input
          v-model="chatStore.inputMessage"
          type="textarea"
          :disabled="chatStore.loading"
          placeholder="请输入消息，按回车发送..."
          @keyup.enter="handleEnterSend"
          :autosize="{ minRows: 1, maxRows: 5 }"
        />
        <el-button
          type="primary"
          :loading="chatStore.loading"
          @click="chatStore.sendMessage()"
          style="margin-top: 10px; width: 100%"
        >
          发送
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// 1. 引入 Pinia 仓库（Nuxt 自动导入）


const chatStore = useChatStore()

// 新增：回车发送（Shift+回车换行）
const handleEnterSend = (e: KeyboardEvent) => {
  if (!e.shiftKey) { // 不是Shift+回车
    e.preventDefault() // 阻止默认换行
    chatStore.sendMessage()
  }
}
</script>
<style scoped>
/* 原有左侧样式保留不变 */
.chat-page {
  display: flex;
  height: 100vh;
  background-color: #f5f5f5;
}
.session-list{
  width: 260px;
  height: 100%;
  border-right: 1px solid #e5e7eb;
  padding: 10px;
  background-color: #f0f0f0;
}
.session-list__content {
  height: calc(100vh - 70px);
  overflow-y: auto;
  background-color: transparent;
}
.session-list__content :deep(.session-item) {
  margin: 0 0 4px 0;
  padding: 8px 12px;
  cursor: pointer;
  line-height: 1.5;
  border-radius: 4px;
  background-color: transparent;
  color: #333;
}
.session-list__content :deep(p.active) {
  background-color: #ffffff;
  color: #409eff;
  font-weight: 500;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}
.session-list__content :deep(p:hover) {
  background-color: #d9d9d9;
  color: #333;
}

/* 新增右侧聊天区域样式 */
.chat-content {
  flex: 1;
  padding: 20px;
  background-color: #ffffff;
  display: flex;
  flex-direction: column; /* 垂直布局：消息列表在上，输入框在下 */
}

/* 消息列表：占满剩余高度，可滚动 */
.message-list {
  flex: 1;
  overflow-y: auto;
  margin-bottom: 20px;
  padding: 0 20px;
  max-width: 800px; /* 消息列表不撑满屏幕，更美观 */
  margin-left: auto;
  margin-right: auto;
}

/* 消息气泡基础样式 */
.message-item {
  margin-bottom: 15px;
  max-width: 70%; /* 消息最大宽度，避免过长 */
}
/* 用户消息：右对齐 */
.message-item.user {
  margin-left: auto;
}
/* AI消息：左对齐 */
.message-item.ai {
  margin-right: auto;
}

/* 消息内容气泡 */
.message-content {
  padding: 10px 15px;
  border-radius: 8px;
  background-color: #f3f4f6; /* AI消息浅灰色 */
  color: #333;
  word-wrap: break-word; /* 自动换行 */
}
/* 用户消息气泡：蓝色背景 */
.message-item.user .message-content {
  background-color: #409eff;
  color: #ffffff;
}

/* 消息时间 */
.message-time {
  font-size: 12px;
  color: #9ca3af;
  margin-top: 5px;
  text-align: right; /* 用户消息时间右对齐 */
}
/* AI消息时间左对齐 */
.message-item.ai .message-time {
  text-align: left;
}

/* 输入区域样式 */
.input-area {
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
}
</style>