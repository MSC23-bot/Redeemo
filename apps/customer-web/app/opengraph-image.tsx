import { ImageResponse } from 'next/og'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Root-level OG image — Next applies this as the default og:image + twitter:image
// for every route that doesn't define its own. Branded 1200x630 card: navy
// #010C35 ground + red->coral accent (globals.css), the real Redeemo logo
// (logo-dark.png = white-ink wordmant, correct on the dark ground), and the
// tagline in Mustica Pro (the brand display face). No fake merchant logos,
// no "% off", no emoji. Generated at build (Node runtime → fs is available).
export const alt = 'Redeemo: save with member vouchers at local places'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Read once at build. process.cwd() is the customer-web project root during build.
const logo = readFileSync(join(process.cwd(), 'public/logo-dark.png'))
const logoSrc = `data:image/png;base64,${logo.toString('base64')}`
const mustica = readFileSync(join(process.cwd(), 'public/fonts/MusticaPro-SemiBold.otf'))

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px 96px',
          backgroundColor: '#010C35',
          position: 'relative',
          fontFamily: 'Mustica Pro',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: 16,
            background: 'linear-gradient(90deg, #E20C04 0%, #E84A00 100%)',
          }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc} width={440} height={237} alt="Redeemo" />
        <div
          style={{
            display: 'flex',
            fontSize: 40,
            color: 'rgba(255,255,255,0.9)',
            marginTop: 32,
            maxWidth: 900,
            lineHeight: 1.25,
          }}
        >
          Local places worth visiting. Member vouchers included.
        </div>
        <div style={{ display: 'flex', fontSize: 28, color: '#E84A00', marginTop: 36 }}>
          redeemo.co.uk
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: 'Mustica Pro', data: mustica, weight: 600, style: 'normal' }],
    },
  )
}
