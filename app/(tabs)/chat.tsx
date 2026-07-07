import { useAuthContext } from '@/hooks/use-auth-context'
import { supabase } from '@/lib/supabase'
import { Redirect } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import {
    ActivityIndicator,
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native'

type SenderProfile = {
  full_name?: string | null
  username?: string | null
}

type ChatMessage = {
  id: string
  squad_id: string | null
  user_id: string | null
  type: 'user' | 'assistant'
  message: string
  created_at: string
  profiles?: SenderProfile | null
}

const CHAT_TABLE = 'chat'
const AI_POLL_ATTEMPTS = 12
const AI_POLL_DELAY_MS = 1000

function mergeMessages(existing: ChatMessage[], incoming: ChatMessage[]) {
  const byId = new Map<string, ChatMessage>()

  existing.forEach((message) => {
    byId.set(message.id, message)
  })

  incoming.forEach((message) => {
    byId.set(message.id, message)
  })

  return Array.from(byId.values()).sort((left, right) => {
    return new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
  })
}

function formatMessageTime(timestamp: string) {
  return new Intl.DateTimeFormat([], {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

function getSenderLabel(message: ChatMessage, currentUserId?: string | null) {
  if (message.type === 'assistant') {
    return 'AI Coach'
  }

  if (message.user_id === currentUserId) {
    return 'You'
  }

  return message.profiles?.full_name ?? message.profiles?.username ?? 'AI Coach'
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function fetchMessagesForSquad(squadId: string) {
  const { data, error } = await supabase
    .from(CHAT_TABLE)
    .select('id, squad_id, user_id, type, message, created_at, profiles(full_name, username)')
    .eq('squad_id', squadId)
    .order('created_at', { ascending: true })
    .limit(100)

  if (error) {
    throw error
  }

  return (data ?? []) as ChatMessage[]
}

async function fetchAssistantMessages(userId: string) {
  const { data, error } = await supabase
    .from(CHAT_TABLE)
    .select('id, squad_id, user_id, type, message, created_at, profiles(full_name, username)')
    .eq('user_id', userId)
    .eq('type', 'assistant')
    .is('squad_id', null)
    .order('created_at', { ascending: true })

  if (error) {
    throw error
  }

  return (data ?? []) as ChatMessage[]
}

function attachAssistantReplies(squadMessages: ChatMessage[], assistantMessages: ChatMessage[]) {
  const combined = [...squadMessages]

  assistantMessages.forEach((assistantMessage) => {
    const assistantTime = new Date(assistantMessage.created_at).getTime()
    const precedingSquadMessage = [...squadMessages]
      .filter((message) => message.type === 'user')
      .filter((message) => new Date(message.created_at).getTime() <= assistantTime)
      .at(-1)

    if (!precedingSquadMessage) {
      return
    }

    const replyDelay = assistantTime - new Date(precedingSquadMessage.created_at).getTime()
    if (replyDelay < 0 || replyDelay > 5 * 60 * 1000) {
      return
    }

    combined.push(assistantMessage)
  })

  return combined.sort((left, right) => {
    return new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
  })
}

async function fetchConversationMessages(squadId: string, userId: string) {
  const [squadMessages, assistantMessages] = await Promise.all([
    fetchMessagesForSquad(squadId),
    fetchAssistantMessages(userId),
  ])

  return attachAssistantReplies(squadMessages, assistantMessages)
}

async function pollForCoachReply(userId: string, userMessageId: string, createdAt: string) {
  for (let attempt = 0; attempt < AI_POLL_ATTEMPTS; attempt += 1) {
    const { data, error } = await supabase
      .from(CHAT_TABLE)
      .select('id, squad_id, user_id, type, message, created_at, profiles(full_name, username)')
      .eq('type', 'assistant')
      .is('squad_id', null)
      .eq('user_id', userId)
      .gte('created_at', createdAt)
      .order('created_at', { ascending: true })
      .limit(10)

    if (!error) {
      const reply = (data ?? []).find((message) => message.id !== userMessageId)

      if (reply) {
        return reply as ChatMessage
      }
    }

    await sleep(AI_POLL_DELAY_MS)
  }

  return null
}

export default function ChatScreen() {
  const { claims, currentSquad, isLoading, isLoggedIn } = useAuthContext()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [isLoadingMessages, setIsLoadingMessages] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [isWaitingForCoach, setIsWaitingForCoach] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const listRef = useRef<FlatList<ChatMessage>>(null)

  useEffect(() => {
    let active = true

    const loadMessages = async () => {
      if (!currentSquad?.id || !claims?.sub) {
        setMessages([])
        setLoadError(null)
        setIsLoadingMessages(false)
        return
      }

      setIsLoadingMessages(true)
      setLoadError(null)

      try {
        const nextMessages = await fetchConversationMessages(currentSquad.id, claims.sub)

        if (active) {
          setMessages(nextMessages)
        }
      } catch (error: unknown) {
        if (active) {
          const message = error instanceof Error ? error.message : 'Unable to load messages.'
          setLoadError(message)
          setMessages([])
        }
      } finally {
        if (active) {
          setIsLoadingMessages(false)
        }
      }
    }

    loadMessages()

    return () => {
      active = false
    }
  }, [claims?.sub, currentSquad?.id])

  useEffect(() => {
    if (!currentSquad?.id) {
      return
    }

    const channel = supabase
      .channel('chat-room')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: CHAT_TABLE,
        },
        async () => {
          try {
            if (!claims?.sub) {
              return
            }

            const nextMessages = await fetchConversationMessages(currentSquad.id, claims.sub)
            setMessages(nextMessages)
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unable to refresh messages.'
            setLoadError(message)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [claims?.sub, currentSquad?.id])

  useEffect(() => {
    if (messages.length > 0) {
      listRef.current?.scrollToEnd({ animated: true })
    }
  }, [messages.length])

  const handleSend = async () => {
    const trimmedMessage = draft.trim()

    if (!trimmedMessage || !currentSquad?.id || !claims?.sub || isSending) {
      return
    }

    setIsSending(true)
    setIsWaitingForCoach(true)
    setLoadError(null)

    try {
      const { data: sentMessage, error: sendError } = await supabase
        .from(CHAT_TABLE)
        .insert({
          squad_id: currentSquad.id,
          user_id: claims.sub,
          message: trimmedMessage,
          type: 'user',
        })
        .select('id, squad_id, user_id, message, created_at, profiles(full_name, username)')
        .single()

      if (sendError || !sentMessage) {
        throw sendError ?? new Error('Unable to send message.')
      }

      const userMessage = sentMessage as ChatMessage
      setMessages((current) => mergeMessages(current, [userMessage]))
      setDraft('')

      const { error: coachError } = await supabase.functions.invoke('ai-coach', {
        body: {
          Chat_ID: userMessage.id,
          chat_id: userMessage.id,
        },
      })

      if (coachError) {
        throw coachError
      }

      const coachReply = await pollForCoachReply(claims.sub, userMessage.id, userMessage.created_at)

      if (coachReply) {
        setMessages((current) => mergeMessages(current, [coachReply]))
      } else {
        const refreshedMessages = await fetchConversationMessages(currentSquad.id, claims.sub)
        setMessages(refreshedMessages)
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to send message.'
      setLoadError(message)
      Alert.alert('Could not send message', message)
    } finally {
      setIsSending(false)
      setIsWaitingForCoach(false)
    }
  }

  if (isLoading) {
    return null
  }

  if (!isLoggedIn) {
    return <Redirect href="/(auth)/login" />
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>AI Coach</Text>
          <Text style={styles.title}>{currentSquad?.name ?? 'Chat with your squad'}</Text>
          <Text style={styles.subtitle}>
            Send a message and the coach will reply back in the conversation.
          </Text>
        </View>

        {!currentSquad ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No active squad</Text>
            <Text style={styles.emptyText}>
              Join or create a squad first. The AI coach lives inside your squad chat.
            </Text>
          </View>
        ) : (
          <View style={styles.chatCard}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.sectionLabel}>Conversation</Text>
                <Text style={styles.sectionHint}>Your messages and the coach reply appear here.</Text>
              </View>
              {isLoadingMessages ? <ActivityIndicator color="#9BA1A6" /> : null}
            </View>

            {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}

            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const isMine = item.type === 'user' && item.user_id === claims?.sub

                return (
                  <View style={[styles.messageRow, isMine && styles.messageRowMine]}>
                    <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
                      <View style={styles.messageMeta}>
                        <Text style={styles.senderLabel}>{getSenderLabel(item, claims?.sub)}</Text>
                        <Text style={styles.timeLabel}>{formatMessageTime(item.created_at)}</Text>
                      </View>
                      <Text style={styles.messageText}>{item.message}</Text>
                    </View>
                  </View>
                )
              }}
              contentContainerStyle={messages.length === 0 ? styles.emptyMessages : styles.messageList}
              ListEmptyComponent={
                isLoadingMessages ? null : (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyTitle}>Start the conversation</Text>
                    <Text style={styles.emptyText}>
                      Ask the coach for a plan, a reminder, or feedback on your training.
                    </Text>
                  </View>
                )
              }
              showsVerticalScrollIndicator={false}
            />

            {isWaitingForCoach ? (
              <View style={styles.typingRow}>
                <ActivityIndicator color="#0a7ea4" />
                <Text style={styles.typingText}>Coach is typing...</Text>
              </View>
            ) : null}
          </View>
        )}

        {currentSquad ? (
          <View style={styles.composer}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Write a message to your AI coach"
              placeholderTextColor="#687076"
              editable={!isSending}
              multiline
            />
            <Pressable
              style={({ pressed }) => [
                styles.sendButton,
                pressed && styles.buttonPressed,
                isSending && styles.buttonDisabled,
              ]}
              onPress={handleSend}
              disabled={isSending}
            >
              {isSending ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.sendButtonText}>Send</Text>
              )}
            </Pressable>
          </View>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1117',
  },
  content: {
    flex: 1,
    padding: 20,
    gap: 16,
  },
  hero: {
    backgroundColor: '#1a1d23',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#2a2d35',
    padding: 20,
    gap: 8,
  },
  kicker: {
    color: '#0a7ea4',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    color: '#ECEDEE',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  subtitle: {
    color: '#9BA1A6',
    fontSize: 14,
    lineHeight: 20,
  },
  emptyCard: {
    backgroundColor: '#111318',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#2a2d35',
    padding: 20,
    gap: 8,
  },
  emptyTitle: {
    color: '#ECEDEE',
    fontSize: 18,
    fontWeight: '700',
  },
  emptyText: {
    color: '#9BA1A6',
    fontSize: 14,
    lineHeight: 20,
  },
  chatCard: {
    flex: 1,
    backgroundColor: '#111318',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#2a2d35',
    padding: 16,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionLabel: {
    color: '#ECEDEE',
    fontSize: 16,
    fontWeight: '700',
  },
  sectionHint: {
    color: '#9BA1A6',
    fontSize: 13,
    marginTop: 2,
  },
  errorText: {
    color: '#ff7b7b',
    fontSize: 13,
  },
  messageList: {
    paddingBottom: 12,
    gap: 10,
  },
  emptyMessages: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  messageRow: {
    flexDirection: 'row',
  },
  messageRowMine: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '88%',
    borderRadius: 18,
    padding: 14,
    gap: 10,
  },
  bubbleMine: {
    backgroundColor: '#0a7ea4',
  },
  bubbleOther: {
    backgroundColor: '#1a1d23',
    borderWidth: 1,
    borderColor: '#2a2d35',
  },
  messageMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  senderLabel: {
    color: '#ECEDEE',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  timeLabel: {
    color: 'rgba(236, 237, 238, 0.7)',
    fontSize: 12,
  },
  messageText: {
    color: '#ECEDEE',
    fontSize: 15,
    lineHeight: 21,
  },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  typingText: {
    color: '#9BA1A6',
    fontSize: 13,
  },
  composer: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    minHeight: 52,
    maxHeight: 120,
    backgroundColor: '#1a1d23',
    borderColor: '#2a2d35',
    borderWidth: 1,
    borderRadius: 16,
    color: '#ECEDEE',
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlignVertical: 'top',
  },
  sendButton: {
    minWidth: 92,
    minHeight: 52,
    backgroundColor: '#0a7ea4',
    borderRadius: 16,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonPressed: {
    transform: [{ scale: 0.98 }],
  },
})