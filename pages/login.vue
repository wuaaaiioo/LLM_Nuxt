<template>
  <div class="auth-page auth-page--login">
    <div class="auth-background" />

    <el-card class="auth-card">
      <template #header>
        <div class="auth-card__header">
          <h1>欢迎登录</h1>
          <p>登录后继续你的 AI 对话</p>
        </div>
      </template>

      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
        <el-form-item label="账号" prop="username">
          <el-input v-model="form.username" placeholder="请输入账号" clearable />
        </el-form-item>

        <el-form-item label="密码" prop="password">
          <el-input
            v-model="form.password"
            placeholder="请输入密码"
            type="password"
            show-password
            clearable
            @keyup.enter="handleLogin"
          />
        </el-form-item>

        <el-button type="primary" class="auth-submit" :loading="submitting" @click="handleLogin">
          登录
        </el-button>
      </el-form>

      <div class="auth-footer">
        还没有账号？
        <NuxtLink to="/register">去注册</NuxtLink>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'

const auth = useAuth()
const router = useRouter()

const formRef = ref<FormInstance>()
const submitting = ref(false)

const form = reactive({
  username: '',
  password: ''
})

const rules: FormRules<typeof form> = {
  username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

onMounted(() => {
  auth.initAuth()
  if (auth.isLoggedIn.value) {
    router.replace('/')
  }
})

const handleLogin = async () => {
  if (!formRef.value) return

  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  const result = await auth.login({ username: form.username, password: form.password })
  submitting.value = false

  if (!result.ok) {
    if (result.code === 403) {
      await ElMessageBox.alert('账号存在非法行为被禁用', '登录受限', {
        confirmButtonText: '我知道了',
        type: 'warning'
      })
      return
    }
    ElMessage.error(result.message)
    return
  }

  ElMessage.success(result.message)
  router.push('/')
}
</script>

<style scoped>
.auth-page {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 24px;
  position: relative;
  overflow: hidden;
}

.auth-page--login {
  background: linear-gradient(130deg, #0b1324 0%, #14274a 42%, #1d4ed8 100%);
}

.auth-background {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(circle at 80% 10%, rgba(186, 230, 253, 0.25), transparent 42%),
    radial-gradient(circle at 10% 90%, rgba(191, 219, 254, 0.18), transparent 40%);
  pointer-events: none;
}

.auth-card {
  width: min(460px, 100%);
  border-radius: 18px;
  position: relative;
  z-index: 1;
}

.auth-card__header h1 {
  margin: 0;
  font-size: 28px;
  color: #0f172a;
}

.auth-card__header p {
  margin: 8px 0 0;
  color: #64748b;
}

.auth-submit {
  width: 100%;
  margin-top: 8px;
  height: 42px;
}

.auth-footer {
  margin-top: 16px;
  text-align: center;
  color: #64748b;
}

.auth-footer a {
  color: #2563eb;
  text-decoration: none;
}

@media (max-width: 768px) {
  .auth-page {
    padding: 18px;
  }

  .auth-card__header h1 {
    font-size: 24px;
  }
}
</style>
