/**
 * NotesTab (Merchant 360 Tab 8, D51). Covers the load-bearing contract:
 *   - composer disabled until non-empty; add flow calls the add mutation
 *   - own + active notes get Edit / Retract; other-author and retracted notes do not
 *   - inline edit flow calls the edit mutation with { noteId, body }
 *   - retract requires a reason before submit; confirm calls the retract mutation
 *   - retracted rendering (strike-through body + soft-delete meta + reason)
 *   - History toggle shows the event trail (who + when) but NEVER the prior body
 *   - loading / error / empty / denied states
 *   - NOTE_* error codes map to human copy via NamedGateBanner
 *
 * useSession and the notes hooks are mocked; the mutation stubs mirror the
 * RmvCoBuildDialog test idiom (module-level mutables the jest.mock factory reads).
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NotesTab } from '../NotesTab'
import { ApiError } from '@/lib/api/client'
import type { MerchantNote } from '@/lib/api/merchantNotes'

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/lib/auth/useSession', () => ({ useSession: jest.fn() }))

let mockNotesQuery: {
  data: MerchantNote[] | undefined
  isLoading: boolean
  isError: boolean
  isFetching: boolean
  refetch: jest.Mock
}
let mockAdd: { mutateAsync: jest.Mock; isPending: boolean; error: unknown; reset: jest.Mock }
let mockEdit: { mutateAsync: jest.Mock; isPending: boolean; error: unknown; reset: jest.Mock }
let mockRetract: { mutateAsync: jest.Mock; isPending: boolean; error: unknown; reset: jest.Mock }
const mockUseMerchantNotes = jest.fn()

jest.mock('@/lib/merchants/useMerchantNotes', () => ({
  useMerchantNotes: (merchantId: string, options?: { enabled?: boolean }) => {
    mockUseMerchantNotes(merchantId, options)
    return mockNotesQuery
  },
  useAddMerchantNote: () => mockAdd,
  useEditMerchantNote: () => mockEdit,
  useRetractMerchantNote: () => mockRetract,
}))

import { useSession } from '@/lib/auth/useSession'
const mockedUseSession = useSession as jest.MockedFunction<typeof useSession>

function mockSession(overrides: { can?: (cap: string) => boolean; adminId?: string | null } = {}) {
  mockedUseSession.mockReturnValue({
    accessToken: 'tok',
    ready: true,
    isAuthenticated: true,
    role: 'OPERATIONS' as never,
    email: 'ops@redeemo.co.uk',
    adminId: overrides.adminId ?? 'admin-me',
    can: overrides.can ?? (() => true),
    setSession: jest.fn(),
    refresh: jest.fn(),
    signOut: jest.fn(),
  })
}

function makeNote(overrides: Partial<MerchantNote> = {}): MerchantNote {
  return {
    id: 'note-1',
    merchantId: 'm-1',
    authorAdminId: 'admin-me',
    body: 'Called the owner about the renewal.',
    status: 'ACTIVE',
    editedAt: null,
    retractedById: null,
    retractedAt: null,
    retractedReason: null,
    createdAt: '2026-07-14T09:00:00.000Z',
    updatedAt: '2026-07-14T09:00:00.000Z',
    events: [
      {
        id: 'ev-1',
        noteId: 'note-1',
        action: 'ADDED',
        actorAdminId: 'admin-me',
        priorBody: null,
        reason: null,
        createdAt: '2026-07-14T09:00:00.000Z',
      },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  mockSession()
  mockNotesQuery = {
    data: [],
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: jest.fn(),
  }
  mockAdd = { mutateAsync: jest.fn().mockResolvedValue(makeNote()), isPending: false, error: null, reset: jest.fn() }
  mockEdit = { mutateAsync: jest.fn().mockResolvedValue(makeNote()), isPending: false, error: null, reset: jest.fn() }
  mockRetract = { mutateAsync: jest.fn().mockResolvedValue(makeNote()), isPending: false, error: null, reset: jest.fn() }
})

afterEach(() => jest.clearAllMocks())

// ── Banner + composer ─────────────────────────────────────────────────────────

describe('NotesTab banner + composer', () => {
  it('renders the honesty banner naming DSAR / customer-side notes', () => {
    render(<NotesTab merchantId="m-1" />)
    const banner = screen.getByTestId('notes-banner')
    expect(banner).toHaveTextContent(/customer-side notes are DSAR data/i)
    expect(banner).toHaveTextContent(/do not record customer personal data/i)
  })

  it('disables Save note until the composer is non-empty', () => {
    render(<NotesTab merchantId="m-1" />)
    expect(screen.getByTestId('note-composer-save')).toBeDisabled()
    fireEvent.change(screen.getByTestId('note-composer-textarea'), { target: { value: '  ' } })
    expect(screen.getByTestId('note-composer-save')).toBeDisabled()
    fireEvent.change(screen.getByTestId('note-composer-textarea'), { target: { value: 'A real note' } })
    expect(screen.getByTestId('note-composer-save')).not.toBeDisabled()
  })

  it('add flow calls the add mutation with the trimmed body and clears the composer', async () => {
    render(<NotesTab merchantId="m-1" />)
    const textarea = screen.getByTestId('note-composer-textarea')
    fireEvent.change(textarea, { target: { value: '  New note body  ' } })
    fireEvent.click(screen.getByTestId('note-composer-save'))
    await waitFor(() => expect(mockAdd.mutateAsync).toHaveBeenCalledWith('New note body'))
    await waitFor(() => expect(textarea).toHaveValue(''))
  })

  it('renders NamedGateBanner copy for a composer error code', () => {
    mockAdd.error = new ApiError(404, { error: { code: 'MERCHANT_NOT_FOUND' } })
    render(<NotesTab merchantId="m-1" />)
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent(/merchant not found/i)
  })
})

// ── List states ────────────────────────────────────────────────────────────────

describe('NotesTab list states', () => {
  it('shows the loading spinner', () => {
    mockNotesQuery.isLoading = true
    render(<NotesTab merchantId="m-1" />)
    expect(screen.getByTestId('workspace-notes-loading')).toBeInTheDocument()
  })

  it('shows the error state distinct from empty', () => {
    mockNotesQuery.isError = true
    render(<NotesTab merchantId="m-1" />)
    const error = screen.getByTestId('workspace-notes-error')
    expect(error).toHaveTextContent(/no items were changed/i)
    expect(screen.queryByTestId('notes-empty')).not.toBeInTheDocument()
  })

  it('shows the empty state when there are no notes', () => {
    mockNotesQuery.data = []
    render(<NotesTab merchantId="m-1" />)
    expect(screen.getByTestId('notes-empty')).toHaveTextContent(/no notes yet/i)
  })

  it('fail-closes with the shared ForbiddenState (and enabled:false) when the role lacks merchant:notes', () => {
    mockSession({ can: () => false })
    render(<NotesTab merchantId="m-1" />)
    expect(screen.getByTestId('workspace-notes-denied')).toHaveTextContent(/merchant:notes/)
    expect(mockUseMerchantNotes).toHaveBeenCalledWith('m-1', { enabled: false })
  })
})

// ── Own vs other action visibility ──────────────────────────────────────────────

describe('NotesTab action visibility', () => {
  it('shows Edit / Retract on an OWN + ACTIVE note', () => {
    mockNotesQuery.data = [makeNote({ id: 'n-own', authorAdminId: 'admin-me' })]
    render(<NotesTab merchantId="m-1" />)
    expect(screen.getByTestId('note-edit-n-own')).toBeInTheDocument()
    expect(screen.getByTestId('note-retract-n-own')).toBeInTheDocument()
  })

  it('hides Edit / Retract on another author\'s note', () => {
    mockNotesQuery.data = [makeNote({ id: 'n-other', authorAdminId: 'admin-other' })]
    render(<NotesTab merchantId="m-1" />)
    expect(screen.queryByTestId('note-edit-n-other')).not.toBeInTheDocument()
    expect(screen.queryByTestId('note-retract-n-other')).not.toBeInTheDocument()
    // Its body is still readable by everyone.
    expect(screen.getByTestId('note-body-n-other')).toBeInTheDocument()
  })

  it('hides Edit / Retract on an own but RETRACTED note', () => {
    mockNotesQuery.data = [
      makeNote({ id: 'n-ret', authorAdminId: 'admin-me', status: 'RETRACTED', retractedById: 'admin-me' }),
    ]
    render(<NotesTab merchantId="m-1" />)
    expect(screen.queryByTestId('note-edit-n-ret')).not.toBeInTheDocument()
    expect(screen.queryByTestId('note-retract-n-ret')).not.toBeInTheDocument()
  })
})

// ── Inline edit ─────────────────────────────────────────────────────────────────

describe('NotesTab inline edit', () => {
  it('prefills the inline textarea and calls the edit mutation with { noteId, body }', async () => {
    mockNotesQuery.data = [makeNote({ id: 'n-1', body: 'Original body' })]
    render(<NotesTab merchantId="m-1" />)

    fireEvent.click(screen.getByTestId('note-edit-n-1'))
    const textarea = screen.getByTestId('note-edit-textarea-n-1')
    expect(textarea).toHaveValue('Original body')
    // Save is disabled while the body is unchanged.
    expect(screen.getByTestId('note-edit-save-n-1')).toBeDisabled()

    fireEvent.change(textarea, { target: { value: 'Edited body' } })
    fireEvent.click(screen.getByTestId('note-edit-save-n-1'))

    await waitFor(() =>
      expect(mockEdit.mutateAsync).toHaveBeenCalledWith({ noteId: 'n-1', body: 'Edited body' })
    )
  })

  it('maps a NOTE_NOT_ACTIVE edit error to human copy via NamedGateBanner', () => {
    mockEdit.error = new ApiError(409, { error: { code: 'NOTE_NOT_ACTIVE' } })
    mockNotesQuery.data = [makeNote({ id: 'n-1' })]
    render(<NotesTab merchantId="m-1" />)
    fireEvent.click(screen.getByTestId('note-edit-n-1'))
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent(/already been retracted/i)
  })
})

// ── Retract ──────────────────────────────────────────────────────────────────────

describe('NotesTab retract', () => {
  it('requires a reason before confirming, then calls the retract mutation', async () => {
    mockNotesQuery.data = [makeNote({ id: 'n-1' })]
    render(<NotesTab merchantId="m-1" />)

    fireEvent.click(screen.getByTestId('note-retract-n-1'))
    expect(screen.getByTestId('retract-note-dialog')).toBeInTheDocument()
    expect(screen.getByTestId('retract-note-submit')).toBeDisabled()

    fireEvent.change(screen.getByTestId('retract-note-reason'), {
      target: { value: 'Recorded on the wrong merchant.' },
    })
    expect(screen.getByTestId('retract-note-submit')).not.toBeDisabled()

    fireEvent.click(screen.getByTestId('retract-note-submit'))
    await waitFor(() =>
      expect(mockRetract.mutateAsync).toHaveBeenCalledWith({
        noteId: 'n-1',
        reason: 'Recorded on the wrong merchant.',
      })
    )
  })

  it('renders a retracted note with a struck-through body and soft-delete meta', () => {
    mockNotesQuery.data = [
      makeNote({
        id: 'n-ret',
        status: 'RETRACTED',
        retractedById: 'admin-me',
        retractedAt: '2026-07-14T11:00:00.000Z',
        retractedReason: 'Superseded by a corrected note.',
      }),
    ]
    render(<NotesTab merchantId="m-1" />)
    expect(screen.getByTestId('note-body-n-ret').className).toMatch(/line-through/)
    const meta = screen.getByTestId('note-retracted-meta-n-ret')
    expect(meta).toHaveTextContent(/Superseded by a corrected note/i)
    expect(meta).toHaveTextContent(/nothing is ever hard-deleted/i)
  })
})

// ── History trail ─────────────────────────────────────────────────────────────────

describe('NotesTab history trail', () => {
  it('toggles the event trail (who + when) but never renders the prior body', () => {
    mockNotesQuery.data = [
      makeNote({
        id: 'n-1',
        editedAt: '2026-07-14T10:00:00.000Z',
        events: [
          {
            id: 'ev-1',
            noteId: 'n-1',
            action: 'ADDED',
            actorAdminId: 'admin-me',
            priorBody: null,
            reason: null,
            createdAt: '2026-07-14T09:00:00.000Z',
          },
          {
            id: 'ev-2',
            noteId: 'n-1',
            action: 'EDITED',
            actorAdminId: 'admin-me',
            priorBody: 'SECRET PRIOR VERSION',
            reason: null,
            createdAt: '2026-07-14T10:00:00.000Z',
          },
        ],
      }),
    ]
    render(<NotesTab merchantId="m-1" />)

    // Hidden until toggled.
    expect(screen.queryByTestId('note-history-n-1')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('note-history-toggle-n-1'))

    const history = screen.getByTestId('note-history-n-1')
    expect(history).toHaveTextContent(/Added/)
    expect(history).toHaveTextContent(/Edited/)
    // priorBody contents are NEVER surfaced in v1.
    expect(history).not.toHaveTextContent(/SECRET PRIOR VERSION/)
  })
})
