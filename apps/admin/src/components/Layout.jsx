import { Fragment, useMemo, useState, useEffect, useCallback } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { Bars3Icon, XMarkIcon, UserIcon, CogIcon, BuildingOfficeIcon, PlusIcon, PhotoIcon, Squares2X2Icon, DocumentTextIcon, WrenchScrewdriverIcon, BookOpenIcon, ClipboardDocumentListIcon, SparklesIcon, Bars3BottomLeftIcon, ShieldCheckIcon, QueueListIcon, RectangleStackIcon, CodeBracketIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext.jsx'
import Footer from './Footer.jsx'
import { PERMISSIONS } from '../constants/permissions.js'
import { adminPluginNavigation } from '../plugins/registry.jsx'

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [switchingTenantId, setSwitchingTenantId] = useState(null)
  const { user, memberships, activeMembership, selectTenant, logout, hasPermission } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useTranslation()

  const navigation = useMemo(() => [
    {
      id: 'create-tenant',
      name: t('nav.create_tenant'),
      href: '/varliklar/yeni',
      icon: PlusIcon,
      // Herkes varlık oluşturabilir - permission yok
    },
    {
      id: 'dashboard',
      name: t('nav.dashboard'),
      href: '/',
      icon: CogIcon,
      permission: PERMISSIONS.DASHBOARD_VIEW
    },
    {
      id: 'users-group',
      name: t('nav.user_management'),
      icon: UserIcon,
      children: [
        {
          id: 'users',
          name: t('nav.users'),
          href: '/users',
          icon: UserIcon,
          permission: PERMISSIONS.USERS_VIEW
        },
        {
          id: 'roles',
          name: t('nav.roles'),
          href: '/roles',
          icon: ShieldCheckIcon,
          permission: PERMISSIONS.ROLES_VIEW
        }
      ]
    },
    {
      id: 'media',
      name: t('nav.media'),
      href: '/media',
      icon: PhotoIcon,
      permission: PERMISSIONS.MEDIA_VIEW
    },
    {
      id: 'galleries',
      name: t('nav.galleries'),
      href: '/galeriler',
      icon: Squares2X2Icon,
      permission: PERMISSIONS.MEDIA_VIEW
    },
    {
      id: 'categories',
      name: t('nav.categories'),
      href: '/categories',
      icon: QueueListIcon,
      permission: PERMISSIONS.CATEGORIES_VIEW
    },
    {
      id: 'contents',
      name: t('nav.contents'),
      href: '/contents',
      icon: DocumentTextIcon,
      permission: PERMISSIONS.CONTENT_VIEW
    },
    ...adminPluginNavigation,
    {
      id: 'collections',
      name: t('nav.collections'),
      href: '/collections',
      icon: RectangleStackIcon,
      permission: PERMISSIONS.COLLECTIONS_VIEW
    },
    {
      id: 'forms',
      name: t('nav.forms'),
      href: '/forms',
      icon: ClipboardDocumentListIcon,
      permission: PERMISSIONS.FORMS_VIEW
    },
    {
      id: 'placements',
      name: t('nav.placements'),
      href: '/placements',
      icon: SparklesIcon,
      permission: PERMISSIONS.PLACEMENTS_VIEW
    },
    {
      id: 'menus',
      name: t('nav.menus'),
      href: '/menus',
      icon: Bars3BottomLeftIcon,
      permission: PERMISSIONS.MENUS_VIEW
    },
    {
      id: 'tenants-group',
      name: t('nav.tenants'),
      icon: BuildingOfficeIcon,
      // Varlıklar menüsü herkes için görünür - permission yok
      children: [
        {
          id: 'tenants',
          name: t('nav.tenant_list'),
          href: '/varliklar',
          icon: BuildingOfficeIcon,
          // Varlık listesi herkes görebilir - permission yok
        },
        {
          id: 'tenant-settings',
          name: t('nav.tenant_settings'),
          href: '/varliklar/ayarlar',
          icon: WrenchScrewdriverIcon,
          permission: PERMISSIONS.TENANTS_MANAGE // Sadece ayarlar yetkili olmalı
        }
      ]
    },
    {
      id: 'docs',
      name: t('nav.documents'),
      href: '/belgeler',
      icon: BookOpenIcon,
      permission: PERMISSIONS.DASHBOARD_VIEW
    },
    {
      id: 'apidocs',
      name: t('nav.api_docs'),
      href: '/apidocs',
      icon: CodeBracketIcon,
      permission: PERMISSIONS.DASHBOARD_VIEW
    }
  ], [t])

  const filterNavigation = useCallback((items) => {
    return items
      .map((item) => {
        if (item.children) {
          const filteredChildren = filterNavigation(item.children)
          if (!filteredChildren.length) {
            return null
          }
          return { ...item, children: filteredChildren }
        }

        if (item.permission && !hasPermission(item.permission)) {
          return null
        }

        return item
      })
      .filter(Boolean)
  }, [hasPermission])

  const filteredNavigation = useMemo(() => filterNavigation(navigation), [navigation, filterNavigation])

  const isActive = useCallback((href) => {
    if (!href) return false
    if (href === '/') {
      return location.pathname === '/'
    }
    return location.pathname === href || location.pathname.startsWith(`${href}/`)
  }, [location.pathname])

  const [expandedGroups, setExpandedGroups] = useState({})

  useEffect(() => {
    const nextState = {}

    const walk = (items) => {
      items.forEach((item) => {
        if (item.children) {
          const childActive = item.children.some((child) => isActive(child.href))
          nextState[item.id] = childActive
          walk(item.children)
        }
      })
    }

    walk(filteredNavigation)
    setExpandedGroups((prev) => ({ ...prev, ...nextState }))
  }, [filteredNavigation, isActive])

  const toggleGroup = (id) => {
    setExpandedGroups((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => !prev)
  }

  const renderNavItem = (item, collapsed = sidebarCollapsed) => {
    if (item.children) {
      const expanded = expandedGroups[item.id]
      return (
        <div key={item.id} className="space-y-1">
          <button
            type="button"
            onClick={() => toggleGroup(item.id)}
            title={collapsed ? item.name : undefined}
            className={classNames(
              'group flex w-full items-center rounded-md px-2 py-2 text-sm font-semibold',
              collapsed ? 'justify-center' : 'justify-between',
              expanded ? 'bg-gray-50 text-blue-600' : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'
            )}
          >
            <span className={classNames('flex items-center', collapsed ? 'justify-center' : 'gap-x-3')}>
              {item.icon && (
                <item.icon
                  className={classNames(
                    expanded ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600',
                    'h-6 w-6 shrink-0'
                  )}
                  aria-hidden="true"
                />
              )}
              <span className={collapsed ? 'sr-only' : ''}>{item.name}</span>
            </span>
            {!collapsed && (
              <svg
                className={classNames('h-4 w-4 transform transition-transform', expanded ? 'rotate-90 text-blue-600' : 'text-gray-400')}
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path fillRule="evenodd" d="M6 4l8 6-8 6V4z" clipRule="evenodd" />
              </svg>
            )}
          </button>
          {expanded && !collapsed && (
            <div className="space-y-1 border-l border-gray-100 pl-4">
              {item.children.map((child) => renderNavItem(child, collapsed))}
            </div>
          )}
        </div>
      )
    }

    const active = isActive(item.href)

    return (
      <Link
        key={item.id || item.href}
        to={item.href}
        title={collapsed ? item.name : undefined}
        className={classNames(
          active ? 'bg-gray-50 text-blue-600' : 'text-gray-700 hover:text-blue-600 hover:bg-gray-50',
          'group flex items-center rounded-md px-2 py-2 text-sm font-semibold',
          collapsed ? 'justify-center' : 'gap-x-3'
        )}
      >
        {item.icon && (
          <item.icon
            className={classNames(
              active ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600',
              'h-6 w-6 shrink-0'
            )}
            aria-hidden="true"
          />
        )}
        <span className={collapsed ? 'sr-only' : ''}>{item.name}</span>
      </Link>
    )
  }

  function classNames(...classes) {
    return classes.filter(Boolean).join(' ')
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1">
        <Transition.Root show={sidebarOpen} as={Fragment}>
          <Dialog as="div" className="relative z-50 lg:hidden" onClose={setSidebarOpen}>
            <Transition.Child
              as={Fragment}
              enter="transition-opacity ease-linear duration-300"
              enterFrom="opacity-0"
              enterTo="opacity-100"
              leave="transition-opacity ease-linear duration-300"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <div className="fixed inset-0 bg-gray-900/80" />
            </Transition.Child>

            <div className="fixed inset-0 flex">
              <Transition.Child
                as={Fragment}
                enter="transition ease-in-out duration-300 transform"
                enterFrom="-translate-x-full"
                enterTo="translate-x-0"
                leave="transition ease-in-out duration-300 transform"
                leaveFrom="translate-x-0"
                leaveTo="-translate-x-full"
              >
                <Dialog.Panel className="relative mr-16 flex w-full max-w-xs flex-1">
                  <Transition.Child
                    as={Fragment}
                    enter="ease-in-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in-out duration-300"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                  >
                    <div className="absolute left-full top-0 flex w-16 justify-center pt-5">
                      <button type="button" className="-m-2.5 p-2.5" onClick={() => setSidebarOpen(false)}>
                        <span className="sr-only">{t('nav.close_menu')}</span>
                        <XMarkIcon className="h-6 w-6 text-white" aria-hidden="true" />
                      </button>
                    </div>
                  </Transition.Child>
                  <div className="flex grow flex-col gap-y-3 overflow-y-auto bg-white px-6 pb-2">
                    <div className="flex h-16 shrink-0 items-center">
                      <div className="flex w-full items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-blue-600">
                            <span className="text-white font-bold">C</span>
                          </div>
                          <span className="truncate text-xl font-bold text-gray-900">ContextHub</span>
                        </div>
                        <button
                          type="button"
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          onClick={() => setSidebarOpen(false)}
                          aria-label={t('nav.close_menu')}
                        >
                          <XMarkIcon className="h-5 w-5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    <nav className="flex flex-1 flex-col">
                      <ul role="list" className="flex flex-1 flex-col gap-y-7">
                        <li>
                          <ul role="list" className="-mx-2 space-y-1">
                            {filteredNavigation.map((item) => (
                              <li key={item.id || item.href}>{renderNavItem(item, false)}</li>
                            ))}
                          </ul>
                        </li>
                      </ul>
                    </nav>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </Dialog>
        </Transition.Root>

        {/* Static sidebar for desktop */}
        <div className={classNames('hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:flex-col lg:transition-[width] lg:duration-200', sidebarCollapsed ? 'lg:w-20' : 'lg:w-72')}>
          <div className={classNames('flex grow flex-col gap-y-3 overflow-y-auto border-r border-gray-200 bg-white', sidebarCollapsed ? 'px-3' : 'px-6')}>
            <div className={classNames('flex shrink-0 items-center', sidebarCollapsed ? 'h-24 justify-center' : 'h-16')}>
              <div className={classNames('flex w-full gap-3', sidebarCollapsed ? 'flex-col items-center justify-center' : 'items-center justify-between')}>
                <div className={classNames('flex min-w-0 items-center gap-3', sidebarCollapsed ? 'justify-center' : '')}>
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-blue-600">
                    <span className="text-white font-bold">C</span>
                  </div>
                  {!sidebarCollapsed && (
                    <span className="truncate text-xl font-bold text-gray-900">ContextHub</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={toggleSidebarCollapsed}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label={sidebarCollapsed ? 'Menüyü genişlet' : 'Menüyü daralt'}
                  title={sidebarCollapsed ? 'Menüyü genişlet' : 'Menüyü daralt'}
                >
                  {sidebarCollapsed ? (
                    <ChevronRightIcon className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <ChevronLeftIcon className="h-5 w-5" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>
            <nav className="flex flex-1 flex-col">
              <ul role="list" className="flex flex-1 flex-col gap-y-7">
                <li>
                  <ul role="list" className="-mx-2 space-y-1">
                    {filteredNavigation.map((item) => (
                      <li key={item.id || item.href}>{renderNavItem(item, sidebarCollapsed)}</li>
                    ))}
                  </ul>
                </li>
              </ul>
            </nav>
          </div>
        </div>

        <div className={classNames('transition-[padding] duration-200', sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-72')}>
          <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-gray-200 bg-white px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
            <button type="button" className="-m-2.5 p-2.5 text-gray-700 lg:hidden" onClick={() => setSidebarOpen(true)}>
              <span className="sr-only">{t('nav.open_menu')}</span>
              <Bars3Icon className="h-6 w-6" aria-hidden="true" />
            </button>

            <div className="h-6 w-px bg-gray-200 lg:hidden" aria-hidden="true" />

            <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
              <div className="flex flex-1 items-center">
                {memberships.length > 0 && (
                  <div className="relative">
                    <label htmlFor="tenant-select" className="sr-only">
                      Varlık seç
                    </label>
                    <select
                      id="tenant-select"
                      value={activeMembership?.tenantId || ''}
                      onChange={async (event) => {
                        const membership = memberships.find((item) => item.tenantId === event.target.value)
                        if (membership && membership.tenantId !== activeMembership?.tenantId) {
                          setSwitchingTenantId(membership.tenantId)
                          try {
                            const selected = await selectTenant(membership)
                            if (selected) {
                              // Tenant-scoped query keys are not uniformly namespaced yet.
                              // Drop the previous tenant's cache and let the dashboard fetch
                              // fresh data with the newly rotated session cookie.
                              queryClient.clear()
                              navigate('/', { replace: true })
                            }
                          } finally {
                            setSwitchingTenantId(null)
                          }
                        }
                      }}
                      disabled={Boolean(switchingTenantId)}
                      className="block w-full rounded-md border-gray-300 py-1.5 pl-3 pr-8 text-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                    >
                      {memberships.map((membership) => (
                        <option key={membership.tenantId} value={membership.tenantId}>
                          {membership.tenant?.name || 'Varlık'}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-x-4 lg:gap-x-6">
                <div className="hidden lg:block lg:h-6 lg:w-px lg:bg-gray-200" aria-hidden="true" />

                {/* Profile dropdown */  }
                <div className="flex items-center gap-x-3">
                  <Link
                    to="/profile"
                    className="flex items-center gap-x-2 text-sm font-semibold leading-6 text-gray-900 hover:text-blue-600"
                  >
                    <span className="sr-only">{t('nav.profile')}</span>
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-800">
                      <span className="text-sm font-medium text-white">
                        {user?.firstName?.charAt(0)?.toUpperCase() || 'U'}
                      </span>
                    </div>
                    <span className="hidden lg:flex lg:flex-col lg:items-start">
                      <span>{user?.firstName || 'Kullanıcı'}</span>
                      <span className="text-xs font-normal text-gray-500">{t('nav.view_profile')}</span>
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={logout}
                    className="inline-flex items-center rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Çıkış
                  </button>
                </div>
              </div>
            </div>
          </div>

          <main className="py-10 bg-gray-50 min-h-screen">
            <div className="px-4 sm:px-6 lg:px-8">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
      <Footer authenticated />
    </div>
  )
}
