import { useEffect, useState } from 'react';
import { getAppNow, getAppTodayISO, millisecondsUntilNextAppMidnight } from '../utils/appTime';

export function useAppNow() {
  const [now, setNow] = useState(getAppNow);
  useEffect(() => {
    const refresh = () => setNow(getAppNow());
    const minuteTimer = setInterval(refresh, 60_000);
    const midnightTimer = setTimeout(refresh, millisecondsUntilNextAppMidnight(now) + 250);
    return () => { clearInterval(minuteTimer); clearTimeout(midnightTimer); };
  }, [getAppTodayISO(now)]);
  return now;
}
