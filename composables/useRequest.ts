// composables/useRequest.ts
// 1. 导入必要依赖：axios 做请求，ElMessage 做提示
import axios from 'axios'
import { ElMessage } from 'element-plus'

// 2. 封装通用请求函数（所有接口都能用这个基础函数）
export const useRequest = () => {
  // 获取 Nuxt 全局环境变量（apiBase = /api，对应 nuxt.config.ts 里的配置）
  const config = useRuntimeConfig()

  // 创建 axios 实例，统一配置基础路径、超时、请求头
  const service = axios.create({
    baseURL: config.public.apiBase, // 请求基础路径：/api
    timeout: 10000, // 超时时间 10 秒
    headers: { 'Content-Type': 'application/json' } // 默认 JSON 格式
  })

  // 3. 请求拦截器：请求发送前的处理（比如加 token，这里暂时不用）
  service.interceptors.request.use(
    (req) => req, // 直接返回请求配置
    (error) => {
      ElMessage.error('请求发送失败，请稍后重试')
      return Promise.reject(error)
    }
  )

  // 4. 响应拦截器：统一处理后端返回结果
  service.interceptors.response.use(
    (res) => {
      const data = res.data
      // 如果后端返回 success=false，提示错误
      if (data.success === false) {
        ElMessage.error(data.message || '操作失败')
        return Promise.reject(data)
      }
      return data // 成功则返回后端数据
    },
    (error) => {
      ElMessage.error(error.message || '服务器错误')
      return Promise.reject(error)
    }
  )

  // 5. 封装 POST 请求（聊天接口用 POST）
  const post = (url: string, data: any) => service.post(url, data)

  return { post }
}

// 6. 封装聊天专属接口（对接 FastAPI 的 /api/chat）
export const useChatApi = () => {
  // 引入上面封装的 post 方法
  const { post } = useRequest()

  // 发送聊天消息的接口函数（参数：消息内容 + 可选用户ID）
  const sendChatMessage = (data: { message: string; user_id?: string }) => {
    // 实际请求地址：/api/chat → Nuxt 代理到后端 http://localhost:8000/api/chat
    return post('/chat', data)
  }

  // 暴露接口函数，供 Pinia 调用
  return { sendChatMessage }
}