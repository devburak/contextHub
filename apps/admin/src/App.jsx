import { Routes, Route, BrowserRouter, Navigate } from 'react-router-dom'
import { useState, useMemo, useCallback, useEffect } from 'react'
import Layout from './components/Layout.jsx'
import Login from './pages/auth/Login.jsx'
import SignUp from './pages/auth/SignUp.jsx'
import ForgotPassword from './pages/auth/ForgotPassword.jsx'
import ResetPassword from './pages/auth/ResetPassword.jsx'
import VerifyEmail from './pages/auth/VerifyEmail.jsx'
import AcceptInvite from './pages/auth/AcceptInvite.jsx'
import Dashboard from './pages/Dashboard.jsx'
import UserList from './pages/users/UserList.jsx'
import CreateUser from './pages/users/CreateUser.jsx'
import EditUser from './pages/users/EditUser.jsx'
import Roles from './pages/users/Roles.jsx'
import TenantSelection from './pages/tenants/TenantSelection.jsx'
import Tenants from './pages/tenants/Tenants.jsx'
import CreateTenant from './pages/tenants/CreateTenant.jsx'
import TenantSettings from './pages/tenants/TenantSettings.jsx'
import TenantWebhooks from './pages/tenants/TenantWebhooks.jsx'
import AcceptTransfer from './pages/tenants/AcceptTransfer.jsx'
import MediaLibrary from './pages/media/Media.jsx'
import Categories from './pages/categories/Categories.jsx'
import ContentList from './pages/contents/ContentList.jsx'
import ContentEditor from './pages/contents/ContentEditor.jsx'
import FormList from './pages/forms/FormList.jsx'
import FormBuilder from './pages/forms/FormBuilder.jsx'
import FormResponses from './pages/forms/FormResponses.jsx'
import { PlacementsList, PlacementEdit, PlacementAnalytics } from './pages/placements/index.js'
import { MenuList, MenuEdit } from './pages/menus/index.js'
import { CollectionsList, CollectionDetail } from './pages/collections/index.js'
import { AuthContext } from './contexts/AuthContext.jsx'
import { ToastProvider } from './contexts/ToastContext.jsx'
import Documentation from './pages/docs/Documentation.jsx'
import GalleryManager from './pages/galleries/GalleryManager.jsx'
import { PermissionRoute } from './components/PermissionRoute.jsx'
import { PERMISSIONS, expandPermissions } from './constants/permissions.js'
import Profile from './pages/profile/Profile.jsx'
import ApiDocs from './pages/ApiDocs.jsx'
import i18n from './i18n.js'
import {
  authAPI,
  setActiveTenantId as setApiActiveTenantId,
  setCsrfToken,
} from './lib/api.js'

