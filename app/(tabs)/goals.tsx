import { useAuthContext } from '@/hooks/use-auth-context'
import { supabase } from '@/lib/supabase'
import { Redirect } from 'expo-router'
import { useEffect, useState } from 'react'
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

type SquadSummary = {
  id: string
  name: string
}

type GoalSummary = {
  type: string
  baseline_points: number | null
}

export default function GoalsScreen() {
  const { claims, isLoading, isLoggedIn } = useAuthContext()
  const [currentSquad, setCurrentSquad] = useState<SquadSummary | null>(null)
  const [currentGoal, setCurrentGoal] = useState<GoalSummary | null>(null)
  const [isLoadingSquad, setIsLoadingSquad] = useState(true)
  const [isLoadingGoal, setIsLoadingGoal] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [goalType, setGoalType] = useState('')
  const [baselinePoints, setBaselinePoints] = useState('0')

  useEffect(() => {
    const loadCurrentSquad = async () => {
      if (!claims?.sub) {
        setCurrentSquad(null)
        setIsLoadingSquad(false)
        return
      }

      setIsLoadingSquad(true)

      const { data: membership } = await supabase
        .from('squad_members')
        .select('squad_id')
        .eq('user_id', claims.sub)
        .eq('is_active', true)
        .order('join_date', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!membership?.squad_id) {
        setCurrentSquad(null)
        setIsLoadingSquad(false)
        return
      }

      const { data: squad } = await supabase
        .from('squads')
        .select('id, name')
        .eq('id', membership.squad_id)
        .single()

      setCurrentSquad(squad ?? null)
      setIsLoadingSquad(false)
    }

    loadCurrentSquad()
  }, [claims?.sub])

  useEffect(() => {
    const loadCurrentGoal = async () => {
      if (!currentSquad?.id) {
        setCurrentGoal(null)
        setIsLoadingGoal(false)
        return
      }

      setIsLoadingGoal(true)

      const { data } = await supabase
        .from('goals')
        .select('type, baseline_points')
        .eq('squad_id', currentSquad.id)

      setCurrentGoal(data?.[0] ?? null)
      setIsLoadingGoal(false)
    }

    loadCurrentGoal()
  }, [currentSquad?.id])

  useEffect(() => {
    if (currentGoal) {
      setGoalType(currentGoal.type)
      setBaselinePoints(currentGoal.baseline_points?.toString() ?? '0')
    }
  }, [currentGoal])

  if (isLoading) {
    return null
  }

  if (!isLoggedIn) {
    return <Redirect href="/(auth)/login" />
  }

  const saveGoal = async () => {
    if (!currentSquad?.id) {
      Alert.alert('No squad found', 'Join a squad before creating a goal.')
      return
    }

    const trimmedGoal = goalType.trim()
    const parsedPoints = baselinePoints.trim() ? Number.parseInt(baselinePoints.trim(), 10) : 0

    if (!trimmedGoal) {
      Alert.alert('Missing information', 'Please enter a goal description.')
      return
    }

    if (Number.isNaN(parsedPoints)) {
      Alert.alert('Invalid points', 'Please enter a valid number for baseline points.')
      return
    }

    setIsSaving(true)
    const { error } = await supabase.from('goals').insert({
      squad_id: currentSquad.id,
      type: trimmedGoal,
      baseline_points: parsedPoints,
    })
    setIsSaving(false)

    if (error) {
      Alert.alert('Could not save goal', error.message)
      return
    }

    setCurrentGoal({ type: trimmedGoal, baseline_points: parsedPoints })
    Alert.alert('Goal created', 'Your squad goal is now available on the dashboard.')
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Text style={styles.kicker}>Squad Goals</Text>
          <Text style={styles.title}>Create a goal</Text>
          <Text style={styles.subtitle}>
            Add a short squad goal description. Everyone in the squad will see it on the dashboard.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Current Squad</Text>
          {isLoadingSquad ? (
            <Text style={styles.helperText}>Loading your squad...</Text>
          ) : currentSquad ? (
            <Text style={styles.squadName}>{currentSquad.name}</Text>
          ) : (
            <Text style={styles.helperText}>Join a squad first to create a goal.</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Goal Details</Text>

          <Text style={styles.label}>Goal Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Run for 15 minutes"
            placeholderTextColor="#687076"
            value={goalType}
            onChangeText={setGoalType}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            editable={!isSaving}
          />

          <Text style={styles.label}>Baseline Points</Text>
          <TextInput
            style={styles.input}
            placeholder="0"
            placeholderTextColor="#687076"
            value={baselinePoints}
            onChangeText={setBaselinePoints}
            keyboardType="number-pad"
            editable={!isSaving}
          />

          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              isSaving && styles.buttonDisabled,
            ]}
            onPress={saveGoal}
            disabled={isSaving || !currentSquad?.id}
          >
            {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create Goal</Text>}
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Current Squad Goal</Text>
          {isLoadingGoal ? (
            <Text style={styles.helperText}>Loading goal...</Text>
          ) : currentGoal ? (
            <>
              <Text style={styles.goalType}>{currentGoal.type}</Text>
              <Text style={styles.helperText}>Baseline points: {currentGoal.baseline_points ?? 0}</Text>
            </>
          ) : (
            <Text style={styles.helperText}>No squad goal has been created yet.</Text>
          )}
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
  content: {
    padding: 24,
    gap: 18,
  },
  hero: {
    gap: 8,
    paddingTop: 24,
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
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 6,
  },
  sectionLabel: {
    color: '#ECEDEE',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  label: {
    color: '#ECEDEE',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: '#111318',
    borderWidth: 1,
    borderColor: '#2a2d35',
    borderRadius: 16,
    color: '#ECEDEE',
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  textArea: {
    minHeight: 110,
  },
  button: {
    backgroundColor: '#0a7ea4',
    borderRadius: 16,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: '#0a7ea4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  helperText: {
    color: '#9BA1A6',
    fontSize: 14,
    lineHeight: 20,
  },
  squadName: {
    color: '#ECEDEE',
    fontSize: 20,
    fontWeight: '700',
  },
  goalType: {
    color: '#ECEDEE',
    fontSize: 18,
    fontWeight: '700',
  },
})