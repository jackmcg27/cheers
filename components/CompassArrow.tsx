import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { angleDiff } from '@/lib/bearing';

type Props = {
  /** Degrees to rotate the arrow so it points at the target, relative to screen-up. */
  rotationDegrees: number;
  size?: number;
};

export function CompassArrow({ rotationDegrees, size = 220 }: Props) {
  const rotation = useRef(new Animated.Value(0)).current;
  const lastValue = useRef(0);

  useEffect(() => {
    const next = lastValue.current + angleDiff(lastValue.current % 360, rotationDegrees);
    lastValue.current = next;
    Animated.timing(rotation, {
      toValue: next,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [rotationDegrees, rotation]);

  const spin = rotation.interpolate({
    inputRange: [-3600, 3600],
    outputRange: ['-3600deg', '3600deg'],
  });

  return (
    <View style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }]}>
      <Animated.View style={[styles.arrowWrap, { transform: [{ rotate: spin }] }]}>
        <View style={styles.arrow} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    borderWidth: 3,
    borderColor: '#3a3a3c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowWrap: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 24,
    borderRightWidth: 24,
    borderBottomWidth: 90,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#ff453a',
  },
});
