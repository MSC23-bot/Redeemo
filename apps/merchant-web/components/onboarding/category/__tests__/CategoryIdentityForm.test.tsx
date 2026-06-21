import { render, screen, fireEvent, within } from '@testing-library/react'
import { CategoryIdentityForm } from '@/components/onboarding/category/CategoryIdentityForm'
import type { OnboardingTaxonomy } from '@/lib/api/taxonomy'

// A two-category taxonomy: Food & Drink (Restaurant has CUISINE tags; Bakery has
// none) + Beauty & Wellness (Barber, no cuisine). Mirrors the real backend shape.
const TAXONOMY: OnboardingTaxonomy = {
  categories: [
    {
      id: 'cat-food',
      name: 'Food & Drink',
      parentId: null,
      eligible: true,
      subcategories: [
        {
          id: 'sub-restaurant',
          name: 'Restaurant',
          parentId: 'cat-food',
          tags: [
            { id: 'cui-modern-british', label: 'Modern British', type: 'CUISINE', isPrimaryEligible: true },
            { id: 'cui-italian', label: 'Italian', type: 'CUISINE', isPrimaryEligible: true },
            { id: 'spec-brunch', label: 'Brunch', type: 'SPECIALTY', isPrimaryEligible: false },
          ],
        },
        {
          id: 'sub-bakery',
          name: 'Bakery',
          parentId: 'cat-food',
          tags: [{ id: 'spec-sourdough', label: 'Sourdough', type: 'SPECIALTY', isPrimaryEligible: false }],
        },
        // Bar: CUISINE tags exist but are ALL isPrimaryEligible:false (mirrors the real
        // seed for Cafe & Coffee / Bakery / Dessert Shop / Bar / Food Hall). Cuisine
        // must NOT apply: a previewed cuisine could never persist as the descriptor.
        {
          id: 'sub-bar',
          name: 'Bar',
          parentId: 'cat-food',
          tags: [
            { id: 'cui-cocktail', label: 'Cocktail', type: 'CUISINE', isPrimaryEligible: false },
            { id: 'cui-wine', label: 'Wine', type: 'CUISINE', isPrimaryEligible: false },
            { id: 'spec-craft-beer', label: 'Craft Beer', type: 'SPECIALTY', isPrimaryEligible: false },
          ],
        },
      ],
    },
    {
      id: 'cat-beauty',
      name: 'Beauty & Wellness',
      parentId: null,
      eligible: true,
      subcategories: [
        {
          id: 'sub-barber',
          name: 'Barber',
          parentId: 'cat-beauty',
          tags: [{ id: 'spec-skin-fade', label: 'Skin Fade', type: 'SPECIALTY', isPrimaryEligible: false }],
        },
      ],
    },
  ],
}

function baseProps() {
  return {
    taxonomy: TAXONOMY,
    initialIdentity: null,
    hasExistingIdentity: false,
    onSave: jest.fn(),
    saving: false,
    saveError: null as string | null,
    onBack: jest.fn(),
  }
}

