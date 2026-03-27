type ChatRole = 'system' | 'user' | 'assistant'
type MessageStatus = 'streaming' | 'done' | 'error' | 'interrupted'

export type ChatMessageDTO = {
  id: string
  content: string
  role: 'user' | 'ai'
  time: string
  createdAt?: string
  status?: MessageStatus
}

export type ChatSessionDTO = {
  id: string
  title: string
  updatedAt?: string
  preview?: string
}

type SessionListResult = {
  items: ChatSessionDTO[]
  total: number
  hasMore: boolean
}

type MessageListResult = {
  items: ChatMessageDTO[]
  nextCursor: string | null
  hasMore: boolean
}

type ChatAPIError = Error & {
  code?: string
  status?: number
}

const toStringValue = (value: unknown, fallback = '') => {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return fallback
}

const resolveData = <T = any>(payload: any): T => {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return payload.data as T
  }

  return payload as T
}

const normalizeTime = (value: unknown) => {
  const raw = toStringValue(value)
  if (!raw) return ''

  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) {
    return raw
  }

  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

const normalizeRole = (value: unknown): 'user' | 'ai' => {
  return value === 'assistant' || value === 'ai' ? 'ai' : 'user'
}

const sortMessagesAscending = (messages: ChatMessageDTO[]) => {
  if (messages.length < 2) return messages

  const first = messages[0]?.createdAt ? new Date(messages[0].createdAt as string).getTime() : Number.NaN
  const last = messages[messages.length - 1]?.createdAt ? new Date(messages[messages.length - 1].createdAt as string).getTime() : Number.NaN

  if (!Number.isNaN(first) && !Number.isNaN(last) && first > last) {
    return [...messages].reverse()
  }

  return messages
}

