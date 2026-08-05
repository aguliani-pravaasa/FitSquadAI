import { useAuthContext } from '@/hooks/use-auth-context'
import { supabase } from '@/lib/supabase'
import { Button, TextInput } from '@expo/ui'
import { Redirect, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import {
    ActivityIndicator,
    Alert,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
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

type LeaderboardMember = {
  user_id: string
  points: number
  profiles?: {
    full_name?: string | null
    username?: string | null
  } | null
}

export default function DashboardScreen() {
  const { claims, email, isLoading, isLoggedIn } = useAuthContext()
  const userId = claims?.sub

  const [currentSquad, setCurrentSquad] = useState<SquadSummary | null>(null)
  const [currentGoal, setCurrentGoal] = useState<GoalSummary | null>(null)
  const currentGoalId = currentGoal?.id ?? null
  const [userGoal, setUserGoal] = useState<UserGoalSummary | null>(null)
  const [leaders, setLeaders] = useState<LeaderboardMember[]>([])

  const [isLoadingSquad, setIsLoadingSquad] = useState(true)
  const [isLoadingGoal, setIsLoadingGoal] = useState(true)
  const [isLoadingUserGoal, setIsLoadingUserGoal] = useState(true)
  const [isLoadingLeaders, setIsLoadingLeaders] = useState(false)

  const [isLogModalVisible, setIsLogModalVisible] = useState(false)
  const [logAmount, setLogAmount] = useState('')
  const [isSubmittingLog, setIsSubmittingLog] = useState(false)

  const [squadGoalDraft, setSquadGoalDraft] = useState('')
  const [isUpdatingSquadGoal, setIsUpdatingSquadGoal] = useState(false)
  const [isEditingSquadGoal, setIsEditingSquadGoal] = useState(false)

  const [isGoalFormOpen, setIsGoalFormOpen] = useState(false)
  const [isCreatingGoal, setIsCreatingGoal] = useState(false)
  const [isSavingGoal, setIsSavingGoal] = useState(false)
  const [goalTypeDraft, setGoalTypeDraft] = useState('')
  const [baselinePointsDraft, setBaselinePointsDraft] = useState('0')
  const [isAcceptingGoal, setIsAcceptingGoal] = useState(false)

  useEffect(() => {
    const loadCurrentSquad = async () => {
      if (!userId) {
        setCurrentSquad(null)
        setIsLoadingSquad(false)
        return
      }

      setIsLoadingSquad(true)

      const { data: membership, error: membershipError } = await supabase
        .from('squad_members')
        .select('squad_id')
        .eq('user_id', userId)
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
  }, [userId])

  useEffect(() => {
    const loadCurrentGoal = async () => {
      if (!currentSquad?.id) {
        setCurrentGoal(null)
        setGoalTypeDraft('')
        setBaselinePointsDraft('0')
        setIsLoadingGoal(false)
        return
      }

      setIsLoadingGoal(true)

      const { data } = await supabase
        .from('goals')
        .select('id, type, baseline_points, scalable_quantity')
        .eq('squad_id', currentSquad.id)

      const nextGoal = data?.[0] ?? null
      setCurrentGoal(nextGoal)
      setGoalTypeDraft(nextGoal?.type ?? '')
      setBaselinePointsDraft(nextGoal?.baseline_points?.toString() ?? '0')
      setIsLoadingGoal(false)
    }

    loadCurrentGoal()
  }, [currentSquad?.id])

  useFocusEffect(
    useCallback(() => {
      let active = true

      const loadUserGoal = async () => {
        if (!userId || !currentGoalId) {
          setUserGoal(null)
          setIsLoadingUserGoal(false)
          return
        }

        setIsLoadingUserGoal(true)

        const { data } = await supabase
          .from('user_goals')
          .select('id, text, user_baseline_points')
          .eq('user_id', userId)
          .eq('goal_id', currentGoalId)
          .maybeSingle()

        if (active) {
          setUserGoal(data ?? null)
          setIsLoadingUserGoal(false)
        }
      }

      loadUserGoal()

      return () => {
        active = false
      }
    }, [userId, currentGoalId]),
  )

  useEffect(() => {
    const loadLeaders = async () => {
      if (!currentSquad?.id) {
        setLeaders([])
        setIsLoadingLeaders(false)
        return
      }

      setIsLoadingLeaders(true)

      const { data, error } = await supabase
        .from('squad_members')
        .select('user_id, points, profiles(full_name, username)')
        .eq('squad_id', currentSquad.id)
        .eq('is_active', true)
        .order('points', { ascending: false })
        .limit(3)

      if (error) {
        setLeaders([])
      } else {
        setLeaders((data ?? []) as unknown as LeaderboardMember[])
      }

      setIsLoadingLeaders(false)
    }

    loadLeaders()
  }, [currentSquad?.id])

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
      Alert.alert('Missing squad', 'Join a squad before updating the squad mission.')
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
        Alert.alert('Could not update squad mission', error.message)
        return
      }

      setCurrentSquad((current) => (current ? { ...current, squad_goal: nextGoal } : current))
      setSquadGoalDraft(nextGoal ?? '')
      setIsEditingSquadGoal(false)
      Alert.alert('Squad mission updated', 'Your squad mission has been saved.')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      Alert.alert('Could not update squad mission', message)
    } finally {
      setIsUpdatingSquadGoal(false)
    }
  }

  const handleSaveSquadGoal = async () => {
    if (!currentSquad?.id) {
      Alert.alert('Missing squad', 'Join a squad before adding a goal.')
      return
    }

    const trimmedGoal = goalTypeDraft.trim()
    const parsedPoints = baselinePointsDraft.trim() ? Number.parseInt(baselinePointsDraft.trim(), 10) : 0

    if (!trimmedGoal) {
      Alert.alert('Missing information', 'Please enter a goal description.')
      return
    }

    if (Number.isNaN(parsedPoints)) {
      Alert.alert('Invalid points', 'Please enter a valid baseline points number.')
      return
    }

    setIsSavingGoal(true)

    try {
      if (currentGoal) {
        const { data: updatedGoal, error } = await supabase
          .from('goals')
          .update({ type: trimmedGoal, baseline_points: parsedPoints })
          .eq('id', currentGoal.id)
          .select('id, type, baseline_points, scalable_quantity')
          .single()

        if (error) {
          Alert.alert('Could not update goal', error.message)
          return
        }

        setCurrentGoal(updatedGoal)
      } else {
        const { data: insertedGoal, error } = await supabase
          .from('goals')
          .insert({
            squad_id: currentSquad.id,
            type: trimmedGoal,
            baseline_points: parsedPoints,
          })
          .select('id, type, baseline_points, scalable_quantity')
          .single()

        if (error) {
          Alert.alert('Could not create goal', error.message)
          return
        }

        setCurrentGoal(insertedGoal)
      }

      setIsGoalFormOpen(false)
      setIsCreatingGoal(false)
      Alert.alert('Goal saved', 'Your squad goal is now active on the dashboard.')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      Alert.alert('Could not save goal', message)
    } finally {
      setIsSavingGoal(false)
    }
  }

  const handleAcceptGoal = async () => {
    if (!currentGoal) {
      Alert.alert('No goal yet', 'Create a squad goal first.')
      return
    }

    if (!userId) {
      Alert.alert('Not signed in', 'Please sign in again before accepting a goal.')
      return
    }

    setIsAcceptingGoal(true)

    try {
      const { data, error } = await supabase.functions.invoke('hyper-service', {
        body: {
          goal_id: currentGoal.id,
          user_id: userId,
        },
      })

      if (error) {
        let message = error.message ?? 'Failed to accept goal.'

        if (error.context?.text) {
          try {
            const bodyText = await error.context.text()
            const bodyJson = JSON.parse(bodyText)
            if (bodyJson?.error) {
              message = bodyJson.error
            }
          } catch {
            // Ignore malformed function payloads and keep default message.
          }
        }

        Alert.alert('Could not accept goal', message)
        return
      }

      const scaledText: string = data?.scaled_text ?? data?.text ?? ''
      const { data: nextUserGoal } = await supabase
        .from('user_goals')
        .select('id, text, user_baseline_points')
        .eq('user_id', userId)
        .eq('goal_id', currentGoal.id)
        .maybeSingle()

      setUserGoal(nextUserGoal ?? null)

      Alert.alert(
        'Goal accepted',
        scaledText ? `Your personalized goal: ${scaledText}` : 'Your personalized goal is now active.',
      )
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      Alert.alert('Could not accept goal', message)
    } finally {
      setIsAcceptingGoal(false)
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
    <View style={styles.screen}>
      <View style={styles.orbTop} />
      <View style={styles.orbBottom} />

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <Text style={styles.kicker}>Today</Text>
          <Text style={styles.title}>Dashboard</Text>
          <Text style={styles.description}>Signed in as</Text>
          <Text style={styles.email}>{email ?? 'Email unavailable'}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Your Squad</Text>
          {isLoadingSquad ? (
            <Text style={styles.squadText}>Loading your squad...</Text>
          ) : currentSquad ? (
            <>
              <Text style={styles.squadName}>{currentSquad.name}</Text>
              <Text style={styles.squadText}>Invite code: {currentSquad.inv_code}</Text>
              <Text style={styles.squadText}>
                {currentSquad.squad_goal ? `Squad mission: ${currentSquad.squad_goal}` : 'No squad mission yet.'}
              </Text>

              {isEditingSquadGoal ? (
                <>
                  <TextInput
                    style={styles.squadGoalInput}
                    value={squadGoalDraft}
                    onChangeText={setSquadGoalDraft}
                    placeholder="Set a squad mission"
                    placeholderTextColor="#687076"
                    editable={!isUpdatingSquadGoal}
                    multiline
                  />
                  <View style={styles.rowActions}>
                    <Button
                      style={styles.ghostButton}
                      variant="outlined"
                      onPress={() => setIsEditingSquadGoal(false)}
                      disabled={isUpdatingSquadGoal}
                    >
                      <Text style={styles.ghostButtonText}>Cancel</Text>
                    </Button>
                    <Button style={styles.primaryButton} onPress={handleUpdateSquadGoal} disabled={isUpdatingSquadGoal}>
                      {isUpdatingSquadGoal ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>Save</Text>}
                    </Button>
                  </View>
                </>
              ) : (
                <Button style={styles.primaryButton} onPress={() => setIsEditingSquadGoal(true)}>
                  <Text style={styles.primaryButtonText}>
                    {currentSquad.squad_goal ? 'Edit Squad Mission' : 'Set Squad Mission'}
                  </Text>
                </Button>
              )}
            </>
          ) : (
            <Text style={styles.squadText}>
              Join or create a squad from the Squads tab to start tracking together.
            </Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Goal Setup</Text>
          {isLoadingGoal ? (
            <Text style={styles.squadText}>Loading goal...</Text>
          ) : currentGoal ? (
            <>
              <Text style={styles.goalType}>{currentGoal.type}</Text>
              <Text style={styles.squadText}>Baseline points: {currentGoal.baseline_points ?? 0}</Text>
              {!isGoalFormOpen ? (
                <Button style={styles.ghostButton} variant="outlined" onPress={() => setIsGoalFormOpen(true)}>
                  <Text style={styles.ghostButtonText}>Edit Goal</Text>
                </Button>
              ) : null}
            </>
          ) : (
            <Text style={styles.squadText}>No squad goal yet. Create one here instead of switching tabs.</Text>
          )}

          {!isGoalFormOpen && !currentGoal ? (
            <Button
              style={styles.primaryButton}
              onPress={() => {
                setIsGoalFormOpen(true)
                setIsCreatingGoal(true)
              }}
            >
              <Text style={styles.primaryButtonText}>Create Squad Goal</Text>
            </Button>
          ) : null}

          {isGoalFormOpen ? (
            <>
              <TextInput
                style={styles.squadGoalInput}
                value={goalTypeDraft}
                onChangeText={setGoalTypeDraft}
                placeholder="Run 20 minutes daily"
                placeholderTextColor="#687076"
                multiline
                editable={!isSavingGoal}
              />
              <TextInput
                style={styles.input}
                value={baselinePointsDraft}
                onChangeText={setBaselinePointsDraft}
                placeholder="0"
                placeholderTextColor="#687076"
                keyboardType="number-pad"
                editable={!isSavingGoal}
              />
              <View style={styles.rowActions}>
                <Button
                  style={styles.ghostButton}
                  variant="outlined"
                  onPress={() => {
                    setIsGoalFormOpen(false)
                    setIsCreatingGoal(false)
                    setGoalTypeDraft(currentGoal?.type ?? '')
                    setBaselinePointsDraft(currentGoal?.baseline_points?.toString() ?? '0')
                  }}
                  disabled={isSavingGoal}
                >
                  <Text style={styles.ghostButtonText}>Cancel</Text>
                </Button>
                <Button style={styles.primaryButton} onPress={handleSaveSquadGoal} disabled={isSavingGoal}>
                  {isSavingGoal ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>{isCreatingGoal ? 'Create' : 'Save'}</Text>
                  )}
                </Button>
              </View>
            </>
          ) : null}

          {currentGoal && !userGoal ? (
            <Button style={styles.primaryButton} onPress={handleAcceptGoal} disabled={isAcceptingGoal}>
              {isAcceptingGoal ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>Accept My Goal</Text>}
            </Button>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>My Progress</Text>
          {isLoadingUserGoal ? (
            <Text style={styles.squadText}>Loading your goal...</Text>
          ) : userGoal ? (
            <>
              <Text style={styles.goalType}>{userGoal.text}</Text>
              <Text style={styles.squadText}>Baseline points: {userGoal.user_baseline_points ?? 0}</Text>
              <Button style={styles.primaryButton} onPress={handleLogData}>
                <Text style={styles.primaryButtonText}>Log Completion</Text>
              </Button>
            </>
          ) : (
            <Text style={styles.squadText}>Accept the active squad goal to begin logging progress.</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Top Teammates</Text>
          {isLoadingLeaders ? (
            <Text style={styles.squadText}>Loading standings...</Text>
          ) : leaders.length === 0 ? (
            <Text style={styles.squadText}>No leaderboard data yet. Log your first activity to get ranking.</Text>
          ) : (
            leaders.map((member, index) => {
              const name = member.profiles?.full_name ?? member.profiles?.username ?? 'Squad member'

              return (
                <View key={member.user_id} style={styles.leaderRow}>
                  <Text style={styles.leaderRank}>{index + 1}</Text>
                  <Text style={styles.leaderName}>{name}</Text>
                  <Text style={styles.leaderPoints}>{member.points} pts</Text>
                </View>
              )
            })
          )}
        </View>
      </ScrollView>

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
            <View style={styles.rowActions}>
              <Button style={styles.ghostButton} variant="outlined" onPress={closeLogModal} disabled={isSubmittingLog}>
                <Text style={styles.ghostButtonText}>Cancel</Text>
              </Button>
              <Button
                style={styles.primaryButton}
                onPress={handleSubmitLog}
                disabled={isSubmittingLog}
              >
                {isSubmittingLog ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>Submit</Text>}
              </Button>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0b1018',
  },
  orbTop: {
    position: 'absolute',
    top: -70,
    right: -20,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: 'rgba(10, 126, 164, 0.18)',
  },
  orbBottom: {
    position: 'absolute',
    bottom: 30,
    left: -80,
    width: 240,
    height: 240,
    borderRadius: 999,
    backgroundColor: 'rgba(94, 189, 126, 0.12)',
  },
  container: {
    padding: 20,
    paddingBottom: 36,
    gap: 14,
  },
  heroCard: {
    backgroundColor: '#141b26',
    borderColor: '#273245',
    borderWidth: 1,
    borderRadius: 24,
    padding: 20,
    gap: 8,
  },
  card: {
    backgroundColor: '#111722',
    borderWidth: 1,
    borderColor: '#273245',
    borderRadius: 24,
    padding: 18,
    gap: 10,
  },
  kicker: {
    color: '#5ec27a',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    color: '#ECEDEE',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  description: {
    color: '#9fb1c2',
    fontSize: 14,
  },
  email: {
    color: '#ECEDEE',
    fontSize: 16,
    fontWeight: '600',
  },
  sectionTitle: {
    color: '#f0f6ff',
    fontSize: 17,
    fontWeight: '700',
  },
  squadName: {
    color: '#ECEDEE',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  squadText: {
    color: '#a0afbf',
    fontSize: 14,
    lineHeight: 20,
  },
  squadGoalInput: {
    backgroundColor: '#0c121b',
    borderColor: '#283648',
    borderWidth: 1,
    borderRadius: 14,
    color: '#ECEDEE',
    fontSize: 16,
    minHeight: 84,
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlignVertical: 'top',
  },
  input: {
    backgroundColor: '#0c121b',
    borderColor: '#283648',
    borderWidth: 1,
    borderRadius: 14,
    color: '#ECEDEE',
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowActions: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#0a7ea4',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  ghostButton: {
    flex: 1,
    backgroundColor: '#141c28',
    borderColor: '#304157',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostButtonText: {
    color: '#d2deea',
    fontSize: 15,
    fontWeight: '600',
  },
  goalType: {
    color: '#ECEDEE',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomColor: '#1f2b3a',
    borderBottomWidth: 1,
  },
  leaderRank: {
    color: '#5ec27a',
    fontSize: 16,
    fontWeight: '700',
    width: 24,
  },
  leaderName: {
    flex: 1,
    color: '#e6edf5',
    fontSize: 15,
    fontWeight: '600',
  },
  leaderPoints: {
    color: '#8dc7db',
    fontSize: 14,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 8, 16, 0.65)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#111722',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#283648',
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
    backgroundColor: '#0c121b',
    borderColor: '#283648',
    borderWidth: 1,
    borderRadius: 14,
    color: '#ECEDEE',
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
})
