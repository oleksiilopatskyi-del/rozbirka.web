type Listener = () => void

let accessToken: string | null = null
const clearListeners = new Set<Listener>()

export const credentials = {
  getAccess(): string | null {
    return accessToken
  },

  setAccess(token: string) {
    accessToken = token
  },

  clear() {
    const hadAccessToken = accessToken !== null
    accessToken = null

    if (hadAccessToken) {
      clearListeners.forEach((listener) => listener())
    }
  },

  onCleared(listener: Listener): () => void {
    clearListeners.add(listener)
    return () => clearListeners.delete(listener)
  },
}
