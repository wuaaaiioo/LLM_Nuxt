// composables/useChatAPI.ts
// 放弃 axios，用原生 fetch 处理 SSE 流式（浏览器原生支持，无兼容问题）
export const sendChatStreamToBackend = async (
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  onChunk: (chunk: string) => void,
  onComplete: () => void,
  onError: (err: string) => void
) => {
  try {
    // 1. 发起流式 POST 请求（原生 fetch 支持 ReadableStream）
    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({ messages, user_id: 'nuxt_chat_user' }),
      signal: AbortSignal.timeout(60000) // 60秒超时
    })

    // 2. 检查请求是否成功
    if (!response.ok) {
      throw new Error(`请求失败：${response.status} ${response.statusText}`)
    }

    // 3. 读取流式响应（核心：原生解析 SSE）
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

      if (!dataLines.length) return

      const content = dataLines.join('\n')
      if (content === '[DONE]') {
        onComplete()
        return true
      }

      onChunk(content)
      return false
    }

    // 4. 循环读取分段数据
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      // 5. 解码二进制数据
      buffer += decoder.decode(value, { stream: true })
      // 6. 按 SSE 事件边界分段，保留换行和缩进
      const events = buffer.split(/\r?\n\r?\n/)
      buffer = events.pop() || ''

      for (const eventChunk of events) {
        const shouldStop = processSSEEvent(eventChunk)
        if (shouldStop) return
      }
    }

    // 8. 流式结束
    if (buffer) {
      processSSEEvent(buffer)
    }
    onComplete()
  } catch (err) {
    // 9. 捕获所有错误并回调
    const errorMsg = err instanceof Error ? err.message : '未知错误'
    console.error('❌ 流式请求/解析失败：', errorMsg)
    onError(errorMsg)
    onComplete()
  }
}

// 保留旧方法（备用，可删除）
export const sendChatToBackend = async () => {
  throw new Error('请使用流式接口 sendChatStreamToBackend')
}
