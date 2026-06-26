import { createClient } from '@supabase/supabase-js'
import { Platform } from 'react-native'
import 'react-native-url-polyfill/auto'

// Web-safe storage using localStorage
const WebStorageAdapter = {
    getItem: (key: string) => {
        return Promise.resolve(localStorage.getItem(key))
    },
    setItem: (key: string, value: string) => {
        localStorage.setItem(key, value)
        return Promise.resolve()
    },
    removeItem: (key: string) => {
        localStorage.removeItem(key)
        return Promise.resolve()
    },
}

// Native storage using expo-secure-store (loaded lazily to avoid web crashes)
const getNativeStorageAdapter = () => {
    const { getItemAsync, setItemAsync, deleteItemAsync } = require('expo-secure-store')
    return {
        getItem: (key: string) => getItemAsync(key),
        setItem: (key: string, value: string) => {
            if (value.length > 2048) {
                console.warn(
                    'Value being stored in SecureStore is larger than 2048 bytes and it may not be stored successfully.'
                )
            }
            return setItemAsync(key, value)
        },
        removeItem: (key: string) => deleteItemAsync(key),
    }
}

const storage = Platform.OS === 'web' ? WebStorageAdapter : getNativeStorageAdapter()

export const supabase = createClient(
    process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
    process.env.EXPO_PUBLIC_SUPABASE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
    {
        auth: {
            storage: storage as any,
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: false,
        },
    }
)

