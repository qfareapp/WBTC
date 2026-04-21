import React from 'react';
import {
  Image,
  ImageResizeMode,
  ImageStyle,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { palette } from '../lib/theme';

const LOGO_SOURCE = require('../assets/qfare-logo.png');

type Props = {
  width?: number;
  height?: number;
  withPill?: boolean;
  resizeMode?: ImageResizeMode;
  containerStyle?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
};

const QfareLogo: React.FC<Props> = ({
  width = 108,
  height = 42,
  withPill = false,
  resizeMode = 'contain',
  containerStyle,
  imageStyle,
}) => (
  <View style={[withPill && styles.pill, containerStyle]}>
    <Image source={LOGO_SOURCE} resizeMode={resizeMode} style={[{ width, height }, imageStyle]} />
  </View>
);

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});

export default QfareLogo;
