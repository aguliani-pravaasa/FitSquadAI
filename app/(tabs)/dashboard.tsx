import { useAuthContext } from '@/hooks/use-auth-context'
import { Redirect } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'

export default function DashboardScreen() {
  const { email, isLoading, isLoggedIn } = useAuthContext()

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
})