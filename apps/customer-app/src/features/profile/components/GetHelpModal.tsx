import React, { useState } from 'react'
import {
  Modal, View, Text, Pressable, FlatList, StyleSheet, SafeAreaView,
  ScrollView, TextInput, ActivityIndicator, RefreshControl,
} from 'react-native'
import { X, Plus, ChevronLeft, ChevronRight } from 'lucide-react-native'
import { useSupportTickets, useSupportTicketDetail } from '../hooks/useSupportTickets'
import { useCreateTicket } from '../hooks/useCreateTicket'
import { SUPPORT_TOPICS, type SupportTopic } from '@/lib/constants/supportTopics'
import type { TicketStatus } from '@/lib/api/support'

type ModalView = 'list' | 'detail' | 'new-form' | 'success'

interface Props {
  visible:        boolean
  onDismiss:      () => void
  initialTopic?:  SupportTopic
  initialMessage?: string
}

function statusBadge(status: TicketStatus): { label: string; color: string; bg: string } {
  return status === 'OPEN'        ? { label: 'Open',        color: '#92400E', bg: '#FEF3C7' }
       : status === 'IN_PROGRESS' ? { label: 'In Progress', color: '#1E40AF', bg: '#EFF6FF' }
       :                            { label: 'Resolved',    color: '#065F46', bg: '#ECFDF5' }
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

// Ticket list view
function TicketListView({
  onNewTicket, onSelectTicket,
}: { onNewTicket: () => void; onSelectTicket: (id: string) => void }) {
  const { data, isLoading, refetch, isRefetching } = useSupportTickets()
  const tickets = data?.items ?? []

  if (isLoading) {
    return <ActivityIndicator style={{ marginTop: 40 }} color="#E20C04" />
  }

  if (tickets.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyEmoji}>💬</Text>
        <Text style={styles.emptyTitle}>No open tickets</Text>
        <Text style={styles.emptyBody}>We're here if you need us.</Text>
        <Pressable style={styles.emptyAction} onPress={onNewTicket}>
          <Text style={styles.emptyActionText}>Create a request</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <FlatList
      data={tickets}
      keyExtractor={t => t.id}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      renderItem={({ item }) => {
        const badge = statusBadge(item.status)
        return (
          <Pressable style={styles.ticketRow} onPress={() => onSelectTicket(item.id)}>
            <View style={styles.ticketMeta}>
              <Text style={styles.ticketNumber}>{item.ticketNumber}</Text>
              <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                <Text style={[styles.statusText, { color: badge.color }]}>{badge.label}</Text>
              </View>
            </View>
            <Text style={styles.ticketSubject} numberOfLines={1}>{item.subject}</Text>
            <Text style={styles.ticketDate}>{relativeDate(item.updatedAt)}</Text>
            <View style={styles.rowChevron}>
              <ChevronRight size={14} color="#9CA3AF" />
            </View>
          </Pressable>
        )
      }}
    />
  )
}

// Ticket detail view
function TicketDetailView({ ticketId, onBack }: { ticketId: string; onBack: () => void }) {
  const { data: ticket, isLoading } = useSupportTicketDetail(ticketId)

  if (isLoading || !ticket) return <ActivityIndicator style={{ marginTop: 40 }} color="#E20C04" />

  const badge = statusBadge(ticket.status)

  return (
    <ScrollView style={styles.detailScroll}>
      <View style={styles.detailHeader}>
        <Text style={styles.detailNumber}>{ticket.ticketNumber}</Text>
        <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.statusText, { color: badge.color }]}>{badge.label}</Text>
        </View>
      </View>
      <Text style={styles.detailSubject}>{ticket.subject}</Text>
      <Text style={styles.detailDate}>{new Date(ticket.createdAt).toLocaleDateString('en-GB', { dateStyle: 'medium' })}</Text>
      <Text style={styles.detailMessage}>{ticket.message}</Text>
      <View style={styles.divider} />
      <Text style={styles.pendingReply}>We'll get back to you soon.</Text>
    </ScrollView>
  )
}

