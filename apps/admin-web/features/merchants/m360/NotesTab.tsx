'use client'

/**
 * NotesTab: internal per-merchant admin notes (Merchant 360 Tab 8, D51; backend
 * packet 2026-07-13, PR #510). Renders over the MerchantNote read/write contract
 * (lib/api/merchantNotes.ts): list newest-first, add, edit-own+active,
 * retract-own+active (soft-delete). Every note carries its event history.
 *
 * OWNER-LOCKED DEVIATIONS from the prototype's Tab 8 (OD2, grill-me 2026-07-10):
 *   - Access is ALL ROLES read + write via the UNIVERSAL `merchant:notes`
 *     capability. There is NO notes:read / notes:write split, NO SALES role, and
 *     NO read-only banner: every admin who can open this tab can also write.
 *     The prototype's role-gated read/write/no-access states are NOT built.
 *   - NO attachments. The prototype's "Attach a file" affordance is omitted
 *     entirely (no attachment storage model in v1).
 *   - NO moderation override. Edit and retract are OWN + ACTIVE only, matching
 *     the backend; not even a SUPER_ADMIN edits or retracts another author's
 *     note in v1.
 *
 * Own-note detection: the note's `authorAdminId` compared to the session admin
 * id (`useSession().adminId`, the JWT `sub`). Own + ACTIVE notes get the Edit /
 * Retract actions; everyone sees every note's body and History.
 *
 * priorBody-in-history choice: the History toggle shows the EVENT TRAIL only
 * (who + when per ADDED / EDITED / RETRACTED), NOT the prior body contents the
 * EDITED event carries. v1 keeps the surface simple: the trail proves an edit
 * happened and who did it; surfacing every prior version is a later refinement.
 *
 * Gating: `merchant:notes` is universal, so the denied state should not normally
 * render, but the tab still fail-closes on it (defence-in-depth) exactly like
 * the sibling tabs, and passes `enabled` down so a denied admin never fires the
 * read. The page already gates the whole workspace on `merchant:read`.
 */
import { useRef, useState } from 'react'
import { Loader2, Pencil, History as HistoryIcon, Archive } from 'lucide-react'
import { useSession } from '@/lib/auth/useSession'
import {
  useMerchantNotes,
  useAddMerchantNote,
  useEditMerchantNote,
  useRetractMerchantNote,
} from '@/lib/merchants/useMerchantNotes'
import { BODY_LIMIT } from '@/lib/api/merchantNotes'
import type { MerchantNote, MerchantNoteEvent } from '@/lib/api/merchantNotes'
import { Badge } from '@/features/shared/Badge'
import type { BadgeTone } from '@/features/shared/Badge'
import { ForbiddenState } from '@/features/shared/ForbiddenState'
import { ErrorState } from '@/features/shared/ErrorState'
import { NamedGateBanner } from '@/features/review/NamedGateBanner'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

// Show the remaining-characters counter only as the body approaches the cap.
const COUNTER_THRESHOLD = BODY_LIMIT - 200

// The no-personal-data reminder (OD2) reused by the composer and the retract
// dialog: neither a note body nor a retract reason is a place for customer PII.
const NO_PII_HINT =
  'Do not record customer personal data here. Customer-side notes are DSAR data and live on Customer 360, not on this tab.'

const londonDateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/London',
})

function formatLondon(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '-' : londonDateTimeFmt.format(d)
}

function statusPill(status: string): { label: string; tone: BadgeTone } {
  return status === 'RETRACTED'
    ? { label: 'Retracted', tone: 'neutral' }
    : { label: 'Active', tone: 'success' }
}

const EVENT_LABEL: Record<string, string> = {
  ADDED: 'Added',
  EDITED: 'Edited',
  RETRACTED: 'Retracted',
}

function eventActionLabel(action: string): string {
  return EVENT_LABEL[action] ?? action
}

function authorLabel(adminId: string, currentAdminId: string | null): string {
  return currentAdminId && adminId === currentAdminId ? `${adminId} (you)` : adminId
}

// ── History trail (event who + when; never the prior body contents) ──────────

