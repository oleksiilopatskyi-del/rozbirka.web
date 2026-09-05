import { useCallback, useEffect, useState } from 'react'

const KEY = 'rozbirka.navigationCollapsed'

/** Storage is a convenience here, so a browser that refuses it costs nothing. */
const read = (): boolean => {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Whether the desktop menu is folded away. The choice is remembered per
 * browser: someone who works on one screen all day should not have to fold the
 * menu again after every reload.
 */
export function useNavigationCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(read)

  useEffect(() => {
    try {
      if (collapsed) localStorage.setItem(KEY, '1')
      else localStorage.removeItem(KEY)
    } catch {
      // A remembered preference is not worth failing a render over.
    }
  }, [collapsed])

  return [collapsed, useCallback(() => setCollapsed((current) => !current), [])]
}
