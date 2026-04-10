import React, { useEffect, useRef } from 'react';
import { Animated, Easing, ImageSourcePropType, StyleSheet, View } from 'react-native';

const APP_ICON = require('../assets/icon.png') as ImageSourcePropType;

const LoadingScreen = () => {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1.04,
            duration: 850,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 1,
            duration: 850,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1,
            duration: 850,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.92,
            duration: 850,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ]),
    );

    loop.start();

    return () => {
      loop.stop();
      scale.stopAnimation();
      opacity.stopAnimation();
    };
  }, [opacity, scale]);

  return (
    <View style={styles.container}>
      <Animated.Image
        source={APP_ICON}
        resizeMode="contain"
        style={[
          styles.icon,
          {
            opacity,
            transform: [{ scale }],
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#06111e',
  },
  icon: {
    width: 132,
    height: 132,
  },
});

export default LoadingScreen;
