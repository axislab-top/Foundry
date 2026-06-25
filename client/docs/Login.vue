<template>
    <div class="container" id="container">
      <div class="form-container sign-up-container">
        <form @submit.prevent="handleRegister">
          <h1>注册账户</h1>
          <div class="social-container">
          </div>
          <span>或使用您的邮箱或手机号进行注册</span>
          <input 
            type="text" 
            placeholder="用户名" 
            v-model="registerForm.form.username"
            :class="{ 'error': registerForm.errors.username }"
          />
          <span class="error-message" v-if="registerForm.errors.username">{{ registerForm.errors.username }}</span>
          <input 
            type="text" 
            placeholder="邮箱或手机号" 
            v-model="registerForm.form.account"
            :class="{ 'error': registerForm.errors.account }"
          />
          <span class="error-message" v-if="registerForm.errors.account">{{ registerForm.errors.account }}</span>
          <div style="width:60%;display:flex;align-items:center;">
            <input 
              type="text" 
              placeholder="验证码" 
              v-model="registerForm.form.smsCode"
              :class="{ 'error': registerForm.errors.smsCode }"
              style="flex:1;"
            />
            <button type="button" style="margin-left:8px;min-width:100px;" @click="onGetCodeClick">获取验证码</button>
          </div>
          <span class="error-message" v-if="registerForm.errors.smsCode">{{ registerForm.errors.smsCode }}</span>
          <input 
            type="password" 
            placeholder="密码" 
            v-model="registerForm.form.password"
            :class="{ 'error': registerForm.errors.password }"
          />
          <span class="error-message" v-if="registerForm.errors.password">{{ registerForm.errors.password }}</span>
          <input 
            type="password" 
            placeholder="确认密码" 
            v-model="registerForm.form.confirmPassword"
            :class="{ 'error': registerForm.errors.confirmPassword }"
          />
          <span class="error-message" v-if="registerForm.errors.confirmPassword">{{ registerForm.errors.confirmPassword }}</span>
          <button type="submit">注册</button>
        </form>
        <!-- 图形验证码弹窗 -->
        <el-dialog v-model="captchaDialogVisible" title="请输入图形验证码" width="300px" :close-on-click-modal="false">
          <div style="display:flex;align-items:center;">
            <el-input v-model="captchaInput" maxlength="4" placeholder="图形验证码" style="flex:1;margin-right:8px;" />
            <div v-html="captchaImg" @click="refreshCaptcha" style="cursor:pointer;width:80px;height:32px;" />
          </div>
          <span class="error-message" v-if="captchaError">{{ captchaError }}</span>
          <template #footer>
            <el-button @click="captchaDialogVisible=false">取消</el-button>
            <el-button type="primary" @click="handleCaptchaConfirm">确定</el-button>
          </template>
        </el-dialog>
      </div>
      <div class="form-container sign-in-container">
        <form @submit.prevent="handleLogin">
          <h1>登录</h1>
          <div class="social-container">
          </div>
          <span>或使用您的账户进行登录</span>
          <input 
            type="email" 
            placeholder="邮箱" 
            v-model="loginForm.form.email"
            :class="{ 'error': loginForm.errors.email }"
          />
          <span class="error-message" v-if="loginForm.errors.email">{{ loginForm.errors.email }}</span>
          <input 
            type="password" 
            placeholder="密码" 
            v-model="loginForm.form.password"
            :class="{ 'error': loginForm.errors.password }"
          />
          <span class="error-message" v-if="loginForm.errors.password">{{ loginForm.errors.password }}</span>
          <a href="#" @click="handleForgotPassword">忘记密码?</a>
          <button type="submit">登录</button>
        </form>
      </div>
      <div class="overlay-container">
        <div class="overlay">
          <div class="overlay-panel overlay-left">
            <h1>欢迎回来！</h1>
            <p>要与我们保持联系，请使用您的个人信息登录</p>
            <button class="ghost" id="signIn">登录！</button>
          </div>
          <div class="overlay-panel overlay-right">
            <h1>嘿,朋友！</h1>
            <p>点击这里输入您的个人详细信息并开始我们的旅程!</p>
            <button class="ghost" id="signUp">注册！</button>
          </div>
        </div>
      </div>
    </div>
  </template>
  
  <script>
  import { useLoginForm, useRegisterForm, useResetPasswordForm } from '@/mixins/authFormMixin'
  import { useStore } from 'vuex'
  import { useRouter } from 'vue-router'
  import { login, register, getCaptcha, sendSmsCode } from '@/services/authService'
  import { ElMessage } from 'element-plus'
  import { validateEmail, validatePhone } from '@/utils/validators/authValidators'
  import { ref, reactive } from 'vue'
  
  export default {
    name: 'Login',
    setup() {
      const store = useStore()
      const router = useRouter()
      const loginForm = useLoginForm()
      const registerForm = reactive({
        form: {
          username: '',
          account: '', // 只用一个字段，输入邮箱或手机号
          smsCode: '',
          password: '',
          confirmPassword: '',
          captchaCode: ''
        },
        errors: {
          username: '',
          account: '',
          smsCode: '',
          password: '',
          confirmPassword: ''
        },
        validateForm: () => {
          const { account, username, password, confirmPassword, smsCode } = registerForm.form
          // 清空错误
          registerForm.errors = { username: '', account: '', smsCode: '', password: '', confirmPassword: '' }
          let type = ''
          if (validateEmail(account)) type = 'email'
          else if (validatePhone(account)) type = 'phone'
          else registerForm.errors.account = '请输入正确的邮箱或手机号'
          if (!username) registerForm.errors.username = '请输入用户名'
          if (!password) registerForm.errors.password = '请输入密码'
          if (!confirmPassword) registerForm.errors.confirmPassword = '请确认密码'
          if (password && confirmPassword && password !== confirmPassword) registerForm.errors.confirmPassword = '两次输入的密码不一致'
          if (!smsCode) registerForm.errors.smsCode = '请输入验证码'
          return Object.values(registerForm.errors).every(e => !e)
        },
        clearForm: () => {
          registerForm.form.username = ''
          registerForm.form.account = ''
          registerForm.form.smsCode = ''
          registerForm.form.password = ''
          registerForm.form.confirmPassword = ''
          registerForm.form.captchaKey = ''
          Object.keys(registerForm.errors).forEach(k => registerForm.errors[k] = '')
        }
      })
      const resetPasswordForm = useResetPasswordForm()
  
      const handleLogin = async () => {
        if (loginForm.validateForm()) {
          try {
            const response = await login(loginForm.form)
            store.commit('auth/SET_USER', response.user)
            store.commit('auth/SET_TOKEN', response.token)
            ElMessage.success('登录成功')
            router.push('/')
          } catch (error) {
            // 清除之前的错误
            loginForm.errors = {
              email: '',
              password: ''
            }

            // 根据错误信息设置对应的错误提示
            if (error.message.includes('邮箱')) {
              loginForm.errors.email = error.message
            } else if (error.message.includes('密码')) {
              loginForm.errors.password = error.message
            } else {
              loginForm.errors.email = error.message
            }

            // 显示错误提示
            ElMessage.error(error.message)
            console.error('登录失败:', error)
          }
        }
      }
  
      const handleRegister = async () => {
        // 先验证表单
        if (!registerForm.validateForm()) {
          console.log('表单验证失败:', registerForm.errors)
          return
        }

        try {
          // 自动识别类型
          const account = registerForm.form.account
          let email = ''
          let phone = ''
          if (validateEmail(account)) email = account
          else if (validatePhone(account)) phone = account

          // 组装注册数据，只传后端需要的字段
          const registerData = {
            username: registerForm.form.username,
            password: registerForm.form.password,
            confirmPassword: registerForm.form.confirmPassword,
            captchaId: captchaKey.value,
            captchaCode: captchaInput.value
          }
          if (email) {
            registerData.email = email
            registerData.emailCode = registerForm.form.emailCode || ''
          } else if (phone) {
            registerData.phone = phone
            registerData.smsCode = registerForm.form.smsCode
          }
          console.log('准备发送的注册数据:', JSON.stringify(registerData, null, 2))

          const response = await register(registerData)
          store.commit('auth/SET_USER', response.user)
          store.commit('auth/SET_TOKEN', response.token)
          ElMessage.success('注册成功')
          router.push('/')
        } catch (error) {
          // 清除之前的错误
          registerForm.errors = {
            username: '',
            account: '',
            password: '',
            confirmPassword: '',
            smsCode: ''
          }

          // 根据错误信息设置对应的错误提示
          if (error.message.includes('邮箱')) {
            registerForm.errors.account = error.message
          } else if (error.message.includes('手机号')) {
            registerForm.errors.account = error.message
          } else if (error.message.includes('用户名')) {
            registerForm.errors.username = error.message
          } else if (error.message.includes('密码')) {
            registerForm.errors.password = error.message
          } else {
            registerForm.errors.account = error.message
          }

          // 显示错误提示
          ElMessage.error(error.message)
          console.error('注册失败:', error)
        }
      }
  
      const handleForgotPassword = async () => {
        if (resetPasswordForm.validateForm()) {
          try {
            // TODO: 实现重置密码功能
            console.log('重置密码功能待实现')
          } catch (error) {
            console.error('重置密码失败:', error)
          }
        }
      }
  
      // 图形验证码弹窗相关
      const captchaDialogVisible = ref(false)
      const captchaInput = ref('')
      const captchaImg = ref('')
      const captchaKey = ref('')
      const captchaError = ref('')
      const onGetCodeClick = async () => {
        // 检查账号输入
        if (!registerForm.form.account) {
          registerForm.errors.account = '请先输入邮箱或手机号'
          return
        }
        // 自动识别类型
        if (!validateEmail(registerForm.form.account) && !validatePhone(registerForm.form.account)) {
          registerForm.errors.account = '请输入正确的邮箱或手机号'
          return
        }
        // 获取图形验证码
        await refreshCaptcha()
        captchaDialogVisible.value = true
      }
      const refreshCaptcha = async () => {
        const res = await getCaptcha()
        captchaImg.value = res.data.svg
        captchaKey.value = res.data.captchaId
        captchaInput.value = ''
        captchaError.value = ''
      }
      const handleCaptchaConfirm = async () => {
        if (!captchaInput.value) {
          captchaError.value = '请输入图形验证码'
          return
        }
        try {
          const type = validateEmail(registerForm.form.account) ? 'email' : 'phone'
          await sendSmsCode({
            [type]: registerForm.form.account,
            captcha: captchaInput.value,
            captchaId: captchaKey.value
          })
          captchaDialogVisible.value = false
          ElMessage.success('验证码已发送')
        } catch (e) {
          captchaError.value = e.message || '验证码发送失败'
          await refreshCaptcha()
        }
      }
  
      return {
        loginForm,
        registerForm,
        resetPasswordForm,
        handleLogin,
        handleRegister,
        handleForgotPassword,
        captchaDialogVisible,
        captchaInput,
        captchaImg,
        captchaError,
        onGetCodeClick,
        refreshCaptcha,
        handleCaptchaConfirm
      }
    },
    mounted() {
      const signUpButton = document.getElementById('signUp')
      const signInButton = document.getElementById('signIn')
      const container = document.getElementById('container')
      
      if (signUpButton && signInButton && container) {
        signUpButton.addEventListener('click', () =>
          container.classList.add('right-panel-active')
        )
  
        signInButton.addEventListener('click', () =>
          container.classList.remove('right-panel-active')
        )
      }
    }
  }
  </script>
  
  <style scoped>
  @import url('https://fonts.googleapis.com/css?family=Montserrat:400,800');
  
  * {
      box-sizing: border-box;
  }
  
  body {
      font-family: 'Montserrat', sans-serif;
      background: #f6f5f7;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: -20px 0 50px;
          margin-top: 20px;
  }
  
  h1 {
      font-weight: bold;
      margin: 0;
  }
  
  p {
      font-size: 14px;
      font-weight: 100;
      line-height: 20px;
      letter-spacing: .5px;
      margin: 20px 0 30px;
  }
  
  span {
      font-size: 14px;
  }
  
  a {
      color: #0e263d;
      font-size: 14px;
      text-decoration: none;
      margin: 15px 0;
  }
  
  .container {
      background: #fff;
      border-radius: 10px;
      box-shadow: 0 14px 28px rgba(0, 0, 0, .2), 0 10px 10px rgba(0, 0, 0, .2);
      position: relative;
      overflow: hidden;
      width: 100vw;
      max-width: 100%;
      min-height: 100vh;
  }
  
  .form-container form {
      background: #fff;
      display: flex;
      flex-direction: column;
      padding:  0 50px;
      height: 100%;
      justify-content: center;
      align-items: center;
      text-align: center;
  }
  
  .social-container {
      margin: 30px 0;
  }
  
  .social-container a {
      border-radius: 50%;
      display: inline-flex;
      justify-content: center;
      align-items: center;
      margin: 0 12px;
      height: 40px;
      width: 40px;
  }
  
  .form-container input {
      background: #eee;
      border: none;
      padding: 12px 15px;
      margin: 8px 0;
      width: 60%;
  }
  
  button {
      border-radius: 20px;
      border: 1px solid #008ecf;
      background: #008ecf;
      color: #fff;
      font-size: 12px;
      font-weight: bold;
      padding: 12px 45px;
      letter-spacing: 1px;
      text-transform: uppercase;
      transition: transform 80ms ease-in;
      margin-top: 10px;
      cursor: pointer;
  }
  
  button:active {
      transform: scale(.95);
  }
  
  button:focus {
      outline: none;
  }
  
  button.ghost {
      background: transparent;
      border-color: #fff;
  }
  
  .form-container {
      position: absolute;
      top: 0;
      height: 100%;
      transition: all .6s ease-in-out;
  }
  
  .sign-in-container {
      left: 0;
      width: 50%;
      z-index: 2;
  }
  
  .sign-up-container {
      left: 0;
      width: 50%;
      z-index: 1;
      opacity: 0;
  }
  
  .overlay-container {
      position: absolute;
      top: 0;
      left: 50%;
      width: 50%;
      height: 100%;
      overflow: hidden;
      transition: transform .6s ease-in-out;
      z-index: 100;
  }
  
  .overlay {
      background: #ff416c;
      background: linear-gradient(to right, #008ecf, #008ecf) no-repeat 0 0 / cover;
      color: #fff;
      position: relative;
      left: -100%;
      height: 100%;
      width: 200%;
      transform: translateY(0);
      transition: transform .6s ease-in-out;
  }
  
  .overlay-panel {
      position: absolute;
      top: 0;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      padding: 0 40px;
      height: 100%;
      width: 50%;
      text-align: center;
      transform: translateY(0);
      transition: transform .6s ease-in-out;
  }
  
  .overlay-right {
      right: 0;
      transform: translateY(0);
  }
  
  .overlay-left {
      transform: translateY(-20%);
  }
  
  /* Move signin to right */
  .container.right-panel-active .sign-in-container {
      transform: translateY(100%);
  }
  
  /* Move overlay to left */
  .container.right-panel-active .overlay-container {
      transform: translateX(-100%);
  }
  
  /* Bring signup over signin */
  .container.right-panel-active .sign-up-container {
      transform: translateX(100%);
      opacity: 1;
      z-index: 5;
  }
  
  /* Move overlay back to right */
  .container.right-panel-active .overlay {
      transform: translateX(50%);
  }
  
  /* Bring back the text to center */
  .container.right-panel-active .overlay-left {
      transform: translateY(0);
  }
  
  /* Same effect for right */
  .container.right-panel-active .overlay-right {
      transform: translateY(20%);
  }
  
  .error {
    border: 1px solid #ff416c;
  }
  
  .error-message {
    color: #ff416c;
    font-size: 12px;
    margin-top: -5px;
    margin-bottom: 5px;
  }
  </style>