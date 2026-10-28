"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

// La UI está diseñada solo para tema CLARO (los componentes usan colores fijos
// slate/white). Forzamos "light" para que el modo oscuro del sistema no inyecte
// tokens oscuros y deje texto blanco sobre inputs blancos.
function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      forcedTheme="light"
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  )
}

export { ThemeProvider }
