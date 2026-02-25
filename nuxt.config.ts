// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  ssr:false,
  devtools: { enabled: true },
  srcDir: '.',
  pages: true, // 显式启用pages路由
  modules: ['@element-plus/nuxt','@pinia/nuxt'],
  imports: {
    dirs: ['stores/**','composables/**'] // 自动导入 stores 目录下的 Pinia 仓库
  },


  // 4. 跨域代理配置（替代原 Vite 代理，对接 FastAPI 后端）
  nitro: {
    devProxy: {
      '/api': {
        target: 'http://localhost:8000/api', // FastAPI 后端地址
        changeOrigin: true, // 开启跨域
        prependPath: false, // 关键：关闭自动拼接路径
        rewrite: (path) => path.replace(/^\/api/, '/api') // 确保路径是 /api/xxx
      }
    }
  },

  // 5. 运行时配置（全局环境变量）
  runtimeConfig: {
    public: {
      apiBase: '/api' // 前端请求的基础路径
    }
  },

  // 6. 构建配置（可选，解决 Element Plus 兼容问题）
  build: {
    transpile: ['element-plus']
  }
})
