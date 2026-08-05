import { Button, Column, Text } from '@expo/ui';
import { Link } from 'expo-router';
import { StyleSheet } from 'react-native';

export default function ModalScreen() {
  return (
    <Column style={styles.container} spacing={16}>
      <Text style={styles.title}>This is a modal</Text>
      <Link href="/(auth)/login" dismissTo asChild>
        <Button style={styles.link}>
          Go to login to continue
        </Button>
      </Link>
    </Column>
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
