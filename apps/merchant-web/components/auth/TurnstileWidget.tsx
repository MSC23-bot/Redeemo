'use client'

import Script from 'next/script'
import { useEffect, useRef } from 'react'

// M1 Slice 4: Cloudflare Turnstile registration captcha. Loads the Cloudflare script,
// renders the widget via the explicit API, and calls onToken with the solved token
// (or '' on expiry/error). Dev/test use the always-pass test site key (auto-solves);
// the backend accepts an empty token when CAPTCHA_ENABLED is off, so the form never
// hard-blocks on the widget. Registration-only.
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '1x00000000000000000000AA'
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js'

interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string
      callback: (token: string) => void
      'expired-callback'?: () => void
      'error-callback'?: () => void
    },
  ) => string
}

export function TurnstileWidget({ onToken }: { onToken: (token: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const renderedRef = useRef(false)
  // keep the latest callback without re-rendering the widget
  const onTokenRef = useRef(onToken)
  onTokenRef.current = onToken

  function tryRender() {
    const turnstile = (window as unknown as { turnstile?: TurnstileApi }).turnstile
    if (!turnstile || !containerRef.current || renderedRef.current) return
    renderedRef.current = true
    turnstile.render(containerRef.current, {
      sitekey: SITE_KEY,
      callback: (token) => onTokenRef.current(token),
      'expired-callback': () => onTokenRef.current(''),
      'error-callback': () => onTokenRef.current(''),
    })
  }

  useEffect(() => {
    tryRender()
  }, [])

  return (
    <>
      <Script src={SCRIPT_SRC} strategy="afterInteractive" onReady={tryRender} onLoad={tryRender} />
      <div ref={containerRef} aria-label="Captcha challenge" />
    </>
  )
}
