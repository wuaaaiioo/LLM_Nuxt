import { computed } from 'vue'

type AuthUser = {
  id: string
  username: string
  name: string
}

type ApiResult<T = any> = {
  code?: number
  msg?: string
  message?: string
  data?: T
}

type LoginPayload = {
  accessToken?: string
  access_token?: string
  token?: string
  refreshToken?: string
  refresh_token?: string
  user?: {
    id: string | number
    username: string
    name: string
  }
}

type RequestResult<T = any> = {
  ok: boolean
  status: number
  result: ApiResult<T>
  raw?: any
}

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: any
  query?: Record<string, any>
  requiresAuth?: boolean
  retryOn401?: boolean
}

const CURRENT_USER_KEY = 'nuxt_llm_current_user'
const ACCESS_TOKEN_KEY = 'nuxt_llm_access_token'

const readStorageValue = (key: string) => {
  if (!process.client) return ''
  return sessionStorage.getItem(key) || ''
}

const writeStorageValue = (key: string, value: string) => {
  if (!process.client) return
  if (!value) {
    sessionStorage.removeItem(key)
    return
  }
  sessionStorage.setItem(key, value)
}

const readCurrentUser = (): AuthUser | null => {
  if (!process.client) return null
  const raw = localStorage.getItem(CURRENT_USER_KEY)
  if (!raw) return null

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const writeCurrentUser = (user: AuthUser | null) => {
  if (!process.client) return
  if (!user) {
    localStorage.removeItem(CURRENT_USER_KEY)
    return
  }
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user))
}

const normalizeResult = <T = any>(payload: any, fallbackStatus = 200): ApiResult<T> => {
  if (payload && typeof payload === 'object' && ('data' in payload || 'code' in payload || 'msg' in payload || 'message' in payload)) {
    return payload as ApiResult<T>
  }

  return {
    code: fallbackStatus,
    msg: fallbackStatus >= 400 ? '请求失败' : '请求成功',
    data: payload as T
  }
}

const extractTokens = (payload: any) => {
  const source = payload?.data || payload

  return {
    accessToken: String(source?.accessToken || source?.access_token || source?.token || ''),
    refreshToken: String(source?.refreshToken || source?.refresh_token || '')
  }
}

const extractUser = (payload: any): AuthUser | null => {
  const source = payload?.data || payload
  const user = source?.user

  if (!user?.id || !user?.username || !user?.name) {
    return null
  }

  return {
    id: String(user.id),
    username: String(user.username),
    name: String(user.name)
  }
}

const createHeaders = (headers?: HeadersInit, accessToken?: string) => {
  const nextHeaders = new Headers(headers)

  if (!nextHeaders.has('Content-Type')) {
    nextHeaders.set('Content-Type', 'application/json')
  }

  if (accessToken) {
    nextHeaders.set('Authorization', `Bearer ${accessToken}`)
  }

  return nextHeaders
}

