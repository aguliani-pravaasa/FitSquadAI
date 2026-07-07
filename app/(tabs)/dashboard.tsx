import { useAuthContext } from '@/hooks/use-auth-context'
import { supabase } from '@/lib/supabase'
import { Redirect, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import {
    ActivityIndicator,
    Alert,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native'

type SquadSummary = {
  id: string
  name: string
  inv_code: string
  squad_goal: string | null
}

type GoalSummary = {
  id: string
  type: string
  baseline_points: number | null
  scalable_quantity: string | null
}

type UserGoalSummary = {
  id: string
  text: string
  user_baseline_points: number | null
}

export default function DashboardScreen() {
  const { claims, email, isLoading, isLoggedIn } = useAuthContext()
  const [currentSquad, setCurrentSquad] = useState<SquadSummary | null>(null)
  const [currentGoal, setCurrentGoal] = useState<GoalSummary | null>(null)
  const [userGoal, setUserGoal] = useState<UserGoalSummary | null>(null)
  const [isLoadingSquad, setIsLoadingSquad] = useState(true)
  const [isLoadingGoal, setIsLoadingGoal] = useState(true)
  const [isLoadingUserGoal, setIsLoadingUserGoal] = useState(true)
  const [isLogModalVisible, setIsLogModalVisible] = useState(false)
  const [logAmount, setLogAmount] = useState('')
  const [isSubmittingLog, setIsSubmittingLog] = useState(false)
  const [squadGoalDraft, setSquadGoalDraft] = useState('')
  const [isUpdatingSquadGoal, setIsUpdatingSquadGoal] = useState(false)

  useEffect(() => {
    const loadCurrentSquad = async () => {
      if (!claims?.sub) {
        setCurrentSquad(null)
        setIsLoadingSquad(false)
        return
      }

      setIsLoadingSquad(true)

      const { data: membership, error: membershipError } = await supabase
        .from('squad_members')
        .select('squad_id')
        .eq('user_id', claims.sub)
        .eq('is_active', true)
        .order('join_date', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (membershipError || !membership?.squad_id) {
        setCurrentSquad(null)
        setIsLoadingSquad(false)
        return
      }

      const { data: squad, error: squadError } = await supabase
        .from('squads')
        .select('id, name, inv_code, squad_goal')
        .eq('id', membership.squad_id)
        .single()

      if (squadError) {
        setCurrentSquad(null)
        setIsLoadingSquad(false)
        return
      }

      setCurrentSquad(squad)
      setSquadGoalDraft(squad.squad_goal ?? '')
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

      // Added scalable_quantity to the select query
      const { data } = await supabase
        .from('goals')
        .select('id, type, baseline_points, scalable_quantity')
        .eq('squad_id', currentSquad.id)

      setCurrentGoal(data?.[0] ?? null)
      setIsLoadingGoal(false)
    }

    loadCurrentGoal()
  }, [currentSquad?.id])

  useFocusEffect(
    useCallback(() => {
      let active = true
      const loadUserGoal = async () => {
        if (!claims?.sub || !currentGoal?.id) {
          setUserGoal(null)
          setIsLoadingUserGoal(false)
          return
        }

        setIsLoadingUserGoal(true)

        const { data } = await supabase
          .from('user_goals')
          .select('id, text, user_baseline_points')
          .eq('user_id', claims.sub)
          .eq('goal_id', currentGoal.id)
          .maybeSingle()

        if (active) {
          setUserGoal(data ?? null)
          setIsLoadingUserGoal(false)
        }
      }

      loadUserGoal()
      return () => { active = false }
    }, [claims?.sub, currentGoal?.id])
  )

  const closeLogModal = () => {
    if (!isSubmittingLog) {
      setIsLogModalVisible(false)
      setLogAmount('')
    }
  }

  const handleLogData = () => {
    if (!currentGoal || !userGoal) return
    setIsLogModalVisible(true)
  }

  const handleUpdateSquadGoal = async () => {
    if (!currentSquad?.id) {
      Alert.alert('Missing squad', 'Join a squad before updating the squad goal.')
      return
    }

    setIsUpdatingSquadGoal(true)
    try {
      const nextGoal = squadGoalDraft.trim() || null

      const { error } = await supabase
        .from('squads')
        .update({ squad_goal: nextGoal })
        .eq('id', currentSquad.id)

      if (error) {
        Alert.alert('Could not update squad goal', error.message)
        return
      }

      setCurrentSquad((current) => (current ? { ...current, squad_goal: nextGoal } : current))
      setSquadGoalDraft(nextGoal ?? '')
      Alert.alert('Squad goal updated', 'Your squad goal has been saved.')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      Alert.alert('Could not update squad goal', message)
    } finally {
      setIsUpdatingSquadGoal(false)
    }
  }

  const handleSubmitLog = async () => {
    if (!userGoal?.id) {
      Alert.alert('Missing goal', 'Accept a goal before logging progress.')
      return
    }

    const parsedAmount = Number.parseFloat(logAmount.trim())
    if (Number.isNaN(parsedAmount)) {
      Alert.alert('Invalid amount', 'Please enter a valid number.')
      return
    }

    setIsSubmittingLog(true)
    try {
      const { error } = await supabase.functions.invoke('point-adding', {
        body: {
          user_goal_id: userGoal.id,
          raw_value: parsedAmount,
        },
      })

      if (error) {
        Alert.alert('Could not log completion', error.message)
        return
      }

      setIsLogModalVisible(false)
      setLogAmount('')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      Alert.alert('Could not log completion', message)
    } finally {
      setIsSubmittingLog(false)
    }
  }

  if (isLoading) {
    return null
  }

  if (!isLoggedIn) {
    return <Redirect href="/(auth)/login" />
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.kicker}>Protected area</Text>
        <Text style={styles.title}>Dashboard</Text>
        <Text style={styles.description}>Signed in as</Text>
        <Text style={styles.email}>{email ?? 'Email unavailable'}</Text>
      </View>

      <View style={styles.squadCard}>
        <Text style={styles.kicker}>Current Squad</Text>
        {isLoadingSquad ? (
          <Text style={styles.squadText}>Loading your squad...</Text>
        ) : currentSquad ? (
          <>
            <Text style={styles.squadName}>{currentSquad.name}</Text>
            <Text style={styles.squadText}>Invite code: {currentSquad.inv_code}</Text>
            <Text style={styles.squadGoalLabel}>Squad goal</Text>
            <TextInput
              style={styles.squadGoalInput}
              value={squadGoalDraft}
              onChangeText={setSquadGoalDraft}
              placeholder="Set a squad goal"
              placeholderTextColor="#687076"
              editable={!isUpdatingSquadGoal}
              multiline
            />
            <TouchableOpacity
              style={styles.saveGoalButton}
              onPress={handleUpdateSquadGoal}
              activeOpacity={0.8}
              disabled={isUpdatingSquadGoal}
            >
              {isUpdatingSquadGoal ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.saveGoalButtonText}>Update Squad Goal</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <Text style={styles.squadText}>You are not currently joined to a squad.</Text>
        )}
      </View>

      <View style={styles.goalCard}>
        <Text style={styles.kicker}>Squad Goal</Text>
        {isLoadingGoal ? (
          <Text style={styles.squadText}>Loading goal...</Text>
        ) : currentGoal ? (
          <>
            <Text style={styles.goalType}>{currentGoal.type}</Text>
            <Text style={styles.squadText}>Baseline points: {currentGoal.baseline_points ?? 0}</Text>
          </>
        ) : (
          <Text style={styles.squadText}>No goal has been set for your squad yet.</Text>
        )}
      </View>

      <View style={styles.goalCard}>
        <Text style={styles.kicker}>User Goal</Text>
        {isLoadingUserGoal ? (
          <Text style={styles.squadText}>Loading your goal...</Text>
        ) : userGoal ? (
          <>
            <Text style={styles.goalType}>{userGoal.text}</Text>
            <Text style={styles.squadText}>Baseline points: {userGoal.user_baseline_points ?? 0}</Text>

            <TouchableOpacity
              style={styles.logButton}
              onPress={handleLogData}
              activeOpacity={0.8}
            >
              <Text style={styles.logButtonText}>Log Completion</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={styles.squadText}>You haven't accepted a squad goal yet. Head to the Goals tab to get started.</Text>
        )}
      </View>

      <Modal visible={isLogModalVisible} transparent animationType="fade" onRequestClose={closeLogModal}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Log progress</Text>
            <Text style={styles.modalSubtitle}>
              Enter the amount of {currentGoal?.scalable_quantity ?? 'your goal'} completed as a float.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={logAmount}
              onChangeText={setLogAmount}
              placeholder={`Example: 10.5 ${currentGoal?.scalable_quantity ?? ''}`.trim()}
              placeholderTextColor="#687076"
              keyboardType="decimal-pad"
              editable={!isSubmittingLog}
              autoFocus
            />
            <View style={styles.modalActions}>
              <Pressable
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
                onPress={closeLogModal}
                disabled={isSubmittingLog}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.buttonPressed,
                  isSubmittingLog && styles.buttonDisabled,
                ]}
                onPress={handleSubmitLog}
                disabled={isSubmittingLog}
              >
                {isSubmittingLog ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Submit</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1117',
    justifyContent: 'center',
    padding: 24,
    gap: 16, // Added a gap here to space out the cards nicely
  },
  card: {
    backgroundColor: '#1a1d23',
    borderWidth: 1,
    borderColor: '#2a2d35',
    borderRadius: 24,
    padding: 28,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
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
  description: {
    color: '#9BA1A6',
    fontSize: 14,
  },
  email: {
    color: '#ECEDEE',
    fontSize: 18,
    fontWeight: '600',
  },
  squadCard: {
    backgroundColor: '#111318',
    borderWidth: 1,
    borderColor: '#2a2d35',
    borderRadius: 24,
    padding: 20,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 6,
  },
  squadName: {
    color: '#ECEDEE',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  squadText: {
    color: '#9BA1A6',
    fontSize: 14,
    lineHeight: 20,
  },
  squadGoalLabel: {
    color: '#ECEDEE',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
  squadGoalInput: {
    backgroundColor: '#1a1d23',
    borderColor: '#2a2d35',
    borderWidth: 1,
    borderRadius: 14,
    color: '#ECEDEE',
    fontSize: 16,
    minHeight: 88,
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlignVertical: 'top',
  },
  saveGoalButton: {
    backgroundColor: '#0a7ea4',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveGoalButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  goalCard: {
    backgroundColor: '#111318',
    borderWidth: 1,
    borderColor: '#2a2d35',
    borderRadius: 24,
    padding: 20,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 6,
  },
  goalType: {
    color: '#ECEDEE',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  // New styles for the log data button
  logButton: {
    backgroundColor: '#0a7ea4',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#111318',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#2a2d35',
    padding: 20,
    gap: 12,
  },
  modalTitle: {
    color: '#ECEDEE',
    fontSize: 20,
    fontWeight: '700',
  },
  modalSubtitle: {
    color: '#9BA1A6',
    fontSize: 14,
    lineHeight: 20,
  },
  modalInput: {
    backgroundColor: '#1a1d23',
    borderColor: '#2a2d35',
    borderWidth: 1,
    borderRadius: 14,
    color: '#ECEDEE',
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#1a1d23',
    borderColor: '#2a2d35',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#ECEDEE',
    fontSize: 16,
    fontWeight: '600',
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#0a7ea4',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonPressed: {
    transform: [{ scale: 0.98 }],
  },
})
