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

type ProfileFormState = {
  age: string
  height: string
  weight: string
  gender: string
}

function calculateFitnessLevel(age: number, heightCm: number, weightKg: number, gender: string) {
  const isWoman = /woman|female|girl/i.test(gender.trim())
  const bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * age) + (isWoman ? -161 : 5)

  return Math.round(bmr)
}

export default function ProfilesScreen() {
  const { claims, email, isLoading, isLoggedIn, profile } = useAuthContext()
  const [isSaving, setIsSaving] = useState(false)
  const [form, setForm] = useState<ProfileFormState>({
    age: '',
    height: '',
    weight: '',
    gender: '',
  })

  useEffect(() => {
    setForm({
      age: profile?.age?.toString() ?? '',
      height: profile?.height_cm?.toString() ?? '',
      weight: profile?.weight_kg?.toString() ?? '',
      gender: profile?.gender?.toString() ?? '',
    })
  }, [profile])

  if (isLoading) {
    return null
  }

  if (!isLoggedIn) {
    return <Redirect href="/(auth)/login" />
  }

  const saveProfile = async () => {
    if (!claims?.sub) {
      Alert.alert('Signed out', 'Please sign in again before updating your profile.')
      return
    }

    const ageValue = form.age.trim() ? Number.parseInt(form.age.trim(), 10) : null
    const heightValue = form.height.trim() ? Number.parseInt(form.height.trim(), 10) : null
    const weightValue = form.weight.trim() ? Number.parseFloat(form.weight.trim()) : null
    const genderValue = form.gender.trim() || null

    if (form.age.trim() && Number.isNaN(ageValue)) {
      Alert.alert('Invalid age', 'Please enter a valid age in years.')
      return
    }

    if (form.height.trim() && Number.isNaN(heightValue)) {
      Alert.alert('Invalid height', 'Please enter a valid height in centimeters.')
      return
    }

    if (form.weight.trim() && Number.isNaN(weightValue)) {
      Alert.alert('Invalid weight', 'Please enter a valid weight in kilograms.')
      return
    }

    if (ageValue === null || heightValue === null || weightValue === null || !genderValue) {
      Alert.alert('Missing information', 'Please enter age, height, weight, and gender to calculate fitness level.')
      return
    }

    const fitnessLevel = calculateFitnessLevel(ageValue, heightValue, weightValue, genderValue)

    setIsSaving(true)
    const { error } = await supabase
      .from('profiles')
      .upsert(
        {
          id: claims.sub,
          age: ageValue,
          height_cm: heightValue,
          weight_kg: weightValue,
          gender: genderValue,
          fitness_level: fitnessLevel,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      )

    setIsSaving(false)

    if (error) {
      Alert.alert('Could not save profile', error.message)
      return
    }

    Alert.alert('Profile saved', 'Your age, height, weight, gender, and fitness level were updated.')
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Text style={styles.kicker}>Account</Text>
          <Text style={styles.title}>Profile</Text>
          <Text style={styles.subtitle}>View your account details and update your measurements.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Account Information</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Email</Text>
            <Text style={styles.infoValue}>{email ?? 'Email unavailable'}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Full Name</Text>
            <Text style={styles.infoValue}>{profile?.full_name ?? 'Not set'}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>Username</Text>
            <Text style={styles.infoValue}>{profile?.username ?? 'Not set'}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Body Details</Text>

          <Text style={styles.label}>Age</Text>
          <TextInput
            style={styles.input}
            value={form.age}
            onChangeText={(text) => setForm((current) => ({ ...current, age: text }))}
            placeholder="28"
            placeholderTextColor="#687076"
            keyboardType="number-pad"
            editable={!isSaving}
          />

          <Text style={styles.label}>Height (cm)</Text>
          <TextInput
            style={styles.input}
            value={form.height}
            onChangeText={(text) => setForm((current) => ({ ...current, height: text }))}
            placeholder="180"
            placeholderTextColor="#687076"
            keyboardType="number-pad"
            editable={!isSaving}
          />

          <Text style={styles.label}>Weight (kg)</Text>
          <TextInput
            style={styles.input}
            value={form.weight}
            onChangeText={(text) => setForm((current) => ({ ...current, weight: text }))}
            placeholder="75.5"
            placeholderTextColor="#687076"
            keyboardType="decimal-pad"
            editable={!isSaving}
          />

          <Text style={styles.label}>Gender</Text>
          <TextInput
            style={styles.input}
            value={form.gender}
            onChangeText={(text) => setForm((current) => ({ ...current, gender: text }))}
            placeholder="Male, Female, Non-binary, etc."
            placeholderTextColor="#687076"
            autoCapitalize="words"
            editable={!isSaving}
          />

          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              isSaving && styles.buttonDisabled,
            ]}
            onPress={saveProfile}
            disabled={isSaving}
          >
            {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save Profile</Text>}
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
    marginBottom: 4,
  },
  infoRow: {
    gap: 4,
    paddingVertical: 6,
  },
  infoKey: {
    color: '#9BA1A6',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  infoValue: {
    color: '#ECEDEE',
    fontSize: 15,
    fontWeight: '600',
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
})