export const useAuth = () => {
  const config = useRuntimeConfig()
  const authBase = config.public.authApiBase || '/auth-api'
  const currentUser = useState<AuthUser | null>('auth_current_user', () => null)
  const accessToken = useState<string>('auth_access_token', () => '')
  const authInitialized = useState<boolean>('auth_initialized', () => false)
  const refreshPromise = useState<Promise<boolean> | null>('auth_refresh_promise', () => null)

  const persistTokens = (tokens: { accessToken?: string }) => {
    if (typeof tokens.accessToken === 'string') {
      accessToken.value = tokens.accessToken
      writeStorageValue(ACCESS_TOKEN_KEY, tokens.accessToken)
    }
  }

  const persistUser = (user: AuthUser | null) => {
    currentUser.value = user
    writeCurrentUser(user)
  }

  const initAuth = () => {
    if (!process.client || authInitialized.value) return

    currentUser.value = readCurrentUser()
    accessToken.value = readStorageValue(ACCESS_TOKEN_KEY)
    authInitialized.value = true
  }

  const clearAuthState = () => {
    persistUser(null)
    persistTokens({ accessToken: '' })
  }

  const request = async <T = any>(
    url: string,
    options?: RequestOptions
  ): Promise<RequestResult<T>> => {
    initAuth()

    const requiresAuth = options?.requiresAuth ?? false
    const retryOn401 = options?.retryOn401 ?? requiresAuth

    const execute = async () => {
      try {
        const result = await $fetch<any>(url, {
          method: options?.method,
          body: options?.body,
          query: options?.query,
          headers: createHeaders(options?.headers, requiresAuth ? accessToken.value : ''),
          timeout: 10000,
          credentials: 'include'
        })

        return {
          ok: true,
          status: 200,
          result: normalizeResult<T>(result)
        }
      } catch (error: any) {
        const status = Number(error?.statusCode || error?.status || error?.response?.status || 500)
        const message = String(error?.message || '')
        const isTimeout =
          error?.name === 'AbortError' ||
          error?.name === 'TimeoutError' ||
          message.toLowerCase().includes('timeout')

        return {
          ok: false,
          status,
          result: normalizeResult<T>(
            error?.data || {
              code: status,
              msg: isTimeout ? '请求超时，请检查后端服务是否启动' : (message || '请求失败')
            },
            status
          ),
          raw: error
        }
      }
    }

    let response = await execute()

    if (response.status === 401 && retryOn401 && requiresAuth) {
      const refreshed = await refreshAccessToken()
      if (refreshed) {
        response = await execute()
      } else {
        clearAuthState()
      }
    }

    return response
  }

  const refreshAccessToken = async () => {
    initAuth()

    if (refreshPromise.value) {
      return refreshPromise.value
    }

    refreshPromise.value = (async () => {
      const { ok, result } = await request<LoginPayload>(`${authBase}/api/auth/refresh`, {
        method: 'POST',
        retryOn401: false
      })

      if (!ok) {
        clearAuthState()
        return false
      }

      const tokens = extractTokens(result)
      const nextAccessToken = tokens.accessToken || accessToken.value

      if (!nextAccessToken) {
        clearAuthState()
        return false
      }

      persistTokens({
        accessToken: nextAccessToken
      })

      const nextUser = extractUser(result)
      if (nextUser) {
        persistUser(nextUser)
      }

      return true
    })()

    try {
      return await refreshPromise.value
    } finally {
      refreshPromise.value = null
    }
  }

  const authFetch = async (input: string, init?: RequestInit, retry = true): Promise<Response> => {
    initAuth()

    const response = await fetch(input, {
      ...init,
      headers: createHeaders(init?.headers, accessToken.value),
      credentials: 'include'
    })

    if (response.status === 401 && retry) {
      const refreshed = await refreshAccessToken()
      if (refreshed) {
        return authFetch(input, init, false)
      }

      clearAuthState()
    }

    return response
  }

  const hasUsername = async (username: string) => {
    const input = username.trim()
    if (!input) return false

    const { ok, result } = await request<{ exists?: boolean; available?: boolean }>(
      `${authBase}/api/auth/check-username?username=${encodeURIComponent(input)}`
    )

    if (!ok) {
      return false
    }

    const data = result.data || {}
    if (typeof data.exists === 'boolean') {
      return data.exists
    }

    if (typeof data.available === 'boolean') {
      return !data.available
    }

    return false
  }

  const register = async (payload: { username: string; password: string; name: string }) => {
    const username = payload.username.trim()
    const password = payload.password.trim()
    const name = payload.name.trim()

    if (!username || !password || !name) {
      return { ok: false, message: '请完整填写账号、密码和名称' }
    }

    if (await hasUsername(username)) {
      return { ok: false, message: '账号已存在，请更换账号' }
    }

    const { ok, result } = await request(`${authBase}/api/auth/register`, {
      method: 'POST',
      body: { username, password, name }
    })

    if (!ok) {
      return { ok: false, message: result.msg || result.message || '注册失败' }
    }

    return { ok: true, message: result.msg || result.message || '注册成功' }
  }

  const login = async (payload: { username: string; password: string }) => {
    const username = payload.username.trim()
    const password = payload.password.trim()

    if (!username || !password) {
      return { ok: false, message: '请输入账号和密码', code: 400 }
    }

    const { ok, status, result } = await request<LoginPayload>(`${authBase}/api/auth/login`, {
      method: 'POST',
      body: { username, password }
    })

    const user = extractUser(result)
    const tokens = extractTokens(result)

    if (!ok || !tokens.accessToken || !user) {
      return {
        ok: false,
        message: result.msg || result.message || '登录失败',
        code: result.code || status || 500
      }
    }

    persistTokens(tokens)
    persistUser(user)

    return {
      ok: true,
      message: result.msg || result.message || '登录成功',
      code: 200
    }
  }

  const logout = () => {
    request(`${authBase}/api/auth/logout`, {
      method: 'POST',
      retryOn401: false
    }).catch(() => undefined)
    clearAuthState()
  }

  const isLoggedIn = computed(() => !!currentUser.value)

  return {
    currentUser,
    accessToken,
    isLoggedIn,
    initAuth,
    request,
    authFetch,
    refreshAccessToken,
    hasUsername,
    register,
    login,
    logout
  }
}