function App() {
  const [user, setUser] = useState(null)
  const [memberships, setMembershipsState] = useState([])
  const [activeTenantId, setActiveTenantId] = useState(null)
  const [authReady, setAuthReady] = useState(false)

  // Set default language to Turkish on app mount
  useEffect(() => {
    if (!localStorage.getItem('language')) {
      localStorage.setItem('language', 'tr')
      i18n.changeLanguage('tr')
    }
  }, [])
  const [pendingTenantSelection, setPendingTenantSelection] = useState(false)

  const updateMemberships = useCallback((list) => {
    const next = Array.isArray(list) ? list : []
    setMembershipsState(next)
  }, [])

  const updateUserProfile = useCallback((nextUser) => {
    if (!nextUser) {
      return
    }
    setUser(nextUser)
  }, [])

  const clearAuthState = useCallback(() => {
    setUser(null)
    setMembershipsState([])
    setActiveTenantId(null)
    setPendingTenantSelection(false)
    setApiActiveTenantId(null)
    setCsrfToken(null)
  }, [])

  const applyAuthResult = useCallback((authResult) => {
    if (!authResult) return

    const {
      user: userData,
      memberships: membershipList = [],
      activeMembership,
      requiresTenantSelection = false,
      csrfToken,
    } = authResult

    setUser(userData || null)
    updateMemberships(membershipList)
    const nextTenantId = activeMembership?.tenantId || null
    setActiveTenantId(nextTenantId)
    setApiActiveTenantId(nextTenantId)
    setPendingTenantSelection(Boolean(requiresTenantSelection))
    if (csrfToken) {
      setCsrfToken(csrfToken)
    }
  }, [updateMemberships])

  const refreshSession = useCallback(async () => {
    const { data } = await authAPI.session()
    applyAuthResult(data)
    return data
  }, [applyAuthResult])

  useEffect(() => {
    let active = true
    authAPI.session()
      .then(({ data }) => {
        if (active) applyAuthResult(data)
      })
      .catch(() => {
        if (active) clearAuthState()
      })
      .finally(() => {
        if (active) setAuthReady(true)
      })

    const handleSessionExpired = () => {
      clearAuthState()
      setAuthReady(true)
    }
    window.addEventListener('contexthub:session-expired', handleSessionExpired)

    return () => {
      active = false
      window.removeEventListener('contexthub:session-expired', handleSessionExpired)
    }
  }, [applyAuthResult, clearAuthState])

  const login = useCallback((authResult) => {
    applyAuthResult(authResult)
    setAuthReady(true)
  }, [applyAuthResult])

  const logout = useCallback(async () => {
    try {
      await authAPI.logout()
    } catch (error) {
      console.warn('Server logout failed:', error)
    } finally {
      clearAuthState()
    }
  }, [clearAuthState])

  const logoutAll = useCallback(async () => {
    try {
      await authAPI.logoutAll()
    } finally {
      clearAuthState()
    }
  }, [clearAuthState])

  const selectTenant = useCallback(async (membershipInput) => {
    const membership =
      typeof membershipInput === 'string'
        ? memberships.find((item) => item.tenantId === membershipInput)
        : membershipInput

    if (!membership || !membership.tenantId) {
      return false
    }

    try {
      const { data } = await authAPI.switchTenant(membership.tenantId)
      applyAuthResult(data)
      return true
    } catch (error) {
      console.error('Tenant switch failed:', error)
      return false
    }
  }, [memberships, applyAuthResult])

  const addMembership = useCallback((membership, options = {}) => {
    if (!membership || !membership.tenantId) {
      return
    }

    const filtered = memberships.filter((item) => item.tenantId !== membership.tenantId)
    updateMemberships([...filtered, membership])

    if (options.activate) {
      setActiveTenantId(membership.tenantId)
      setApiActiveTenantId(membership.tenantId)
      setPendingTenantSelection(false)
    }
  }, [memberships, updateMemberships])

  const activeMembership = useMemo(
    () => memberships.find((item) => item.tenantId === activeTenantId) || null,
    [memberships, activeTenantId]
  )

  const activePermissions = useMemo(() => {
    const collected = new Set()
    if (Array.isArray(activeMembership?.roleMeta?.permissions)) {
      activeMembership.roleMeta.permissions.forEach((permission) => {
        if (permission) {
          collected.add(permission)
        }
      })
    }
    if (Array.isArray(activeMembership?.permissions)) {
      activeMembership.permissions.forEach((permission) => {
        if (permission) {
          collected.add(permission)
        }
      })
    }
    if (collected.size === 0 && activeMembership?.role === 'owner') {
      Object.values(PERMISSIONS).forEach((permission) => collected.add(permission))
    }
    return expandPermissions(Array.from(collected))
  }, [activeMembership])

  const hasPermission = useCallback((permissionsInput, options = {}) => {
    const required = Array.isArray(permissionsInput)
      ? permissionsInput.filter(Boolean)
      : [permissionsInput].filter(Boolean)

    if (!required.length) {
      return true
    }

    const mode = options.mode || 'all'
    const available = new Set(activePermissions)

    if (available.size === 0) {
      return false
    }

    if (mode === 'any') {
      return required.some((permission) => available.has(permission))
    }

    return required.every((permission) => available.has(permission))
  }, [activePermissions])

  const hasAnyPermission = useCallback((permissionsInput) => {
    return hasPermission(permissionsInput, { mode: 'any' })
  }, [hasPermission])

  const authValue = useMemo(() => ({
    user,
    memberships,
    activeMembership,
    activeTenantId,
    permissions: activePermissions,
    role: activeMembership?.role || null,
    roleMeta: activeMembership?.roleMeta || null,
    pendingTenantSelection,
    login,
    logout,
    logoutAll,
    selectTenant,
    addMembership,
    updateMemberships,
    updateUserProfile,
    refreshSession,
    authReady,
    isAuthenticated: Boolean(user),
    hasPermission,
    hasAnyPermission
  }), [
    user,
    memberships,
    activeMembership,
    activeTenantId,
    activePermissions,
    pendingTenantSelection,
    login,
    logout,
    logoutAll,
    selectTenant,
    addMembership,
    updateMemberships,
    updateUserProfile,
    refreshSession,
    authReady,
    hasPermission,
    hasAnyPermission
  ])

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-sm text-gray-600">
        Güvenli oturum yükleniyor...
      </div>
    )
  }

  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthContext.Provider value={authValue}>
          {pendingTenantSelection ? (
            <Routes>
              <Route path="/accept-invite" element={<AcceptInvite />} />
              <Route path="/select-tenant" element={<TenantSelection />} />
              <Route path="/varliklar/yeni" element={<CreateTenant />} />
              <Route path="/transfer-accept" element={<AcceptTransfer />} />
              <Route path="*" element={<Navigate to="/select-tenant" replace />} />
            </Routes>
          ) : !user ? (
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<SignUp />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/verify-email" element={<VerifyEmail />} />
              <Route path="/accept-invite" element={<AcceptInvite />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        ) : (
          <Routes>
            <Route path="/accept-invite" element={<AcceptInvite />} />
            {/* Layout wrapper with nested routes; Layout renders <Outlet /> */}
            <Route element={<Layout />}>
              <Route path="/" element={<PermissionRoute permissions={PERMISSIONS.DASHBOARD_VIEW}><Dashboard /></PermissionRoute>} />
              <Route path="/users" element={<PermissionRoute permissions={PERMISSIONS.USERS_VIEW}><UserList /></PermissionRoute>} />
              <Route path="/users/new" element={<PermissionRoute permissions={PERMISSIONS.USERS_MANAGE}><CreateUser /></PermissionRoute>} />
              <Route path="/users/:id/edit" element={<PermissionRoute permissions={PERMISSIONS.USERS_MANAGE}><EditUser /></PermissionRoute>} />
              <Route path="/roles" element={<PermissionRoute permissions={PERMISSIONS.ROLES_VIEW}><Roles /></PermissionRoute>} />
              <Route path="/media" element={<PermissionRoute permissions={PERMISSIONS.MEDIA_VIEW}><MediaLibrary /></PermissionRoute>} />
              <Route path="/galeriler" element={<PermissionRoute permissions={PERMISSIONS.MEDIA_VIEW}><GalleryManager /></PermissionRoute>} />
              <Route path="/categories" element={<PermissionRoute permissions={PERMISSIONS.CATEGORIES_VIEW}><Categories /></PermissionRoute>} />
              <Route path="/contents" element={<PermissionRoute permissions={PERMISSIONS.CONTENT_VIEW}><ContentList /></PermissionRoute>} />
              <Route path="/contents/:id" element={<PermissionRoute permissions={PERMISSIONS.CONTENT_MANAGE}><ContentEditor /></PermissionRoute>} />
              <Route path="/forms" element={<PermissionRoute permissions={PERMISSIONS.FORMS_VIEW}><FormList /></PermissionRoute>} />
              <Route path="/forms/:id" element={<PermissionRoute permissions={PERMISSIONS.FORMS_MANAGE}><FormBuilder /></PermissionRoute>} />
              <Route path="/forms/:id/responses" element={<PermissionRoute permissions={PERMISSIONS.FORMS_VIEW}><FormResponses /></PermissionRoute>} />
              <Route path="/collections" element={<PermissionRoute permissions={PERMISSIONS.COLLECTIONS_VIEW}><CollectionsList /></PermissionRoute>} />
              <Route path="/collections/:key" element={<PermissionRoute permissions={PERMISSIONS.COLLECTIONS_MANAGE}><CollectionDetail /></PermissionRoute>} />
              <Route path="/placements" element={<PermissionRoute permissions={PERMISSIONS.PLACEMENTS_VIEW}><PlacementsList /></PermissionRoute>} />
              <Route path="/placements/:id" element={<PermissionRoute permissions={PERMISSIONS.PLACEMENTS_MANAGE}><PlacementEdit /></PermissionRoute>} />
              <Route path="/placements/:id/analytics" element={<PermissionRoute permissions={[PERMISSIONS.PLACEMENTS_VIEW, PERMISSIONS.ANALYTICS_VIEW]} mode="any"><PlacementAnalytics /></PermissionRoute>} />
              <Route path="/menus" element={<PermissionRoute permissions={PERMISSIONS.MENUS_VIEW}><MenuList /></PermissionRoute>} />
              <Route path="/menus/:id" element={<PermissionRoute permissions={PERMISSIONS.MENUS_MANAGE}><MenuEdit /></PermissionRoute>} />
              <Route path="/icerikler/*" element={<Navigate to="/contents" replace />} />
              <Route path="/kategoriler/*" element={<Navigate to="/categories" replace />} />
              <Route path="/varliklar" element={<Tenants />} />
              <Route path="/varliklar/yeni" element={<CreateTenant />} />
              <Route path="/varliklar/ayarlar" element={<PermissionRoute permissions={PERMISSIONS.TENANTS_MANAGE}><TenantSettings /></PermissionRoute>} />
              <Route path="/varliklar/webhooks" element={<PermissionRoute permissions={PERMISSIONS.TENANTS_MANAGE}><TenantWebhooks /></PermissionRoute>} />
              <Route path="/transfer-accept" element={<AcceptTransfer />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/belgeler" element={<PermissionRoute permissions={PERMISSIONS.DASHBOARD_VIEW}><Documentation /></PermissionRoute>} />
              <Route path="/apidocs" element={<PermissionRoute permissions={PERMISSIONS.DASHBOARD_VIEW}><ApiDocs /></PermissionRoute>} />
            </Route>
            {/* Fallback catch-all when authenticated */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
        </AuthContext.Provider>
      </ToastProvider>
    </BrowserRouter>
  )
}

export default App
