import { StyleSheet, Text, View } from 'react-native';

export default function CutScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Cut</Text>
      <Text style={styles.subtext}>
        Cutting optimiser coming in Phase 4–5.
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
  },
});
