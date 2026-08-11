import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function ModalScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>This is a modal</Text>
      <Link href="/(auth)/login" dismissTo asChild>
        <Pressable style={styles.link}>
          <Text style={{ color: '#0a7ea4' }}>Go to login to continue</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#ECEDEE',
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
});
