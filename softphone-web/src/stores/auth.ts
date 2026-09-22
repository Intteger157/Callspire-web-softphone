import { defineStore } from 'pinia'

import { computed, ref } from 'vue'

import { api, ApiError } from '@/api/client'

import type { Me } from '@/api/types'

import { appLog } from '@/logging/logCapture'

import {

  clearPublicComputerClientData,

  hasSharedBrowserCookie,

  isPublicComputerMode,

  markBrowserSession,

  setPersistentDeviceTrust,

  setPublicComputerMode,

  setSharedSessionDeviceTrust,

  shouldRejectRestoredSession,

} from '@/publicComputer'



export const useAuthStore = defineStore('auth', () => {

  const me = ref<Me | null>(null)

  const loading = ref(false)

  const error = ref<string | null>(null)

  const initialized = ref(false)

  const publicComputer = ref(false)



  const isAuthenticated = computed(() => me.value !== null)

  const extension = computed(() => me.value?.extension ?? '')

  const email = computed(() => me.value?.email ?? '')

  const mustChangePassword = computed(() => me.value?.must_change_password ?? false)



  function syncPublicComputerFromMe(user: Me | null) {

    publicComputer.value = !!(

      user?.public_computer ||

      isPublicComputerMode() ||

      hasSharedBrowserCookie()

    )

  }



  async function rejectRestoredSharedSession(reason: string): Promise<null> {

    appLog('info', '[auth]', reason)

    try {

      await api.post('auth/logout')

    } catch { /* ignore */ }

    me.value = null

    publicComputer.value = false

    clearPublicComputerClientData()

    return null

  }



  async function checkAuth(): Promise<Me | null> {

    loading.value = true

    error.value = null

    const freshBrowserSession = markBrowserSession()



    try {

      me.value = await api.get<Me>('me')

      syncPublicComputerFromMe(me.value)



      if (me.value?.public_computer && !isPublicComputerMode() && !hasSharedBrowserCookie()) {

        return rejectRestoredSharedSession('shared-computer session expired (browser reopened)')

      }



      if (freshBrowserSession && me.value && shouldRejectRestoredSession()) {

        return rejectRestoredSharedSession('session not trusted after browser restart')

      }



      if (me.value?.public_computer) {

        setPublicComputerMode(true)

        setSharedSessionDeviceTrust()

      } else if (me.value) {

        setPersistentDeviceTrust()

      }



      return me.value

    } catch (e) {

      if (e instanceof ApiError && e.status === 401) {

        me.value = null

        publicComputer.value = false

        return null

      }

      error.value = e instanceof Error ? e.message : 'Session check failed'

      me.value = null

      publicComputer.value = false

      return null

    } finally {

      initialized.value = true

      loading.value = false

    }

  }



  async function login(

    emailInput: string,

    password: string,

    options?: { publicComputer?: boolean },

  ): Promise<Me> {

    loading.value = true

    error.value = null

    const pc = !!options?.publicComputer



    if (pc) {

      setPublicComputerMode(true)

      setSharedSessionDeviceTrust()

    } else {

      setPublicComputerMode(false)

      setPersistentDeviceTrust()

    }



    try {

      const res = await api.post<{ ok: boolean; me: Me; public_computer?: boolean }>(

        'auth/login',

        {

          email: emailInput,

          password,

          public_computer: pc,

        },

      )

      me.value = {

        ...res.me,

        public_computer: !!(res.public_computer ?? pc),

      }

      publicComputer.value = !!me.value.public_computer

      initialized.value = true

      appLog('info', '[auth]', pc ? 'logged in (shared computer)' : 'logged in (persistent)')

      return me.value

    } catch (e) {

      if (pc) clearPublicComputerClientData()

      error.value = e instanceof Error ? e.message : 'Login failed'

      throw e

    } finally {

      loading.value = false

    }

  }



  async function logout(): Promise<void> {

    try {

      await api.post('auth/logout')

    } finally {

      me.value = null

      publicComputer.value = false

      clearPublicComputerClientData()

      error.value = null

    }

  }



  async function changePassword(currentPassword: string, newPassword: string): Promise<void> {

    await api.post('me/change-password', {

      current_password: currentPassword,

      new_password: newPassword,

    })

    if (me.value) {

      me.value = { ...me.value, must_change_password: false }

    }

  }



  function clearError() {

    error.value = null

  }



  return {

    me,

    loading,

    error,

    initialized,

    publicComputer,

    isAuthenticated,

    extension,

    email,

    mustChangePassword,

    checkAuth,

    login,

    logout,

    changePassword,

    clearError,

  }

})

