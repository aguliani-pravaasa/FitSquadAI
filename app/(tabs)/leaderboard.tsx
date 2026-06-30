import { useAuthContext } from '@/hooks/use-auth-context'
import { supabase } from '@/lib/supabase'
import { Redirect } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native'

type Profile = {
  full_name?: string | null
  username?: string | null
}

type SquadMember = {
  user_id: string
  points: number
  streak: number
  profiles?: Profile | null
}

export default function LeaderboardScreen() {
  const { claims, currentSquad, isLoading, isLoggedIn } = useAuthContext()
  const [members, setMembers] = useState<SquadMember[]>([])
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const fetchLeaderboard = useCallback(async (showLoadingIndicator = true) => {
    if (!currentSquad?.id) {
      setMembers([])
      setIsLoadingLeaderboard(false)
      setIsRefreshing(false)
      return
    }

    if (showLoadingIndicator) {
      setIsLoadingLeaderboard(true)
    }
    setLoadError(null)

    try {
      const { data, error } = await supabase
        .from('squad_members')
        .select(`
          user_id,
          points,
          streak,
          profiles (
            full_name,
            username
          )
        `)
        .eq('squad_id', currentSquad.id)
        .eq('is_active', true)
        .order('points', { ascending: false })

      if (error) {
        setLoadError(error.message)
      } else {
        setMembers((data ?? []) as unknown as SquadMember[])
      }
    } catch (err: any) {
      setLoadError(err.message || 'An unexpected error occurred.')
    } finally {
      setIsLoadingLeaderboard(false)
      setIsRefreshing(false)
    }
  }, [currentSquad])

  useEffect(() => {
    let active = true
    Promise.resolve().then(() => {
      if (active) {
        fetchLeaderboard()
      }
    })
    return () => {
      active = false
    }
  }, [fetchLeaderboard])

  const handleRefresh = () => {
    setIsRefreshing(true)
    fetchLeaderboard(false)
  }

  if (isLoading) {
    return <ActivityIndicator style={{ flex: 1 }} color="#0a7ea4" />
  }

  if (!isLoggedIn) {
    return <Redirect href="/(auth)/login" />
  }

  const renderLeaderboardItem = ({ item, index }: { item: SquadMember; index: number }) => {
    const rank = index + 1
    const name = item.profiles?.full_name ?? item.profiles?.username ?? 'Squad member'
    const isCurrentUser = item.user_id === claims?.sub

    // Define tier styles for Top 3
    let rankBadge = <Text style={styles.rankText}>{rank}</Text>
    let itemStyle: StyleProp<ViewStyle> = styles.itemCard
    let pointsColor = '#ECEDEE'

    if (rank === 1) {
      rankBadge = <Text style={styles.medalText}>🥇</Text>
      itemStyle = [styles.itemCard, styles.goldCard]
      pointsColor = '#ffd700'
    } else if (rank === 2) {
      rankBadge = <Text style={styles.medalText}>🥈</Text>
      itemStyle = [styles.itemCard, styles.silverCard]
      pointsColor = '#c0c0c0'
    } else if (rank === 3) {
      rankBadge = <Text style={styles.medalText}>🥉</Text>
      itemStyle = [styles.itemCard, styles.bronzeCard]
      pointsColor = '#cd7f32'
    }

    return (
      <View style={itemStyle}>
        <View style={styles.rankContainer}>{rankBadge}</View>
        <View style={styles.userInfo}>
          <Text style={styles.userName} numberOfLines={1}>
            {name}
            {isCurrentUser ? <Text style={styles.currentUserTag}> (You)</Text> : null}
          </Text>
          {item.streak > 0 ? (
            <View style={styles.streakContainer}>
              <Text style={styles.streakText}>🔥 {item.streak} day streak</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.pointsContainer}>
          <Text style={[styles.pointsText, { color: pointsColor }]}>{item.points}</Text>
          <Text style={styles.pointsLabel}>PTS</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>Leaderboards</Text>
        {currentSquad ? (
          <>
            <Text style={styles.title}>{currentSquad.name}</Text>
            <Text style={styles.subtitle}>
              Compare points with your squad members. Keep moving to reach the top!
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.title}>Squad Leaderboard</Text>
            <Text style={styles.subtitle}>Join a squad to see your leaderboard standings.</Text>
          </>
        )}
      </View>

      {!currentSquad ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No Squad Found</Text>
          <Text style={styles.emptyText}>
            {"Go to the Squads tab to create or join a squad first. Once you're part of a squad, you'll see your squadmates here!"}
          </Text>
        </View>
      ) : isLoadingLeaderboard ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0a7ea4" />
          <Text style={styles.loadingText}>Fetching rankings...</Text>
        </View>
      ) : loadError ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Could not load leaderboard</Text>
          <Text style={styles.errorText}>{loadError}</Text>
        </View>
      ) : members.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Squad is Empty</Text>
          <Text style={styles.emptyText}>
            Invite your friends to join using code: {currentSquad.inv_code}
          </Text>
        </View>
      ) : (
        <FlatList
          data={members}
          keyExtractor={(item) => item.user_id}
          renderItem={renderLeaderboardItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor="#0a7ea4"
              colors={['#0a7ea4']}
            />
          }
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1117',
  },
  hero: {
    gap: 8,
    paddingTop: 48,
    paddingHorizontal: 24,
    paddingBottom: 16,
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
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    gap: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#9BA1A6',
    fontSize: 14,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1d23',
    borderWidth: 1,
    borderColor: '#2a2d35',
    borderRadius: 20,
    padding: 16,
    gap: 16,
  },
  goldCard: {
    borderColor: '#ffd70033',
    backgroundColor: '#1a1b18',
    borderWidth: 1.5,
  },
  silverCard: {
    borderColor: '#c0c0c033',
    backgroundColor: '#17181a',
    borderWidth: 1.5,
  },
  bronzeCard: {
    borderColor: '#cd7f3233',
    backgroundColor: '#1a1715',
    borderWidth: 1.5,
  },
  rankContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#111318',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankText: {
    color: '#9BA1A6',
    fontSize: 16,
    fontWeight: '700',
  },
  medalText: {
    fontSize: 20,
  },
  userInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  userName: {
    color: '#ECEDEE',
    fontSize: 16,
    fontWeight: '600',
  },
  currentUserTag: {
    color: '#0a7ea4',
    fontWeight: '700',
    fontSize: 14,
  },
  streakContainer: {
    alignSelf: 'flex-start',
    backgroundColor: '#ff950015',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  streakText: {
    color: '#ff9500',
    fontSize: 12,
    fontWeight: '600',
  },
  pointsContainer: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  pointsText: {
    fontSize: 22,
    fontWeight: '800',
  },
  pointsLabel: {
    color: '#687076',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: -2,
  },
  emptyCard: {
    margin: 24,
    backgroundColor: '#1a1d23',
    borderWidth: 1,
    borderColor: '#2a2d35',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    color: '#ECEDEE',
    fontSize: 18,
    fontWeight: '700',
  },
  emptyText: {
    color: '#9BA1A6',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  errorCard: {
    margin: 24,
    backgroundColor: '#251212',
    borderWidth: 1,
    borderColor: '#542424',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  errorTitle: {
    color: '#f07272',
    fontSize: 18,
    fontWeight: '700',
  },
  errorText: {
    color: '#ECEDEE',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
})
