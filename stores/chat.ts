// stores/chat.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import dayjs from 'dayjs' // 用来格式化时间（记得先装：pnpm install dayjs）

// 1. 定义消息类型（用户/AI消息）
type Message = {
  id: string
  content: string // 消息内容
  role: 'user' | 'ai' // 消息发送方
  time: string // 发送时间
}

// 2. 改造会话类型：新增 messages 字段（存储当前会话的所有消息）
type Session = {
  id: string
  title: string
  messages: Message[] // 新增：会话对应的消息列表
}

export const useChatStore = defineStore('chat', () => {
  // 原有状态：会话列表、当前选中会话ID
  const activeSessionId = ref('')
  const sessionList = ref<Session[]>([])

  // 新增状态：输入框内容、加载态（AI回复时显示）
  const inputMessage = ref('')
  const loading = ref(false)

  
  // 新增：计算属性 - 获取当前选中的会话
  const currentSession = computed(() => {
    return sessionList.value.find(item => item.id === activeSessionId.value)
  })

  // 改造：新建会话时，初始化空消息列表
  const createNewSession = () => {
    const newSession: Session = {
      id: Date.now().toString(),
      title: '新会话',
      messages: [] // 空消息列表
    }
    sessionList.value.push(newSession)
    activeSessionId.value = newSession.id
  }

  // 新增核心方法：发送消息（前端模拟版）
  const sendMessage = () => {
    // 1. 校验：输入为空则不执行
    if (!inputMessage.value.trim()) return

    // 2. 确保有当前会话（防止异常）
    if (!currentSession.value) createNewSession()

    // 3. 添加用户消息到当前会话
    const userMsg: Message = {
      id: Date.now().toString(), // 时间戳做唯一ID
      content: inputMessage.value.trim(),
      role: 'user',
      time: dayjs().format('HH:mm') // 格式化时间为 时:分
    }
    currentSession.value.messages.push(userMsg)

    // 4. 清空输入框，设置加载态（模拟AI思考中）
    inputMessage.value = ''
    loading.value = true

    // 5. 模拟AI回复（2秒后返回固定内容）
    setTimeout(() => {
      const aiMsg: Message = {
        id: Date.now().toString(),
        content: '你好👋！这是模拟的AI回复～你可以继续输入其他问题试试～',
        role: 'ai',
        time: dayjs().format('HH:mm')
      }
      currentSession.value!.messages.push(aiMsg)
      loading.value = false // 关闭加载态
    }, 2000)
  }

  // 初始化：默认创建一个会话
  if (sessionList.value.length === 0) {
    createNewSession()
  }

  // 新增暴露的状态/方法
  return {
    activeSessionId,
    sessionList,
    inputMessage, // 输入框内容
    loading,      // 加载态
    currentSession, // 当前会话
    createNewSession,
    sendMessage   // 发送消息方法
  }
})