import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

const ProfileScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Your profile</Text>
      <Text style={styles.body}>Coming soon: saved tickets, preferences, and payment methods.</Text>
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
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 10
  },
  body: {
    color: '#A6BDD8',
    fontSize: 15,
    lineHeight: 20
  }
});

export default ProfileScreen;
