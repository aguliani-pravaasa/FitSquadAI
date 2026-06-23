import { useAuthContext } from '@/hooks/use-auth-context'
import { supabase } from '@/lib/supabase'
import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

type SquadFormState = {
  name: string
  squadGoal: string
  coach: boolean
}

type JoinFormState = {
  inviteCode: string
}

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

export default function SquadsScreen() {
  const { claims, isLoading, isLoggedIn } = useAuthContext()
  const [isCreating, setIsCreating] = useState(false)
  const [isJoining, setIsJoining] = useState(false)
  const [showJoinForm, setShowJoinForm] = useState(false)
  const [createdInviteCode, setCreatedInviteCode] = useState<string | null>(null)
  const [joinedSquadName, setJoinedSquadName] = useState<string | null>(null)
  const [form, setForm] = useState<SquadFormState>({
    name: '',
    squadGoal: '',
    coach: false,
  })
  const [joinForm, setJoinForm] = useState<JoinFormState>({
    inviteCode: '',
  })

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
    }

    setCreatedInviteCode(data?.inv_code ?? invCode)
    setJoinedSquadName(null)
    setForm({
      name: '',
      squadGoal: '',
      coach: false,
    })
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

  if (isLoading) {
    return null
  }

  if (!isLoggedIn) {
    return null
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>Squads</Text>
        <Text style={styles.title}>Create or join a squad</Text>
        <Text style={styles.subtitle}>
          Create a squad, generate an invite code automatically, or join an existing squad with a code.
        </Text>
      </View>

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
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: form.coach }}
            style={({ pressed }) => [
              styles.toggle,
              form.coach && styles.toggleOn,
              pressed && styles.togglePressed,
              isCreating && styles.toggleDisabled,
            ]}
            onPress={() => setForm((current) => ({ ...current, coach: !current.coach }))}
            disabled={isCreating}
          >
            <View style={[styles.toggleThumb, form.coach && styles.toggleThumbOn]} />
          </Pressable>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            isCreating && styles.buttonDisabled,
          ]}
          onPress={createSquad}
          disabled={isCreating}
        >
          {isCreating ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create Squad</Text>}
        </Pressable>
      </View>

      <Pressable
        style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
        onPress={() => setShowJoinForm((current) => !current)}
      >
        <Text style={styles.secondaryButtonText}>Join an existing squad</Text>
      </Pressable>

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

          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              isJoining && styles.buttonDisabled,
            ]}
            onPress={joinSquad}
            disabled={isJoining}
          >
            {isJoining ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Join Squad</Text>}
          </Pressable>
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
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#0f1117',
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
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginTop: 4,
  },
  switchCopy: {
    flex: 1,
    gap: 4,
  },
  switchDescription: {
    color: '#9BA1A6',
    fontSize: 13,
    lineHeight: 18,
  },
  toggle: {
    width: 56,
    height: 32,
    borderRadius: 999,
    backgroundColor: '#2a2d35',
    padding: 4,
    justifyContent: 'center',
  },
  toggleOn: {
    backgroundColor: '#0a7ea4',
  },
  togglePressed: {
    opacity: 0.85,
  },
  toggleDisabled: {
    opacity: 0.5,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: '#ECEDEE',
    transform: [{ translateX: 0 }],
  },
  toggleThumbOn: {
    transform: [{ translateX: 24 }],
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
  secondaryButton: {
    borderRadius: 16,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2a2d35',
    backgroundColor: '#111318',
  },
  secondaryButtonText: {
    color: '#ECEDEE',
    fontSize: 16,
    fontWeight: '700',
  },
  successCard: {
    backgroundColor: '#12251c',
    borderWidth: 1,
    borderColor: '#24543f',
    borderRadius: 20,
    padding: 18,
    gap: 6,
  },
  successLabel: {
    color: '#72f0aa',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  successText: {
    color: '#ECEDEE',
    fontSize: 16,
    fontWeight: '600',
  },
})