import { IconSymbol } from '@/components/ui/icon-symbol'
import { useAuthContext } from '@/hooks/use-auth-context'
import { supabase } from '@/lib/supabase'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'

type CommitmentLevel = 'casual' | 'medium' | 'intense'
type ExperienceLevel = 'amateur' | 'intermediate' | 'pro'

const PRESET_GOALS = [
  'Daily 10k Steps Challenge',
  'Run 5K Three Times a Week',
  '30-Day Strength & Muscle Gain',
  'Active Daily Cardio & Heart Health',
  'Calorie Deficit & Clean Eating',
]

const COMMITMENT_OPTIONS: {
  id: CommitmentLevel
  title: string
  subtitle: string
  badge: string
  icon: string
}[] = [
  {
    id: 'casual',
    title: 'Casual',
    subtitle: 'Flexible pace, low stress, light tracking & fun weekly goals.',
    badge: '1-2 days / wk',
    icon: 'figure.walk',
  },
  {
    id: 'medium',
    title: 'Medium',
    subtitle: 'Consistent workouts 3-4 days per week with steady accountability.',
    badge: '3-4 days / wk',
    icon: 'figure.run',
  },
  {
    id: 'intense',
    title: 'Intense',
    subtitle: 'Daily grind, high effort, strict check-ins & peak performance.',
    badge: '5+ days / wk',
    icon: 'flame.fill',
  },
]

const EXPERIENCE_OPTIONS: {
  id: ExperienceLevel
  title: string
  subtitle: string
  badge: string
  icon: string
}[] = [
  {
    id: 'amateur',
    title: 'Amateur',
    subtitle: 'Just starting out or returning to fitness. Focus on building habits.',
    badge: 'Beginner',
    icon: 'leaf.fill',
  },
  {
    id: 'intermediate',
    title: 'Intermediate',
    subtitle: 'Familiar with regular workouts and basic nutrition fundamentals.',
    badge: 'Regular',
    icon: 'bolt.fill',
  },
  {
    id: 'pro',
    title: 'Pro',
    subtitle: 'Experienced athlete pushing advanced targets and elite conditioning.',
    badge: 'Advanced',
    icon: 'trophy.fill',
  },
]

