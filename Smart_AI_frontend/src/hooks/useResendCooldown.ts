import { useCallback, useEffect, useRef, useState } from 'react';

function readRetryAfterSeconds(error: unknown): number | null {
  const axiosError = error as {
    response?: { data?: { data?: { retryAfterSeconds?: number } } };
  };
  const seconds = axiosError?.response?.data?.data?.retryAfterSeconds;
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
    ? Math.ceil(seconds)
    : null;
}

export function useResendCooldown(initialCooldownSeconds = 60) {
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return clearTimer;
  }, [clearTimer]);

  const startCooldown = useCallback(
    (seconds?: number) => {
      clearTimer();
      const total = Math.max(1, Math.floor(seconds ?? initialCooldownSeconds));
      setRemainingSeconds(total);
      timerRef.current = setInterval(() => {
        setRemainingSeconds((prev) => {
          if (prev <= 1) {
            clearTimer();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    },
    [clearTimer, initialCooldownSeconds]
  );

  const startSending = useCallback(() => setIsSending(true), []);
  const stopSending = useCallback(() => setIsSending(false), []);

  return {
    remainingSeconds,
    isOnCooldown: remainingSeconds > 0,
    isSending,
    startCooldown,
    startSending,
    stopSending,
    getRetryAfterSeconds: readRetryAfterSeconds,
  };
}

export { readRetryAfterSeconds };