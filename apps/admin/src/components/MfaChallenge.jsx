import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { mfaAPI } from '../lib/api.js'
import { mfaError } from '../lib/mfaError.js'

export default function MfaChallenge({ challenge, onSuccess, onCancel }) {
  const { t } = useTranslation()
  const [method, setMethod] = useState(challenge.methods?.[0] || 'recovery')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [retryAt, setRetryAt] = useState(Date.now() + (challenge.retryAfterSeconds || 0) * 1000)
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  const remaining = Math.max(0, Math.ceil((retryAt - now) / 1000))
  async function sendCode() {
    setBusy(true); setError('')
    try { const { data } = await mfaAPI.sendCode(); setRetryAt(Date.now() + data.retryAfterSeconds * 1000); setNotice(t('mfa.sent', { email: challenge.maskedEmail })) }
    catch (err) { setError(mfaError(err, t)); if (err.response?.data?.retryAfterSeconds) setRetryAt(Date.now() + err.response.data.retryAfterSeconds * 1000) }
    finally { setBusy(false) }
  }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    try { const { data } = await mfaAPI.verify(method, code); onSuccess(data) }
    catch (err) { setError(mfaError(err, t)) }
    finally { setBusy(false) }
  }
  return <section className="space-y-5" aria-labelledby="mfa-login-title">
    <h1 id="mfa-login-title" className="text-2xl font-semibold text-gray-900">{t('mfa.title')}</h1>
    <p className="text-sm text-gray-600">{t('mfa.login_help')}</p>
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm font-medium">{t('mfa.method')}
        <select value={method} disabled={busy} onChange={(event) => { setMethod(event.target.value); setCode(''); setError(''); setNotice('') }} className="mt-1 block w-full rounded-md border-gray-300">
          {(challenge.methods || []).map((item) => <option key={item} value={item}>{t(`mfa.${item}`)}</option>)}
          {challenge.recoveryAvailable && <option value="recovery">{t('mfa.recovery')}</option>}
        </select>
      </label>
      <label className="block text-sm font-medium">{t('mfa.code')}
        <input autoFocus value={code} onChange={(event) => setCode(event.target.value)} required autoComplete="one-time-code" inputMode={method === 'recovery' ? 'text' : 'numeric'} maxLength={method === 'recovery' ? 64 : 6} pattern={method === 'recovery' ? undefined : '[0-9]{6}'} className="mt-1 block w-full rounded-md border-gray-300" />
      </label>
      {method === 'email' && <button type="button" onClick={sendCode} disabled={busy || remaining > 0} className="text-sm text-blue-700 disabled:text-gray-500">{remaining ? t('mfa.resend_wait', { seconds: remaining }) : t('mfa.send')}</button>}
      {notice && <p role="status" className="text-sm text-green-700">{notice}</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={busy || !code} className="w-full rounded-md bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50">{t('mfa.verify')}</button>
      <button type="button" disabled={busy} onClick={async () => { await mfaAPI.cancel().catch(() => {}); onCancel() }} className="w-full text-sm text-gray-600">{t('mfa.cancel_login')}</button>
    </form>
  </section>
}
