import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { expect, it } from 'vitest'
import { ScanResumeScreen } from './scan-resume'

function LocationProbe() {
  const location = useLocation()
  return <span>{location.pathname + location.search}</span>
}

function renderScan(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/scan/:qrCode" element={<ScanResumeScreen />} />
        <Route path="/account" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

it('replaces a valid scan intent with an encoded account handoff', () => {
  renderScan('/scan/QR-123~part')
  expect(screen.getByText('/account?scan=QR-123~part')).toBeInTheDocument()
})

it('drops a malformed scan parameter instead of forwarding it', () => {
  renderScan('/scan/%5Cevil')
  expect(screen.getByText('/account')).toBeInTheDocument()
})
