import React from 'react'
import { render, type RenderOptions } from '@testing-library/react'
import { AppDialogProvider } from '../components/common/AppDialogProvider'
import { LocaleProvider } from '../i18n/LocaleContext'

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LocaleProvider>
      <AppDialogProvider>{children}</AppDialogProvider>
    </LocaleProvider>
  )
}

export function renderWithProviders(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  return render(ui, {
    wrapper: Providers,
    ...options,
  })
}
