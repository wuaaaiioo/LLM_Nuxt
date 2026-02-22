<template>
  <!-- 页面外层容器 -->
  <div class="chat-page">
    <!-- 1. 左侧会话列表 -->
    <div class="session-list">
      <el-button icon="Plus" type="primary">新建会话</el-button>
      <el-list border class="session-list__content">
        <el-list-item>新会话</el-list-item>
      </el-list>
    </div>

    <!-- 2. 右侧聊天区域 -->
    <div class="chat-content">
      <!-- 2.1 消息列表（临时测试） -->
      <div class="message-list">
        <div class="message-item user">
          <div class="message-content">你好</div>
          <div class="message-time">14:30</div>
        </div>
        <div class="message-item ai">
          <div class="message-content">你好👋！有什么我可以帮助你的吗？</div>
          <div class="message-time">14:30</div>
        </div>
      </div>

      <!-- 2.2 输入区域 -->
      <div class="input-area">
        <el-input type="textarea" placeholder="请输入消息..."/>
        <el-button type="primary" style="margin-top: 10px">发送</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// 暂时空脚本，后续加逻辑
</script>

<style scoped>
/* 只加最基础的布局样式，保证页面能正常显示 */
.chat-page {
  display: flex;
  height: 100vh;
}

.session-list {
  width: 260px;
  border-right: 1px solid #e5e7eb;
  padding: 10px;
}

.chat-content {
  flex: 1;
  padding: 20px;
  display: flex;
  flex-direction: column;
}

.message-list {
  flex: 1;
  margin-bottom: 20px;
}
</style>