import React, { useEffect } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

const AnimatedImage = Animated.createAnimatedComponent(Image);
const AnimatedText = Animated.createAnimatedComponent(Text);

export default function LoadingScreen() {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.8);
  const dots = useSharedValue(0);

  useEffect(() => {
    scale.value = withRepeat(withTiming(1.08, { duration: 1000 }), -1, true);
    opacity.value = withRepeat(withTiming(1, { duration: 1000 }), -1, true);
    dots.value = withRepeat(withTiming(3, { duration: 1200 }), -1, true);
  }, [dots, opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const dotsStyle = useAnimatedStyle(() => ({
    opacity: Math.round(dots.value) % 3 === 0 ? 0.3 : 1,
  }));

  return (
    <View style={styles.container}>
      <View style={styles.glow} />
      <AnimatedImage
        source={require("../assets/images/qfare-logo.png")}
        style={[styles.logo, animatedStyle]}
        resizeMode="contain"
      />
      <View style={styles.textRow}>
        <Text style={styles.text}>Loading your ride</Text>
        <AnimatedText style={[styles.text, styles.dots, dotsStyle]}>...</AnimatedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f1c2e",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  glow: {
    position: "absolute",
    width: 200,
    height: 200,
    backgroundColor: "#0890C8",
    borderRadius: 100,
    opacity: 0.15,
    top: "40%",
  },
  logo: {
    width: 240,
    height: 129,
  },
  textRow: {
    marginTop: 22,
    flexDirection: "row",
    alignItems: "center",
  },
  text: {
    color: "#ffffff",
    fontSize: 16,
    opacity: 0.8,
    letterSpacing: 0.3,
  },
  dots: {
    marginLeft: 2,
    minWidth: 18,
  },
});
