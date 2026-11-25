import { useEffect, useState } from 'react'

/** Reads CSS custom properties and re-reads them when the theme class changes. */
export function useCssVars<T extends string>(names: readonly T[]): Record<T, string> {
  const read = () => {
    const style = getComputedStyle(document.documentElement)
    return Object.fromEntries(names.map((n) => [n, style.getPropertyValue(`--${n}`).trim()])) as Record<
      T,
      string
    >
  }
  const [vars, setVars] = useState(read)
  useEffect(() => {
    const observer = new MutationObserver(() => setVars(read()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return vars
}
