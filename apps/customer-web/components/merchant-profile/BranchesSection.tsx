type Branch = {
  id: string; name: string; isOpenNow: boolean
  addressLine1: string; addressLine2: string | null; city: string; postcode: string
  phone: string | null; distance: number | null; avgRating: number | null; reviewCount: number
}

function formatDistance(metres: number | null): string | null {
  if (metres === null) return null
  if (metres < 1000) return `${Math.round(metres)}m`
  return `${(metres / 1000).toFixed(1)}km`
}

export function BranchesSection({ branches }: { branches: Branch[] }) {
  if (branches.length === 0) return null

  return (
    <section id="branches" className="px-6 py-10 border-t border-navy/[0.06]">
      <h2 className="font-display text-[22px] text-navy mb-6">
        {branches.length === 1 ? 'Location' : `${branches.length} Locations`}
      </h2>

      <div className="flex flex-col gap-4 max-w-2xl">
        {branches.map(branch => {
          const dist = formatDistance(branch.distance)
          const address = [branch.addressLine1, branch.addressLine2, branch.city, branch.postcode]
            .filter(Boolean).join(', ')

          return (
            <div
              key={branch.id}
              className="bg-white border border-navy/[0.08] rounded-2xl p-5 flex items-start justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="font-display text-[16px] text-navy">{branch.name}</span>
                  <span
                    className={`font-mono text-[10px] tracking-wide px-2.5 py-0.5 rounded-full ${
                      branch.isOpenNow
                        ? 'bg-green-50 text-green-700'
                        : 'bg-red/[0.07] text-red'
                    }`}
                  >
                    {branch.isOpenNow ? 'Open' : 'Closed'}
                  </span>
                </div>
                <p className="text-[13px] text-navy/55 leading-relaxed">{address}</p>
                {branch.phone && (
                  <a href={`tel:${branch.phone}`} className="text-[13px] text-navy/45 hover:text-navy mt-1 block">
                    {branch.phone}
                  </a>
                )}
                {branch.avgRating !== null && (
                  <span className="text-[12px] text-navy/40 mt-1 block">
                    ★ {branch.avgRating.toFixed(1)} ({branch.reviewCount} reviews)
                  </span>
                )}
              </div>
              {dist && (
                <span className="font-mono text-[12px] text-navy/35 flex-shrink-0">{dist}</span>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
