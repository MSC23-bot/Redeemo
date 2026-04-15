import Image from 'next/image'

type AppMockupFrameProps = {
  src?: string
  alt?: string
  size?: 'sm' | 'md'
  className?: string
}

const SIZES = {
  sm: { width: 220, height: 440, radius: 28 },
  md: { width: 280, height: 560, radius: 36 },
}

export function AppMockupFrame({ src, alt = 'App screenshot', size = 'md', className }: AppMockupFrameProps) {
  const { width, height, radius } = SIZES[size]

  return (
    <div
      className={className}
      style={{
        width,
        height,
        borderRadius: radius,
        overflow: 'hidden',
        border: '1.5px solid rgba(255,255,255,0.1)',
        boxShadow: '0 32px 80px rgba(0,0,0,0.35)',
        flexShrink: 0,
        position: 'relative',
        background: 'rgba(255,255,255,0.04)',
      }}
    >
      {src ? (
        <Image src={src} alt={alt} fill style={{ objectFit: 'cover' }} />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <span className="font-mono text-[10px] text-white/20 tracking-widest uppercase">App screen</span>
        </div>
      )}
    </div>
  )
}
