import createAdminPluginPages from 'virtual:ctxhub-plugins'
import { apiClient } from '../lib/api.js'
import {
  navigationFromAdminPages,
  validateAdminPluginPages
} from './adminPageRegistry.js'

const pageFactory = typeof createAdminPluginPages === 'function'
  ? createAdminPluginPages
  : () => []

export const adminPluginPages = validateAdminPluginPages(pageFactory({ apiClient }))
export const adminPluginNavigation = navigationFromAdminPages(adminPluginPages)
