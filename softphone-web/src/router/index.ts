import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import LoginView from '@/views/LoginView.vue'
import { useAuthStore } from '@/stores/auth'
import { applySavedTheme, applySystemTheme } from '@/theme'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/home' },
    { path: '/login', name: 'login', component: LoginView, meta: { guestOnly: true } },
    { path: '/home', name: 'home', component: HomeView, meta: { requiresAuth: true } },
    { path: '/:pathMatch(.*)*', redirect: '/home' },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  // Restore session from the httpOnly cookie once per app load.
  if (!auth.initialized) {
    await auth.checkAuth()
  }

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  // Authenticated users shouldn't see the login form.
  if (to.meta.guestOnly && auth.isAuthenticated) {
    return { name: 'home' }
  }

  if (to.name === 'login') applySystemTheme()
  else applySavedTheme()

  return true
})

export default router
