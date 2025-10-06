import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'

export function PermissionRoute({ children, permissions = undefined, mode = 'all', fallback = '/' }) {
  const { hasPermission, isAuthenticated } = useAuth()

  if (!Array.isArray(permissions) && !permissions) {
    return children
  }

  const authorized = hasPermission(permissions, { mode })

  if (authorized) {
    return children
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <Navigate to={fallback} replace />
}
