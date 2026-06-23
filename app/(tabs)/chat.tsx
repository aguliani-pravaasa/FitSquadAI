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
	squad_id: string
	user_id: string
	message: string
	created_at: string
	profiles?: SenderProfile | null
}

const CHAT_TABLE = 'chat'

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
	if (message.user_id === currentUserId) {
		return 'You'
	}

	return message.profiles?.full_name ?? message.profiles?.username ?? 'Squad member'
}

export default function ChatScreen() {
	const { claims, currentSquad, isLoading, isLoggedIn } = useAuthContext()
	const [messages, setMessages] = useState<ChatMessage[]>([])
	const [draft, setDraft] = useState('')
	const [isLoadingMessages, setIsLoadingMessages] = useState(true)
	const [isSending, setIsSending] = useState(false)
	const [loadError, setLoadError] = useState<string | null>(null)
	const listRef = useRef<FlatList<ChatMessage>>(null)

	useEffect(() => {
		let isActive = true

		const loadMessages = async () => {
			if (!currentSquad?.id) {
				setMessages([])
				setLoadError(null)
				setIsLoadingMessages(false)
				return
			}

			setIsLoadingMessages(true)
			setLoadError(null)

			const { data, error } = await supabase
				.from(CHAT_TABLE)
				.select('id, squad_id, user_id, message, created_at, profiles(full_name, username)')
				.eq('squad_id', currentSquad.id)
				.order('created_at', { ascending: true })
				.limit(75)

			if (!isActive) {
				return
			}

			if (error) {
				setMessages([])
				setLoadError(error.message)
				setIsLoadingMessages(false)
				return
			}

			setMessages((data ?? []) as ChatMessage[])
			setIsLoadingMessages(false)
		}

		loadMessages()

		return () => {
			isActive = false
		}
	}, [currentSquad?.id])

	useEffect(() => {
		if (!currentSquad?.id) {
			return
		}

		const channel = supabase
			.channel(`squad-chat-${currentSquad.id}`)
			.on(
				'postgres_changes',
				{
					event: 'INSERT',
					schema: 'public',
					table: CHAT_TABLE,
					filter: `squad_id=eq.${currentSquad.id}`,
				},
				(payload) => {
					const nextMessage = payload.new as ChatMessage

					setMessages((current) => mergeMessages(current, [nextMessage]))
				}
			)
			.subscribe()

		return () => {
			supabase.removeChannel(channel)
		}
	}, [currentSquad?.id])

	useEffect(() => {
		if (messages.length > 0) {
			listRef.current?.scrollToEnd({ animated: true })
		}
	}, [messages.length])

	if (isLoading) {
		return null
	}

	if (!isLoggedIn) {
		return <Redirect href="/(auth)/login" />
	}

	const handleSend = async () => {
		const trimmedMessage = draft.trim()

		if (!trimmedMessage || !currentSquad?.id || !claims?.sub || isSending) {
			return
		}

		setIsSending(true)
		setLoadError(null)

		try {
			const { data, error } = await supabase
				.from(CHAT_TABLE)
				.insert({
					squad_id: currentSquad.id,
					user_id: claims.sub,
					message: trimmedMessage,
				})
				.select('id, squad_id, user_id, message, created_at, profiles(full_name, username)')
				.single()

			if (error) {
				throw error
			}

			setDraft('')

			if (data) {
				setMessages((current) => mergeMessages(current, [data as ChatMessage]))
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unable to send message.'
			setLoadError(message)
			Alert.alert('Could not send message', message)
		} finally {
			setIsSending(false)
		}
	}

	if (!currentSquad) {
		return (
			<KeyboardAvoidingView
				style={styles.container}
				behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
			>
				<View style={styles.content}>
					<View style={styles.hero}>
						<Text style={styles.kicker}>Squad Chat</Text>
						<Text style={styles.title}>Join a squad first</Text>
						<Text style={styles.subtitle}>
							Chat is tied to your active squad. Join or create one from the Squads tab to get started.
						</Text>
					</View>

					<View style={styles.emptyCard}>
						<Text style={styles.emptyTitle}>No active squad</Text>
						<Text style={styles.emptyText}>
							Once you join a squad, your team chat will appear here automatically.
						</Text>
					</View>
				</View>
			</KeyboardAvoidingView>
		)
	}

	return (
		<KeyboardAvoidingView
			style={styles.container}
			behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
		>
			<View style={styles.content}>
				<View style={styles.hero}>
					<Text style={styles.kicker}>Squad Chat</Text>
					<Text style={styles.title}>{currentSquad.name}</Text>
					<Text style={styles.subtitle}>
						Messages here are shared with everyone in your active squad.
					</Text>
				</View>

				<View style={styles.chatCard}>
					<View style={styles.cardHeader}>
						<View>
							<Text style={styles.sectionLabel}>Messages</Text>
							<Text style={styles.sectionHint}>Realtime updates stay in sync for this squad.</Text>
						</View>
						{isLoadingMessages ? <ActivityIndicator color="#9BA1A6" /> : null}
					</View>

					{loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}

					<FlatList
						ref={listRef}
						data={messages}
						keyExtractor={(item) => item.id}
						renderItem={({ item }) => {
							const isMine = item.user_id === claims?.sub

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
						contentContainerStyle={messages.length === 0 ? styles.listEmptyContent : styles.listContent}
						onContentSizeChange={() => {
							listRef.current?.scrollToEnd({ animated: true })
						}}
						ListEmptyComponent={
							isLoadingMessages ? null : (
								<View style={styles.emptyState}>
									<Text style={styles.emptyTitle}>No messages yet</Text>
									<Text style={styles.emptyText}>Start the conversation and everyone in your squad will see it here.</Text>
								</View>
							)
						}
						showsVerticalScrollIndicator={false}
					/>
				</View>

				<View style={styles.composerCard}>
					<TextInput
						style={styles.input}
						placeholder="Write a message..."
						placeholderTextColor="#687076"
						value={draft}
						onChangeText={setDraft}
						multiline
						editable={!isSending}
					/>

					<Pressable
						style={({ pressed }) => [
							styles.sendButton,
							pressed && styles.sendButtonPressed,
							(isSending || !draft.trim()) && styles.sendButtonDisabled,
						]}
						onPress={handleSend}
						disabled={isSending || !draft.trim()}
					>
						{isSending ? <ActivityIndicator color="#0f1117" /> : <Text style={styles.sendButtonText}>Send</Text>}
					</Pressable>
				</View>
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
		padding: 24,
		gap: 18,
	},
	hero: {
		gap: 10,
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
		fontSize: 30,
		fontWeight: '700',
		letterSpacing: -0.6,
	},
	subtitle: {
		color: '#9BA1A6',
		fontSize: 14,
		lineHeight: 20,
	},
	chatCard: {
		flex: 1,
		backgroundColor: '#111318',
		borderWidth: 1,
		borderColor: '#2a2d35',
		borderRadius: 24,
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
		fontSize: 12,
		marginTop: 2,
	},
	errorText: {
		color: '#ff8f8f',
		fontSize: 13,
	},
	listContent: {
		gap: 12,
		paddingBottom: 8,
	},
	listEmptyContent: {
		flexGrow: 1,
		justifyContent: 'center',
		alignItems: 'center',
		paddingVertical: 24,
	},
	messageRow: {
		flexDirection: 'row',
		justifyContent: 'flex-start',
	},
	messageRowMine: {
		justifyContent: 'flex-end',
	},
	bubble: {
		maxWidth: '86%',
		borderRadius: 18,
		paddingVertical: 12,
		paddingHorizontal: 14,
		gap: 8,
	},
	bubbleOther: {
		backgroundColor: '#1a1d23',
		borderWidth: 1,
		borderColor: '#2a2d35',
	},
	bubbleMine: {
		backgroundColor: '#0a7ea4',
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
	},
	timeLabel: {
		color: 'rgba(236, 237, 238, 0.72)',
		fontSize: 11,
	},
	messageText: {
		color: '#ECEDEE',
		fontSize: 15,
		lineHeight: 21,
	},
	emptyState: {
		alignItems: 'center',
		gap: 8,
		paddingHorizontal: 20,
	},
	emptyCard: {
		backgroundColor: '#111318',
		borderWidth: 1,
		borderColor: '#2a2d35',
		borderRadius: 24,
		padding: 20,
		gap: 8,
	},
	emptyTitle: {
		color: '#ECEDEE',
		fontSize: 18,
		fontWeight: '700',
		letterSpacing: -0.2,
	},
	emptyText: {
		color: '#9BA1A6',
		fontSize: 14,
		lineHeight: 20,
	},
	composerCard: {
		backgroundColor: '#111318',
		borderWidth: 1,
		borderColor: '#2a2d35',
		borderRadius: 24,
		padding: 14,
		gap: 12,
	},
	input: {
		minHeight: 52,
		maxHeight: 120,
		backgroundColor: '#1a1d23',
		borderWidth: 1,
		borderColor: '#2a2d35',
		borderRadius: 16,
		color: '#ECEDEE',
		paddingHorizontal: 14,
		paddingVertical: 12,
		fontSize: 15,
		lineHeight: 21,
	},
	sendButton: {
		alignSelf: 'flex-end',
		minWidth: 92,
		borderRadius: 16,
		paddingVertical: 13,
		paddingHorizontal: 18,
		backgroundColor: '#ECEDEE',
		alignItems: 'center',
		justifyContent: 'center',
	},
	sendButtonPressed: {
		opacity: 0.85,
		transform: [{ scale: 0.98 }],
	},
	sendButtonDisabled: {
		opacity: 0.45,
	},
	sendButtonText: {
		color: '#0f1117',
		fontSize: 15,
		fontWeight: '700',
	},
})
