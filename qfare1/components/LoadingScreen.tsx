import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  ImageSourcePropType,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { palette } from '../lib/theme';

const LOGO = require('../assets/loading-logo.png') as ImageSourcePropType;
const HERO = require('../assets/loading-hero.png') as ImageSourcePropType;
const HERO_ASPECT_RATIO = 1781 / 887;
const REFERENCE_WIDTH = 853;
const REFERENCE_HEIGHT = 1844;

const LoadingScreen = () => {
  const { width, height } = useWindowDimensions();
  const [trackWidth, setTrackWidth] = useState(0);
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoTranslateY = useRef(new Animated.Value(-18)).current;
  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroTranslateY = useRef(new Animated.Value(28)).current;
  const labelOpacity = useRef(new Animated.Value(0)).current;
  const labelTranslateY = useRef(new Animated.Value(8)).current;
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const entrance = Animated.sequence([
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(logoTranslateY, {
          toValue: 0,
          duration: 700,
          easing: Easing.out(Easing.back(1.2)),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(heroOpacity, {
          toValue: 1,
          duration: 850,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(heroTranslateY, {
          toValue: 0,
          duration: 850,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(labelOpacity, {
          toValue: 1,
          duration: 450,
          delay: 120,
          useNativeDriver: true,
        }),
        Animated.timing(labelTranslateY, {
          toValue: 0,
          duration: 450,
          delay: 120,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ]);

    const progressLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 0.58,
          duration: 2800,
          easing: Easing.bezier(0.4, 0, 0.2, 1),
          useNativeDriver: false,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 0,
          useNativeDriver: false,
        }),
      ]),
    );

    entrance.start();
    progressLoop.start();

    return () => {
      entrance.stop();
      progressLoop.stop();
    };
  }, [
    heroOpacity,
    heroTranslateY,
    labelOpacity,
    labelTranslateY,
    logoOpacity,
    logoTranslateY,
    progress,
  ]);

  const horizontalScale = width / REFERENCE_WIDTH;
  const verticalScale = height / REFERENCE_HEIGHT;
  const logoWidth = Math.min(width * 0.54, 430);
  const logoHeight = logoWidth * 0.245;
  const heroWidth = Math.max(width * 1.1, 930 * horizontalScale);
  const heroHeight = heroWidth / HERO_ASPECT_RATIO;
  const logoTop = Math.max(72, 300 * verticalScale);
  const heroTopOffset = Math.max(32, 160 * verticalScale);
  const bottomPadding = Math.max(72, 152 * verticalScale);
  const progressSectionGap = Math.max(18, 24 * verticalScale);
  const progressTrackWidth = Math.min(width * 0.5, 430);

  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, trackWidth || 1],
  });

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.logoArea,
          { paddingTop: logoTop },
          {
            opacity: logoOpacity,
            transform: [{ translateY: logoTranslateY }],
          },
        ]}
      >
        <Animated.Image
          source={LOGO}
          resizeMode="contain"
          style={[styles.logo, { width: logoWidth, height: logoHeight }]}
        />
        <Text style={styles.tagline}>
          Smart Rides. <Text style={styles.taglineAccent}>Better Journeys.</Text>
        </Text>
      </Animated.View>

      <View style={[styles.illustrationWrap, { marginTop: heroTopOffset }]}>
        <Animated.Image
          source={HERO}
          resizeMode="contain"
          style={[
            styles.hero,
            { width: heroWidth, height: heroHeight },
            {
              opacity: heroOpacity,
              transform: [{ translateY: heroTranslateY }],
            },
          ]}
        />
      </View>

      <Animated.View
        style={[
          styles.bottom,
          {
            opacity: labelOpacity,
            transform: [{ translateY: labelTranslateY }],
          },
          { paddingBottom: bottomPadding },
        ]}
      >
        <Text style={styles.loadingLabel}>Loading...</Text>
        <View
          style={[styles.progressTrack, { width: progressTrackWidth, marginTop: progressSectionGap }]}
          onLayout={event => setTrackWidth(event.nativeEvent.layout.width)}
        >
          <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  logoArea: {
    alignItems: 'center',
    paddingTop: 0,
    paddingHorizontal: 24,
  },
  logo: {
    marginLeft: 8,
  },
  tagline: {
    marginTop: 14,
    fontSize: 18,
    color: palette.textMuted,
    letterSpacing: -0.2,
  },
  taglineAccent: {
    color: palette.accent,
    fontWeight: '500',
  },
  illustrationWrap: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  hero: {
    marginLeft: 8,
  },
  bottom: {
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  loadingLabel: {
    fontSize: 19,
    fontWeight: '600',
    color: '#3f536f',
    letterSpacing: -0.2,
  },
  progressTrack: {
    height: 15,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#e8edf3',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#1fc39b',
  },
});

export default LoadingScreen;
