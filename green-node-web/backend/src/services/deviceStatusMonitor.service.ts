import { ReadingService } from './reading.service.js';

const STATUS_CHECK_INTERVAL_MS = 10_000;

export async function startDeviceStatusMonitor(): Promise<() => void> {
  let running = false;

  const refresh = async () => {
    if (running) return;
    running = true;
    try {
      await ReadingService.refreshDeviceStatuses();
    } catch (error) {
      console.error('Failed to refresh device statuses:', error);
    } finally {
      running = false;
    }
  };

  await refresh();
  const interval = setInterval(() => {
    void refresh();
  }, STATUS_CHECK_INTERVAL_MS);

  return () => clearInterval(interval);
}
