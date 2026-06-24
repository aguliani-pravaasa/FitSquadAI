import { supabase } from '@/lib/supabase'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native'

export default function Login() {
    const router = useRouter()
    const [isLogin,setIslogin] = useState(true);
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false);

    async function handleAuth() {
        setLoading(true)
        try {
            if (isLogin) {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                })

                if (error) {
                    Alert.alert('Sign In Error', error.message)
                } else {
                    router.replace('/(tabs)')
                }
            } else {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            full_name: username,
                        },
                    },
                })

                if (error) {
                    Alert.alert('Sign Up Error', error.message)
                } else {
                    router.replace('/(tabs)')
                }
            }
        } finally {
            setLoading(false)
        }
    }

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <View style={styles.inner}>
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.title}>{isLogin ? 'Welcome back' : 'Create an account'}</Text>
                </View>

                {/* Form */}
                <View style={styles.form}>
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Display Name</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Your full name"
                            placeholderTextColor="#687076"
                            value={username}
                            onChangeText={setUsername}
                            autoCapitalize="none"
                            autoComplete="name"
                            editable={!loading}
                        />
                    </View>
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Email</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="you@example.com"
                            placeholderTextColor="#687076"
                            value={email}
                            onChangeText={setEmail}
                            autoCapitalize="none"
                            keyboardType="email-address"
                            autoComplete="email"
                            editable={!loading}
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Password</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Enter your password"
                            placeholderTextColor="#687076"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                            autoComplete="password"
                            editable={!loading}
                        />
                    </View>

                    <Pressable
                        style={({ pressed }) => [
                            styles.button,
                            pressed && styles.buttonPressed,
                            loading && styles.buttonDisabled,
                        ]}
                        onPress={handleAuth}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.buttonText}>
                                {isLogin ? 'Sign In' : 'Sign Up'}
                            </Text>
                        )}
                    </Pressable>
                </View>

                {/* Footer */}
                <TouchableOpacity style={styles.footer} onPress={() => setIslogin(!isLogin)}>
                    <Text style={styles.footerText}>
                        {isLogin ? "Don't have an account? " : 'Already have an account? '}
                    </Text>
                    <Text style={styles.footerLink}>{isLogin ? 'Sign Up' : 'Sign In'}</Text>
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    )
}
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0f1117',
    },
    inner: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 28,
        gap: 32,
    },
    header: {
        gap: 8,
    },
    title: {
        fontSize: 30,
        fontWeight: '700',
        color: '#ECEDEE',
        letterSpacing: -0.5,
    },
    subtitle: {
        fontSize: 15,
        color: '#687076',
    },
    form: {
        gap: 20,
    },
    inputGroup: {
        gap: 6,
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
        color: '#9BA1A6',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    input: {
        backgroundColor: '#1a1d23',
        borderWidth: 1,
        borderColor: '#2a2d35',
        borderRadius: 14,
        paddingHorizontal: 16,
        paddingVertical: 15,
        fontSize: 16,
        color: '#ECEDEE',
    },
    button: {
        backgroundColor: '#0a7ea4',
        borderRadius: 14,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 4,
        shadowColor: '#0a7ea4',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    buttonPressed: {
        opacity: 0.8,
        transform: [{ scale: 0.98 }],
    },
    buttonDisabled: {
        opacity: 0.5,
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: 0.2,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
    },
    footerText: {
        color: '#687076',
        fontSize: 14,
    },
    footerLink: {
        color: '#0a7ea4',
        fontSize: 14,
        fontWeight: '600',
    },
})