export function createBeforeUnloadHandler(shouldBlock) {
  return (event) => {
    if (!shouldBlock()) return undefined

    event.preventDefault()
    event.returnValue = ''
    return ''
  }
}
