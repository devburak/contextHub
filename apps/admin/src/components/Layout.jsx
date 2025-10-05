import { Fragment, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { Bars3Icon, XMarkIcon, UserIcon, CogIcon, BuildingOfficeIcon, PlusIcon, PhotoIcon, Squares2X2Icon, DocumentTextIcon, WrenchScrewdriverIcon, BookOpenIcon, ClipboardDocumentListIcon } from '@heroicons/react/24/outline'
import { Link, useLocation, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import Footer from './Footer.jsx'

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user, memberships, activeMembership, selectTenant, logout } = useAuth()
  const location = useLocation()

  const navigation = [
    { name: 'Kontrol Paneli', href: '/', icon: CogIcon },
    { name: 'Kullanıcılar', href: '/users', icon: UserIcon },
    { name: 'Medya', href: '/media', icon: PhotoIcon },
    { name: 'Galeriler', href: '/galeriler', icon: Squares2X2Icon },
    { name: 'Kategoriler', href: '/categories', icon: Squares2X2Icon },
    { name: 'İçerikler', href: '/contents', icon: DocumentTextIcon },
    { name: 'Formlar', href: '/forms', icon: ClipboardDocumentListIcon },
    { name: 'Varlıklar', href: '/varliklar', icon: BuildingOfficeIcon },
    { name: 'Tenant Ayarları', href: '/varliklar/ayarlar', icon: WrenchScrewdriverIcon },
    { name: 'Belgeler', href: '/belgeler', icon: BookOpenIcon }
  ]

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
                  <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-white px-6 pb-2">
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
                            {navigation.map((item) => {
                              const isActive = location.pathname === item.href || (item.href !== '/' && location.pathname.startsWith(`${item.href}/`))
                              return (
                                <li key={item.name}>
                                  <Link
                                    to={item.href}
                                    className={classNames(
                                      isActive
                                        ? 'bg-gray-50 text-blue-600'
                                        : 'text-gray-700 hover:text-blue-600 hover:bg-gray-50',
                                      'group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold'
                                    )}
                                  >
                                    <item.icon
                                      className={classNames(
                                        isActive ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600',
                                        'h-6 w-6 shrink-0'
                                      )}
                                      aria-hidden="true"
                                    />
                                    {item.name}
                                  </Link>
                                </li>
                              )
                            })}
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
          <div className="flex grow flex-col gap-y-5 overflow-y-auto border-r border-gray-200 bg-white px-6">
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
                    {navigation.map((item) => {
                      const isActive = location.pathname === item.href || (item.href !== '/' && location.pathname.startsWith(`${item.href}/`))
                      return (
                        <li key={item.name}>
                          <Link
                            to={item.href}
                            className={classNames(
                              isActive
                                ? 'bg-gray-50 text-blue-600'
                                : 'text-gray-700 hover:text-blue-600 hover:bg-gray-50',
                              'group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold'
                            )}
                          >
                            <item.icon
                              className={classNames(
                                isActive ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600',
                                'h-6 w-6 shrink-0'
                              )}
                              aria-hidden="true"
                            />
                            {item.name}
                          </Link>
                        </li>
                      )
                    })}
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
                <Link
                  to="/varliklar/yeni"
                  className="hidden md:inline-flex items-center gap-x-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  <PlusIcon className="h-4 w-4" aria-hidden="true" />
                  Yeni Varlık Oluştur
                </Link>
                <Link
                  to="/varliklar/yeni"
                  className="md:hidden inline-flex items-center rounded-full border border-blue-600 p-2 text-blue-600 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  aria-label="Yeni varlık oluştur"
                >
                  <PlusIcon className="h-4 w-4" aria-hidden="true" />
                </Link>
                <div className="hidden lg:block lg:h-6 lg:w-px lg:bg-gray-200" aria-hidden="true" />

                {/* Profile dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    className="flex items-center gap-x-2 text-sm font-semibold leading-6 text-gray-900"
                    onClick={logout}
                  >
                    <span className="sr-only">Your profile</span>
                    <div className="h-8 w-8 rounded-full bg-gray-800 flex items-center justify-center">
                      <span className="text-white text-sm font-medium">
                        {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                      </span>
                    </div>
                    <span className="hidden lg:flex lg:items-center">
                      <span>{user?.name || 'User'}</span>
                    </span>
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
