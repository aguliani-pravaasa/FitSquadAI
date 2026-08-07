import { IconSymbol } from '@/components/ui/icon-symbol'
import { useAuthContext } from '@/hooks/use-auth-context'
import { supabase } from '@/lib/supabase'
import { Button, Switch } from '@expo/ui'
import { Redirect, useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
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
  inv_code: string
  squad_goal: string | null
  coach: boolean | null
  commitment_level: string | null
  experience: string | null
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
  const { claims, email, isLoading, isLoggedIn, profile } = useAuthContext()
  const router = useRouter()
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
  const [isSettingsModalVisible, setIsSettingsModalVisible] = useState(false)

  // Squad create/join state (moved from squads page)
  const [isCreating, setIsCreating] = useState(false)
  const [isJoining, setIsJoining] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showJoinForm, setShowJoinForm] = useState(false)
  const [createdInviteCode, setCreatedInviteCode] = useState<string | null>(null)
  const [joinedSquadName, setJoinedSquadName] = useState<string | null>(null)
  const [form, setForm] = useState<{ name: string; squadGoal: string; coach: boolean }>({
    name: '',
    squadGoal: '',
    coach: false,
  })
  const [joinForm, setJoinForm] = useState<{ inviteCode: string }>({ inviteCode: '' })

  const INVITE_CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

  function generateInviteCode(length = 8) {
    let code = ''

    for (let index = 0; index < length; index += 1) {
      const randomIndex = Math.floor(Math.random() * INVITE_CHARACTERS.length)
      code += INVITE_CHARACTERS[randomIndex]
    }

    return code
  }

  async function addOrRestoreSquadMember(userId: string, squadId: string) {
    const now = new Date().toISOString()

    const { data: existingMember, error: existingMemberError } = await supabase
      .from('squad_members')
      .select('id')
      .eq('user_id', userId)
      .eq('squad_id', squadId)
      .maybeSingle()

    if (existingMemberError) {
      return { error: existingMemberError.message }
    }

    if (existingMember) {
      const { error } = await supabase
        .from('squad_members')
        .update({
          is_active: true,
          last_active: now,
        })
        .eq('id', existingMember.id)

      if (error) {
        return { error: error.message }
      }

      return { error: null }
    }

    const { error } = await supabase.from('squad_members').insert({
      user_id: userId,
      squad_id: squadId,
      points: 0,
      streak: 0,
      join_date: now,
      last_active: now,
      is_active: true,
    })

    if (error) {
      return { error: error.message }
    }

    return { error: null }
  }

  const createSquad = async () => {
    if (!form.name.trim()) {
      Alert.alert('Missing information', 'Please enter a squad name.')
      return
    }

    if (!claims?.sub) {
      Alert.alert('Signed out', 'Please sign in again before creating a squad.')
      return
    }

    const invCode = generateInviteCode()

    setIsCreating(true)
    const { data, error } = await supabase
      .from('squads')
      .insert({
        name: form.name.trim(),
        squad_goal: form.squadGoal.trim() || null,
        creator: claims.sub,
        coach: form.coach,
        inv_code: invCode,
      })
      .select('id, name, inv_code')
      .single()

    setIsCreating(false)

    if (error) {
      Alert.alert('Could not create squad', error.message)
      return
    }

    if (data?.id) {
      const memberResult = await addOrRestoreSquadMember(claims.sub, data.id)

      if (memberResult.error) {
        Alert.alert('Squad created, but membership failed', memberResult.error)
        return
      }

      setCreatedInviteCode(data?.inv_code ?? invCode)
      setJoinedSquadName(null)
      setForm({ name: '', squadGoal: '', coach: false })

      // Navigate to onboarding page for the new squad
      router.push({
        pathname: '/squad-onboarding',
        params: { squadId: data.id },
      })
    }
  }

  const joinSquad = async () => {
    const inviteCode = joinForm.inviteCode.trim().toUpperCase()

    if (!inviteCode) {
      Alert.alert('Missing information', 'Please enter an invite code.')
      return
    }

    if (!claims?.sub) {
      Alert.alert('Signed out', 'Please sign in again before joining a squad.')
      return
    }

    setIsJoining(true)
    const { data: squad, error } = await supabase
      .from('squads')
      .select('id, name')
      .eq('inv_code', inviteCode)
      .maybeSingle()

    if (error) {
      setIsJoining(false)
      Alert.alert('Could not find squad', error.message)
      return
    }

    if (!squad) {
      setIsJoining(false)
      Alert.alert('Invalid code', 'No squad matches that invite code.')
      return
    }

    const memberResult = await addOrRestoreSquadMember(claims.sub, squad.id)
    setIsJoining(false)

    if (memberResult.error) {
      Alert.alert('Could not join squad', memberResult.error)
      return
    }

    setJoinedSquadName(squad.name)
    setCreatedInviteCode(null)
    setJoinForm({ inviteCode: '' })
  }

  const [isLogModalVisible, setIsLogModalVisible] = useState(false)
  const [logAmount, setLogAmount] = useState('')
  const [isSubmittingLog, setIsSubmittingLog] = useState(false)

  const [squadGoalDraft, setSquadGoalDraft] = useState('')
  const [squadCoachDraft, setSquadCoachDraft] = useState(true)
  const [squadCommitmentDraft, setSquadCommitmentDraft] = useState<'casual' | 'medium' | 'intense'>('medium')
  const [squadExperienceDraft, setSquadExperienceDraft] = useState<'amateur' | 'intermediate' | 'pro'>('intermediate')
  const [isUpdatingSquadGoal, setIsUpdatingSquadGoal] = useState(false)
  const [isEditingSquadGoal, setIsEditingSquadGoal] = useState(false)

  const [isGoalFormOpen, setIsGoalFormOpen] = useState(false)
  const [isCreatingGoal, setIsCreatingGoal] = useState(false)
  const [isSavingGoal, setIsSavingGoal] = useState(false)
  const [goalTypeDraft, setGoalTypeDraft] = useState('')
  const [baselinePointsDraft, setBaselinePointsDraft] = useState('0')
  const [isAcceptingGoal, setIsAcceptingGoal] = useState(false)

  const openSettingsMenu = () => {
    setSquadGoalDraft(currentSquad?.squad_goal ?? '')
    setSquadCoachDraft(currentSquad?.coach ?? true)
    setSquadCommitmentDraft((currentSquad?.commitment_level as any) ?? 'medium')
    setSquadExperienceDraft((currentSquad?.experience as any) ?? 'intermediate')
    setGoalTypeDraft(currentGoal?.type ?? '')
    setBaselinePointsDraft(currentGoal?.baseline_points?.toString() ?? '0')
    setIsEditingSquadGoal(false)
    setIsGoalFormOpen(false)
    setIsCreatingGoal(false)
    setIsSettingsModalVisible(true)
  }

  const closeSettingsMenu = () => {
    setIsSettingsModalVisible(false)
    setIsEditingSquadGoal(false)
    setIsGoalFormOpen(false)
    setIsCreatingGoal(false)
    setSquadGoalDraft(currentSquad?.squad_goal ?? '')
    setSquadCoachDraft(currentSquad?.coach ?? true)
    setSquadCommitmentDraft((currentSquad?.commitment_level as any) ?? 'medium')
    setSquadExperienceDraft((currentSquad?.experience as any) ?? 'intermediate')
    setGoalTypeDraft(currentGoal?.type ?? '')
    setBaselinePointsDraft(currentGoal?.baseline_points?.toString() ?? '0')
  }

  const openProfileEditor = () => {
    closeSettingsMenu()
    router.push('/(tabs)/profiles')
  }

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
        .select('id, name, inv_code, squad_goal, coach, commitment_level, experience')
        .eq('id', membership.squad_id)
        .single()

      if (squadError) {
        setCurrentSquad(null)
        setIsLoadingSquad(false)
        return
      }

      setCurrentSquad(squad)
      setSquadGoalDraft(squad.squad_goal ?? '')
      setSquadCoachDraft(squad.coach ?? true)
      setSquadCommitmentDraft((squad.commitment_level as any) ?? 'medium')
      setSquadExperienceDraft((squad.experience as any) ?? 'intermediate')
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
      Alert.alert('Missing squad', 'Join a squad before updating squad settings.')
      return
    }

    setIsUpdatingSquadGoal(true)

    try {
      const nextGoal = squadGoalDraft.trim() || null

      const { error } = await supabase
        .from('squads')
        .update({
          squad_goal: nextGoal,
          coach: squadCoachDraft,
          commitment_level: squadCommitmentDraft,
          experience: squadExperienceDraft,
        })
        .eq('id', currentSquad.id)

      if (error) {
        Alert.alert('Could not update squad settings', error.message)
        return
      }

      setCurrentSquad((current) =>
        current
          ? {
              ...current,
              squad_goal: nextGoal,
              coach: squadCoachDraft,
              commitment_level: squadCommitmentDraft,
              experience: squadExperienceDraft,
            }
          : current,
      )
      setSquadGoalDraft(nextGoal ?? '')
      setIsEditingSquadGoal(false)
      Alert.alert('Squad settings updated', 'Your squad settings have been saved.')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      Alert.alert('Could not update squad settings', message)
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
          <Pressable
            accessibilityLabel="Open dashboard settings"
            accessibilityRole="button"
            onPress={openSettingsMenu}
            style={({ pressed }) => [styles.settingsButton, pressed && styles.settingsButtonPressed]}
          >
            <IconSymbol name="gearshape.fill" size={16} color="#eef5ff" />
          </Pressable>
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
              <Text style={styles.squadText}>Open settings to update the squad mission.</Text>
            </>
          ) : (
            // Render create / join controls inline when the user has no squad
            <>
              {!showCreateForm ? (
                <Button
                  style={styles.button}
                  onPress={() => {
                    setShowCreateForm(true)
                    setShowJoinForm(false)
                  }}
                >
                  <Text style={styles.buttonText}>Create a New Squad</Text>
                </Button>
              ) : (
                <View style={styles.card}>
                  <Text style={styles.label}>Squad Name</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Morning Movers"
                    placeholderTextColor="#687076"
                    value={form.name}
                    onChangeText={(text) => setForm((current) => ({ ...current, name: text }))}
                    editable={!isCreating}
                  />

                  <Text style={styles.label}>Squad Goal</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="Running, Heart Health, Weight Loss, etc."
                    placeholderTextColor="#687076"
                    value={form.squadGoal}
                    onChangeText={(text) => setForm((current) => ({ ...current, squadGoal: text }))}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                    editable={!isCreating}
                  />

                  <View style={styles.switchRow}>
                    <View style={styles.switchCopy}>
                      <Text style={styles.label}>Coach</Text>
                      <Text style={styles.switchDescription}>AI Coach Features</Text>
                    </View>
                    <Switch
                      value={form.coach}
                      onValueChange={(checked) => setForm((current) => ({ ...current, coach: checked }))}
                      disabled={isCreating}
                    />
                  </View>

                  <View style={styles.formActions}>
                    <Button
                      variant="outlined"
                      style={styles.secondaryButton}
                      onPress={() => setShowCreateForm(false)}
                      disabled={isCreating}
                    >
                      <Text style={styles.secondaryButtonText}>Cancel</Text>
                    </Button>
                    <Button
                      style={isCreating ? { ...styles.button, ...styles.buttonDisabled } : styles.button}
                      onPress={createSquad}
                      disabled={isCreating}
                    >
                      {isCreating ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create Squad</Text>}
                    </Button>
                  </View>
                </View>
              )}

              <Button
                variant="outlined"
                style={styles.secondaryButton}
                onPress={() => setShowJoinForm((current) => !current)}
              >
                <Text style={styles.secondaryButtonText}>Join an existing squad</Text>
              </Button>

              {showJoinForm ? (
                <View style={styles.card}>
                  <Text style={styles.label}>Invite Code</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="ABCDEFGH"
                    placeholderTextColor="#687076"
                    value={joinForm.inviteCode}
                    onChangeText={(text) => setJoinForm({ inviteCode: text })}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    editable={!isJoining}
                  />

                  <Button
                    style={isJoining ? { ...styles.button, ...styles.buttonDisabled } : styles.button}
                    onPress={joinSquad}
                    disabled={isJoining}
                  >
                    {isJoining ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Join Squad</Text>}
                  </Button>
                </View>
              ) : null}

              {createdInviteCode ? (
                <View style={styles.successCard}>
                  <Text style={styles.successLabel}>Squad created</Text>
                  <Text style={styles.successText}>Invite code: {createdInviteCode}</Text>
                </View>
              ) : null}

              {joinedSquadName ? (
                <View style={styles.successCard}>
                  <Text style={styles.successLabel}>Joined squad</Text>
                  <Text style={styles.successText}>{joinedSquadName}</Text>
                </View>
              ) : null}
            </>
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
              <Text style={styles.squadText}>Use settings to edit or recreate the squad goal.</Text>
            </>
          ) : (
            <Text style={styles.squadText}>No squad goal yet. Create one here instead of switching tabs.</Text>
          )}
          <Text style={styles.squadText}>Open settings to edit or create the squad goal.</Text>
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

      <Modal visible={isSettingsModalVisible} transparent animationType="fade" onRequestClose={closeSettingsMenu}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, styles.settingsModalCard]}>
            <View style={styles.settingsHeader}>
              <View style={styles.settingsHeaderCopy}>
                <Text style={styles.modalTitle}>Settings</Text>
                <Text style={styles.modalSubtitle}>Edit squad, users, and goals from one place.</Text>
              </View>
              <Button style={styles.closeButton} variant="outlined" onPress={closeSettingsMenu}>
                <Text style={styles.ghostButtonText}>Close</Text>
              </Button>
            </View>

            <ScrollView contentContainerStyle={styles.settingsContent} showsVerticalScrollIndicator={false}>
              <View style={styles.settingsSection}>
                <Text style={styles.settingsSectionLabel}>Squad</Text>
                <Text style={styles.settingsSectionTitle}>{currentSquad?.name ?? 'No active squad'}</Text>
                <Text style={styles.settingsSectionText}>
                  {currentSquad
                    ? `Invite code: ${currentSquad.inv_code}`
                    : 'Join or create a squad to manage the mission here.'}
                </Text>
                <Text style={styles.settingsSectionText}>
                  {currentSquad?.squad_goal ? `Mission: ${currentSquad.squad_goal}` : 'No squad mission set yet.'}
                </Text>
                {currentSquad ? (
                  <>
                    <Text style={styles.settingsSectionText}>
                      AI Coach: {currentSquad.coach ? 'Enabled' : 'Disabled'}
                    </Text>
                    <Text style={styles.settingsSectionText}>
                      Commitment: {currentSquad.commitment_level ? currentSquad.commitment_level.toUpperCase() : 'MEDIUM'}
                    </Text>
                    <Text style={styles.settingsSectionText}>
                      Experience: {currentSquad.experience ? currentSquad.experience.toUpperCase() : 'INTERMEDIATE'}
                    </Text>
                  </>
                ) : null}

                {currentSquad ? (
                  !isEditingSquadGoal ? (
                    <Button
                      style={styles.primaryButton}
                      onPress={() => {
                        setSquadGoalDraft(currentSquad.squad_goal ?? '')
                        setSquadCoachDraft(currentSquad.coach ?? true)
                        setSquadCommitmentDraft((currentSquad.commitment_level as any) ?? 'medium')
                        setSquadExperienceDraft((currentSquad.experience as any) ?? 'intermediate')
                        setIsEditingSquadGoal(true)
                      }}
                    >
                      <Text style={styles.primaryButtonText}>Edit Squad Settings</Text>
                    </Button>
                  ) : (
                    <>
                      <Text style={styles.settingsFieldLabel}>Squad Goal / Mission</Text>
                      <TextInput
                        style={styles.squadGoalInput}
                        value={squadGoalDraft}
                        onChangeText={setSquadGoalDraft}
                        placeholder="Set a squad mission"
                        placeholderTextColor="#687076"
                        editable={!isUpdatingSquadGoal}
                        multiline
                      />

                      <View style={styles.switchSettingRow}>
                        <Text style={styles.settingsFieldLabel}>AI Coach</Text>
                        <Switch
                          value={squadCoachDraft}
                          onValueChange={setSquadCoachDraft}
                          disabled={isUpdatingSquadGoal}
                        />
                      </View>

                      <Text style={styles.settingsFieldLabel}>Commitment Level</Text>
                      <View style={styles.settingOptionGroup}>
                        {(['casual', 'medium', 'intense'] as const).map((level) => (
                          <Pressable
                            key={level}
                            style={[
                              styles.settingOptionPill,
                              squadCommitmentDraft === level && styles.settingOptionPillSelected,
                            ]}
                            onPress={() => setSquadCommitmentDraft(level)}
                          >
                            <Text
                              style={[
                                styles.settingOptionPillText,
                                squadCommitmentDraft === level && styles.settingOptionPillTextSelected,
                              ]}
                            >
                              {level.charAt(0).toUpperCase() + level.slice(1)}
                            </Text>
                          </Pressable>
                        ))}
                      </View>

                      <Text style={styles.settingsFieldLabel}>Fitness Experience</Text>
                      <View style={styles.settingOptionGroup}>
                        {(['amateur', 'intermediate', 'pro'] as const).map((exp) => (
                          <Pressable
                            key={exp}
                            style={[
                              styles.settingOptionPill,
                              squadExperienceDraft === exp && styles.settingOptionPillSelected,
                            ]}
                            onPress={() => setSquadExperienceDraft(exp)}
                          >
                            <Text
                              style={[
                                styles.settingOptionPillText,
                                squadExperienceDraft === exp && styles.settingOptionPillTextSelected,
                              ]}
                            >
                              {exp.charAt(0).toUpperCase() + exp.slice(1)}
                            </Text>
                          </Pressable>
                        ))}
                      </View>

                      <View style={styles.rowActions}>
                        <Button
                          style={styles.ghostButton}
                          variant="outlined"
                          onPress={() => {
                            setIsEditingSquadGoal(false)
                            setSquadGoalDraft(currentSquad?.squad_goal ?? '')
                          }}
                          disabled={isUpdatingSquadGoal}
                        >
                          <Text style={styles.ghostButtonText}>Cancel</Text>
                        </Button>
                        <Button style={styles.primaryButton} onPress={handleUpdateSquadGoal} disabled={isUpdatingSquadGoal}>
                          {isUpdatingSquadGoal ? (
                            <ActivityIndicator color="#ffffff" />
                          ) : (
                            <Text style={styles.primaryButtonText}>Save Settings</Text>
                          )}
                        </Button>
                      </View>
                    </>
                  )
                ) : null}
              </View>

              <View style={styles.settingsSection}>
                <Text style={styles.settingsSectionLabel}>Users</Text>
                <Text style={styles.settingsSectionTitle}>{profile?.full_name ?? 'Profile not set'}</Text>
                <Text style={styles.settingsSectionText}>{email ?? 'Email unavailable'}</Text>
                <Text style={styles.settingsSectionText}>Username: {profile?.username ?? 'Not set'}</Text>
                <Text style={styles.settingsSectionText}>Body details live in your profile screen.</Text>
                <Button style={styles.ghostButton} variant="outlined" onPress={openProfileEditor}>
                  <Text style={styles.ghostButtonText}>Edit Body Details</Text>
                </Button>
              </View>

              <View style={styles.settingsSection}>
                <Text style={styles.settingsSectionLabel}>Goals</Text>
                <Text style={styles.settingsSectionTitle}>{currentGoal?.type ?? 'No squad goal yet'}</Text>
                <Text style={styles.settingsSectionText}>
                  {currentGoal ? `Baseline points: ${currentGoal.baseline_points ?? 0}` : 'Create a squad goal to start tracking.'}
                </Text>

                {!isGoalFormOpen ? (
                  <View style={styles.rowActions}>
                    <Button
                      style={styles.primaryButton}
                      onPress={() => {
                        setGoalTypeDraft(currentGoal?.type ?? '')
                        setBaselinePointsDraft(currentGoal?.baseline_points?.toString() ?? '0')
                        setIsCreatingGoal(!currentGoal)
                        setIsGoalFormOpen(true)
                      }}
                    >
                      <Text style={styles.primaryButtonText}>{currentGoal ? 'Edit Goal' : 'Create Goal'}</Text>
                    </Button>
                    {currentGoal && !userGoal ? (
                      <Button style={styles.ghostButton} variant="outlined" onPress={handleAcceptGoal} disabled={isAcceptingGoal}>
                        {isAcceptingGoal ? (
                          <ActivityIndicator color="#ffffff" />
                        ) : (
                          <Text style={styles.ghostButtonText}>Accept Goal</Text>
                        )}
                      </Button>
                    ) : null}
                  </View>
                ) : (
                  <>
                    <Text style={styles.settingsFieldLabel}>Goal description</Text>
                    <TextInput
                      style={styles.squadGoalInput}
                      value={goalTypeDraft}
                      onChangeText={setGoalTypeDraft}
                      placeholder="Run 20 minutes daily"
                      placeholderTextColor="#687076"
                      multiline
                      editable={!isSavingGoal}
                    />

                    <Text style={styles.settingsFieldLabel}>Baseline points</Text>
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
                )}
              </View>

              <View style={styles.settingsSection}>
                <Text style={styles.settingsSectionLabel}>Feedback</Text>
                <Text style={styles.settingsSectionTitle}>Send Feedback</Text>
                <Text style={styles.settingsSectionText}>
                  Help us improve FitSquad AI with your ideas, feature requests, or bug reports.
                </Text>
                <Button
                  style={styles.ghostButton}
                  variant="outlined"
                  onPress={() => {
                    closeSettingsMenu()
                    router.push('/(tabs)/feedback')
                  }}
                >
                  <Text style={styles.ghostButtonText}>Submit Feedback</Text>
                </Button>
              </View>
            </ScrollView>
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
    position: 'relative',
    backgroundColor: '#141b26',
    borderColor: '#273245',
    borderWidth: 1,
    borderRadius: 24,
    padding: 20,
    paddingRight: 64,
    gap: 8,
  },
  settingsButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0c121b',
    borderColor: '#2f3e53',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.96 }],
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
  button: {
    backgroundColor: '#0a7ea4',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  label: {
    color: '#9fb1c2',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  textArea: {
    minHeight: 112,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  switchCopy: {
    flex: 1,
    gap: 4,
  },
  switchDescription: {
    color: '#a0afbf',
    fontSize: 14,
    lineHeight: 20,
  },
  formActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#141c28',
    borderColor: '#304157',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#d2deea',
    fontSize: 15,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  successCard: {
    backgroundColor: '#0f1b27',
    borderColor: '#2f4d3d',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  successLabel: {
    color: '#5ec27a',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  successText: {
    color: '#e6edf5',
    fontSize: 14,
    lineHeight: 20,
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
  settingsModalCard: {
    maxHeight: '90%',
  },
  settingsHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  settingsHeaderCopy: {
    flex: 1,
    gap: 6,
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
  closeButton: {
    minWidth: 72,
    backgroundColor: '#141c28',
    borderColor: '#304157',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsContent: {
    gap: 14,
    paddingBottom: 8,
  },
  settingsSection: {
    backgroundColor: '#0c121b',
    borderWidth: 1,
    borderColor: '#273245',
    borderRadius: 20,
    padding: 16,
    gap: 10,
  },
  settingsSectionLabel: {
    color: '#5ec27a',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  settingsSectionTitle: {
    color: '#ECEDEE',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  settingsSectionText: {
    color: '#a0afbf',
    fontSize: 14,
    lineHeight: 20,
  },
  settingsFieldLabel: {
    color: '#9fb1c2',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  switchSettingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  settingOptionGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  settingOptionPill: {
    flex: 1,
    backgroundColor: '#161d28',
    borderWidth: 1,
    borderColor: '#293547',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingOptionPillSelected: {
    backgroundColor: '#0a7ea4',
    borderColor: '#0a7ea4',
  },
  settingOptionPillText: {
    color: '#9BA1A6',
    fontSize: 13,
    fontWeight: '700',
  },
  settingOptionPillTextSelected: {
    color: '#ffffff',
  },
})
