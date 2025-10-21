import { Fragment, useMemo, useState, useEffect, useCallback } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { Bars3Icon, XMarkIcon, UserIcon, CogIcon, BuildingOfficeIcon, PlusIcon, PhotoIcon, Squares2X2Icon, DocumentTextIcon, WrenchScrewdriverIcon, BookOpenIcon, ClipboardDocumentListIcon, SparklesIcon, Bars3BottomLeftIcon, ShieldCheckIcon, QueueListIcon, RectangleStackIcon, CodeBracketIcon } from '@heroicons/react/24/outline'
import { Link, useLocation, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import Footer from './Footer.jsx'
import { PERMISSIONS } from '../constants/permissions.js'

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user, memberships, activeMembership, selectTenant, logout, hasPermission } = useAuth()
  const location = useLocation()

  const navigation = useMemo(() => [
    {
      id: 'create-tenant',
      name: 'Yeni Varlık Oluştur',
      href: '/varliklar/yeni',
      icon: PlusIcon,
      // Herkes varlık oluşturabilir - permission yok
    },
    {
      id: 'dashboard',
      name: 'Kontrol Paneli',
      href: '/',
      icon: CogIcon,
      permission: PERMISSIONS.DASHBOARD_VIEW
    },
    {
      id: 'users-group',
      name: 'Kullanıcı Yönetimi',
      icon: UserIcon,
      children: [
        {
          id: 'users',
          name: 'Kullanıcılar',
          href: '/users',
          icon: UserIcon,
          permission: PERMISSIONS.USERS_VIEW
        },
        {
          id: 'roles',
          name: 'Roller',
          href: '/roles',
          icon: ShieldCheckIcon,
          permission: PERMISSIONS.ROLES_VIEW
        }
      ]
    },
    {
      id: 'media',
      name: 'Medya',
      href: '/media',
      icon: PhotoIcon,
      permission: PERMISSIONS.MEDIA_VIEW
    },
    {
      id: 'galleries',
      name: 'Galeriler',
      href: '/galeriler',
      icon: Squares2X2Icon,
      permission: PERMISSIONS.MEDIA_VIEW
    },
    {
      id: 'categories',
      name: 'Kategoriler',
      href: '/categories',
      icon: QueueListIcon,
      permission: PERMISSIONS.CATEGORIES_VIEW
    },
    {
      id: 'contents',
      name: 'İçerikler',
      href: '/contents',
      icon: DocumentTextIcon,
      permission: PERMISSIONS.CONTENT_VIEW
    },
    {
      id: 'collections',
      name: 'Koleksiyonlar',
      href: '/collections',
      icon: RectangleStackIcon,
      permission: PERMISSIONS.COLLECTIONS_VIEW
    },
    {
      id: 'forms',
      name: 'Formlar',
      href: '/forms',
      icon: ClipboardDocumentListIcon,
      permission: PERMISSIONS.FORMS_VIEW
    },
    {
      id: 'placements',
      name: 'Yerleşimler',
      href: '/placements',
      icon: SparklesIcon,
      permission: PERMISSIONS.PLACEMENTS_VIEW
    },
    {
      id: 'menus',
      name: 'Menüler',
      href: '/menus',
      icon: Bars3BottomLeftIcon,
      permission: PERMISSIONS.MENUS_VIEW
    },
    {
      id: 'tenants-group',
      name: 'Varlıklar',
      icon: BuildingOfficeIcon,
      // Varlıklar menüsü herkes için görünür - permission yok
      children: [
        {
          id: 'tenants',
          name: 'Varlık Listesi',
          href: '/varliklar',
          icon: BuildingOfficeIcon,
          // Varlık listesi herkes görebilir - permission yok
        },
        {
          id: 'tenant-settings',
          name: 'Varlık Ayarları',
          href: '/varliklar/ayarlar',
          icon: WrenchScrewdriverIcon,
          permission: PERMISSIONS.TENANTS_MANAGE // Sadece ayarlar yetkili olmalı
        }
      ]
    },
    {
      id: 'docs',
      name: 'Belgeler',
      href: '/belgeler',
      icon: BookOpenIcon,
      permission: PERMISSIONS.DASHBOARD_VIEW
    },
    {
      id: 'apidocs',
      name: 'API Dokümantasyonu',
      href: '/apidocs',
      icon: CodeBracketIcon,
      permission: PERMISSIONS.DASHBOARD_VIEW
    }
  ], [])

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

  const renderNavItem = (item) => {
    if (item.children) {
      const expanded = expandedGroups[item.id]
      return (
        <div key={item.id} className="space-y-1">
          <button
            type="button"
            onClick={() => toggleGroup(item.id)}
            className={classNames(
              'group flex w-full items-center justify-between rounded-md px-2 py-2 text-sm font-semibold',
              expanded ? 'bg-gray-50 text-blue-600' : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'
            )}
          >
            <span className="flex items-center gap-x-3">
              {item.icon && (
                <item.icon
                  className={classNames(
                    expanded ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600',
                    'h-6 w-6 shrink-0'
                  )}
                  aria-hidden="true"
                />
              )}
              {item.name}
            </span>
            <svg
              className={classNames('h-4 w-4 transform transition-transform', expanded ? 'rotate-90 text-blue-600' : 'text-gray-400')}
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path fillRule="evenodd" d="M6 4l8 6-8 6V4z" clipRule="evenodd" />
            </svg>
          </button>
          {expanded && (
            <div className="space-y-1 border-l border-gray-100 pl-4">
              {item.children.map((child) => renderNavItem(child))}
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
        className={classNames(
          active ? 'bg-gray-50 text-blue-600' : 'text-gray-700 hover:text-blue-600 hover:bg-gray-50',
          'group flex items-center gap-x-3 rounded-md px-2 py-2 text-sm font-semibold'
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
        {item.name}
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
                        <span className="sr-only">Close sidebar</span>
                        <XMarkIcon className="h-6 w-6 text-white" aria-hidden="true" />
                      </button>
                    </div>
                  </Transition.Child>
                  <div className="flex grow flex-col gap-y-3 overflow-y-auto bg-white px-6 pb-2">
                    <div className="flex h-16 shrink-0 items-center">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
                          <span className="text-white font-bold">C</span>
                        </div>
                        <span className="text-xl font-bold text-gray-900">ContextHub</span>
                      </div>
                    </div>
                    <nav className="flex flex-1 flex-col">
                      <ul role="list" className="flex flex-1 flex-col gap-y-7">
                        <li>
                          <ul role="list" className="-mx-2 space-y-1">
                            {filteredNavigation.map((item) => (
                              <li key={item.id || item.href}>{renderNavItem(item)}</li>
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
        <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col">
          <div className="flex grow flex-col gap-y-3 overflow-y-auto border-r border-gray-200 bg-white px-6">
            <div className="flex h-16 shrink-0 items-center">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
                  <span className="text-white font-bold">C</span>
                </div>
                <span className="text-xl font-bold text-gray-900">ContextHub</span>
              </div>
            </div>
            <nav className="flex flex-1 flex-col">
              <ul role="list" className="flex flex-1 flex-col gap-y-7">
                <li>
                  <ul role="list" className="-mx-2 space-y-1">
                    {filteredNavigation.map((item) => (
                      <li key={item.id || item.href}>{renderNavItem(item)}</li>
                    ))}
                  </ul>
                </li>
              </ul>
            </nav>
          </div>
        </div>

        <div className="lg:pl-72">
          <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-gray-200 bg-white px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
            <button type="button" className="-m-2.5 p-2.5 text-gray-700 lg:hidden" onClick={() => setSidebarOpen(true)}>
              <span className="sr-only">Open sidebar</span>
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
                      onChange={(event) => {
                        const membership = memberships.find((item) => item.tenantId === event.target.value)
                        if (membership) {
                          selectTenant(membership)
                        }
                      }}
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
                    <span className="sr-only">Profil</span>
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-800">
                      <span className="text-sm font-medium text-white">
                        {user?.firstName?.charAt(0)?.toUpperCase() || 'U'}
                      </span>
                    </div>
                    <span className="hidden lg:flex lg:flex-col lg:items-start">
                      <span>{user?.firstName || 'Kullanıcı'}</span>
                      <span className="text-xs font-normal text-gray-500">Profili görüntüle</span>
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
      <Footer />
    </div>
  )
}
