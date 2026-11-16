import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import QRCode from 'qrcode'
import { mfaAPI } from '../lib/api.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { mfaError } from '../lib/mfaError.js'

export default function MfaSettings() {
  const { t } = useTranslation()
  const { user, login, logout } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const settings = useQuery({ queryKey: ['mfa-settings', user?.id], queryFn: async () => (await mfaAPI.settings()).data, retry: false })
  const [currentPassword, setPassword] = useState('')
  const [setup, setSetup] = useState(null)
  const [qr, setQr] = useState('')
  const [code, setCode] = useState('')
  const [codes, setCodes] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmAction, setConfirmAction] = useState(null)
  const [retryAt, setRetryAt] = useState(0)
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  useEffect(() => {
    let active = true
    setQr('')
    if (setup?.uri) QRCode.toDataURL(setup.uri, { width: 220, margin: 2 }).then((value) => { if (active) setQr(value) }).catch(() => {})
    return () => { active = false }
  }, [setup?.uri])
  const status = settings.data
  async function run(task) {
    setBusy(true); setError('')
    try { await task() } catch (err) { setError(mfaError(err, t)); if (err.response?.data?.retryAfterSeconds) setRetryAt(Date.now() + err.response.data.retryAfterSeconds * 1000) }
    finally { setBusy(false) }
  }
  function apply(data) {
    login(data); setPassword(''); setSetup(null); setCode(''); setCodes(data.recoveryCodes || []); setConfirmAction(null)
    queryClient.invalidateQueries({ queryKey: ['mfa-settings'] })
  }
  const remaining = Math.max(0, Math.ceil((retryAt - now) / 1000))
  return <section id="two-factor" className="rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm space-y-4" aria-labelledby="mfa-settings-title">
    <h2 id="mfa-settings-title" className="font-semibold text-amber-900">{t('mfa.title')}</h2>
    <p className="text-sm text-amber-900">{t('mfa.optional_help')}</p>
    {settings.isLoading && <p>{t('mfa.loading')}</p>}
    {settings.isError && <p role="alert">{t('mfa.error.default')} <button onClick={() => settings.refetch()}>{t('mfa.retry')}</button></p>}
    {status && <>
      <p className="text-sm">{status.enabled ? t('mfa.enabled', { methods: status.methods.map((item) => t(`mfa.${item}`)).join(', ') }) : t('mfa.disabled')}</p>
      {codes.length > 0 && <div className="rounded-md border border-amber-300 bg-amber-50 p-4 space-y-3">
        <h3 className="font-semibold">{t('mfa.save_codes')}</h3><p className="text-sm">{t('mfa.codes_help')}</p>
        <ul className="space-y-1 font-mono text-sm break-all">{codes.map((item) => <li key={item}>{item}</li>)}</ul>
        <a download="contexthub-recovery-codes.txt" href={`data:text/plain;charset=utf-8,${encodeURIComponent(codes.join('\n'))}`} className="inline-block text-sm text-blue-700 underline">{t('mfa.download')}</a>
        <button type="button" onClick={() => setCodes([])} className="ml-4 text-sm underline">{t('mfa.saved')}</button>
      </div>}
      {status.requiresMfaReauthentication ? <div className="space-y-2"><p className="text-sm text-amber-800">{t('mfa.reauth_help')}</p><button type="button" onClick={async () => { await logout(); navigate('/auth/login?returnTo=%2Fprofile') }} className="text-sm text-blue-700">{t('mfa.reauth')}</button></div> : <>
        {(!status.available && !status.enabled) ? <p className="text-sm text-gray-500">{t('mfa.unavailable')}</p> : <>
          <label className="block text-sm">{t('mfa.password')}<input type="password" value={currentPassword} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" className="mt-1 block w-full max-w-sm rounded-md border-gray-300" /></label>
          {status.googleProofAvailable && <p className="text-sm text-gray-500">{t('mfa.google_proof')}</p>}
          {!setup && <div className="flex flex-wrap gap-3">
            {status.available && ['totp', 'email'].filter((item) => !status.methods.includes(item)).map((method) => <button type="button" key={method} disabled={busy} onClick={() => run(async () => { const { data } = await mfaAPI.enroll(method, currentPassword); setSetup(data); setRetryAt(Date.now() + (data.retryAfterSeconds || 0) * 1000); setCodes([]) })} className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50">{t('mfa.setup', { method: t(`mfa.${method}`) })}</button>)}
          </div>}
          {setup && <form onSubmit={(event) => { event.preventDefault(); run(async () => apply((await mfaAPI.confirm({ method: setup.method, challengeToken: setup.challengeToken, code })).data)) }} className="space-y-3 rounded-md bg-gray-50 p-4">
            <h3 className="font-medium">{t('mfa.setup', { method: t(`mfa.${setup.method}`) })}</h3>
            {setup.method === 'totp' ? <><p className="text-sm">{t('mfa.scan_help')}</p>{qr && <img src={qr} width="220" height="220" alt={t('mfa.qr_alt')} />}<p className="text-sm">{t('mfa.manual_key')}</p><code className="block break-all select-all">{setup.secret}</code></> : <p className="text-sm">{t('mfa.email_setup_help')}</p>}
            <label className="block text-sm">{t('mfa.code')}<input value={code} onChange={(event) => setCode(event.target.value)} required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" className="mt-1 block w-full max-w-sm rounded-md border-gray-300" /></label>
            <div className="flex flex-wrap gap-3"><button type="submit" disabled={busy} className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50">{t('mfa.enable')}</button><button type="button" disabled={busy} onClick={() => { setSetup(null); setCode(''); setQr(''); setError('') }} className="text-sm">{t('mfa.cancel')}</button>
              {setup.method === 'email' && <button type="button" disabled={busy || remaining > 0} onClick={() => run(async () => { const { data } = await mfaAPI.resendEnrollment(setup.challengeToken); setRetryAt(Date.now() + data.retryAfterSeconds * 1000) })} className="text-sm text-blue-700 disabled:text-gray-500">{remaining ? t('mfa.resend_wait', { seconds: remaining }) : t('mfa.send')}</button>}</div>
          </form>}
          {status.enabled && !setup && <div className="border-t pt-3 space-y-3"><p className="text-sm">{t('mfa.codes_remaining', { count: status.recoveryCodesRemaining })}</p>
            <div className="flex flex-wrap gap-4"><button type="button" disabled={busy} onClick={() => setConfirmAction('recovery')} className="text-sm text-blue-700">{t('mfa.regenerate')}</button><button type="button" disabled={busy} onClick={() => setConfirmAction('disable')} className="text-sm text-red-700">{t('mfa.disable')}</button></div>
            {confirmAction && <div className="rounded-md border p-3"><p className="text-sm">{t(`mfa.confirm_${confirmAction}`)}</p><button type="button" disabled={busy} onClick={() => run(async () => apply((await mfaAPI.change(confirmAction, currentPassword)).data))} className="mt-2 mr-4 text-sm font-semibold text-red-700">{t('mfa.confirm')}</button><button type="button" disabled={busy} onClick={() => setConfirmAction(null)} className="text-sm">{t('mfa.cancel')}</button></div>}
          </div>}
        </>}
      </>}
    </>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </section>
}

export function MfaReminder() {
  const { user, memberships } = useAuth()
  const { t } = useTranslation()
  const eligible = memberships?.some((item) => item.status === 'active' && ['owner', 'admin'].includes(item.role))
  const settings = useQuery({ queryKey: ['mfa-settings', user?.id], queryFn: async () => (await mfaAPI.settings()).data, enabled: Boolean(user && eligible), retry: false, staleTime: 60000 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const status = settings.data
  if (!eligible || !status?.available || status.enabled || (status.reminderAfter && new Date(status.reminderAfter) > new Date())) return null
  return <aside className="mb-5 rounded-md border border-blue-200 bg-blue-50 p-4 text-sm" aria-label={t('mfa.reminder')}>
    <p>{t('mfa.reminder')}</p><div className="mt-2 flex gap-4"><Link to="/profile#two-factor" className="font-semibold text-blue-700">{t('mfa.open_settings')}</Link><button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await mfaAPI.snooze(); await settings.refetch() } catch { setError(t('mfa.error.default')) } finally { setBusy(false) } }}>{t('mfa.later')}</button></div>
    {error && <p role="alert">{error}</p>}
  </aside>
}
