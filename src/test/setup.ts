import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeAll, vi } from 'vitest'
import { installMockBrowserApis } from './mocks/browserApis'

vi.mock('@monaco-editor/react', async () => {
  const mod = await import('./mocks/monaco')
  return {
    default: mod.MonacoEditorMock,
  }
})

beforeAll(() => {
  installMockBrowserApis()
})

afterEach(() => {
  cleanup()
})
