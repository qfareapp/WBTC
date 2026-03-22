import { Text, View, StyleSheet } from "react-native";

export default function QfareLogo({ size = "large", align = "center" }) {
  const scale = size === "small" ? 0.72 : 1;

  return (
    <View style={[styles.wrap, align === "left" ? styles.left : styles.center]}>
      <Text
        style={[
          styles.wordmark,
          {
            fontSize: 52 * scale,
            lineHeight: 56 * scale,
            letterSpacing: -2.4 * scale,
          },
        ]}
      >
        <Text style={styles.q}>q</Text>
        <Text style={styles.fare}>fare</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
  },
  center: {
    alignItems: "center",
  },
  left: {
    alignItems: "flex-start",
  },
  wordmark: {
    fontWeight: "800",
  },
  q: {
    color: "#00C87A",
  },
  fare: {
    color: "#FFFFFF",
  },
});
