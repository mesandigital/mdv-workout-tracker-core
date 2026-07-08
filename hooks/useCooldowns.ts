import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * useCooldowns - A reusable hook for managing cooldowns (e.g., dismiss timers) with AsyncStorage persistence.
 * @param storageKey The key to use in AsyncStorage (default: 'cooldowns')
 * @returns { cooldowns, setCooldowns, handleDismiss, loading }
 */
export function useCooldowns(storageKey = 'cooldowns') {
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // Load cooldowns from AsyncStorage
  useEffect(() => {
    AsyncStorage.getItem(storageKey).then(val => {
      if (val) setCooldowns(JSON.parse(val));
      setLoading(false);
    });
  }, [storageKey]);

  // Save cooldowns to AsyncStorage when changed
  useEffect(() => {
    if (!loading) {
      AsyncStorage.setItem(storageKey, JSON.stringify(cooldowns));
    }
  }, [cooldowns, storageKey, loading]);

  // Dismiss handler: set cooldown for a given key (e.g., exercise name)
  const handleDismiss = (key: string) => {
    setCooldowns(prev => ({ ...prev, [key]: Date.now() }));
  };

  return { cooldowns, setCooldowns, handleDismiss, loading };
}


// import { useCooldowns } from './useCooldowns';

// export function useFeatureDismissals() {
//   // Use a unique storage key for this feature's cooldowns
//   const { cooldowns, handleDismiss, loading } = useCooldowns('featureDismissals');

//   // Example: dismiss a feature by key
//   const dismissFeature = (featureKey: string) => {
//     handleDismiss(featureKey);
//   };

//   // Example: check if a feature is on cooldown
//   const isOnCooldown = (featureKey: string, cooldownMs: number) => {
//     const lastDismissed = cooldowns[featureKey];
//     if (!lastDismissed) return false;
//     return Date.now() - lastDismissed < cooldownMs;
//   };

//   return { cooldowns, dismissFeature, isOnCooldown, loading };
// }