import { useEffect, useState } from "react";

export function useCountdown(initial = 0) {
  const [seconds, setSeconds] = useState(initial);
  useEffect(() => {
    if (seconds <= 0) return;
    const timer = window.setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);
  return { seconds, start: (n: number) => setSeconds(n) };
}
