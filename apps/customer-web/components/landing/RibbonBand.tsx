'use client'

import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { useRef } from 'react'
import { useScrollLinked } from './scroll'

/**
 * The section-seam ribbon, final form (owner 2026-07-08): a real 3D satin
 * ribbon render (generated in the same visual language as the hero artwork,
 * cut out, brand-graded) instead of hand-drawn SVG, which never matched the
 * artwork's satin. The seam still follows the band: its true top and bottom
 * edges were sampled from the PNG's alpha and baked in as fill paths, so
 * topColor meets bottomColor exactly along the fabric. Decorative only.
 */

const VIEW_W = 1280
const VIEW_H = 249

const TOP_FILL = 'M-120 -120 L1400 -120 L1400 61 L1272 61 L1264 60 L1256 60 L1248 59 L1240 58 L1232 57 L1224 56 L1216 56 L1208 55 L1200 55 L1192 54 L1184 54 L1176 53 L1168 53 L1160 52 L1152 52 L1144 51 L1136 50 L1128 49 L1120 48 L1112 48 L1104 47 L1096 46 L1088 45 L1080 44 L1072 43 L1064 42 L1056 41 L1048 40 L1040 39 L1032 38 L1024 37 L1016 36 L1008 35 L1000 34 L992 32 L984 31 L976 30 L968 28 L960 27 L952 24 L944 23 L936 21 L928 20 L920 18 L912 16 L904 14 L896 13 L888 12 L880 11 L872 10 L864 9 L856 9 L848 9 L840 9 L832 10 L824 11 L816 13 L808 15 L800 18 L792 19 L784 21 L776 22 L768 24 L760 25 L752 27 L744 28 L736 30 L728 31 L720 32 L712 33 L704 34 L696 36 L688 37 L680 38 L672 39 L664 39 L656 41 L648 42 L640 43 L632 44 L624 45 L616 46 L608 47 L600 48 L592 49 L584 50 L576 51 L568 52 L560 53 L552 54 L544 55 L536 57 L528 60 L520 64 L512 69 L504 75 L496 81 L488 82 L480 81 L472 81 L464 80 L456 79 L448 79 L440 78 L432 77 L424 77 L416 76 L408 75 L400 74 L392 73 L384 72 L376 71 L368 71 L360 70 L352 69 L344 69 L336 68 L328 67 L320 66 L312 65 L304 64 L296 64 L288 63 L280 63 L272 62 L264 62 L256 62 L248 62 L240 61 L232 61 L224 61 L216 61 L208 60 L200 60 L192 60 L184 60 L176 60 L168 59 L160 59 L152 59 L144 58 L136 58 L128 58 L120 57 L112 57 L104 56 L96 56 L88 55 L80 55 L72 55 L64 54 L56 54 L48 54 L40 53 L32 53 L24 52 L16 51 L8 50 L0 47 L-120 47 Z'
const BOTTOM_FILL = 'M-120 221 L0 221 L8 222 L16 222 L24 222 L32 223 L40 223 L48 223 L56 223 L64 223 L72 223 L80 223 L88 223 L96 223 L104 224 L112 224 L120 225 L128 226 L136 226 L144 227 L152 228 L160 229 L168 230 L176 231 L184 232 L192 233 L200 234 L208 235 L216 236 L224 237 L232 238 L240 238 L248 238 L256 239 L264 239 L272 239 L280 238 L288 237 L296 236 L304 235 L312 234 L320 232 L328 230 L336 227 L344 224 L352 221 L360 219 L368 216 L376 214 L384 212 L392 210 L400 208 L408 206 L416 204 L424 203 L432 201 L440 199 L448 197 L456 195 L464 193 L472 191 L480 189 L488 187 L496 186 L504 184 L512 182 L520 180 L528 178 L536 177 L544 174 L552 173 L560 170 L568 169 L576 166 L584 164 L592 162 L600 161 L608 159 L616 157 L624 155 L632 156 L640 157 L648 158 L656 159 L664 160 L672 161 L680 162 L688 164 L696 165 L704 166 L712 167 L720 168 L728 169 L736 170 L744 172 L752 173 L760 174 L768 175 L776 176 L784 177 L792 178 L800 179 L808 180 L816 180 L824 181 L832 182 L840 183 L848 183 L856 184 L864 185 L872 185 L880 186 L888 186 L896 187 L904 187 L912 188 L920 188 L928 188 L936 188 L944 188 L952 189 L960 189 L968 189 L976 188 L984 188 L992 188 L1000 188 L1008 187 L1016 187 L1024 187 L1032 186 L1040 186 L1048 186 L1056 186 L1064 186 L1072 186 L1080 186 L1088 186 L1096 187 L1104 187 L1112 187 L1120 187 L1128 188 L1136 188 L1144 189 L1152 190 L1160 191 L1168 192 L1176 193 L1184 194 L1192 195 L1200 196 L1208 198 L1216 199 L1224 201 L1232 202 L1240 204 L1248 206 L1256 208 L1264 210 L1272 212 L1400 212 L1400 369 L-120 369 Z'

export function RibbonBand({
  flip = false,
  topColor,
  bottomColor,
}: {
  flip?: boolean
  topColor: string
  bottomColor: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })

  const x = useScrollLinked(useTransform(scrollYProgress, [0, 1], [-30, 30]))
  const sheenNum = useScrollLinked(useTransform(scrollYProgress, [0, 1], [-30, 130]))
  const sheenX = useTransform(sheenNum, (v) => `${v}%`)

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="relative pointer-events-none select-none h-[110px] md:h-[190px] overflow-hidden"
      style={{ background: topColor }}
    >
      <motion.div
        className="absolute -inset-x-[3%] inset-y-0"
        style={{ x: reduceMotion ? 0 : x, scaleX: flip ? -1 : 1 }}
      >
        {/* The seam follows the fabric: fills trace the band's real edges */}
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <path d={TOP_FILL} fill={topColor} />
          <path d={BOTTOM_FILL} fill={bottomColor} />
        </svg>

        {/* The satin band itself */}
        <img src="/ribbon/band.png" alt="" className="absolute inset-0 h-full w-full" style={{ objectFit: 'fill' }} />

        {/* A soft light sweep along the fabric, clipped by its own alpha */}
        {!reduceMotion && (
          <motion.div
            className="absolute inset-0"
            style={{
              WebkitMaskImage: 'url(/ribbon/band.png)',
              maskImage: 'url(/ribbon/band.png)',
              WebkitMaskSize: '100% 100%',
              maskSize: '100% 100%',
              background:
                'linear-gradient(100deg, rgba(255,255,255,0) 40%, rgba(255,255,255,0.28) 50%, rgba(255,255,255,0) 60%)',
              backgroundSize: '300% 100%',
              backgroundPositionX: sheenX,
            }}
          />
        )}
      </motion.div>
    </div>
  )
}