function HistoryTrail({ events, noteId }: { events: MerchantNoteEvent[]; noteId: string }) {
  return (
    <ol
      className="mt-3 space-y-1.5 border-t border-border pt-3"
      data-testid={`note-history-${noteId}`}
    >
      {events.map((ev) => (
        <li key={ev.id} className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{eventActionLabel(ev.action)}</span>
          {' by '}
          {ev.actorAdminId}
          {' on '}
          {formatLondon(ev.createdAt)}
          {ev.action === 'RETRACTED' && ev.reason ? (
            <span className="mt-0.5 block italic">Reason: {ev.reason}</span>
          ) : null}
        </li>
      ))}
    </ol>
  )
}

// ── Retract dialog (reason required + no-PII hint) ───────────────────────────

function RetractNoteDialog({
  onConfirm,
  onCancel,
  isPending,
  error,
}: {
  onConfirm: (reason: string) => void
  onCancel: () => void
  isPending: boolean
  error: unknown
}) {
  const [reason, setReason] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const trimmed = reason.trim()
  const canSubmit = trimmed.length > 0 && !isPending

  return (
    <Dialog
      label="Retract note"
      onClose={onCancel}
      scrimTestId="retract-note-scrim"
      panelTestId="retract-note-dialog"
      initialFocusRef={textareaRef}
    >
      <h2 className="mb-1 text-base font-semibold text-foreground">Retract this note</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Retracting is a soft-delete for accountability: the note stays in the record marked
        retracted, and nothing is ever hard-deleted. A reason is required.
      </p>

      <label htmlFor="retract-note-reason" className="mb-1.5 block text-sm font-medium text-foreground">
        Reason for retraction
      </label>
      <textarea
        id="retract-note-reason"
        ref={textareaRef}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        maxLength={500}
        placeholder="Explain why this note is being retracted."
        className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="retract-note-reason"
      />
      <p className="mt-2 text-xs text-muted-foreground">{NO_PII_HINT}</p>

      {error ? (
        <div className="mt-3">
          <NamedGateBanner error={error} />
        </div>
      ) : null}

      <div className="mt-5 flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isPending}
          data-testid="retract-note-cancel"
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={() => canSubmit && onConfirm(trimmed)}
          disabled={!canSubmit}
          data-testid="retract-note-submit"
        >
          {isPending ? 'Retracting...' : 'Retract note'}
        </Button>
      </div>
    </Dialog>
  )
}

// ── Note card ────────────────────────────────────────────────────────────────

interface NoteCardProps {
  note: MerchantNote
  currentAdminId: string | null
  isEditing: boolean
  editDraft: string
  onEditDraftChange: (v: string) => void
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: () => void
  editIsPending: boolean
  editError: unknown
  historyOpen: boolean
  onToggleHistory: () => void
  onStartRetract: () => void
}

