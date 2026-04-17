'use client'

import { useSyncExternalStore } from 'react'
import { Moon, Sun } from 'lucide-react'

// The `.light` class on <html> is the source of truth (set pre-paint by the
// inline script in app/layout.tsx from localStorage). We subscribe to DOM
// class changes via useSyncExternalStore so React reads the real value
// without the setState-in-effect anti-pattern.
function subscribe(callback: () => void) {
  if (typeof window === 'undefined') return () => {}
  const observer = new MutationObserver(callback)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}

function getSnapshot(): boolean {
  return document.documentElement.classList.contains('light')
}

function getServerSnapshot(): boolean {
  // Dark is the default during SSR; the inline script flips it before paint.
  return false
}

export function ThemeToggle() {
  const isLight = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  function toggle() {
    const goLight = !isLight
    document.documentElement.classList.toggle('light', goLight)

    if (goLight) {
      localStorage.setItem('theme', 'light')
    } else {
      localStorage.removeItem('theme')
    }
  }

  return (
    <button
      onClick={toggle}
      className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      aria-label="Toggle theme"
    >
      {isLight ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
    </button>
  )
}
