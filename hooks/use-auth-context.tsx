import { createContext, useContext } from 'react'

type SquadSummary = {
    id: string
    name: string
    inv_code: string
}

export type AuthData = {
    claims?: Record<string, any> | null
    profile?: any | null
    email?: string | null
    currentSquad?: SquadSummary | null
    isLoading: boolean
    isLoggedIn: boolean
}
export const AuthContext = createContext<AuthData>({
    claims: undefined,
    profile: undefined,
    email: undefined,
    currentSquad: undefined,
    isLoading: true,
    isLoggedIn: false,
})
export const useAuthContext = () => useContext(AuthContext)