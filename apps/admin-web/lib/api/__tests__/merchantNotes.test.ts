/**
 * merchantNotes.ts: typed client for the internal per-merchant admin notes
 * routes (Merchant 360 Tab 8, D51). apiFetch is mocked to verify URL, method,
 * auth option, body, and Zod parsing; ApiError passes through unchanged so the
 * NOTE_* / MERCHANT_NOT_FOUND codes reach NamedGateBanner.
 */
import {
  merchantNotesApi,
  merchantNoteSchema,
  merchantNotesResponseSchema,
  BODY_LIMIT,
  REASON_LIMIT,
} from '../merchantNotes'
import { apiFetch, ApiError } from '../client'

jest.mock('../client', () => ({
  apiFetch: jest.fn(),
  // Re-export the real ApiError so `instanceof` checks behave.
  ApiError: jest.requireActual('../client').ApiError,
}))

const mockedApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>

afterEach(() => jest.clearAllMocks())

const NOTE = {
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
}

describe('cap constants', () => {
  it('pins BODY_LIMIT at 4000 (note body / composer / inline-edit cap)', () => {
    expect(BODY_LIMIT).toBe(4000)
  })

  it('pins REASON_LIMIT at 500 (retract reason cap)', () => {
    expect(REASON_LIMIT).toBe(500)
  })
})

describe('merchantNotesApi.list', () => {
  it('GET /admin/merchants/:id/notes with auth:true and parses the array', async () => {
    mockedApiFetch.mockResolvedValueOnce([NOTE])
    const result = await merchantNotesApi.list('m-1')
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/v1/admin/merchants/m-1/notes', { auth: true })
    expect(result).toHaveLength(1)
    expect(result[0].authorAdminId).toBe('admin-me')
    expect(result[0].events[0].action).toBe('ADDED')
  })

  it('tolerates an unknown status / action string (drift resilience)', () => {
    const drifted = [
      { ...NOTE, status: 'ARCHIVED', events: [{ ...NOTE.events[0], action: 'MERGED' }] },
    ]
    const parsed = merchantNotesResponseSchema.parse(drifted)
    expect(parsed[0].status).toBe('ARCHIVED')
    expect(parsed[0].events[0].action).toBe('MERGED')
  })

  it('throws when the note shape drifts (Zod)', async () => {
    mockedApiFetch.mockResolvedValueOnce([{ id: 'x' }])
    await expect(merchantNotesApi.list('m-1')).rejects.toThrow()
  })
})

describe('merchantNotesApi.add', () => {
  it('POSTs the body and parses the created note', async () => {
    mockedApiFetch.mockResolvedValueOnce(NOTE)
    const result = await merchantNotesApi.add('m-1', 'Called the owner about the renewal.')
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/v1/admin/merchants/m-1/notes', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ body: 'Called the owner about the renewal.' }),
    })
    expect(result.id).toBe('note-1')
  })
})

describe('merchantNotesApi.edit', () => {
  it('PATCHes the note body at the :noteId path', async () => {
    const edited = { ...NOTE, body: 'Updated body', editedAt: '2026-07-14T10:00:00.000Z' }
    mockedApiFetch.mockResolvedValueOnce(edited)
    const result = await merchantNotesApi.edit('m-1', 'note-1', 'Updated body')
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/v1/admin/merchants/m-1/notes/note-1', {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify({ body: 'Updated body' }),
    })
    expect(result.editedAt).toBe('2026-07-14T10:00:00.000Z')
  })

  it('passes an ApiError through unchanged (NOTE_NOT_AUTHOR)', async () => {
    mockedApiFetch.mockRejectedValueOnce(new ApiError(403, { error: { code: 'NOTE_NOT_AUTHOR' } }))
    await expect(merchantNotesApi.edit('m-1', 'note-1', 'x')).rejects.toMatchObject({
      code: 'NOTE_NOT_AUTHOR',
      status: 403,
    })
  })
})

describe('merchantNotesApi.retract', () => {
  it('POSTs the reason at the :noteId/retract path', async () => {
    const retracted = {
      ...NOTE,
      status: 'RETRACTED',
      retractedById: 'admin-me',
      retractedAt: '2026-07-14T11:00:00.000Z',
      retractedReason: 'Recorded on the wrong merchant.',
    }
    mockedApiFetch.mockResolvedValueOnce(retracted)
    const result = await merchantNotesApi.retract('m-1', 'note-1', 'Recorded on the wrong merchant.')
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/v1/admin/merchants/m-1/notes/note-1/retract', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ reason: 'Recorded on the wrong merchant.' }),
    })
    expect(result.status).toBe('RETRACTED')
    expect(result.retractedReason).toBe('Recorded on the wrong merchant.')
  })

  it('passes an ApiError through unchanged (NOTE_RETRACT_REASON_REQUIRED)', async () => {
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError(400, { error: { code: 'NOTE_RETRACT_REASON_REQUIRED' } })
    )
    await expect(merchantNotesApi.retract('m-1', 'note-1', '')).rejects.toMatchObject({
      code: 'NOTE_RETRACT_REASON_REQUIRED',
    })
  })
})

describe('merchantNoteSchema retracted shape', () => {
  it('accepts the fully-populated retracted fields', () => {
    const parsed = merchantNoteSchema.parse({
      ...NOTE,
      status: 'RETRACTED',
      editedAt: '2026-07-14T10:00:00.000Z',
      retractedById: 'admin-me',
      retractedAt: '2026-07-14T11:00:00.000Z',
      retractedReason: 'Superseded.',
      events: [
        NOTE.events[0],
        {
          id: 'ev-2',
          noteId: 'note-1',
          action: 'RETRACTED',
          actorAdminId: 'admin-me',
          priorBody: null,
          reason: 'Superseded.',
          createdAt: '2026-07-14T11:00:00.000Z',
        },
      ],
    })
    expect(parsed.retractedReason).toBe('Superseded.')
    expect(parsed.events).toHaveLength(2)
  })
})
