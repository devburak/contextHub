import { describe, it, expect } from 'vitest'
import App from './App.jsx'

describe('App component', () => {
  it('exports a React component function', () => {
    expect(typeof App).toBe('function')
  })
})
