import { useAuthContext } from '@/hooks/use-auth-context'
import { supabase } from '@/lib/supabase'
import { Redirect } from 'expo-router'
import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

type SquadSummary = {
  id: string
  name: string
  inv_code: string
}

type GoalSummary = {
  type: string
  baseline_points: number | null
}

export default function DashboardScreen() {
  const { claims, email, isLoading, isLoggedIn } = useAuthContext()
  const [currentSquad, setCurrentSquad] = useState<SquadSummary | null>(null)
  const [currentGoal, setCurrentGoal] = useState<GoalSummary | null>(null)
  const [isLoadingSquad, setIsLoadingSquad] = useState(true)
  const [isLoadingGoal, setIsLoadingGoal] = useState(true)

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

      const { data } = await supabase
        .from('goals')
        .select('type, baseline_points')
        .eq('squad_id', currentSquad.id)

      setCurrentGoal(data?.[0] ?? null)
      setIsLoadingGoal(false)
    }

    loadCurrentGoal()
  }, [currentSquad?.id])

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
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1117',
    justifyContent: 'center',
    padding: 24,
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
})