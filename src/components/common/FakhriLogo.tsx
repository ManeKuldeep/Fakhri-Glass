import React from 'react';
import {
  Image,
  ImageStyle,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

const logoMark = require('../../../assets/images/logo.png');
const logoWhite = require('../../../assets/images/logo-white.png');
const logoHorizontal = require('../../../assets/images/logo-horizontal.png');

export interface FakhriLogoProps {
  /**
   * Visual variant:
   * - 'mark': Just the circular FG monogram emblem
   * - 'horizontal': Pre-rendered high-res lockup with 'FAKHRI GLASS' brand text
   * - 'badge': Circular emblem housed inside an elevated glassmorphic circular card
   * - 'white': Pure white monogram for dark slate headers or buttons
   */
  variant?: 'mark' | 'horizontal' | 'badge' | 'white';
  /**
   * Dimension size in dp:
   * - For 'mark'/'badge'/'white': represents width & height (square)
   * - For 'horizontal': represents the height (aspect ratio ~ 3.75:1 is preserved)
   */
  size?: number;
  /** Custom container style */
  style?: StyleProp<ViewStyle>;
  /** Custom image style */
  imageStyle?: StyleProp<ImageStyle>;
}

/**
 * Official Fakhri Glass Brand Logo
 * Extracted and optimized directly from company visiting card assets.
 */
export default function FakhriLogo({
  variant = 'mark',
  size = 48,
  style,
  imageStyle,
}: FakhriLogoProps) {
  if (variant === 'horizontal') {
    const width = Math.round(size * 3.75);
    return (
      <View style={[styles.horizontalContainer, style]}>
        <Image
          source={logoHorizontal}
          style={[{ width, height: size }, styles.imageContain, imageStyle]}
          resizeMode="contain"
          accessibilityLabel="Fakhri Glass"
        />
      </View>
    );
  }

  if (variant === 'badge') {
    const padding = Math.max(8, Math.round(size * 0.18));
    const innerSize = size - padding * 2;
    return (
      <View
        style={[
          styles.badgeCard,
          { width: size, height: size, borderRadius: size / 2 },
          style,
        ]}
      >
        <Image
          source={logoMark}
          style={[{ width: innerSize, height: innerSize }, styles.imageContain, imageStyle]}
          resizeMode="contain"
          accessibilityLabel="Fakhri Glass Logo"
        />
      </View>
    );
  }

  const source = variant === 'white' ? logoWhite : logoMark;

  return (
    <View style={[styles.markContainer, { width: size, height: size }, style]}>
      <Image
        source={source}
        style={[{ width: size, height: size }, styles.imageContain, imageStyle]}
        resizeMode="contain"
        accessibilityLabel="Fakhri Glass Logo"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  markContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  horizontalContainer: {
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  imageContain: {
    resizeMode: 'contain',
  },
  badgeCard: {
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FEE2E2',
    shadowColor: '#A91D22',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
});
