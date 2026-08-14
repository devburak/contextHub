import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * API hatalarını kullanıcıya gösterilebilir metne çevirir.
 *
 * Öncelik sırası:
 *   1. Yanıttaki `error` kodunun yerel sözlükteki karşılığı (`errors.<Kod>`)
 *   2. Sunucunun döndürdüğü `message` (backend de artık yerelleştiriyor)
 *   3. Ağ/zaman aşımı gibi taşıma katmanı hataları için özel metinler
 *   4. Genel "beklenmeyen hata" metni
 *
 * Kod öncelikli olmasının sebebi: aynı kod farklı ekranlarda farklı bir cümleyle
 * anlatılmak istenebilir ve bu karar sunucuda değil, arayüzde verilmelidir.
 */
export function useApiError() {
  const { t, i18n } = useTranslation()

  return useCallback(
    (error, fallbackKey = 'errors.unknown') => {
      if (!error) {
        return t(fallbackKey)
      }

      // Axios taşıma katmanı hataları: yanıt hiç oluşmamış.
      if (!error.response) {
        if (error.code === 'ECONNABORTED' || /timeout/i.test(error.message || '')) {
          return t('errors.timeout')
        }
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          return t('errors.offline')
        }
        if (error.request) {
          return t('errors.network')
        }
      }

      const data = error.response?.data
      const code = typeof data?.error === 'string' ? data.error : null

      if (code) {
        const key = `errors.${code}`
        if (i18n.exists(key)) {
          return t(key)
        }
      }

      if (typeof data?.message === 'string' && data.message.trim()) {
        return data.message
      }

      return t(fallbackKey)
    },
    [t, i18n]
  )
}

/**
 * Hata kodunu ham hâliyle döner — çağıran taraf koda göre dallanmak istediğinde
 * (örneğin `RequestLimitExceeded` için yükseltme çağrısı göstermek) kullanılır.
 */
export function getApiErrorCode(error) {
  const code = error?.response?.data?.error
  return typeof code === 'string' ? code : null
}

export default useApiError
