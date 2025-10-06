import { useAuth } from '../contexts/AuthContext.jsx'

export const usePermission = (permissions, options) => {
  const { hasPermission } = useAuth()
  return hasPermission(permissions, options)
}

export const useAnyPermission = (permissions) => {
  const { hasAnyPermission } = useAuth()
  return hasAnyPermission(permissions)
}
