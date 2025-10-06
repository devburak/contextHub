import { PERMISSIONS } from './permissions.js'

export const PERMISSION_LABELS = {
  [PERMISSIONS.DASHBOARD_VIEW]: 'Kontrol panelini görüntüle',
  [PERMISSIONS.USERS_VIEW]: 'Kullanıcıları görüntüle',
  [PERMISSIONS.USERS_MANAGE]: 'Kullanıcıları yönet',
  [PERMISSIONS.USERS_INVITE]: 'Kullanıcı davet et',
  [PERMISSIONS.USERS_ASSIGN_ROLE]: 'Rolleri ata',
  [PERMISSIONS.ROLES_VIEW]: 'Rolleri görüntüle',
  [PERMISSIONS.ROLES_MANAGE]: 'Rolleri yönet',
  [PERMISSIONS.PROFILE_UPDATE]: 'Profilini güncelle',
  [PERMISSIONS.TENANTS_VIEW]: 'Varlıkları görüntüle',
  [PERMISSIONS.TENANTS_MANAGE]: 'Varlıkları yönet',
  [PERMISSIONS.CONTENT_VIEW]: 'İçerikleri görüntüle',
  [PERMISSIONS.CONTENT_MANAGE]: 'İçerikleri yönet',
  [PERMISSIONS.MEDIA_VIEW]: 'Medya kütüphanesini görüntüle',
  [PERMISSIONS.MEDIA_MANAGE]: 'Medya kütüphanesini yönet',
  [PERMISSIONS.CATEGORIES_VIEW]: 'Kategorileri görüntüle',
  [PERMISSIONS.CATEGORIES_MANAGE]: 'Kategorileri yönet',
  [PERMISSIONS.FORMS_VIEW]: 'Formları görüntüle',
  [PERMISSIONS.FORMS_MANAGE]: 'Formları yönet',
  [PERMISSIONS.PLACEMENTS_VIEW]: 'Placements görüntüle',
  [PERMISSIONS.PLACEMENTS_MANAGE]: 'Placements yönet',
  [PERMISSIONS.MENUS_VIEW]: 'Menüleri görüntüle',
  [PERMISSIONS.MENUS_MANAGE]: 'Menüleri yönet',
  [PERMISSIONS.ANALYTICS_VIEW]: 'Analitikleri görüntüle',
  [PERMISSIONS.SETTINGS_MANAGE]: 'Ayarları yönet'
}

export const PERMISSION_GROUP_LABELS = {
  DASHBOARD: 'Kontrol Paneli',
  USERS: 'Kullanıcı Yönetimi',
  ROLES: 'Roller',
  PROFILE: 'Profil',
  TENANTS: 'Varlıklar',
  CONTENT: 'İçerik',
  MEDIA: 'Medya',
  CATEGORIES: 'Kategoriler',
  FORMS: 'Formlar',
  PLACEMENTS: 'Placements',
  MENUS: 'Menüler',
  ANALYTICS: 'Analitik',
  SETTINGS: 'Ayarlar'
}
