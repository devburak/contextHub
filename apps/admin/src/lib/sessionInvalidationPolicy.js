const AUTH_INVALIDATING_ERRORS = new Set([
  'AccountDisabled',
  'EmailVerificationRequired',
])

export function shouldInvalidateSession({
  status,
  errorCode,
  requestRevision,
  currentRevision,
  sessionTransitioning = false,
  isSessionTransitionRequest = false,
}) {
  if (AUTH_INVALIDATING_ERRORS.has(errorCode)) {
    return true
  }

  if (status !== 401) {
    return false
  }

  if (Number.isFinite(requestRevision) && requestRevision < currentRevision) {
    return false
  }

  // While the session cookie is being rotated, requests already in flight can
  // legitimately fail with the now-revoked token. The transition request's own
  // 401 remains authoritative and must still end the session.
  if (sessionTransitioning && !isSessionTransitionRequest) {
    return false
  }

  return true
}