// New ticket form
function NewTicketForm({
  onSuccess, initialTopic, initialMessage,
}: { onSuccess: (ticketNumber: string) => void; initialTopic?: SupportTopic; initialMessage?: string }) {
  const [topic, setTopic]     = useState<string>(initialTopic ?? '')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState(initialMessage ?? '')
  const [error, setError]     = useState<string | null>(null)
  const { mutate, isPending } = useCreateTicket()

  const handleSubmit = () => {
    if (!topic)              { setError('Please select a topic'); return }
    if (!subject.trim())     { setError('Subject is required'); return }
    if (message.trim().length < 20) { setError('Message must be at least 20 characters'); return }
    setError(null)
    mutate(
      { topic, subject: subject.trim(), message: message.trim() },
      {
        onSuccess: (ticket) => onSuccess(ticket.ticketNumber),
        onError:   () => setError('Failed to submit. Please try again.'),
      }
    )
  }

  return (
    <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
      <Text style={styles.formSectionLabel}>Topic</Text>
      <View style={styles.topicList}>
        {SUPPORT_TOPICS.map(t => (
          <Pressable
            key={t}
            style={[styles.topicChip, topic === t && styles.topicChipSelected]}
            onPress={() => setTopic(t)}
          >
            <Text style={[styles.topicChipText, topic === t && styles.topicChipTextSelected]}>{t}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.formSectionLabel}>Subject</Text>
      <TextInput
        style={styles.input}
        value={subject}
        onChangeText={setSubject}
        maxLength={100}
        placeholder="One-line summary"
        placeholderTextColor="#9CA3AF"
      />

      <Text style={styles.formSectionLabel}>Message</Text>
      <TextInput
        style={[styles.input, styles.messageInput]}
        value={message}
        onChangeText={setMessage}
        multiline
        maxLength={2000}
        placeholder="Describe your issue in detail..."
        placeholderTextColor="#9CA3AF"
        textAlignVertical="top"
      />
      <Text style={styles.charCount}>{message.length}/2000</Text>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <Pressable
        style={[styles.submitButton, isPending && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={isPending}
      >
        {isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Send request</Text>}
      </Pressable>
    </ScrollView>
  )
}

// Main modal
export function GetHelpModal({ visible, onDismiss, initialTopic, initialMessage }: Props) {
  const [view, setView]               = useState<ModalView>('list')
  const [selectedId, setSelectedId]   = useState<string | null>(null)
  const [ticketNumber, setTicketNumber] = useState<string | null>(null)

  const handleClose = () => {
    setView('list')
    setSelectedId(null)
    setTicketNumber(null)
    onDismiss()
  }

  const handleNewTicket = () => {
    setView('new-form')
  }

  const handleSuccess = (tNum: string) => {
    setTicketNumber(tNum)
    setView('success')
  }

  const titleFor: Record<ModalView, string> = {
    list:       'Get help',
    detail:     'Ticket detail',
    'new-form': 'New request',
    success:    '',
  }

  const backTargetFor: Partial<Record<ModalView, ModalView>> = {
    detail:     'list',
    'new-form': 'list',
  }

  const backView = backTargetFor[view]

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <SafeAreaView style={styles.modalRoot}>
        {/* Header */}
        {view !== 'success' && (
          <View style={styles.modalHeader}>
            {backView ? (
              <Pressable onPress={() => setView(backView)} style={styles.headerBtn}>
                <ChevronLeft size={20} color="#010C35" />
              </Pressable>
            ) : (
              <Pressable onPress={handleClose} style={styles.headerBtn}>
                <X size={20} color="#010C35" />
              </Pressable>
            )}
            <Text style={styles.modalTitle}>{titleFor[view]}</Text>
            {view === 'list' ? (
              <Pressable onPress={handleNewTicket} style={styles.headerBtn}>
                <Plus size={20} color="#E20C04" />
                <Text style={styles.newTicketLabel}>New ticket</Text>
              </Pressable>
            ) : (
              <View style={styles.headerBtn} />
            )}
          </View>
        )}

        {/* Content */}
        {view === 'list' && (
          <TicketListView
            onNewTicket={handleNewTicket}
            onSelectTicket={(id) => { setSelectedId(id); setView('detail') }}
          />
        )}
        {view === 'detail' && selectedId && (
          <TicketDetailView ticketId={selectedId} onBack={() => setView('list')} />
        )}
        {view === 'new-form' && (
          <NewTicketForm
            onSuccess={handleSuccess}
            {...(initialTopic !== undefined ? { initialTopic } : {})}
            {...(initialMessage !== undefined ? { initialMessage } : {})}
          />
        )}
        {view === 'success' && ticketNumber && (
          <View style={styles.successView}>
            <Text style={styles.successEmoji}>✅</Text>
            <Text style={styles.successTitle}>Ticket logged</Text>
            <Text style={styles.successNumber}>{ticketNumber}</Text>
            <Text style={styles.successBody}>We'll get back to you as soon as possible.</Text>
            <Pressable style={styles.viewTicketsButton} onPress={() => setView('list')}>
              <Text style={styles.viewTicketsText}>View my tickets</Text>
            </Pressable>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modalRoot:        { flex: 1, backgroundColor: '#FAF8F5' },
  modalHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB', backgroundColor: '#FFFFFF' },
  headerBtn:        { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 60 },
  modalTitle:       { fontSize: 17, fontWeight: '600', color: '#010C35' },
  newTicketLabel:   { fontSize: 14, color: '#E20C04', fontWeight: '600' },
  emptyState:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyEmoji:       { fontSize: 40, marginBottom: 12 },
  emptyTitle:       { fontSize: 18, fontWeight: '700', color: '#010C35', marginBottom: 6 },
  emptyBody:        { fontSize: 14, color: 'rgba(1,12,53,0.5)', textAlign: 'center', marginBottom: 20 },
  emptyAction:      { backgroundColor: '#010C35', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  emptyActionText:  { color: '#FFFFFF', fontWeight: '600' },
  ticketRow:        { backgroundColor: '#FFFFFF', marginHorizontal: 16, marginTop: 12, borderRadius: 12, padding: 16 },
  ticketMeta:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  ticketNumber:     { fontSize: 12, color: 'rgba(1,12,53,0.5)', fontWeight: '600' },
  ticketSubject:    { fontSize: 15, fontWeight: '500', color: '#010C35', marginBottom: 4 },
  ticketDate:       { fontSize: 12, color: 'rgba(1,12,53,0.4)' },
  rowChevron:       { position: 'absolute', right: 16, top: '50%' },
  statusBadge:      { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusText:       { fontSize: 11, fontWeight: '600' },
  detailScroll:     { flex: 1, padding: 20 },
  detailHeader:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  detailNumber:     { fontSize: 13, fontWeight: '600', color: 'rgba(1,12,53,0.5)' },
  detailSubject:    { fontSize: 20, fontWeight: '700', color: '#010C35', marginBottom: 4 },
  detailDate:       { fontSize: 12, color: 'rgba(1,12,53,0.4)', marginBottom: 16 },
  detailMessage:    { fontSize: 15, color: '#374151', lineHeight: 24 },
  divider:          { height: 1, backgroundColor: '#E5E7EB', marginVertical: 20 },
  pendingReply:     { fontSize: 14, color: 'rgba(1,12,53,0.4)', fontStyle: 'italic' },
  formScroll:       { flex: 1, padding: 20 },
  formSectionLabel: { fontSize: 12, fontWeight: '600', color: 'rgba(1,12,53,0.5)', marginBottom: 8, marginTop: 16 },
  topicList:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  topicChip:        { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  topicChipSelected: { backgroundColor: '#010C35', borderColor: '#010C35' },
  topicChipText:    { fontSize: 13, color: '#374151' },
  topicChipTextSelected: { color: '#FFFFFF' },
  input:            { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  messageInput:     { minHeight: 140 },
  charCount:        { fontSize: 11, color: '#9CA3AF', textAlign: 'right', marginTop: 4 },
  errorText:        { fontSize: 13, color: '#DC2626', marginTop: 12 },
  submitButton:     { backgroundColor: '#E20C04', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 20, marginBottom: 8 },
  buttonDisabled:   { opacity: 0.6 },
  submitText:       { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  successView:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  successEmoji:     { fontSize: 48, marginBottom: 16 },
  successTitle:     { fontSize: 22, fontWeight: '700', color: '#010C35', marginBottom: 8 },
  successNumber:    { fontSize: 16, fontWeight: '600', color: '#E20C04', marginBottom: 12 },
  successBody:      { fontSize: 14, color: 'rgba(1,12,53,0.5)', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  viewTicketsButton: { backgroundColor: '#010C35', borderRadius: 12, paddingHorizontal: 28, paddingVertical: 14 },
  viewTicketsText:  { color: '#FFFFFF', fontWeight: '600' },
})