describe('CategoryIdentityForm', () => {
  it('renders the 11-step-2-of-6 setup pill and the primary category tiles from the taxonomy', () => {
    render(<CategoryIdentityForm {...baseProps()} />)
    expect(screen.getByText(/setup step 2 of 6/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /food & drink/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /beauty & wellness/i })).toBeInTheDocument()
  })

  it('does not show subcategories until a category is picked, then reveals that category\'s subcategories', () => {
    render(<CategoryIdentityForm {...baseProps()} />)
    expect(screen.queryByRole('button', { name: /^restaurant$/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /food & drink/i }))
    expect(screen.getByRole('button', { name: /^restaurant$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^bakery$/i })).toBeInTheDocument()
    // not the other category's subs
    expect(screen.queryByRole('button', { name: /^barber$/i })).not.toBeInTheDocument()
  })

  it('reveals the cuisine step (min 1) for a food subcategory that HAS cuisine tags, and gates save until a cuisine is picked', () => {
    const props = baseProps()
    render(<CategoryIdentityForm {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /food & drink/i }))
    fireEvent.click(screen.getByRole('button', { name: /^restaurant$/i }))
    expect(screen.getByText(/choose your cuisine/i)).toBeInTheDocument()
    // save disabled until a cuisine is selected
    const save = screen.getByRole('button', { name: /save and continue/i })
    expect(save).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /modern british/i }))
    expect(save).toBeEnabled()
  })

  it('does NOT show the cuisine step for a subcategory with no cuisine tags, and allows save without a cuisine', () => {
    render(<CategoryIdentityForm {...baseProps()} />)
    fireEvent.click(screen.getByRole('button', { name: /beauty & wellness/i }))
    fireEvent.click(screen.getByRole('button', { name: /^barber$/i }))
    expect(screen.queryByText(/choose your cuisine/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save and continue/i })).toBeEnabled()
  })

  it('hides the cuisine step for a food subcategory whose CUISINE tags are ALL non-eligible (Bar), allows save without a cuisine, and uses the subcategory name as the descriptor', () => {
    const props = baseProps()
    render(<CategoryIdentityForm {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /food & drink/i }))
    fireEvent.click(screen.getByRole('button', { name: /^bar$/i }))
    // No cuisine step, no forced pick, no un-persistable cuisine option offered.
    expect(screen.queryByText(/choose your cuisine/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^cocktail$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^wine$/i })).not.toBeInTheDocument()
    // Descriptor is exactly the subcategory name (preview === stored), nothing lost.
    expect(screen.getByTestId('category-descriptor')).toHaveTextContent('Bar')
    // Save is allowed without a cuisine.
    const save = screen.getByRole('button', { name: /save and continue/i })
    expect(save).toBeEnabled()
    fireEvent.click(save)
    expect(props.onSave).toHaveBeenCalledWith({
      subcategoryId: 'sub-bar',
      primaryDescriptorTagId: null,
      specialtyTagIds: [],
    })
  })

  it('on a food subcategory only offers the eligible cuisines and previews ONLY the primary descriptor (preview === stored)', () => {
    const props = baseProps()
    render(<CategoryIdentityForm {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /food & drink/i }))
    fireEvent.click(screen.getByRole('button', { name: /^restaurant$/i }))
    // both eligible cuisines are offered
    fireEvent.click(screen.getByRole('button', { name: /modern british/i }))
    fireEvent.click(screen.getByRole('button', { name: /^italian$/i }))
    // descriptor previews ONLY the primary (first) cuisine; the 2nd folds into specialties
    expect(screen.getByTestId('category-descriptor')).toHaveTextContent('Modern British Restaurant')
    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }))
    expect(props.onSave).toHaveBeenCalledWith({
      subcategoryId: 'sub-restaurant',
      primaryDescriptorTagId: 'cui-modern-british',
      specialtyTagIds: ['cui-italian'],
    })
  })

  it('treats specialties as optional (save stays enabled with none selected)', () => {
    render(<CategoryIdentityForm {...baseProps()} />)
    fireEvent.click(screen.getByRole('button', { name: /beauty & wellness/i }))
    fireEvent.click(screen.getByRole('button', { name: /^barber$/i }))
    expect(screen.getByText(/what you are known for/i)).toBeInTheDocument()
    expect(screen.getByText(/optional/i)).toBeInTheDocument()
    // specialty pick does not change the save gate (still enabled)
    fireEvent.click(screen.getByRole('button', { name: /skin fade/i }))
    expect(screen.getByRole('button', { name: /save and continue/i })).toBeEnabled()
  })

  it('composes the live descriptor as [primary cuisine, subcategory].join(" ") (preview === stored)', () => {
    render(<CategoryIdentityForm {...baseProps()} />)
    // empty-state copy first
    expect(screen.getByText(/pick a category to see your descriptor/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /food & drink/i }))
    fireEvent.click(screen.getByRole('button', { name: /^restaurant$/i }))
    // subcategory only at first
    expect(screen.getByTestId('category-descriptor')).toHaveTextContent('Restaurant')
    fireEvent.click(screen.getByRole('button', { name: /modern british/i }))
    expect(screen.getByTestId('category-descriptor')).toHaveTextContent('Modern British Restaurant')
    // a second cuisine folds into specialties; the descriptor still previews ONLY the
    // primary descriptor cuisine, so the preview never diverges from what persists
    fireEvent.click(screen.getByRole('button', { name: /^italian$/i }))
    expect(screen.getByTestId('category-descriptor')).toHaveTextContent('Modern British Restaurant')
  })

  it('saves the exact identity body (subcategoryId + primaryDescriptorTagId + specialtyTagIds)', () => {
    const props = baseProps()
    render(<CategoryIdentityForm {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /food & drink/i }))
    fireEvent.click(screen.getByRole('button', { name: /^restaurant$/i }))
    fireEvent.click(screen.getByRole('button', { name: /modern british/i }))
    fireEvent.click(screen.getByRole('button', { name: /^italian$/i }))
    fireEvent.click(screen.getByRole('button', { name: /brunch/i }))
    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }))
    expect(props.onSave).toHaveBeenCalledWith({
      subcategoryId: 'sub-restaurant',
      primaryDescriptorTagId: 'cui-modern-british',
      specialtyTagIds: ['spec-brunch', 'cui-italian'],
    })
  })

  it('resets the subcategory + tags when the category changes (prototype reset semantics)', () => {
    render(<CategoryIdentityForm {...baseProps()} />)
    fireEvent.click(screen.getByRole('button', { name: /food & drink/i }))
    fireEvent.click(screen.getByRole('button', { name: /^restaurant$/i }))
    fireEvent.click(screen.getByRole('button', { name: /modern british/i }))
    // switch top-level category -> subcategory + cuisine selection cleared, save disabled
    fireEvent.click(screen.getByRole('button', { name: /beauty & wellness/i }))
    expect(screen.queryByText(/choose your cuisine/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save and continue/i })).toBeDisabled()
  })

  it('renders NO "Add your own" affordance (D5: seeded tags only)', () => {
    render(<CategoryIdentityForm {...baseProps()} />)
    fireEvent.click(screen.getByRole('button', { name: /food & drink/i }))
    fireEvent.click(screen.getByRole('button', { name: /^restaurant$/i }))
    expect(screen.queryByText(/add your own/i)).not.toBeInTheDocument()
  })

  it('surfaces a save error message when one is passed', () => {
    render(<CategoryIdentityForm {...baseProps()} saveError="One or more selected tags are not available for this subcategory." />)
    expect(screen.getByRole('alert')).toHaveTextContent(/not available for this subcategory/i)
  })

  it('hydrates from initialIdentity on an edit (preselects category/subcategory/tags) without showing the change confirm on first save', () => {
    const props = {
      ...baseProps(),
      hasExistingIdentity: true,
      initialIdentity: {
        subcategoryId: 'sub-restaurant',
        primaryDescriptorTagId: 'cui-italian',
        specialtyTagIds: ['spec-brunch'],
      },
    }
    render(<CategoryIdentityForm {...props} />)
    // descriptor reflects the hydrated selection
    expect(screen.getByTestId('category-descriptor')).toHaveTextContent('Italian Restaurant')
    // saving the SAME top-level category does not trigger the change confirm
    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }))
    expect(screen.queryByText(/change your business category/i)).not.toBeInTheDocument()
    expect(props.onSave).toHaveBeenCalledTimes(1)
  })

  it('shows the change-category confirm when an existing identity\'s TOP-LEVEL category changes, and only saves after confirming', () => {
    const props = {
      ...baseProps(),
      hasExistingIdentity: true,
      initialIdentity: {
        subcategoryId: 'sub-restaurant',
        primaryDescriptorTagId: 'cui-italian',
        specialtyTagIds: [],
      },
    }
    render(<CategoryIdentityForm {...props} />)
    // change to a DIFFERENT top-level category
    fireEvent.click(screen.getByRole('button', { name: /beauty & wellness/i }))
    fireEvent.click(screen.getByRole('button', { name: /^barber$/i }))
    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }))
    // confirm dialog appears; onSave NOT yet called
    expect(props.onSave).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/change your business category/i)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: /choose a new category/i }))
    expect(props.onSave).toHaveBeenCalledWith({
      subcategoryId: 'sub-barber',
      primaryDescriptorTagId: null,
      specialtyTagIds: [],
    })
  })

  it('does NOT show the change confirm when a fresh merchant (no existing identity) picks a category', () => {
    render(<CategoryIdentityForm {...baseProps()} hasExistingIdentity={false} />)
    fireEvent.click(screen.getByRole('button', { name: /food & drink/i }))
    fireEvent.click(screen.getByRole('button', { name: /^restaurant$/i }))
    fireEvent.click(screen.getByRole('button', { name: /modern british/i }))
    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }))
    expect(screen.queryByText(/change your business category/i)).not.toBeInTheDocument()
  })
})
