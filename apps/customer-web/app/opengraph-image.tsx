import { ImageResponse } from 'next/og'

// Root-level OG image — Next applies this as the default og:image + twitter:image
// for every route that doesn't define its own. Branded 1200x630 card built from
// brand tokens (navy #010C35 ground + red->coral accent, globals.css), no fake
// merchant logos, no "% off", no emoji. v1 renders the wordmark as text; embedding
// the exact logo asset + Mustica Pro is a deferred polish follow-up.
export const alt = 'Redeemo: save with member vouchers at local places'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

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
          padding: '96px',
          backgroundColor: '#010C35',
          position: 'relative',
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
        <div style={{ display: 'flex', fontSize: 96, fontWeight: 700, color: '#FFFFFF', letterSpacing: -3 }}>
          Redeemo
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 46,
            color: 'rgba(255,255,255,0.88)',
            marginTop: 28,
            maxWidth: 960,
            lineHeight: 1.25,
          }}
        >
          Local places worth visiting. Member vouchers included.
        </div>
        <div style={{ display: 'flex', fontSize: 30, fontWeight: 600, color: '#E84A00', marginTop: 44 }}>
          redeemo.co.uk
        </div>
      </div>
    ),
    { ...size },
  )
}
