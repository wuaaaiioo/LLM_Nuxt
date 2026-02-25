import { defineStore } from 'pinia'
import { ref, computed, watch, nextTick } from 'vue'
import dayjs from 'dayjs'
import { sendChatStreamToBackend } from '~/composables/useChatAPI'

// 类型定义
type Message = { 
  id: string; 
  content: string; 
  role: 'user' | 'ai'; 
  time: string 
}
type Session = { 
  id: string; 
  title: string; 
  messages: Message[] 
}

export const useChatStore = defineStore('chat', () => {
  // 基础状态
  const activeSessionId = ref('')
  const sessionList = ref<Session[]>([])
  const inputMessage = ref('')
  const loading = ref(false)

  // 当前会话
  const currentSession = computed(() => {
    return sessionList.value.find(s => s.id === activeSessionId.value)
  })

  // ========== 1. 创建新会话（极简：无引导语） ==========
  const createNewSession = () => {
    const newSession: Session = {
      id: Date.now().toString(),
      title: '新会话',
      messages: [] // 空消息列表，无引导语
    }
    sessionList.value.push(newSession)
    activeSessionId.value = newSession.id
    saveSessions()
  }

  // ========== 2. 本地存储（极简版） ==========
  const loadSessions = () => {
    if (process.client) {
      const saved = localStorage.getItem('chat_sessions')
      const activeId = localStorage.getItem('active_session_id')
      if (saved) {
        try {
          sessionList.value = JSON.parse(saved)
        } catch (e) {
          sessionList.value = []
        }
      }
      if (activeId) activeSessionId.value = activeId
    }
  }
  const saveSessions = () => {
    if (process.client) {
      localStorage.setItem('chat_sessions', JSON.stringify(sessionList.value))
      localStorage.setItem('active_session_id', activeSessionId.value)
    }
  }

  // ========== 3. 删除会话 ==========
  const deleteSession = (id: string) => {
    sessionList.value = sessionList.value.filter(s => s.id !== id)
    activeSessionId.value = sessionList.value[0]?.id || ''
    saveSessions()
    if (sessionList.value.length === 0) createNewSession()
  }

  // ========== 4. 初始化（极简） ==========
  const initSessions = () => {
    loadSessions()
    if (sessionList.value.length === 0) createNewSession()
    else if (!activeSessionId.value) activeSessionId.value = sessionList.value[0].id
  }

  // ========== 5. 发送消息（核心：无引导语逻辑） ==========
  const sendMessage = async () => {
    const content = inputMessage.value.trim()
    if (!content || loading.value || !currentSession.value) return

    // 1. 添加用户消息
    const userMsg: Message = {
      id: Date.now().toString(),
      content,
      role: 'user',
      time: dayjs().format('HH:mm')
    }
    currentSession.value.messages.push(userMsg)
    saveSessions()

    // 2. 初始化变量
    inputMessage.value = ''
    loading.value = true
    const aiMsgId = Date.now().toString()
    let fullContent = ''

    // 3. 添加空AI消息
    const aiMsg: Message = {
      id: aiMsgId,
      content: '',
      role: 'ai',
      time: dayjs().format('HH:mm')
    }
    currentSession.value.messages.push(aiMsg)
    saveSessions()

    // 4. 构造历史消息（极简：只传用户/AI消息）
    const historyMessages = [{
      role: 'system',
      content: '你是一个专业、友好的AI助手，回答简洁易懂'
    }]
    currentSession.value.messages.forEach(msg => {
      historyMessages.push({
        role: msg.role === 'ai' ? 'assistant' : msg.role,
        content: msg.content
      })
    })

    // 5. 调用流式接口
    await sendChatStreamToBackend(
      historyMessages,
      (chunk) => {
        fullContent += chunk
        // 更新AI消息
        const index = currentSession.value!.messages.findIndex(m => m.id === aiMsgId)
        if (index > -1) {
          currentSession.value!.messages[index].content = fullContent
        }
      },
      () => {
        loading.value = false
        // 更新会话标题
        if (currentSession.value!.title === '新会话') {
          currentSession.value!.title = content.slice(0, 10) || '新会话'
          saveSessions()
        }
      },
      (err) => {
        loading.value = false
        const index = currentSession.value!.messages.findIndex(m => m.id === aiMsgId)
        if (index > -1) {
          currentSession.value!.messages[index].content = `😥 出错了：${err}`
        }
      }
    )
  }

  // 初始化 + 自动保存
  initSessions()
  watch([sessionList, activeSessionId], () => saveSessions(), { deep: true })

  return {
    activeSessionId,
    sessionList,
    inputMessage,
    loading,
    currentSession,
    createNewSession,
    sendMessage,
    deleteSession
  }
})