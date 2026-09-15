import createAdminPluginPages from 'virtual:ctxhub-plugins'
import { apiClient } from '../lib/api.js'
import {
  navigationFromAdminPages,
  tenantTabsFromAdminPages,
  validateAdminPluginContributions
} from './adminPageRegistry.js'

const pageFactory = typeof createAdminPluginPages === 'function'
  ? createAdminPluginPages
  : () => []

export const adminPluginContributions = validateAdminPluginContributions(pageFactory({ apiClient }))
export const adminPluginPages = adminPluginContributions.pages
export const adminPluginNavigation = navigationFromAdminPages(adminPluginPages)
export const adminPluginTenantTabs = tenantTabsFromAdminPages(adminPluginPages)
export const adminPluginContentSearch = adminPluginContributions.contentSearch
export const adminPluginContentEditorPanels = adminPluginContributions.contentEditorPanels
