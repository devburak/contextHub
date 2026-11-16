export function mfaError(error, t) {
  const key = `mfa.error.${error.response?.data?.error}`
  return t(key, { defaultValue: t('mfa.error.default') })
}
