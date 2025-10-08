import { Routes, Route, BrowserRouter, Navigate } from 'react-router-dom'
import { useState, useMemo, useCallback } from 'react'
import Layout from './components/Layout.jsx'
import Login from './pages/auth/Login.jsx'
import SignUp from './pages/auth/SignUp.jsx'
import ForgotPassword from './pages/auth/ForgotPassword.jsx'
import ResetPassword from './pages/auth/ResetPassword.jsx'
import Dashboard from './pages/Dashboard.jsx'
import UserList from './pages/users/UserList.jsx'
import CreateUser from './pages/users/CreateUser.jsx'
import EditUser from './pages/users/EditUser.jsx'
import Roles from './pages/users/Roles.jsx'
import TenantSelection from './pages/tenants/TenantSelection.jsx'
import Tenants from './pages/tenants/Tenants.jsx'
import CreateTenant from './pages/tenants/CreateTenant.jsx'
import TenantSettings from './pages/tenants/TenantSettings.jsx'
import AcceptTransfer from './pages/tenants/AcceptTransfer.jsx'
import MediaLibrary from './pages/media/Media.jsx'
import Categories from './pages/categories/Categories.jsx'
import ContentList from './pages/contents/ContentList.jsx'
import ContentEditor from './pages/contents/ContentEditor.jsx'
import FormList from './pages/forms/FormList.jsx'
import FormBuilder from './pages/forms/FormBuilder.jsx'
import { PlacementsList, PlacementEdit, PlacementAnalytics } from './pages/placements/index.js'
import { MenuList, MenuEdit } from './pages/menus/index.js'
import { CollectionsList, CollectionDetail } from './pages/collections/index.js'
import { AuthContext } from './contexts/AuthContext.jsx'
import { ToastProvider } from './contexts/ToastContext.jsx'
import Documentation from './pages/docs/Documentation.jsx'
import GalleryManager from './pages/galleries/GalleryManager.jsx'
import { PermissionRoute } from './components/PermissionRoute.jsx'
import { PERMISSIONS } from './constants/permissions.js'
import Profile from './pages/profile/Profile.jsx'

const parseStoredJSON = (key, fallback) => {
  const raw = localStorage.getItem(key)
  if (!raw) return fallback
  try {
    return JSON.parse(raw)
  } catch (err) {
    console.warn(`Failed to parse stored ${key}:`, err)
    return fallback
  }
}

function App() {
  const [user, setUser] = useState(() => parseStoredJSON('user', null))
  const [token, setToken] = useState(() => localStorage.getItem('token'))
  const [memberships, setMembershipsState] = useState(() => parseStoredJSON('memberships', []))
  const [activeTenantId, setActiveTenantId] = useState(() => localStorage.getItem('tenantId'))
  const [pendingTenantSelection, setPendingTenantSelection] = useState(false)

  const updateMemberships = useCallback((list) => {
    const next = Array.isArray(list) ? list : []
    setMembershipsState(next)
    if (next.length) {
      localStorage.setItem('memberships', JSON.stringify(next))
    } else {
      localStorage.removeItem('memberships')
    }
  }, [])

  const updateUserProfile = useCallback((nextUser) => {
    if (!nextUser) {
      return
    }
    setUser(nextUser)
    localStorage.setItem('user', JSON.stringify(nextUser))
  }, [])

  const login = useCallback((authResult) => {
    if (!authResult) return

    const {
      user: userData,
      token: tokenData,
      memberships: membershipList = [],
      activeMembership,
      requiresTenantSelection = false,
    } = authResult

    if (userData) {
      setUser(userData)
      localStorage.setItem('user', JSON.stringify(userData))
    }

    updateMemberships(membershipList)

    if (tokenData) {
      setToken(tokenData)
      localStorage.setItem('token', tokenData)
      const membershipToUse =
        activeMembership ||
        membershipList.find((item) => item?.token === tokenData) ||
        membershipList[0] ||
        null

      if (membershipToUse?.tenantId) {
        setActiveTenantId(membershipToUse.tenantId)
        localStorage.setItem('tenantId', membershipToUse.tenantId)
      }

      setPendingTenantSelection(false)
    } else {
      setToken(null)
      localStorage.removeItem('token')
      setActiveTenantId(null)
      localStorage.removeItem('tenantId')
      setPendingTenantSelection(requiresTenantSelection)
    }
  }, [updateMemberships])

  const logout = useCallback(() => {
    setUser(null)
    setToken(null)
    setActiveTenantId(null)
    setPendingTenantSelection(false)
    updateMemberships([])
    localStorage.removeItem('token')
    localStorage.removeItem('tenantId')
    localStorage.removeItem('user')
    localStorage.removeItem('memberships')
  }, [updateMemberships])

  const selectTenant = useCallback((membershipInput) => {
    const membership =
      typeof membershipInput === 'string'
        ? memberships.find((item) => item.tenantId === membershipInput)
        : membershipInput

    if (!membership || !membership.tenantId) {
      return false
    }

    if (membership.token) {
      setToken(membership.token)
      localStorage.setItem('token', membership.token)
    }

    setActiveTenantId(membership.tenantId)
    localStorage.setItem('tenantId', membership.tenantId)
    setPendingTenantSelection(false)

    const nextMemberships = memberships.some((item) => item.tenantId === membership.tenantId)
      ? memberships.map((item) => (item.tenantId === membership.tenantId ? { ...item, ...membership } : item))
      : [...memberships, membership]

    updateMemberships(nextMemberships)
    return true
  }, [memberships, updateMemberships])

  const addMembership = useCallback((membership, options = {}) => {
    if (!membership || !membership.tenantId) {
      return
    }

    const filtered = memberships.filter((item) => item.tenantId !== membership.tenantId)
    updateMemberships([...filtered, membership])

    if (options.activate) {
      selectTenant(membership)
    }
  }, [memberships, updateMemberships, selectTenant])

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
    return Array.from(collected)
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
    token,
    memberships,
    activeMembership,
    activeTenantId,
    permissions: activePermissions,
    role: activeMembership?.role || null,
    roleMeta: activeMembership?.roleMeta || null,
    pendingTenantSelection,
    login,
    logout,
    selectTenant,
    addMembership,
    updateMemberships,
    updateUserProfile,
    isAuthenticated: Boolean(token),
    hasPermission,
    hasAnyPermission
  }), [
    user,
    token,
    memberships,
    activeMembership,
    activeTenantId,
    activePermissions,
    pendingTenantSelection,
    login,
    logout,
    selectTenant,
    addMembership,
    updateMemberships,
    updateUserProfile,
    hasPermission,
    hasAnyPermission
  ])

 
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthContext.Provider value={authValue}>
          {pendingTenantSelection ? (
            <Routes>
              <Route path="/select-tenant" element={<TenantSelection />} />
              <Route path="/transfer-accept" element={<AcceptTransfer />} />
              <Route path="*" element={<Navigate to="/select-tenant" replace />} />
            </Routes>
          ) : !token ? (
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<SignUp />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        ) : (
          <Routes>
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
              <Route path="/transfer-accept" element={<AcceptTransfer />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/belgeler" element={<PermissionRoute permissions={PERMISSIONS.DASHBOARD_VIEW}><Documentation /></PermissionRoute>} />
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
