import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { discoveryApi } from '@/lib/api'
import { MerchantTile } from '@/components/ui/MerchantTile'

/** "Food & Drink" → "food-drink" */
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

type Props = { params: Promise<{ slug: string }> }

/** Resolve slug → category object */
async function getCategory(slug: string) {
  const data = await discoveryApi.categories().catch(() => null)
  if (!data) return null
  return data.categories.find(c => toSlug(c.name) === slug) ?? null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const category = await getCategory(slug)
  if (!category) return { title: 'Category not found' }
  return {
    title: `${category.name} — Discover local`,
    description: `Browse independent ${category.name.toLowerCase()} businesses near you on Redeemo. Subscribe to unlock exclusive vouchers.`,
  }
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params
  const category = await getCategory(slug)
  if (!category) notFound()

  const result = await discoveryApi
    .search({ categoryId: category.id, limit: 48, sortBy: 'nearest' })
    .catch(() => ({ results: [], total: 0 }))

  const merchants = result.results
  const total = result.total

  return (
    <>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-[#010C35] py-14 md:py-18 px-6">
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(500px circle at 90% -8%, rgba(226,12,4,0.24), transparent 55%), radial-gradient(380px circle at 5% 112%, rgba(200,50,0,0.16), transparent 55%)',
          }}
        />
        <div className="relative max-w-7xl mx-auto">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[12px] text-white/35 mb-5">
            <Link href="/discover" className="hover:text-white/65 transition-colors no-underline">
              Discover
            </Link>
            <span aria-hidden="true">/</span>
            <span className="text-white/65">{category.name}</span>
          </nav>
          <h1
            className="font-display text-white leading-[1.08] mb-3"
            style={{ fontSize: 'clamp(30px, 4vw, 48px)', letterSpacing: '-0.4px' }}
          >
            {category.name}
          </h1>
          <p className="text-[14px] text-white/42">
            {total > 0 ? `${total} merchant${total !== 1 ? 's' : ''} near you` : 'Merchants coming soon in this category'}
          </p>
        </div>
      </section>

      {/* ── Merchant grid ── */}
      <section className="bg-[#F8F7F5] py-10 md:py-14 px-6">
        <div className="max-w-7xl mx-auto">
          {merchants.length === 0 ? (
            <div className="text-center py-20">
              <p className="font-display text-[#010C35] text-[22px] mb-3">No merchants yet</p>
              <p className="text-[14px] text-[#9CA3AF] max-w-[360px] mx-auto mb-8 leading-[1.7]">
                We are still growing the {category.name} network. Check back soon, or explore other categories.
              </p>
              <Link
                href="/discover"
                className="inline-block text-white font-semibold text-[14px] px-6 py-3 rounded-lg no-underline hover:opacity-90 transition-opacity"
                style={{ background: 'var(--brand-gradient)' }}
              >
                Browse all merchants
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {merchants.map((merchant, i) => (
                <MerchantTile
                  key={merchant.id}
                  merchant={merchant}
                  index={i}
                  variant="grid"
                />
              ))}
            </div>
          )}

          {/* Load more placeholder — pagination not yet wired */}
          {total > merchants.length && (
            <p className="text-center text-[13px] text-[#9CA3AF] mt-10">
              Showing {merchants.length} of {total} merchants.{' '}
              <Link href={`/discover?categoryId=${category.id}`} className="text-[#E20C04] no-underline hover:underline">
                See all on the discover page
              </Link>
            </p>
          )}
        </div>
      </section>
    </>
  )
}
