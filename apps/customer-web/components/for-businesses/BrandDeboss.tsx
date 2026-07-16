'use client'

/**
 * Oversized Redeemo mark pressed into a section background: two stacked
 * monochrome silhouettes of the ribbon icon give a letterpress deboss (cream
 * surfaces) or a low emboss (navy surfaces). Purely decorative.
 */

const PATHS = [
  'M831.36,460.76c-.47,98.87-51.84,193.62-136.76,246.67l-19.79-11.27c.75-2.95,1.45-5.9,2.1-8.89a289.81,289.81,0,0,0,6.83-62.89c0-2.34,0-4.67-.09-7-1.68-41.73-10.95-82-30.41-119.12-19.14-36.54-46.23-66.16-77.48-93.11a562,562,0,0,0-67.24-49.46C502.77,352,497,348.42,491.07,345q-24.49-14.52-49.93-27.46L270.32,220.69l-12.17-7.25-18.24-10.85,49.55-46.65a54.34,54.34,0,0,0,48.33,18.15c29.38-3.84,50.3-29.76,46.6-58A49.9,49.9,0,0,0,366.24,83.7L399,52.86l23,9.78,8.8,3.74h0c46.65,23,113.09,53.3,150.66,75.38,55.68,32.71,110.66,64.38,158.66,108.78,7.3,6.79,14.32,13.9,20.92,21.34,36.63,41.5,60.26,94.09,67.75,148.93A286,286,0,0,1,831.36,460.76Z',
  'M812.79,922.43a53.61,53.61,0,0,0,53.71,53.62v78.09L543.85,873.25l-95.78-53.62L240.61,703.36V448.93l9.5,5.43L645.89,679.64,672.8,695l2,1.17,19.79,11.27,171.9,97.84v63.59A53.65,53.65,0,0,0,812.79,922.43Z',
  '497.24 848.27 239.91 1035.42 240.6 703.35 497.24 848.27',
]

function Silhouette({ fill }: { fill: string }) {
  return (
    <>
      <path d={PATHS[0]} fill={fill} />
      <path d={PATHS[1]} fill={fill} />
      <polygon points={PATHS[2]} fill={fill} />
    </>
  )
}

export function BrandDeboss({
  tone,
  size = 560,
  rotate = 0,
  style,
}: {
  tone: 'cream' | 'navy'
  size?: number
  rotate?: number
  style?: React.CSSProperties
}) {
  // Cream: darker shape with a white lift below (pressed in).
  // Navy: lighter shape with a darker edge below (raised whisper).
  const face = tone === 'cream' ? 'rgba(1,12,53,0.045)' : 'rgba(255,255,255,0.032)'
  const edge = tone === 'cream' ? 'rgba(255,255,255,0.7)' : 'rgba(0,3,18,0.5)'
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 1080 1080"
      className="pointer-events-none absolute select-none"
      style={{ transform: `rotate(${rotate}deg)`, ...style }}
    >
      <g transform="translate(0 3)">
        <Silhouette fill={edge} />
      </g>
      <Silhouette fill={face} />
    </svg>
  )
}