const normalizeMessage = (item: any): ChatMessageDTO => {
  const createdAt = toStringValue(item?.createdAt || item?.created_at || item?.timestamp || '')

  return {
    id: toStringValue(item?.id || item?.messageId || item?.message_id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
    content: toStringValue(item?.content || item?.text || item?.message || ''),
    role: normalizeRole(item?.role),
    time: normalizeTime(item?.time || createdAt),
    createdAt,
    status: item?.status
  }
}

const normalizeSession = (item: any): ChatSessionDTO => ({
  id: toStringValue(item?.id || item?.sessionId || item?.session_id),
  title: toStringValue(item?.title || item?.name || '新会话'),
  updatedAt: toStringValue(item?.updatedAt || item?.updated_at || ''),
  preview: toStringValue(item?.preview || item?.lastMessage || item?.last_message || '')
})

const createChatApiError = (message: string, status?: number): ChatAPIError => {
  const error = new Error(message) as ChatAPIError
  error.status = status
  if (status === 404) {
    error.code = 'UNSUPPORTED_CHAT_HISTORY'
  }
  return error
}

export const useChatAPI = () => {
  const config = useRuntimeConfig()
  const apiBase = config.public.apiBase || '/api'
  const auth = useAuth()
  const getUserId = () => {
    const userId = auth.currentUser.value?.id
    if (!userId) {
      throw createChatApiError('请先登录后再使用对话功能', 401)
    }
    return userId
  }

  const listChatSessions = async (params?: { page?: number; pageSize?: number }) => {
    const page = params?.page || 1
    const pageSize = params?.pageSize || 20

    const { ok, result } = await auth.request<any>(`${apiBase}/chat/sessions`, {
      method: 'GET',
      requiresAuth: true,
      query: {
        user_id: getUserId(),
        page,
        page_size: pageSize
      } as any
    })

    if (!ok) {
      throw createChatApiError(result.msg || result.message || '获取会话列表失败', result.code)
    }

    const data = resolveData<any>(result)
    const items = Array.isArray(data) ? data : (data?.items || data?.list || data?.records || [])
    const total = Number(data?.total || data?.count || items.length || 0)
    const hasMore = typeof data?.hasMore === 'boolean'
      ? data.hasMore
      : typeof data?.has_more === 'boolean'
        ? data.has_more
        : page * pageSize < total

    return {
      items: items.map(normalizeSession).filter(item => item.id),
      total,
      hasMore
    } satisfies SessionListResult
  }

  const createChatSession = async (payload?: { title?: string }) => {
    const { ok, result } = await auth.request<any>(`${apiBase}/chat/sessions`, {
      method: 'POST',
      requiresAuth: true,
      body: {
        user_id: getUserId(),
        title: payload?.title || '新会话'
      }
    })

    if (!ok) {
      throw createChatApiError(result.msg || result.message || '创建会话失败', result.code)
    }

    return normalizeSession(resolveData<any>(result))
  }

  const deleteChatSession = async (sessionId: string) => {
    const { ok, result } = await auth.request<any>(`${apiBase}/chat/sessions/${sessionId}`, {
      method: 'DELETE',
      requiresAuth: true,
      query: {
        user_id: getUserId()
      } as any
    })

    if (!ok) {
      throw createChatApiError(result.msg || result.message || '删除会话失败', result.code)
    }
  }

  const getChatMessages = async (sessionId: string, params?: { cursor?: string | null; limit?: number }) => {
    const { ok, result } = await auth.request<any>(`${apiBase}/chat/sessions/${sessionId}/messages`, {
      method: 'GET',
      requiresAuth: true,
      query: {
        user_id: getUserId(),
        cursor: params?.cursor || undefined,
        limit: params?.limit || 20
      } as any
    })

    if (!ok) {
      throw createChatApiError(result.msg || result.message || '获取消息历史失败', result.code)
    }

    const data = resolveData<any>(result)
    const items = Array.isArray(data) ? data : (data?.items || data?.list || data?.messages || [])
    const nextCursor = toStringValue(data?.nextCursor || data?.next_cursor || '') || null
    const hasMore = typeof data?.hasMore === 'boolean'
      ? data.hasMore
      : typeof data?.has_more === 'boolean'
        ? data.has_more
        : !!nextCursor

    return {
      items: sortMessagesAscending(items.map(normalizeMessage)),
      nextCursor,
      hasMore
    } satisfies MessageListResult
  }

  const sendChatStreamToBackend = async (
    messages: Array<{ role: ChatRole; content: string }>,
    onChunk: (chunk: string) => void,
    onComplete: () => void,
    onError: (err: string, type?: 'abort' | 'error' | 'timeout') => void,
    options?: {
      signal?: AbortSignal
      sessionId?: string
      onSessionCreated?: (sessionId: string) => void
    }
  ) => {
    try {
      const response = await auth.authFetch(`${apiBase}/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify({
          messages,
          session_id: options?.sessionId,
          user_id: getUserId()
        }),
        signal: options?.signal || AbortSignal.timeout(60000)
      })

      if (!response.ok) {
        throw new Error(`请求失败：${response.status} ${response.statusText}`)
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder('utf-8')

      if (!reader) {
        throw new Error('无法获取流式响应阅读器')
      }

      let buffer = ''

      const processSSEEvent = (eventChunk: string) => {
        const lines = eventChunk.split(/\r?\n/)
        const dataLines: string[] = []

        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          let value = line.slice(5)
          if (value.startsWith(' ')) {
            value = value.slice(1)
          }
          dataLines.push(value)
        }

        if (!dataLines.length) return false

        const content = dataLines.join('\n')
        if (content === '[DONE]') {
          onComplete()
          return true
        }

        try {
          const payload = JSON.parse(content)
          if (payload?.type === 'session_created' && payload?.session_id) {
            options?.onSessionCreated?.(toStringValue(payload.session_id))
            return false
          }
        } catch {}

        onChunk(content)
        return false
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split(/\r?\n\r?\n/)
        buffer = events.pop() || ''

        for (const eventChunk of events) {
          const shouldStop = processSSEEvent(eventChunk)
          if (shouldStop) return
        }
      }

      if (buffer) {
        processSSEEvent(buffer)
      }

      onComplete()
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        onError('回答已被手动中断。', 'abort')
        onComplete()
        return
      }

      if (err instanceof DOMException && err.name === 'TimeoutError') {
        onError('请求超时，请稍后重试。', 'timeout')
        onComplete()
        return
      }

      const errorMsg = err instanceof Error ? err.message : '未知错误'
      console.error('chat stream error:', errorMsg)
      onError(errorMsg, 'error')
      onComplete()
    }
  }

  return {
    listChatSessions,
    createChatSession,
    deleteChatSession,
    getChatMessages,
    sendChatStreamToBackend
  }
}
