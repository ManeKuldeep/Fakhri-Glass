import { StyleSheet, Text, View } from 'react-native';

export default function OrdersScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Orders</Text>
      <Text style={styles.subtext}>
        Order management coming in Phase 3.
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
