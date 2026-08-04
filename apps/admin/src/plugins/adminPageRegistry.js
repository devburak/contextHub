const CORE_PAGE_IDS = new Set([
  'dashboard', 'users', 'users.new', 'users.edit', 'roles', 'media', 'galleries',
  'categories', 'contents', 'contents.edit', 'forms', 'forms.edit', 'forms.responses',
  'collections', 'collections.detail', 'placements', 'placements.edit',
  'placements.analytics', 'menus', 'menus.edit', 'tenants', 'tenants.new',
  'tenant.settings', 'tenant.webhooks', 'profile', 'docs', 'api-docs'
])

const CORE_PATHS = new Set([
  '/', '/users', '/users/new', '/users/:id/edit', '/roles', '/media', '/galeriler',
  '/categories', '/contents', '/contents/:id', '/forms', '/forms/:id',
  '/forms/:id/responses', '/collections', '/collections/:key', '/placements',
  '/placements/:id', '/placements/:id/analytics', '/menus', '/menus/:id',
  '/varliklar', '/varliklar/yeni', '/varliklar/ayarlar', '/varliklar/webhooks',
  '/profile', '/belgeler', '/apidocs'
])

const CORE_MENU_IDS = new Set([
  'create-tenant', 'dashboard', 'users-group', 'users', 'roles', 'media', 'galleries',
  'categories', 'contents', 'collections', 'forms', 'placements', 'menus',
  'tenants-group', 'tenants', 'tenant-settings', 'docs', 'apidocs'
])

function requiredString(value, label) {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

export function validateAdminPluginPages(value) {
  if (!Array.isArray(value)) throw new Error('admin plugin page factory must return an array')

  const ids = new Set(CORE_PAGE_IDS)
  const paths = new Set(CORE_PATHS)
  const menuIds = new Set(CORE_MENU_IDS)
  return Object.freeze(value.map((page) => {
    const id = requiredString(page?.id, 'admin page id')
    const path = requiredString(page?.path, `admin page ${id} path`)
    if (!path.startsWith('/')) throw new Error(`admin page path must start with /: ${path}`)
    if (!page.element) throw new Error(`admin page element is required: ${id}`)
    if (ids.has(id)) throw new Error(`admin page id collision: ${id}`)
    if (paths.has(path)) throw new Error(`admin page path collision: ${path}`)
    ids.add(id)
    paths.add(path)

    let menu = null
    if (page.menu) {
      const menuId = requiredString(page.menu.id || id, `admin page ${id} menu id`)
      if (menuIds.has(menuId)) throw new Error(`admin menu id collision: ${menuId}`)
      menuIds.add(menuId)
      menu = Object.freeze({
        id: menuId,
        name: requiredString(page.menu.name, `admin page ${id} menu name`),
        icon: page.menu.icon || null,
        order: Number.isFinite(page.menu.order) ? page.menu.order : 100
      })
    }

    return Object.freeze({
      id,
      path,
      element: page.element,
      permission: page.permission || null,
      feature: page.feature || null,
      menu
    })
  }))
}

export function navigationFromAdminPages(pages) {
  return Object.freeze(pages
    .filter((page) => page.menu)
    .sort((left, right) => left.menu.order - right.menu.order)
    .map((page) => Object.freeze({
      id: page.menu.id,
      name: page.menu.name,
      href: page.path,
      icon: page.menu.icon,
      permission: page.permission,
      feature: page.feature
    })))
}
