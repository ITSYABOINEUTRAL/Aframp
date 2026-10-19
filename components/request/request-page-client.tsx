'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Copy, Check, Camera, AlertCircle, Clock, TriangleAlert } from 'lucide-react'
import QRCode from 'react-qr-code'
import { Button } from '@/components/ui/button'
import { QRScanner } from '@/components/send/qr-scanner'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { cn } from '@/lib/utils'
import { useMediaQuery } from '@/hooks/use-media-query'
import { api, ApiError, type PaymentRequest } from '@/lib/api'
import { formatStroops } from '@/lib/money'
import { formatDateTime } from '@/lib/format-date'

interface RequestPageClientProps {
  requestId: string
}

type CopyTarget = 'wallet' | 'paymentLink' | 'sep7'

// The QR scanner relies on getUserMedia, which requires the Permissions-Policy
// header to allow camera access for same-origin pages (camera=(self)).
// See next.config.mjs — keep these in sync.
const CAMERA_PERMISSIONS_POLICY = 'camera=(self)'

export function RequestPageClient({ requestId }: RequestPageClientProps) {
  const router = useRouter()
  const [request, setRequest] = useState<PaymentRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [copied, setCopied] = useState<CopyTarget | null>(null)
  const copyFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMobile = useMediaQuery('(max-width: 767px)')
  const [scannedAddress, setScannedAddress] = useState<string | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const fetchRequest = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      setError(null)
      try {
        const data = await api.getPaymentRequest(requestId, signal)
        setRequest(data)
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        if (cause instanceof ApiError && cause.status === 404) {
          setError('Payment request not found.')
        } else if (cause instanceof ApiError && cause.status === 0) {
          setError("We can't reach the server right now. Check your connection and try again.")
        } else {
          setError(cause instanceof Error ? cause.message : 'Could not load this payment request.')
        }
      } finally {
        setLoading(false)
      }
    },
    [requestId]
  )

  useEffect(() => {
    const controller = new AbortController()
    void fetchRequest(controller.signal)
    return () => controller.abort()
  }, [fetchRequest])

  useEffect(
    () => () => {
      if (copyFeedbackTimer.current) clearTimeout(copyFeedbackTimer.current)
    },
    []
  )

  const handleCopy = async (target: CopyTarget, value: string) => {
    await navigator.clipboard.writeText(value)
    setCopied(target)
    if (copyFeedbackTimer.current) clearTimeout(copyFeedbackTimer.current)
    copyFeedbackTimer.current = setTimeout(() => {
      setCopied((current) => (current === target ? null : current))
      copyFeedbackTimer.current = null
    }, 2000)
  }

  const handleScanPayment = async (address: string) => {
    setScannedAddress(address)
    setScannerOpen(false)

    // Validate address format (basic Stellar address validation)
    if (!/^G[A-Z0-9]{55}$/.test(address)) {
      setScanError('Invalid Stellar address format')
      return
    }

    setSubmitting(true)
    setScanError(null)

    try {
      // TODO: Replace mock with actual API endpoint when backend is ready:
      // await api.confirmScannedPayment(requestId, address)
      await new Promise((resolve) => setTimeout(resolve, 500))
    } catch (err) {
      setScanError(
        err instanceof Error ? err.message : 'Failed to confirm payment. Please try again.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  // ── Loading state ──
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  // ── Error state ──
  if (error || !request) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center">
        <div className="w-full max-w-md flex flex-col min-h-screen relative">
          <header className="flex items-center gap-3 px-5 pt-6 pb-4">
            <button
              onClick={() => router.back()}
              className="p-2 -ml-2 rounded-full hover:bg-muted transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base font-semibold tracking-tight">Payment Request</h1>
          </header>
          <div className="flex flex-col flex-1 items-center justify-center px-5 gap-4 text-center">
            <div className="p-4 rounded-full bg-destructive/10">
              <TriangleAlert className="w-8 h-8 text-destructive" />
            </div>
            <p className="text-sm text-muted-foreground">
              {error ?? 'This payment request could not be loaded.'}
            </p>
            <Button variant="outline" onClick={() => void fetchRequest()}>
              Try again
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ── Expired state ──
  if (request.status === 'expired') {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center">
        <div className="w-full max-w-md flex flex-col min-h-screen relative">
          <header className="flex items-center gap-3 px-5 pt-6 pb-4">
            <button
              onClick={() => router.back()}
              className="p-2 -ml-2 rounded-full hover:bg-muted transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base font-semibold tracking-tight">Payment Request</h1>
          </header>
          <div className="flex flex-col flex-1 items-center justify-center px-5 gap-4 text-center">
            <div className="p-4 rounded-full bg-muted">
              <Clock className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold">Request expired</h2>
            <p className="text-sm text-muted-foreground">
              This payment request expired on {formatDateTime(request.expires_at)}.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── Paid state ──
  if (request.status === 'paid') {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center">
        <div className="w-full max-w-md flex flex-col min-h-screen relative">
          <header className="flex items-center gap-3 px-5 pt-6 pb-4">
            <button
              onClick={() => router.back()}
              className="p-2 -ml-2 rounded-full hover:bg-muted transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base font-semibold tracking-tight">Payment Request</h1>
          </header>
          <div className="flex flex-col flex-1 items-center justify-center px-5 gap-4 text-center">
            <div className="p-4 rounded-full bg-emerald-500/10">
              <Check className="w-8 h-8 text-emerald-500" />
            </div>
            <h2 className="text-lg font-semibold">Payment received</h2>
            <p className="text-sm text-muted-foreground">
              {formatStroops(request.amount_stroops)} {request.asset} has been received.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const qrValue =
    request.sep7_uri ??
    `stellar:${request.address}?amount=${formatStroops(request.amount_stroops)}&asset=${request.asset}&memo=${request.memo}`

  return (
    <div className="min-h-screen bg-background flex flex-col items-center">
      <div className="w-full max-w-md flex flex-col min-h-screen relative">
        {/* ── Header ── */}
        <header className="flex items-center gap-3 px-5 pt-6 pb-4">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 rounded-full hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-semibold tracking-tight">Payment Request</h1>
        </header>

        {/* ── Content ── */}
        <div className="flex flex-col flex-1 px-5 gap-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <p className="text-sm text-muted-foreground">Requesting</p>
            <p className="text-3xl font-bold tracking-tight">
              {formatStroops(request.amount_stroops)} {request.asset}
            </p>
            {request.memo && (
              <p className="text-sm text-muted-foreground">{request.memo}</p>
            )}
          </div>

          <div className="flex justify-center p-4 bg-white rounded-2xl">
            <QRCode value={qrValue} size={isMobile ? 200 : 240} />
          </div>

          <div className="flex flex-col gap-3">
            <Button
              variant="outline"
              className="w-full justify-between"
              onClick={() => void handleCopy('wallet', request.address)}
            >
              <span className="truncate font-mono text-xs">{request.address}</span>
              {copied === 'wallet' ? (
                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
              ) : (
                <Copy className="w-4 h-4 shrink-0" />
              )}
            </Button>

            <Button
              className="w-full gap-2"
              onClick={() => setScannerOpen(true)}
            >
              <Camera className="w-4 h-4" />
              Scan to confirm payment
            </Button>
          </div>

          {scanError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{scanError}</span>
            </div>
          )}

          {scannedAddress && !scanError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-500/10 text-emerald-600 text-sm">
              <Check className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="break-all">
                {submitting ? 'Confirming payment…' : `Scanned: ${scannedAddress}`}
              </span>
            </div>
          )}
        </div>

        {scannerOpen && (
          <QRScanner
            onScan={(value) => void handleScanPayment(value)}
            onClose={() => setScannerOpen(false)}
          />
        )}
      </div>
    </div>
  )
}
