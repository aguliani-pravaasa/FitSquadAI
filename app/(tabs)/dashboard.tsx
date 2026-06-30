import { useAuthContext } from '@/hooks/use-auth-context'
import { supabase } from '@/lib/supabase'
import { Redirect, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

type SquadSummary = {
  id: string
  name: string
  inv_code: string
}

type GoalSummary = {
  id: string
  type: string
  baseline_points: number | null
  scalable_quantity: boolean | null // Added scalable_quantity
}

type UserGoalSummary = {
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
        .select('id, name, inv_code')
        .eq('id', membership.squad_id)
        .single()

      if (squadError) {
        setCurrentSquad(null)
        setIsLoadingSquad(false)
        return
      }

      setCurrentSquad(squad)
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
          .select('text, user_baseline_points')
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

  // Handler for logging data based on scalable_quantity
  const handleLogData = () => {
    if (!currentGoal) return;

    if (currentGoal.scalable_quantity) {
      // Logic for logging a scalable amount (e.g., miles run, pages read)
      // Tip: You could use `router.push('/log-quantity')` here in Expo
      Alert.alert("Log Data", "Navigate to scalable quantity input form.");
    } else {
      // Logic for logging a standard completion (e.g., did you meditate today? Yes/No)
      Alert.alert("Log Data", "Mark goal as completed.");
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

            {/* New Button for logging data */}
            <TouchableOpacity
              style={styles.logButton}
              onPress={handleLogData}
              activeOpacity={0.8}
            >
              <Text style={styles.logButtonText}>
                {currentGoal?.scalable_quantity ? 'Log Quantity' : 'Log Completion'}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={styles.squadText}>You haven't accepted a squad goal yet. Head to the Goals tab to get started.</Text>
        )}
      </View>
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
})
