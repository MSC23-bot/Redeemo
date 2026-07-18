import React from 'react'
import Svg, { Path, Line } from 'react-native-svg'
import { color } from '../tokens'

/**
 * Map W2b round 5 — the crisp FILLED brand-red ticket mark (owner
 * rejected both the dashed-border stub and the lucide Ticket glyph).
 *
 * A horizontal ticket silhouette drawn as ONE path in a 16x12 viewBox:
 * rounded corners (r=2), two semicircular side notches (r=1.6) cut into
 * the mid-left/mid-right edges (both arcs sweep-0: on-screen
 * counter-clockwise, which bows them INTO the body), and a tiny white
 * dashed perforation line inside the left stub. Renders at ~16x12; scale
 * via `size` (height keeps the 12/16 ratio).
 *
 * Reused as the voucher-count identity mark in value lines (VoucherValue:
 * list rows + carousel card). The Map pin lockup's ticket mark (W2a's
 * file) deliberately does NOT import this yet — W2a adopts it after this
 * lands (lead coordination note).
 */

const TICKET_PATH =
  'M2 0 H14 A2 2 0 0 1 16 2 V4.4 A1.6 1.6 0 0 0 16 7.6 V10 ' +
  'A2 2 0 0 1 14 12 H2 A2 2 0 0 1 0 10 V7.6 A1.6 1.6 0 0 0 0 4.4 V2 A2 2 0 0 1 2 0 Z'

type Props = {
  /** Rendered width in pt (height = size x 12/16). Default 16. */
  size?:   number
  fill?:   string
  testID?: string
}

export function TicketMark({ size = 16, fill = color.brandRose, testID }: Props) {
  return (
    <Svg width={size} height={size * (12 / 16)} viewBox="0 0 16 12" testID={testID}>
      <Path d={TICKET_PATH} fill={fill} />
      <Line
        x1={4.8}
        y1={2.4}
        x2={4.8}
        y2={9.6}
        stroke="#FFFFFF"
        strokeWidth={1}
        strokeDasharray="1.7 1.5"
        strokeLinecap="round"
      />
    </Svg>
  )
}
