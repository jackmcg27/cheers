import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { angleDiff } from '@/lib/bearing';

type Props = {
  /** Degrees to rotate the bottle so its neck points at the target, relative to screen-up. */
  rotationDegrees: number;
  size?: number;
};

const TICK_ANGLES = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

export function BottleCompass({ rotationDegrees, size = 220 }: Props) {
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

  const bottleHeight = size * 0.62;
  const bodyWidth = size * 0.26;
  const neckWidth = size * 0.11;
  const neckHeight = size * 0.18;
  const capWidth = size * 0.1;
  const capHeight = size * 0.05;

  return (
    <View style={[styles.dial, { width: size, height: size, borderRadius: size / 2 }]}>
      {TICK_ANGLES.map((angle) => (
        <View
          key={angle}
          style={[styles.tickWrap, { width: size, height: size, transform: [{ rotate: `${angle}deg` }] }]}>
          <View style={angle === 0 ? styles.tickNorth : styles.tick} />
        </View>
      ))}

      <View style={styles.hub} />

      <Animated.View style={[styles.bottleWrap, { transform: [{ rotate: spin }] }]}>
        <View style={[styles.cap, { width: capWidth, height: capHeight, borderRadius: capHeight / 3 }]} />
        <View
          style={[
            styles.neck,
            { width: neckWidth, height: neckHeight, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
          ]}
        />
        <View
          style={[
            styles.body,
            {
              width: bodyWidth,
              height: bottleHeight - neckHeight - capHeight,
              borderTopLeftRadius: bodyWidth * 0.55,
              borderTopRightRadius: bodyWidth * 0.55,
            },
          ]}>
          <View style={styles.label} />
          <View style={styles.shine} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  dial: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(242, 193, 78, 0.05)',
    borderWidth: 1.5,
    borderColor: 'rgba(242, 193, 78, 0.35)',
  },
  tickWrap: {
    position: 'absolute',
    alignItems: 'center',
  },
  tick: {
    width: 2,
    height: 7,
    marginTop: 6,
    borderRadius: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  tickNorth: {
    width: 3,
    height: 10,
    marginTop: 6,
    borderRadius: 1.5,
    backgroundColor: '#f2c14e',
  },
  hub: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(242, 193, 78, 0.4)',
  },
  bottleWrap: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  cap: {
    backgroundColor: '#d4a13d',
  },
  neck: {
    backgroundColor: '#6f4518',
  },
  body: {
    backgroundColor: '#6f4518',
    alignItems: 'center',
    overflow: 'hidden',
  },
  label: {
    position: 'absolute',
    bottom: '28%',
    width: '100%',
    height: '22%',
    backgroundColor: '#f2c14e',
  },
  shine: {
    position: 'absolute',
    top: 4,
    left: '20%',
    width: '14%',
    height: '85%',
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
});
