<template>
  <div class="auth-page auth-page--register">
    <div class="auth-background" />

    <el-card class="auth-card">
      <template #header>
        <div class="auth-card__header">
          <h1>创建账号</h1>
          <p>填写信息，快速开始你的 AI 聊天</p>
        </div>
      </template>

      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
        <el-form-item label="账号" prop="username">
          <el-input v-model="form.username" placeholder="请输入账号" clearable @blur="checkUsername" />
        </el-form-item>

        <el-form-item label="密码" prop="password">
          <el-input
            v-model="form.password"
            placeholder="请输入密码（至少6位）"
            type="password"
            show-password
            clearable
          />
        </el-form-item>

        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入你的名称" clearable @keyup.enter="handleRegister" />
        </el-form-item>

        <el-button type="primary" class="auth-submit" :loading="submitting" @click="handleRegister">
          注册
        </el-button>
      </el-form>

      <div class="auth-footer">
        已有账号？
        <NuxtLink to="/login">去登录</NuxtLink>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'

const auth = useAuth()
const router = useRouter()

const formRef = ref<FormInstance>()
const submitting = ref(false)

const form = reactive({
  username: '',
  password: '',
  name: ''
})

const rules: FormRules<typeof form> = {
  username: [
    { required: true, message: '请输入账号', trigger: 'blur' },
    { min: 3, message: '账号至少 3 位', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码至少 6 位', trigger: 'blur' }
  ],
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }]
}

onMounted(() => {
  auth.initAuth()
  if (auth.isLoggedIn.value) {
    router.replace('/')
  }
})

const checkUsername = async () => {
  if (!form.username.trim()) return
  if (await auth.hasUsername(form.username)) {
    ElMessage.warning('账号已存在，请更换账号')
  }
}

const handleRegister = async () => {
  if (!formRef.value) return

  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  const result = await auth.register({
    username: form.username,
    password: form.password,
    name: form.name
  })
  submitting.value = false

  if (!result.ok) {
    ElMessage.error(result.message)
    return
  }

  ElMessage.success('注册成功，请登录')
  router.push('/login')
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

.auth-page--register {
  background: linear-gradient(140deg, #082f49 0%, #0f766e 44%, #14b8a6 100%);
}

.auth-background {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(circle at 85% 8%, rgba(167, 243, 208, 0.24), transparent 42%),
    radial-gradient(circle at 16% 88%, rgba(125, 211, 252, 0.2), transparent 45%);
  pointer-events: none;
}

.auth-card {
  width: min(500px, 100%);
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
  color: #0f766e;
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
