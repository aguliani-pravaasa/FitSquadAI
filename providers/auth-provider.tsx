import { AuthContext } from '@/hooks/use-auth-context'
import { supabase } from '@/lib/supabase'
import { PropsWithChildren, useEffect, useState } from 'react'

export default function AuthProvider({ children }: PropsWithChildren) {
    const [claims, setClaims] = useState<Record<string, any> | undefined | null>()
    const [profile, setProfile] = useState<any>()
    const [email, setEmail] = useState<string | null>()
    const [isLoading, setIsLoading] = useState<boolean>(true)

    // Fetch the claims once, and subscribe to auth state changes
    useEffect(() => {
        const fetchClaims = async () => {
            setIsLoading(true)

            const [{ data, error }, userResult] = await Promise.all([
                supabase.auth.getClaims(),
                supabase.auth.getUser(),
            ])

            if (error) {
                console.error('Error fetching claims:', error)
            }

            setClaims(data?.claims ?? null)
            setEmail(userResult.data.user?.email ?? data?.claims?.email ?? null)
            setIsLoading(false)
        }

        fetchClaims()

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange(async (_event, _session) => {
            console.log('Auth state changed:', { event: _event })
            const [{ data }, userResult] = await Promise.all([
                supabase.auth.getClaims(),
                supabase.auth.getUser(),
            ])
            setClaims(data?.claims ?? null)
            setEmail(userResult.data.user?.email ?? data?.claims?.email ?? null)
        })

        // Cleanup subscription on unmount
        return () => {
            subscription.unsubscribe()
        }
    }, [])

    // Fetch the profile when the claims change
    useEffect(() => {
        const fetchProfile = async () => {
            setIsLoading(true)

            if (claims) {
                const { data } = await supabase.from('profiles').select('*').eq('id', claims.sub).single()

                setProfile(data)
            } else {
                setProfile(null)
            }

            setIsLoading(false)
        }

        fetchProfile()
    }, [claims])

    return (
        <AuthContext.Provider
            value={{
                claims,
                email,
                isLoading,
                profile,
                isLoggedIn: !!claims,
            }}
        >
            {children}
        </AuthContext.Provider>
    )
}