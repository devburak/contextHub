export const ROLE_LEVELS = [
  { key: 'viewer', label: 'Görüntüleyici', level: 10 },
  { key: 'author', label: 'Yazar', level: 20 },
  { key: 'editor', label: 'Editör', level: 30 },
  { key: 'admin', label: 'Yönetici', level: 40 },
  { key: 'owner', label: 'Sahip', level: 50 }
]

export const ROLE_LABELS = ROLE_LEVELS.reduce((acc, role) => {
  acc[role.key] = role.label
  return acc
}, {})

export const ROLE_LEVEL_MAP = ROLE_LEVELS.reduce((acc, role) => {
  acc[role.key] = role.level
  return acc
}, {})
