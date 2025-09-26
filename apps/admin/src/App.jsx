import { Routes, Route, BrowserRouter, Navigate } from 'react-router-dom'
import { useState, useMemo, useCallback } from 'react'
import Layout from './components/Layout.jsx'
import Login from './pages/auth/Login.jsx'
import SignUp from './pages/auth/SignUp.jsx'
import ForgotPassword from './pages/auth/ForgotPassword.jsx'
import Dashboard from './pages/Dashboard.jsx'
import UserList from './pages/users/UserList.jsx'
import CreateUser from './pages/users/CreateUser.jsx'
import EditUser from './pages/users/EditUser.jsx'
import TenantSelection from './pages/tenants/TenantSelection.jsx'
import Tenants from './pages/tenants/Tenants.jsx'
import CreateTenant from './pages/tenants/CreateTenant.jsx'
import TenantSettings from './pages/tenants/TenantSettings.jsx'
import MediaLibrary from './pages/media/Media.jsx'
import Categories from './pages/categories/Categories.jsx'
import ContentList from './pages/contents/ContentList.jsx'
import ContentEditor from './pages/contents/ContentEditor.jsx'
import { AuthContext } from './contexts/AuthContext.jsx'

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

  const authValue = useMemo(() => ({
    user,
    token,
    memberships,
    activeMembership,
    activeTenantId,
    pendingTenantSelection,
    login,
    logout,
    selectTenant,
    addMembership,
    updateMemberships,
    isAuthenticated: Boolean(token)
  }), [
    user,
    token,
    memberships,
    activeMembership,
    activeTenantId,
    pendingTenantSelection,
    login,
    logout,
    selectTenant,
    addMembership,
    updateMemberships
  ])

 
  return (
    <BrowserRouter>
      <AuthContext.Provider value={authValue}>
        {pendingTenantSelection ? (
          <Routes>
            <Route path="/select-tenant" element={<TenantSelection />} />
            <Route path="*" element={<Navigate to="/select-tenant" replace />} />
          </Routes>
        ) : !token ? (
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        ) : (
          <Routes>
            {/* Layout wrapper with nested routes; Layout renders <Outlet /> */}
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/users" element={<UserList />} />
              <Route path="/users/new" element={<CreateUser />} />
              <Route path="/users/:id/edit" element={<EditUser />} />
              <Route path="/media" element={<MediaLibrary />} />
              <Route path="/categories" element={<Categories />} />
              <Route path="/contents" element={<ContentList />} />
              <Route path="/contents/:id" element={<ContentEditor />} />
              <Route path="/icerikler/*" element={<Navigate to="/contents" replace />} />
              <Route path="/kategoriler/*" element={<Navigate to="/categories" replace />} />
              <Route path="/varliklar" element={<Tenants />} />
              <Route path="/varliklar/yeni" element={<CreateTenant />} />
              <Route path="/varliklar/ayarlar" element={<TenantSettings />} />
            </Route>
            {/* Fallback catch-all when authenticated */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </AuthContext.Provider>
    </BrowserRouter>
  )
}

export default App
