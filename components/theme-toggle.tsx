'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

export function ThemeToggle() {
  // Dark is the default (:root is dark, .light is opt-in)
  const [isLight, setIsLight] = useState(false)

  useEffect(() => {
    setIsLight(document.documentElement.classList.contains('light'))
  }, [])

  function toggle() {
    const goLight = !isLight
    setIsLight(goLight)
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
