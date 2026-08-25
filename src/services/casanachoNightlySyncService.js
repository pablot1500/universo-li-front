const STATUS_URL = '/api/casanacho-nightly-sync/status';
const TRIGGER_URL = '/api/casanacho-nightly-sync/trigger';
const CANCEL_URL = '/api/casanacho-nightly-sync/cancel';

export const getCasanachoNightlySyncStatus = async () => {
  const response = await fetch(STATUS_URL);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || 'Error fetching nightly sync status');
  }
  return data?.state || null;
};

export const triggerCasanachoNightlySync = async () => {
  const response = await fetch(TRIGGER_URL, { method: 'POST' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || 'Error triggering nightly sync');
  }
  return data;
};

export const cancelCasanachoNightlySync = async () => {
  const response = await fetch(CANCEL_URL, { method: 'POST' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || 'Error cancelling nightly sync');
  }
  return data;
};