function NoteCard({
  note,
  currentAdminId,
  isEditing,
  editDraft,
  onEditDraftChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  editIsPending,
  editError,
  historyOpen,
  onToggleHistory,
  onStartRetract,
}: NoteCardProps) {
  const pill = statusPill(note.status)
  const isRetracted = note.status === 'RETRACTED'
  const isOwn = currentAdminId != null && note.authorAdminId === currentAdminId
  const canAct = isOwn && !isRetracted
  const editTrimmed = editDraft.trim()
  const editCanSave = editTrimmed.length > 0 && editTrimmed !== note.body && !editIsPending

  return (
    <li
      className="rounded-lg border border-border bg-card p-4"
      data-testid={`note-card-${note.id}`}
    >
      {/* Header: author + timestamp + status. */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground" data-testid={`note-author-${note.id}`}>
            {authorLabel(note.authorAdminId, currentAdminId)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{formatLondon(note.createdAt)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {note.editedAt && !isRetracted ? (
            <Badge tone="neutral">
              <span data-testid={`note-edited-${note.id}`}>Edited</span>
            </Badge>
          ) : null}
          <Badge tone={pill.tone}>
            <span data-testid={`note-status-${note.id}`}>{pill.label}</span>
          </Badge>
        </div>
      </div>

      {/* Body (inline edit for own + active notes). */}
      {isEditing ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={editDraft}
            onChange={(e) => onEditDraftChange(e.target.value)}
            rows={4}
            maxLength={BODY_LIMIT}
            className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid={`note-edit-textarea-${note.id}`}
          />
          <p className="text-xs text-muted-foreground">
            The prior version is kept in this note&apos;s history when you save.
          </p>
          {editError ? <NamedGateBanner error={editError} /> : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCancelEdit}
              disabled={editIsPending}
              data-testid={`note-edit-cancel-${note.id}`}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={onSaveEdit}
              disabled={!editCanSave}
              data-testid={`note-edit-save-${note.id}`}
            >
              {editIsPending ? 'Saving...' : 'Save changes'}
            </Button>
          </div>
        </div>
      ) : (
        <p
          className={`mt-3 whitespace-pre-wrap text-sm ${
            isRetracted ? 'text-muted-foreground line-through' : 'text-foreground'
          }`}
          data-testid={`note-body-${note.id}`}
        >
          {note.body}
        </p>
      )}

      {/* Retracted meta. */}
      {isRetracted ? (
        <div
          className="mt-3 rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground"
          data-testid={`note-retracted-meta-${note.id}`}
        >
          <p>
            Retracted by {note.retractedById ?? 'unknown'}
            {note.retractedAt ? ` on ${formatLondon(note.retractedAt)}` : ''}.
          </p>
          {note.retractedReason ? (
            <p className="mt-1 italic">Reason: {note.retractedReason}</p>
          ) : null}
          <p className="mt-1">Soft-delete for accountability: nothing is ever hard-deleted.</p>
        </div>
      ) : null}

      {/* Actions row: History (everyone) + Edit / Retract (own + active only). */}
      {!isEditing ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <button
            type="button"
            onClick={onToggleHistory}
            className="inline-flex items-center gap-1.5 rounded-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid={`note-history-toggle-${note.id}`}
            aria-expanded={historyOpen}
          >
            <HistoryIcon className="size-4" aria-hidden="true" />
            History ({note.events.length})
          </button>
          {canAct ? (
            <>
              <button
                type="button"
                onClick={onStartEdit}
                className="inline-flex items-center gap-1.5 rounded-sm font-medium text-primary transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid={`note-edit-${note.id}`}
              >
                <Pencil className="size-4" aria-hidden="true" />
                Edit
              </button>
              <button
                type="button"
                onClick={onStartRetract}
                className="inline-flex items-center gap-1.5 rounded-sm font-medium text-destructive transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid={`note-retract-${note.id}`}
              >
                <Archive className="size-4" aria-hidden="true" />
                Retract
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {historyOpen ? <HistoryTrail events={note.events} noteId={note.id} /> : null}
    </li>
  )
}

// ── Tab ──────────────────────────────────────────────────────────────────────

interface NotesTabProps {
  merchantId: string
}

export function NotesTab({ merchantId }: NotesTabProps) {
  const { adminId, can } = useSession()
  const canNotes = can('merchant:notes')

  const { data, isLoading, isError, refetch } = useMerchantNotes(merchantId, { enabled: canNotes })
  const addMutation = useAddMerchantNote(merchantId)
  const editMutation = useEditMerchantNote(merchantId)
  const retractMutation = useRetractMerchantNote(merchantId)

  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [historyOpen, setHistoryOpen] = useState<Set<string>>(new Set())
  const [retractingId, setRetractingId] = useState<string | null>(null)

  // Fail-closed (defence-in-depth): merchant:notes is universal, so this should
  // not normally render, but the tab never renders notes without the capability.
  if (!canNotes) {
    return (
      <ForbiddenState
        variant="section"
        heading="Notes"
        subject="this merchant's internal notes"
        capability="merchant:notes"
        testId="workspace-notes-denied"
      />
    )
  }

  const draftTrimmed = draft.trim()
  const canSaveNote = draftTrimmed.length > 0 && !addMutation.isPending
  const remaining = BODY_LIMIT - draft.length

  async function handleAdd() {
    if (draftTrimmed.length === 0 || addMutation.isPending) return
    try {
      await addMutation.mutateAsync(draftTrimmed)
      setDraft('')
    } catch {
      // Error surfaces via addMutation.error (NamedGateBanner below).
    }
  }

  function startEdit(note: MerchantNote) {
    setEditingId(note.id)
    setEditDraft(note.body)
    editMutation.reset()
  }
  function cancelEdit() {
    setEditingId(null)
    setEditDraft('')
    editMutation.reset()
  }
  async function saveEdit(noteId: string) {
    const body = editDraft.trim()
    if (body.length === 0 || editMutation.isPending) return
    try {
      await editMutation.mutateAsync({ noteId, body })
      setEditingId(null)
      setEditDraft('')
    } catch {
      // Error surfaces via editMutation.error inside the card.
    }
  }

  function toggleHistory(noteId: string) {
    setHistoryOpen((prev) => {
      const next = new Set(prev)
      if (next.has(noteId)) next.delete(noteId)
      else next.add(noteId)
      return next
    })
  }

  function startRetract(noteId: string) {
    setRetractingId(noteId)
    retractMutation.reset()
  }
  function cancelRetract() {
    setRetractingId(null)
    retractMutation.reset()
  }
  async function confirmRetract(reason: string) {
    if (retractingId == null) return
    try {
      await retractMutation.mutateAsync({ noteId: retractingId, reason })
      setRetractingId(null)
    } catch {
      // Error surfaces via retractMutation.error inside the dialog.
    }
  }

  const notes = data ?? []

  return (
    <div className="space-y-5" data-testid="workspace-notes">
      <h2 className="text-sm font-semibold text-foreground">Notes</h2>

      {/* Honesty banner: what this surface is (and is not). */}
      <div
        className="rounded-md border border-border bg-secondary/30 px-4 py-3 text-sm text-muted-foreground"
        data-testid="notes-banner"
      >
        <p className="text-foreground">
          Internal notes about this business. Audited. Factual and professional. Customer-side
          notes are DSAR data and do not live here.
        </p>
        <p className="mt-1.5">{NO_PII_HINT}</p>
      </div>

      {/* Composer. */}
      <section className="space-y-2" data-testid="note-composer">
        <label htmlFor="note-composer-textarea" className="block text-sm font-medium text-foreground">
          Add an internal note
        </label>
        <textarea
          id="note-composer-textarea"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          maxLength={BODY_LIMIT}
          placeholder="Add a factual, professional note about this business."
          className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="note-composer-textarea"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          {draft.length >= COUNTER_THRESHOLD ? (
            <span className="text-xs text-muted-foreground" data-testid="note-composer-counter">
              {remaining} characters left
            </span>
          ) : (
            <span />
          )}
          <Button
            type="button"
            onClick={handleAdd}
            disabled={!canSaveNote}
            data-testid="note-composer-save"
          >
            {addMutation.isPending ? 'Saving...' : 'Save note'}
          </Button>
        </div>
        {addMutation.error ? <NamedGateBanner error={addMutation.error} /> : null}
      </section>

      {/* List / states. */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16" data-testid="workspace-notes-loading">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading" />
        </div>
      ) : isError ? (
        <ErrorState
          subject="this merchant's notes"
          onRetry={refetch}
          testId="workspace-notes-error"
        />
      ) : notes.length === 0 ? (
        <div
          className="rounded-lg border border-dashed border-border bg-card px-4 py-8 text-center"
          data-testid="notes-empty"
        >
          <p className="text-sm text-muted-foreground">
            No notes yet. Add the first internal note about this business above.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              currentAdminId={adminId}
              isEditing={editingId === note.id}
              editDraft={editDraft}
              onEditDraftChange={setEditDraft}
              onStartEdit={() => startEdit(note)}
              onCancelEdit={cancelEdit}
              onSaveEdit={() => saveEdit(note.id)}
              editIsPending={editMutation.isPending}
              editError={editingId === note.id ? editMutation.error : null}
              historyOpen={historyOpen.has(note.id)}
              onToggleHistory={() => toggleHistory(note.id)}
              onStartRetract={() => startRetract(note.id)}
            />
          ))}
        </ul>
      )}

      {retractingId != null ? (
        <RetractNoteDialog
          onConfirm={confirmRetract}
          onCancel={cancelRetract}
          isPending={retractMutation.isPending}
          error={retractMutation.error}
        />
      ) : null}
    </div>
  )
}
