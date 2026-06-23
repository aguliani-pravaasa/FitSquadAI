import { AuthContext } from '@/hooks/use-auth-context'
import { supabase } from '@/lib/supabase'
import { PropsWithChildren, useEffect, useState } from 'react'

type SquadSummary = {
    id: string
    name: string
    inv_code: string
}

export default function AuthProvider({ children }: PropsWithChildren) {
    const [claims, setClaims] = useState<Record<string, any> | undefined | null>()
    const [profile, setProfile] = useState<any>()
    const [email, setEmail] = useState<string | null>()
    const [currentSquad, setCurrentSquad] = useState<SquadSummary | null>()
    const [isLoading, setIsLoading] = useState<boolean>(true)

    const loadAuthData = async () => {
        setIsLoading(true)

        const [{ data, error }, userResult] = await Promise.all([
            supabase.auth.getClaims(),
            supabase.auth.getUser(),
        ])

        if (error) {
            console.error('Error fetching claims:', error)
        }

        const nextClaims = data?.claims ?? null

        setClaims(nextClaims)
        setEmail(userResult.data.user?.email ?? data?.claims?.email ?? null)

        if (!nextClaims?.sub) {
            setProfile(null)
            setCurrentSquad(null)
            setIsLoading(false)
            return
        }

        const [{ data: profileData }, { data: membership, error: membershipError }] = await Promise.all([
            supabase.from('profiles').select('*').eq('id', nextClaims.sub).single(),
            supabase
                .from('squad_members')
                .select('squad_id')
                .eq('user_id', nextClaims.sub)
                .eq('is_active', true)
                .order('join_date', { ascending: false })
                .limit(1)
                .maybeSingle(),
        ])

        setProfile(profileData ?? null)

        if (membershipError || !membership?.squad_id) {
            setCurrentSquad(null)
            setIsLoading(false)
            return
        }

        const { data: squadData } = await supabase
            .from('squads')
            .select('id, name, inv_code')
            .eq('id', membership.squad_id)
            .single()

        setCurrentSquad(squadData ?? null)
        setIsLoading(false)
    }

    // Fetch the claims once, and subscribe to auth state changes
    useEffect(() => {
        loadAuthData()

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange(async (_event, _session) => {
            console.log('Auth state changed:', { event: _event })
            await loadAuthData()
        })

        // Cleanup subscription on unmount
        return () => {
            subscription.unsubscribe()
        }
    }, [])

    return (
        <AuthContext.Provider
            value={{
                claims,
                email,
                currentSquad,
                isLoading,
                profile,
                isLoggedIn: !!claims,
            }}
        >
            {children}
        </AuthContext.Provider>
    )
}