export default function SquadOnboardingScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ squadId?: string }>()
  const squadId = params.squadId
  const { claims } = useAuthContext()

  const [step, setStep] = useState<number>(1)
  const [squadName, setSquadName] = useState<string>('')

  // Form State
  const [squadGoal, setSquadGoal] = useState<string>('')
  const [coach, setCoach] = useState<boolean>(true)
  const [commitmentLevel, setCommitmentLevel] = useState<CommitmentLevel>('medium')
  const [experience, setExperience] = useState<ExperienceLevel>('intermediate')

  const [isLoadingSquad, setIsLoadingSquad] = useState<boolean>(!!squadId)
  const [isSaving, setIsSaving] = useState<boolean>(false)

  useEffect(() => {
    if (!squadId) {
      setIsLoadingSquad(false)
      return
    }

    async function loadSquad() {
      try {
        const { data, error } = await supabase
          .from('squads')
          .select('name, squad_goal, coach, commitment_level, experience')
          .eq('id', squadId)
          .maybeSingle()

        if (error) {
          console.error('Error fetching squad for onboarding:', error.message)
        } else if (data) {
          setSquadName(data.name ?? '')
          if (data.squad_goal) setSquadGoal(data.squad_goal)
          if (typeof data.coach === 'boolean') setCoach(data.coach)
          if (data.commitment_level) setCommitmentLevel(data.commitment_level as CommitmentLevel)
          if (data.experience) setExperience(data.experience as ExperienceLevel)
        }
      } finally {
        setIsLoadingSquad(false)
      }
    }

    loadSquad()
  }, [squadId])

  const handleNext = () => {
    if (step === 1 && !squadGoal.trim()) {
      Alert.alert('Squad Goal Required', 'Please enter or select a goal for your squad.')
      return
    }

    if (step < 4) {
      setStep((prev) => prev + 1)
    } else {
      handleCompleteOnboarding()
    }
  }

  const handleBack = () => {
    if (step > 1) {
      setStep((prev) => prev - 1)
    }
  }

  const handleCompleteOnboarding = async () => {
    if (!squadId) {
      Alert.alert('Squad missing', 'No active squad ID found for onboarding.')
      router.replace('/(tabs)/dashboard')
      return
    }

    setIsSaving(true)

    try {
      const { error } = await supabase
        .from('squads')
        .update({
          squad_goal: squadGoal.trim(),
          coach,
          commitment_level: commitmentLevel,
          experience,
        })
        .eq('id', squadId)

      if (error) {
        Alert.alert('Failed to save squad onboarding', error.message)
        return
      }

      // Ensure membership is active for the squad creator
      if (claims?.sub) {
        const now = new Date().toISOString()
        const { data: member } = await supabase
          .from('squad_members')
          .select('id')
          .eq('user_id', claims.sub)
          .eq('squad_id', squadId)
          .maybeSingle()

        if (!member) {
          await supabase.from('squad_members').insert({
            user_id: claims.sub,
            squad_id: squadId,
            points: 0,
            streak: 0,
            join_date: now,
            last_active: now,
            is_active: true,
          })
        }
      }

      Alert.alert('Squad Ready!', 'Your squad onboarding is complete.', [
        {
          text: 'Go to Dashboard',
          onPress: () => router.replace('/(tabs)/dashboard'),
        },
      ])
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred'
      Alert.alert('Error completing setup', message)
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoadingSquad) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0a7ea4" />
        <Text style={styles.loadingText}>Preparing your squad onboarding...</Text>
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      {/* Top Header & Stepper */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.kicker}>SQUAD SETUP</Text>
          <Text style={styles.stepBadge}>Step {step} of 4</Text>
        </View>
        <Text style={styles.squadHeadline}>
          {squadName ? `Setting up ${squadName}` : 'New Squad Onboarding'}
        </Text>

        {/* Progress Bar */}
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${(step / 4) * 100}%` }]} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* STEP 1: Squad Goal */}
        {step === 1 && (
          <View style={styles.stepContainer}>
            <View style={styles.stepHeader}>
              <Text style={styles.stepTitle}>What is your Squad's Goal?</Text>
              <Text style={styles.stepSubtitle}>
                Define a shared mission to keep all squad members accountable and focused.
              </Text>
            </View>

            <Text style={styles.fieldLabel}>Squad Goal / Mission</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="e.g. Run 5km 3x a week & hit 10,000 daily steps"
              placeholderTextColor="#687076"
              value={squadGoal}
              onChangeText={setSquadGoal}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <Text style={styles.presetLabel}>Or choose a popular preset:</Text>
            <View style={styles.presetsContainer}>
              {PRESET_GOALS.map((preset) => {
                const isSelected = squadGoal === preset
                return (
                  <Pressable
                    key={preset}
                    style={[styles.presetChip, isSelected && styles.presetChipSelected]}
                    onPress={() => setSquadGoal(preset)}
                  >
                    <Text style={[styles.presetChipText, isSelected && styles.presetChipTextSelected]}>
                      {preset}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>
        )}

        {/* STEP 2: AI Coach */}
        {step === 2 && (
          <View style={styles.stepContainer}>
            <View style={styles.stepHeader}>
              <Text style={styles.stepTitle}>Would you like an AI Coach?</Text>
              <Text style={styles.stepSubtitle}>
                The AI Coach provides personalized advice, smart daily workouts, and automated squad check-ins.
              </Text>
            </View>

            <View style={styles.coachCard}>
              <View style={styles.coachCardHeader}>
                <View style={styles.coachIconContainer}>
                  <IconSymbol name="sparkles" size={28} color="#72f0aa" />
                </View>
                <View style={styles.coachTitleCopy}>
                  <Text style={styles.coachCardTitle}>FitSquad AI Coach</Text>
                  <Text style={styles.coachCardStatus}>
                    {coach ? 'Enabled for squad' : 'Disabled'}
                  </Text>
                </View>
                <Switch value={coach} onValueChange={setCoach} />
              </View>

              <View style={styles.divider} />

              <View style={styles.featureList}>
                <View style={styles.featureRow}>
                  <IconSymbol name="checkmark.circle.fill" size={18} color="#0a7ea4" />
                  <Text style={styles.featureText}>Personalized scaling based on body metrics</Text>
                </View>
                <View style={styles.featureRow}>
                  <IconSymbol name="checkmark.circle.fill" size={18} color="#0a7ea4" />
                  <Text style={styles.featureText}>Interactive squad chat assistant & motivation</Text>
                </View>
                <View style={styles.featureRow}>
                  <IconSymbol name="checkmark.circle.fill" size={18} color="#0a7ea4" />
                  <Text style={styles.featureText}>Automated activity point scoring & advice</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* STEP 3: Commitment Level */}
        {step === 3 && (
          <View style={styles.stepContainer}>
            <View style={styles.stepHeader}>
              <Text style={styles.stepTitle}>Squad Commitment Level</Text>
              <Text style={styles.stepSubtitle}>
                Select the expectations and workout frequency for your squad.
              </Text>
            </View>

            <View style={styles.optionsStack}>
              {COMMITMENT_OPTIONS.map((opt) => {
                const isSelected = commitmentLevel === opt.id
                return (
                  <Pressable
                    key={opt.id}
                    style={[styles.optionCard, isSelected && styles.optionCardSelected]}
                    onPress={() => setCommitmentLevel(opt.id)}
                  >
                    <View style={styles.optionHeader}>
                      <View style={[styles.optionIconBox, isSelected && styles.optionIconBoxSelected]}>
                        <IconSymbol name={opt.icon as any} size={22} color={isSelected ? '#0a7ea4' : '#9BA1A6'} />
                      </View>
                      <View style={styles.optionTextContainer}>
                        <View style={styles.optionTitleRow}>
                          <Text style={styles.optionTitle}>{opt.title}</Text>
                          <Text style={[styles.optionBadge, isSelected && styles.optionBadgeSelected]}>
                            {opt.badge}
                          </Text>
                        </View>
                        <Text style={styles.optionSubtitle}>{opt.subtitle}</Text>
                      </View>
                    </View>
                  </Pressable>
                )
              })}
            </View>
          </View>
        )}

        {/* STEP 4: Fitness Experience */}
        {step === 4 && (
          <View style={styles.stepContainer}>
            <View style={styles.stepHeader}>
              <Text style={styles.stepTitle}>Squad Fitness Experience</Text>
              <Text style={styles.stepSubtitle}>
                Choose the background level that best describes your squad members.
              </Text>
            </View>

            <View style={styles.optionsStack}>
              {EXPERIENCE_OPTIONS.map((opt) => {
                const isSelected = experience === opt.id
                return (
                  <Pressable
                    key={opt.id}
                    style={[styles.optionCard, isSelected && styles.optionCardSelected]}
                    onPress={() => setExperience(opt.id)}
                  >
                    <View style={styles.optionHeader}>
                      <View style={[styles.optionIconBox, isSelected && styles.optionIconBoxSelected]}>
                        <IconSymbol name={opt.icon as any} size={22} color={isSelected ? '#0a7ea4' : '#9BA1A6'} />
                      </View>
                      <View style={styles.optionTextContainer}>
                        <View style={styles.optionTitleRow}>
                          <Text style={styles.optionTitle}>{opt.title}</Text>
                          <Text style={[styles.optionBadge, isSelected && styles.optionBadgeSelected]}>
                            {opt.badge}
                          </Text>
                        </View>
                        <Text style={styles.optionSubtitle}>{opt.subtitle}</Text>
                      </View>
                    </View>
                  </Pressable>
                )
              })}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Footer Nav Controls */}
      <View style={styles.footer}>
        {step > 1 ? (
          <Pressable
            style={styles.backButton}
            onPress={handleBack}
            disabled={isSaving}
          >
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
        ) : (
          <View style={{ flex: 1 }} />
        )}

        <Pressable
          style={isSaving ? [styles.nextButton, styles.disabledButton] : styles.nextButton}
          onPress={handleNext}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.nextButtonText}>
              {step === 4 ? 'Complete Onboarding' : 'Next Step'}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0f1117',
    paddingTop: 54,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0f1117',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    color: '#9BA1A6',
    fontSize: 15,
  },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1d212b',
    gap: 6,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kicker: {
    color: '#0a7ea4',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  stepBadge: {
    backgroundColor: '#1d2330',
    color: '#0a7ea4',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  squadHeadline: {
    color: '#ECEDEE',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#1a1d25',
    borderRadius: 3,
    marginTop: 10,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#0a7ea4',
    borderRadius: 3,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  stepContainer: {
    gap: 20,
  },
  stepHeader: {
    gap: 8,
  },
  stepTitle: {
    color: '#ECEDEE',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  stepSubtitle: {
    color: '#9BA1A6',
    fontSize: 14,
    lineHeight: 20,
  },
  fieldLabel: {
    color: '#ECEDEE',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  input: {
    backgroundColor: '#161922',
    borderWidth: 1,
    borderColor: '#292e3a',
    borderRadius: 16,
    color: '#ECEDEE',
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  textArea: {
    minHeight: 110,
  },
  presetLabel: {
    color: '#9BA1A6',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
  },
  presetsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  presetChip: {
    backgroundColor: '#161922',
    borderWidth: 1,
    borderColor: '#292e3a',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  presetChipSelected: {
    backgroundColor: '#0a7ea4',
    borderColor: '#0a7ea4',
  },
  presetChipText: {
    color: '#9BA1A6',
    fontSize: 13,
    fontWeight: '600',
  },
  presetChipTextSelected: {
    color: '#ffffff',
    fontWeight: '700',
  },
  coachCard: {
    backgroundColor: '#161922',
    borderWidth: 1,
    borderColor: '#292e3a',
    borderRadius: 24,
    padding: 20,
    gap: 16,
  },
  coachCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  coachIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#1b2a24',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coachTitleCopy: {
    flex: 1,
    gap: 2,
  },
  coachCardTitle: {
    color: '#ECEDEE',
    fontSize: 18,
    fontWeight: '700',
  },
  coachCardStatus: {
    color: '#72f0aa',
    fontSize: 13,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#242a36',
  },
  featureList: {
    gap: 12,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureText: {
    color: '#C1C7CD',
    fontSize: 14,
    flex: 1,
  },
  optionsStack: {
    gap: 14,
  },
  optionCard: {
    backgroundColor: '#161922',
    borderWidth: 1,
    borderColor: '#292e3a',
    borderRadius: 20,
    padding: 18,
  },
  optionCardSelected: {
    backgroundColor: '#14232c',
    borderColor: '#0a7ea4',
  },
  optionHeader: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
  },
  optionIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#202532',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIconBoxSelected: {
    backgroundColor: '#173646',
  },
  optionTextContainer: {
    flex: 1,
    gap: 4,
  },
  optionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionTitle: {
    color: '#ECEDEE',
    fontSize: 17,
    fontWeight: '700',
  },
  optionBadge: {
    color: '#9BA1A6',
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: '#202532',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  optionBadgeSelected: {
    color: '#0a7ea4',
    backgroundColor: '#1a3748',
  },
  optionSubtitle: {
    color: '#9BA1A6',
    fontSize: 13,
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 18,
    backgroundColor: '#12151d',
    borderTopWidth: 1,
    borderTopColor: '#1d212b',
    gap: 12,
  },
  backButton: {
    flex: 1,
    borderRadius: 16,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#161922',
    borderColor: '#292e3a',
  },
  backButtonText: {
    color: '#ECEDEE',
    fontSize: 16,
    fontWeight: '700',
  },
  nextButton: {
    flex: 2,
    backgroundColor: '#0a7ea4',
    borderRadius: 16,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.6,
  },
})
