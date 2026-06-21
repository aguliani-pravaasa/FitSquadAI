
import { supabase } from '@/lib/supabase';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
export default function login() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false);

    async function signInWithEmail() {
        setLoading(true);
        const { error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });
        if (error) {
            console.log('Error signing in:', error.message);
        }
        setLoading(false);
    }

    return (
        <View>
            <View>
                <TextInput
                    onChangeText={(text) => setEmail(text)}
                    value={email}
                    placeholder="example@mail.com"
                    autoCapitalize={"none"}
                    textContentType="emailAddress"
                />
            </View>
            <View>
                <TouchableOpacity
                    disabled={loading}
                    onPress={() => signInWithEmail()}
                >
                    <Text>
                        Sign In
                    </Text>

                </TouchableOpacity>
                <Link href="/(auth)/register">
                    <Text> Don't have an account? Register</Text>
                </Link>
            </View>

        </View>
    )
}