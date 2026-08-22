const PADDLE_SCRIPT_ID = 'ctxhub-paddle-js'
const PADDLE_SCRIPT_URL = 'https://cdn.paddle.com/paddle/v2/paddle.js'

export function loadPaddleJs(documentObject = document) {
  if (globalThis.Paddle) return Promise.resolve(globalThis.Paddle)

  const existing = documentObject.getElementById(PADDLE_SCRIPT_ID)
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(globalThis.Paddle), { once: true })
      existing.addEventListener('error', () => reject(new Error('Paddle.js failed to load')), { once: true })
    })
  }

  return new Promise((resolve, reject) => {
    const script = documentObject.createElement('script')
    script.id = PADDLE_SCRIPT_ID
    script.src = PADDLE_SCRIPT_URL
    script.async = true
    script.addEventListener('load', () => resolve(globalThis.Paddle), { once: true })
    script.addEventListener('error', () => {
      script.remove()
      reject(new Error('Paddle.js failed to load'))
    }, { once: true })
    documentObject.head.appendChild(script)
  })
}
