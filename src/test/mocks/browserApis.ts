type ClipboardMock = {
  readText: () => Promise<string>
  writeText: (text: string) => Promise<void>
}

function createClipboardMock(): ClipboardMock {
  let value = ''
  return {
    readText: async () => value,
    writeText: async (text: string) => {
      value = text
    },
  }
}

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function createStorageDirectoryHandle() {
  return {
    async getDirectoryHandle() {
      return createStorageDirectoryHandle()
    },
    async getFileHandle() {
      return {
        async getFile() {
          return new File([], 'mock.mix')
        },
        async createWritable() {
          return {
            async write() {},
            async close() {},
            async abort() {},
          }
        },
      }
    },
    async *entries() {},
    async removeEntry() {},
  }
}

export function installMockBrowserApis() {
  const clipboard = createClipboardMock()

  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: clipboard,
  })

  Object.defineProperty(window.navigator, 'storage', {
    configurable: true,
    value: {
      getDirectory: async () => createStorageDirectoryHandle(),
    },
  })

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false
      },
    }),
  })

  Object.defineProperty(window, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: ResizeObserverMock,
  })

  Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: () => {},
  })
}
