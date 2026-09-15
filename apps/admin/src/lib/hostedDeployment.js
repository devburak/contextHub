export const HOSTED_PAYMENT_MARKS_PATH = '/assets/iyzico-card-brands.png'

export function isHostedDeployment(env = import.meta.env) {
  return String(env?.VITE_CTXHUB_HOSTED || '').trim().toLowerCase() === 'true'
}
