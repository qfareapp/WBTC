import React from 'react';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  route: RouteProp<RootStackParamList, 'Ticket'>;
  navigation: NativeStackNavigationProp<RootStackParamList, 'Ticket'>;
};

const TicketScreen: React.FC<Props> = ({ route, navigation }) => {
  const { source, destination, fare, busNumber, routeCode, routeName, bookingId, bookedAt } = route.params;
  const ticketId = bookingId || `TKT-${busNumber}-${Date.now()}`;
  const bookedLabel = bookedAt ? new Date(bookedAt).toLocaleString() : 'Just now';

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Ticket generated</Text>
      <View style={styles.ticketCard}>
        <Text style={styles.routeName}>{routeCode} - {routeName}</Text>
        <Text style={styles.meta}>Bus: {busNumber}</Text>
        <Text style={styles.meta}>Booked: {bookedLabel}</Text>
        <View style={styles.row}>
          <View style={styles.stopBlock}>
            <Text style={styles.label}>From</Text>
            <Text style={styles.value}>{source}</Text>
          </View>
          <View style={styles.stopBlock}>
            <Text style={styles.label}>To</Text>
            <Text style={styles.value}>{destination}</Text>
          </View>
        </View>
        <View style={styles.fareRow}>
          <Text style={styles.label}>Fare</Text>
          <Text style={styles.fareValue}>Rs {fare.toFixed(2)}</Text>
        </View>
        <Text style={styles.ticketId}>Ticket ID: {ticketId}</Text>
        <Text style={styles.helper}>Show this to the conductor/inspector</Text>
      </View>
      <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.popToTop()}>
        <Text style={styles.primaryButtonText}>Back to Home</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1828',
    padding: 20,
    justifyContent: 'center'
  },
  heading: {
    color: '#EAF2FF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 14,
    textAlign: 'center'
  },
  ticketCard: {
    backgroundColor: '#102238',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#1F4C78'
  },
  routeName: {
    color: '#EAF2FF',
    fontSize: 18,
    fontWeight: '700'
  },
  meta: {
    color: '#A6BDD8',
    marginTop: 4
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14
  },
  stopBlock: {
    flex: 1
  },
  label: {
    color: '#A6BDD8'
  },
  value: {
    color: '#EAF2FF',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4
  },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: '#1F4C78'
  },
  fareValue: {
    color: '#4DD4AC',
    fontSize: 20,
    fontWeight: '800'
  },
  ticketId: {
    color: '#A6BDD8',
    marginTop: 12
  },
  helper: {
    color: '#EAF2FF',
    marginTop: 4,
    fontSize: 12
  },
  primaryButton: {
    marginTop: 20,
    backgroundColor: '#4DD4AC',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center'
  },
  primaryButtonText: {
    color: '#0B1828',
    fontSize: 16,
    fontWeight: '700'
  }
});

export default TicketScreen;
