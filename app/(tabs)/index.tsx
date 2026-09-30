import { StyleSheet, Text, View } from 'react-native';
import { useAuthStore } from '../../src/stores/authStore';

export default function HomeScreen() {
  const profile = useAuthStore((s) => s.profile);
  const greeting = profile ? `Welcome, ${profile.full_name}` : 'Welcome';

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{greeting}</Text>
      <Text style={styles.subtext}>
        Dashboard coming soon — low-stock alerts and recent activity will appear here.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 24,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  subtext: {
    fontSize: 15,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 22,
  },
});
