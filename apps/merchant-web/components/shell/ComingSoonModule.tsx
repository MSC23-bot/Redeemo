/**
 * Shell wave: the honest under-construction module shell (roadmap §2 "generic
 * coming-soon module shell" - the shell-wave fix for the former `#` dead links).
 * Structural pattern follows the prototype teaser pages: coral eyebrow + grey
 * status pill, display H1, intro copy, optional preview cards, closing footnote.
 * Nothing here pretends to work: no dead buttons, no fake data.
 */
import type { ComponentType, ReactNode } from 'react'

export interface PreviewCard {
  icon: ComponentType<{ size?: number }>
  title: string
  body: string
}

export function ComingSoonModule({
  eyebrow,
  badge = 'Coming soon',
  title,
  intro,
  cards,
  cardsHeading = 'What is coming',
  footnote,
  children,
}: {
  eyebrow: string
  badge?: string
  title: string
  intro: string
  cards?: PreviewCard[]
  cardsHeading?: string
  footnote?: string
  children?: ReactNode
}) {
  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.13em] text-[#E84A00]">{eyebrow}</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F3F4F6] px-2.5 py-0.5 text-[11.5px] font-bold text-[#566079]">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#9CA3AF]" />
            {badge}
          </span>
        </div>
        <h1 className="font-display text-3xl font-semibold text-foreground">{title}</h1>
        <p className="max-w-[62ch] text-[15px] leading-relaxed text-[#566079]">{intro}</p>
      </header>

      {children}

      {cards && cards.length > 0 && (
        <section className="space-y-3">
          <div className="text-[11px] font-extrabold uppercase tracking-[0.13em] text-[#8089A4]">{cardsHeading}</div>
          <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            {cards.map((card) => {
              const Icon = card.icon
              return (
                <div key={card.title} className="relative rounded-[18px] border border-[#EFE7E2] bg-white p-5">
                  <span className="absolute right-4 top-4 rounded-full bg-[#F3F4F6] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#6B7390]">
                    Preview
                  </span>
                  <span aria-hidden className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFF1EC] text-[#E84A00]">
                    <Icon size={20} />
                  </span>
                  <h3 className="mt-3 font-display text-[17px] font-semibold text-foreground">{card.title}</h3>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-[#566079]">{card.body}</p>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {footnote && <p className="text-[13px] text-[#8089A4]">{footnote}</p>}
    </div>
  )
}
