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
    // 4. 循环读取分段数据
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      // 5. 解码二进制数据
      buffer += decoder.decode(value, { stream: true })
      // 6. 按 SSE 规范分割行（\n 或 \r\n）
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() || '' // 保留未完成的最后一行

      // 7. 逐行解析纯文本 SSE
      for (const line of lines) {
        const trimmedLine = line.trim()
        if (!trimmedLine) continue

        // 提取 data: 后的纯文本内容
        if (trimmedLine.startsWith('data: ')) {
          const content = trimmedLine.slice(6).trim()
          console.log('📥 原生fetch收到分段：', content) // 关键日志
          
          if (content === '[DONE]') {
            onComplete()
            return
          }
          if (content) {
            onChunk(content) // 直接传递纯文本给 Pinia
          }
        }
      }
    }

    // 8. 流式结束
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