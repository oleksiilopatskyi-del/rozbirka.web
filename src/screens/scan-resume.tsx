import { Navigate, useParams } from 'react-router'

const scanCodePattern = /^[A-Za-z0-9._~-]{1,256}$/

export function ScanResumeScreen() {
  const { qrCode = '' } = useParams<{ qrCode: string }>()
  const destination = scanCodePattern.test(qrCode)
    ? `/account?scan=${encodeURIComponent(qrCode)}`
    : '/account'

  return <Navigate to={destination} replace />
}
