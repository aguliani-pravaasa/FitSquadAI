import { useAuthContext } from '@/hooks/use-auth-context'
import { supabase } from '@/lib/supabase'
import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

export default function FeedbackScreen() {
  const { claims, currentSquad, isLoading } = useAuthContext()
  const [feedbackText, setFeedbackText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    const trimmed = feedbackText.trim()
    if (!trimmed) {
      Alert.alert('Empty Feedback', 'Please enter your feedback before submitting.')
      return
    }

    const userId = claims?.sub
    if (!userId) {
      Alert.alert('Authentication Error', 'You must be signed in to submit feedback.')
      return
    }

    setIsSubmitting(true)
    try {
      let squadId = currentSquad?.id ?? null

      if (!squadId) {
        const { data: membership } = await supabase
          .from('squad_members')
          .select('squad_id')
          .eq('user_id', userId)
          .eq('is_active', true)
          .order('join_date', { ascending: false })
          .limit(1)
          .maybeSingle()

        squadId = membership?.squad_id ?? null
      }

      const { error } = await supabase.from('feedback').insert({
        user: userId,
        squad: squadId,
        text: trimmed,
      })

      if (error) {
        console.error('Error submitting feedback:', error)
        Alert.alert('Submission Failed', error.message || 'Could not submit feedback. Please try again.')
        return
      }

      Alert.alert('Thank You!', 'Your feedback has been submitted successfully.', [
        {
          text: 'OK',
          onPress: () => {
            setFeedbackText('')
          },
        },
      ])
    } catch (err: any) {
      console.error('Unexpected error submitting feedback:', err)
      Alert.alert('Error', 'An unexpected error occurred while submitting feedback.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0a7ea4" />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Text style={styles.kicker}>Feedback</Text>
          <Text style={styles.title}>Share your thoughts</Text>
          <Text style={styles.subtitle}>
            We'd love to hear your feedback on FitSquad AI. Type your message below to send it directly to our team.
          </Text>
        </View>

        <View style={styles.card}>
          <TextInput
            style={styles.textInput}
            value={feedbackText}
            onChangeText={setFeedbackText}
            placeholder="Type your feedback here..."
            placeholderTextColor="#687076"
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            editable={!isSubmitting}
          />

          <Pressable
            style={[styles.submitButton, (isSubmitting || !feedbackText.trim()) && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={isSubmitting || !feedbackText.trim()}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>Submit Feedback</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1117',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0f1117',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 24,
    gap: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 36,
  },
  hero: {
    gap: 8,
    paddingTop: 12,
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
    letterSpacing: -0.5,
  },
  subtitle: {
    color: '#9BA1A6',
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#1a1d23',
    borderWidth: 1,
    borderColor: '#2a2d35',
    borderRadius: 24,
    padding: 20,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 6,
  },
  textInput: {
    backgroundColor: '#111318',
    borderWidth: 1,
    borderColor: '#2a2d35',
    borderRadius: 16,
    color: '#ECEDEE',
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 160,
  },
  submitButton: {
    backgroundColor: '#0a7ea4',
    borderRadius: 16,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0a7ea4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
})
