import { useMemo } from 'react'

export function useSlidingIndicator(selector: string): (el: HTMLElement | null) => void {
  return useMemo(() => {
    let stop: (() => void) | null = null
    return (root: HTMLElement | null) => {
      stop?.()
      stop = null
      if (!root) return
      const place = (): void => {
        const active = root.querySelector<HTMLElement>(selector)
        if (!active) {
          if (root.classList.contains('has-indicator')) root.classList.remove('has-indicator')
          return
        }
        root.style.setProperty('--indicator-x', `${active.offsetLeft}px`)
        root.style.setProperty('--indicator-y', `${active.offsetTop}px`)
        root.style.setProperty('--indicator-w', `${active.offsetWidth}px`)
        if (!root.classList.contains('has-indicator')) root.classList.add('has-indicator')
      }
      const mutations = new MutationObserver(place)
      mutations.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] })
      const sizes = new ResizeObserver(place)
      sizes.observe(root)
      place()
      stop = () => {
        mutations.disconnect()
        sizes.disconnect()
      }
    }
  }, [selector])
}
