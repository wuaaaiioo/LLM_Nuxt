import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import dayjs from 'dayjs'
import { useChatAPI, type ChatMessageDTO, type ChatSessionDTO } from '~/composables/useChatAPI'

type Message = ChatMessageDTO

type Session = ChatSessionDTO & {
  persisted: boolean
  messages: Message[]
  nextCursor: string | null
  hasMoreHistory: boolean
  historyLoaded: boolean
  historyLoading: boolean
}

const SESSION_PAGE_SIZE = 20
const MESSAGE_PAGE_SIZE = 20
const SESSION_CACHE_KEY = 'nuxt_llm_session_list_cache'
const SESSION_CACHE_TTL = 60 * 1000

type SessionCachePayload = {
  savedAt: number
  page: number
  hasMore: boolean
  activeSessionId: string
  items: Array<{
    id: string
    title: string
    updatedAt?: string
    preview?: string
    persisted?: boolean
  }>
}

export const useChatStore = defineStore('chat', () => {
  const auth = useAuth()
  const chatApi = useChatAPI()

  const createId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  const isDraftSessionId = (sessionId: string) => sessionId.includes('_')
  const createEmptySession = (overrides?: Partial<Session>): Session => ({
    id: overrides?.id || createId(),
    title: overrides?.title || '新会话',
    updatedAt: overrides?.updatedAt,
    preview: overrides?.preview,
    persisted: overrides?.persisted ?? !isDraftSessionId(overrides?.id || ''),
    messages: overrides?.messages || [],
    nextCursor: overrides?.nextCursor || null,
    hasMoreHistory: overrides?.hasMoreHistory || false,
    historyLoaded: overrides?.historyLoaded || false,
    historyLoading: overrides?.historyLoading || false
  })

  const activeSessionId = ref('')
  const sessionList = ref<Session[]>([])
  const inputMessage = ref('')
  const loading = ref(false)
  const abortController = ref<AbortController | null>(null)
  const sessionListLoading = ref(false)
  const sessionListPage = ref(1)
  const sessionListHasMore = ref(false)
  const initialized = ref(false)

  const currentSession = computed(() => {
    return sessionList.value.find(session => session.id === activeSessionId.value)
  })

  const findSession = (sessionId: string) => {
    return sessionList.value.find(session => session.id === sessionId)
  }

  const isEmptyDraftSession = (session?: Session) => {
    if (!session || session.persisted) return false
    return !session.messages.some(message => message.content.trim())
  }

  const removeSessionLocally = (sessionId: string) => {
    sessionList.value = sessionList.value.filter(session => session.id !== sessionId)
    if (activeSessionId.value === sessionId) {
      activeSessionId.value = sessionList.value[0]?.id || ''
    }
  }

  const createLocalDraftSession = () => {
    const now = new Date().toISOString()
    const session = createEmptySession({
      id: createId(),
      title: '新会话',
      updatedAt: now,
      persisted: false,
      historyLoaded: true
    })
    sessionList.value.unshift(session)
    sortSessionsByRecent()
    activeSessionId.value = session.id
    persistSessionListCache()
    return session
  }

  const getSessionTimestamp = (session: Pick<Session, 'updatedAt'>) => {
    if (!session.updatedAt) return 0
    const time = new Date(session.updatedAt).getTime()
    return Number.isNaN(time) ? 0 : time
  }

  const sortSessionsByRecent = () => {
    sessionList.value.sort((a, b) => {
      const timeDiff = getSessionTimestamp(b) - getSessionTimestamp(a)
      if (timeDiff !== 0) return timeDiff
      return b.id.localeCompare(a.id)
    })
  }

  const bumpSessionToTop = (sessionId: string, updatedAt?: string) => {
    const session = findSession(sessionId)
    if (!session) return

    if (updatedAt) {
      session.updatedAt = updatedAt
    }

    sortSessionsByRecent()
  }

  const persistSessionListCache = () => {
    if (!process.client) return

    const payload: SessionCachePayload = {
      savedAt: Date.now(),
      page: sessionListPage.value,
      hasMore: sessionListHasMore.value,
      activeSessionId: activeSessionId.value,
      items: sessionList.value
        .filter(session => session.persisted)
        .map(session => ({
        id: session.id,
        title: session.title,
        updatedAt: session.updatedAt,
        preview: session.preview,
        persisted: session.persisted
      }))
    }

    sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(payload))
  }

  const restoreSessionListCache = () => {
    if (!process.client) return false

    const raw = sessionStorage.getItem(SESSION_CACHE_KEY)
    if (!raw) return false

    try {
      const payload = JSON.parse(raw) as SessionCachePayload
      if (!payload?.savedAt || Date.now() - payload.savedAt > SESSION_CACHE_TTL) {
        sessionStorage.removeItem(SESSION_CACHE_KEY)
        return false
      }

      const cachedItems = Array.isArray(payload.items) ? payload.items : []
      if (!cachedItems.length) {
        return false
      }

      sessionList.value = cachedItems.map(item => createEmptySession(item))
      sortSessionsByRecent()
      activeSessionId.value = sessionList.value[0]?.id || payload.activeSessionId || ''
      sessionListPage.value = payload.page || 2
      sessionListHasMore.value = !!payload.hasMore
      initialized.value = true
      return true
    } catch {
      sessionStorage.removeItem(SESSION_CACHE_KEY)
      return false
    }
  }

  const mergeMessages = (olderMessages: Message[], currentMessages: Message[]) => {
    const merged = [...olderMessages, ...currentMessages]
    const seen = new Set<string>()

    return merged.filter((message) => {
      if (seen.has(message.id)) {
        return false
      }
      seen.add(message.id)
      return true
    })
  }

  const upsertSession = (session: Partial<Session> & { id: string }) => {
    const index = sessionList.value.findIndex(item => item.id === session.id)
    if (index === -1) {
      sessionList.value.unshift(createEmptySession(session))
      sortSessionsByRecent()
      return findSession(session.id)!
    }

    sessionList.value[index] = {
      ...sessionList.value[index],
      ...session
    }

    sortSessionsByRecent()

    return sessionList.value[index]
  }

  const ensureFallbackSession = async () => {
    if (!auth.isLoggedIn.value) {
      return
    }

    if (sessionList.value.length > 0) {
      if (!activeSessionId.value) {
        activeSessionId.value = sessionList.value[0].id
      }
      return
    }

    createLocalDraftSession()
  }

  const clearChatState = () => {
    stopResponse()
    activeSessionId.value = ''
    sessionList.value = []
    inputMessage.value = ''
    loading.value = false
    abortController.value = null
    sessionListLoading.value = false
    sessionListPage.value = 1
    sessionListHasMore.value = false
    initialized.value = false
    if (process.client) {
      sessionStorage.removeItem(SESSION_CACHE_KEY)
    }
  }

  const normalizeSessionPage = (sessions: ChatSessionDTO[]) => {
    return sessions.map(session => createEmptySession(session))
  }

  const loadSessions = async (options?: { reset?: boolean }) => {
    if (!auth.isLoggedIn.value) {
      sessionList.value = []
      activeSessionId.value = ''
      sessionListHasMore.value = false
      initialized.value = true
      return
    }

    const reset = options?.reset ?? false
    const nextPage = reset ? 1 : sessionListPage.value

    if (sessionListLoading.value) return

    sessionListLoading.value = true

    try {
      const result = await chatApi.listChatSessions({
        page: nextPage,
        pageSize: SESSION_PAGE_SIZE
      })

      const normalized = normalizeSessionPage(result.items)

      if (reset) {
        sessionList.value = normalized
      } else {
        const existingIds = new Set(sessionList.value.map(item => item.id))
        sessionList.value.push(...normalized.filter(item => !existingIds.has(item.id)))
      }

      sortSessionsByRecent()

      sessionListPage.value = nextPage + 1
      sessionListHasMore.value = result.hasMore

      if (sessionList.value.length === 0) {
        await ensureFallbackSession()
      } else if (reset || !activeSessionId.value || !findSession(activeSessionId.value)) {
        activeSessionId.value = sessionList.value[0].id
      }

      persistSessionListCache()
    } finally {
      sessionListLoading.value = false
      initialized.value = true
    }
  }

  const loadMoreSessions = async () => {
    if (!auth.isLoggedIn.value) return
    if (!sessionListHasMore.value || sessionListLoading.value) return
    await loadSessions()
  }

  const hydrateSessionMessages = async (sessionId: string, force = false) => {
    if (!auth.isLoggedIn.value) return
    const session = findSession(sessionId)
    if (!session || session.historyLoading) return
    if (!session.persisted) {
      session.historyLoaded = true
      session.hasMoreHistory = false
      session.nextCursor = null
      return
    }
    if (session.historyLoaded && !force) return

    session.historyLoading = true

    try {
      const result = await chatApi.getChatMessages(sessionId, {
        limit: MESSAGE_PAGE_SIZE
      })

      session.messages = result.items
      session.nextCursor = result.nextCursor
      session.hasMoreHistory = result.hasMore
      session.historyLoaded = true
    } finally {
      session.historyLoading = false
    }
  }

  const loadOlderMessages = async () => {
    if (!auth.isLoggedIn.value) return
    const session = currentSession.value
    if (!session || !session.hasMoreHistory || session.historyLoading) return

    session.historyLoading = true

    try {
      const result = await chatApi.getChatMessages(session.id, {
        cursor: session.nextCursor,
        limit: MESSAGE_PAGE_SIZE
      })

      session.messages = mergeMessages(result.items, session.messages)
      session.nextCursor = result.nextCursor
      session.hasMoreHistory = result.hasMore
      session.historyLoaded = true
    } finally {
      session.historyLoading = false
    }
  }

  const selectSession = async (sessionId: string) => {
    if (!auth.isLoggedIn.value) return
    if (activeSessionId.value === sessionId) {
      await hydrateSessionMessages(sessionId)
      return
    }

    const previousSession = currentSession.value
    if (isEmptyDraftSession(previousSession)) {
      removeSessionLocally(previousSession!.id)
    }

    activeSessionId.value = sessionId
    persistSessionListCache()
    await hydrateSessionMessages(sessionId)
  }

  const createNewSession = async () => {
    if (!auth.isLoggedIn.value) return
    stopResponse()
    if (isEmptyDraftSession(currentSession.value)) {
      activeSessionId.value = currentSession.value!.id
      return
    }
    createLocalDraftSession()
  }

  const deleteSession = async (sessionId: string) => {
    if (!auth.isLoggedIn.value) return
    if (currentSession.value?.id === sessionId && loading.value) {
      stopResponse()
    }

    const targetSession = findSession(sessionId)
    removeSessionLocally(sessionId)

    if (targetSession?.persisted) {
      await chatApi.deleteChatSession(sessionId)
    }

    activeSessionId.value = sessionList.value[0]?.id || ''
    if (sessionList.value.length === 0) {
      await ensureFallbackSession()
    }
    persistSessionListCache()
  }

  const buildHistoryMessages = (messages: Message[]) => {
    const historyMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [{
      role: 'system',
      content: '你是一个专业、友好的AI助手，回答简洁易懂'
    }]

    messages.forEach((message) => {
      const normalizedContent = message.content.trim()
      if (!normalizedContent) {
        return
      }

      historyMessages.push({
        role: message.role === 'ai' ? 'assistant' : 'user',
        content: normalizedContent
      })
    })

    return historyMessages
  }

  const sendMessage = async () => {
    if (!auth.isLoggedIn.value) return
    const content = inputMessage.value.trim()
    if (!content || loading.value || !currentSession.value) return

    let session = currentSession.value
    const isDraftSession = !session.persisted
    const sessionId = session.id

    const userMsg: Message = {
      id: createId(),
      content,
      role: 'user',
      time: dayjs().format('HH:mm'),
      createdAt: new Date().toISOString()
    }

    session.messages.push(userMsg)
    session.historyLoaded = true
    session.preview = content
    session.updatedAt = userMsg.createdAt
    persistSessionListCache()

    inputMessage.value = ''
    loading.value = true
    abortController.value = new AbortController()

    const aiMsgId = createId()
    let fullContent = ''

    const aiMsg: Message = {
      id: aiMsgId,
      content: '',
      role: 'ai',
      time: dayjs().format('HH:mm'),
      createdAt: new Date().toISOString(),
      status: 'streaming'
    }

    session.messages.push(aiMsg)
    session = upsertSession({
      id: sessionId,
      preview: content,
      updatedAt: userMsg.createdAt,
      title: session.title === '新会话' || session.title === '新对话'
        ? (content.slice(0, 20) || '新会话')
        : session.title
    })
    activeSessionId.value = session.id

    const historyMessages = buildHistoryMessages(session.messages)

    await chatApi.sendChatStreamToBackend(
      historyMessages,
      (chunk) => {
        const targetSession = findSession(isDraftSession ? activeSessionId.value : sessionId) || findSession(sessionId)
        if (!targetSession) return

        fullContent += chunk
        const targetMessage = targetSession.messages.find(message => message.id === aiMsgId)
        if (!targetMessage) return

        targetMessage.content = fullContent
        targetMessage.status = 'streaming'
        targetSession.preview = fullContent || content
        targetSession.updatedAt = new Date().toISOString()
        bumpSessionToTop(sessionId, targetSession.updatedAt)
        persistSessionListCache()
      },
      () => {
        const targetSession = findSession(activeSessionId.value) || findSession(sessionId)
        loading.value = false
        abortController.value = null
        if (!targetSession) return

        const targetMessage = targetSession.messages.find(message => message.id === aiMsgId)
        if (!targetMessage) return

        if (targetMessage.status === 'streaming') {
          targetMessage.status = 'done'
        }

        if (targetSession.title === '新会话' || targetSession.title === '新对话') {
          targetSession.title = content.slice(0, 20) || '新会话'
        }

        targetSession.preview = fullContent || content
        targetSession.updatedAt = new Date().toISOString()
        bumpSessionToTop(sessionId, targetSession.updatedAt)
        persistSessionListCache()
      },
      (err, type) => {
        const targetSession = findSession(activeSessionId.value) || findSession(sessionId)
        loading.value = false
        abortController.value = null
        if (!targetSession) return

        const targetMessage = targetSession.messages.find(message => message.id === aiMsgId)
        if (!targetMessage) return

        targetMessage.status = type === 'abort' ? 'interrupted' : 'error'
        if (!targetMessage.content.trim()) {
          targetMessage.content = type === 'abort'
            ? '回答已停止。'
            : '当前回答因网络或服务异常而中断。'
        }
      },
      {
        signal: abortController.value.signal,
        sessionId: isDraftSession ? undefined : sessionId,
        onSessionCreated: (persistedSessionId) => {
          const targetSession = findSession(sessionId)
          if (!targetSession) return

          targetSession.id = persistedSessionId
          targetSession.persisted = true
          activeSessionId.value = persistedSessionId
          sortSessionsByRecent()
          persistSessionListCache()
        }
      }
    )
  }

  const stopResponse = () => {
    if (!loading.value || !abortController.value) return
    abortController.value.abort()
  }

  const initSessions = async (force = false) => {
    if (initialized.value && !force) return

    if (!auth.isLoggedIn.value) {
      sessionList.value = []
      activeSessionId.value = ''
      sessionListHasMore.value = false
      initialized.value = true
      if (process.client) {
        sessionStorage.removeItem(SESSION_CACHE_KEY)
      }
      return
    }

    if (!force && restoreSessionListCache()) {
      if (activeSessionId.value) {
        await hydrateSessionMessages(activeSessionId.value)
      }
      return
    }

    await loadSessions({ reset: true })

    if (activeSessionId.value) {
      await hydrateSessionMessages(activeSessionId.value)
    }
  }

  return {
    activeSessionId,
    sessionList,
    inputMessage,
    loading,
    currentSession,
    sessionListLoading,
    sessionListHasMore,
    loadMoreSessions,
    initSessions,
    clearChatState,
    createNewSession,
    deleteSession,
    selectSession,
    loadOlderMessages,
    sendMessage,
    stopResponse
  }
})
