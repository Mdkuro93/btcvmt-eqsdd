import { useState, useEffect } from 'react';

/**
 * Custom hook to debounce value changes (e.g. for search inputs)
 * @param value The value to debounce
 * @param delay Milliseconds delay (default 400ms)
 */
export function useDebounce<T>(value: T, delay: number = 400): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
