import { getCasanachoPrice } from './casanacho-price.js';
import { getSupabaseAdmin } from './supabase-admin.js';

const JOB_COLLECTION = 'syncJobs';
const JOB_ID = 'casanacho-nightly-sync';
const COMPONENT_COLLECTION = 'components';
const LOCK_WINDOW_MS = 14 * 60 * 1000;
const RUN_BUDGET_MS = 12 * 60 * 1000;
const LAST_FULL_SYNC_COOLDOWN_MS = 18 * 60 * 60 * 1000;
const ARGENTINA_TIMEZONE = 'America/Argentina/Buenos_Aires';
const RUN_HEARTBEAT_STALE_MS = 2 * 60 * 1000;
const QUEUE_STALE_MS = 60 * 1000;
const MAX_RATE_LIMIT_RETRIES_PER_COMPONENT = 3;
const BLOCKING_JOB_STATUSES = new Set(['queued', 'running', 'cancelling']);
const CANCELLABLE_JOB_STATUSES = new Set(['queued', 'running', 'retry-wait', 'partial', 'cancelling']);

const round2 = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num * 100) / 100 : value;
};

const nowIso = () => new Date().toISOString();
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const getNightRunKey = (date = new Date()) => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ARGENTINA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
};

const getJobRow = async (supabase) => {
  const { data, error } = await supabase
    .from('data_store')
    .select('data,external_id')
    .eq('collection', JOB_COLLECTION)
    .eq('external_id', JOB_ID)
    .limit(1);

  if (error) throw error;
  return data?.[0]?.data || null;
};

const upsertJobRow = async (supabase, payload) => {
  const { error } = await supabase
    .from('data_store')
    .upsert([{
      collection: JOB_COLLECTION,
      external_id: JOB_ID,
      data: {
        id: JOB_ID,
        ...payload
      }
    }], { onConflict: 'collection,external_id' });

  if (error) throw error;
};

const listComponentsWithLink = async (supabase) => {
  const { data, error } = await supabase
    .from('data_store')
    .select('data,external_id')
    .eq('collection', COMPONENT_COLLECTION)
    .order('external_id', { ascending: true });

  if (error) throw error;

  return (data || [])
    .map(row => row.data)
    .filter(component => component?.link && String(component.link).trim());
};

const sortComponentsForRun = (components) => {
  return components.slice().sort((a, b) => {
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  });
};

const updateComponentRow = async (supabase, component) => {
  const { error } = await supabase
    .from('data_store')
    .upsert([{
      collection: COMPONENT_COLLECTION,
      external_id: String(component.id),
      data: component
    }], { onConflict: 'collection,external_id' });

  if (error) throw error;
};

const getSyncSourceFromTrigger = (triggerSource) => (
  triggerSource === 'scheduled' ? 'nightly' : 'manual'
);

const buildSuccessPayload = (component, price, result, triggerSource) => ({
  ...component,
  price: round2(price),
  autoPriceFailed: false,
  lastPriceSyncAt: nowIso(),
  lastPriceSyncStatus: result.stale === true ? 'stale' : 'success',
  lastPriceSyncSource: getSyncSourceFromTrigger(triggerSource),
  lastPriceSyncError: null,
  lastPriceSyncCached: result.cached === true,
  lastPriceSyncStale: result.stale === true
});

const buildErrorPayload = (component, message, triggerSource) => ({
  ...component,
  autoPriceFailed: true,
  lastPriceSyncAt: nowIso(),
  lastPriceSyncStatus: 'error',
  lastPriceSyncSource: getSyncSourceFromTrigger(triggerSource),
  lastPriceSyncError: message,
  lastPriceSyncCached: false,
  lastPriceSyncStale: false
});

const createEmptyReport = ({ runKey, triggerSource, totalComponentsWithLink }) => ({
  runKey,
  triggerSource,
  startedAt: nowIso(),
  finishedAt: null,
  totalComponentsWithLink,
  processedCount: 0,
  successCount: 0,
  errorCount: 0,
  finishedAll: false,
  rateLimited: false,
  executed: [],
  updated: [],
  failed: []
});

const upsertById = (list = [], nextItem) => {
  const nextId = String(nextItem?.id || '');
  const filtered = list.filter(item => String(item?.id || '') !== nextId);
  return [...filtered, nextItem].sort((a, b) => String(a?.id || '').localeCompare(String(b?.id || '')));
};

const removeById = (list = [], id) => {
  const target = String(id || '');
  return list.filter(item => String(item?.id || '') !== target);
};

const buildSuccessEntry = (component, price, result) => ({
  id: component.id,
  name: component.name,
  category: component.category,
  oldPrice: round2(component.price),
  newPrice: round2(price),
  status: result.stale === true ? 'stale' : 'success',
  cached: result.cached === true,
  stale: result.stale === true,
  at: nowIso()
});

const buildErrorEntry = (component, message) => ({
  id: component.id,
  name: component.name,
  category: component.category,
  status: 'error',
  error: message,
  at: nowIso()
});

const mergeReportWithSuccess = (report, component, price, result) => {
  const entry = buildSuccessEntry(component, price, result);
  const nextExecuted = upsertById(report.executed, entry);
  return {
    ...report,
    processedCount: nextExecuted.length,
    successCount: report.successCount + 1,
    executed: nextExecuted,
    updated: upsertById(report.updated, entry),
    failed: removeById(report.failed, component.id)
  };
};

const mergeReportWithError = (report, component, message) => {
  const entry = buildErrorEntry(component, message);
  const nextExecuted = upsertById(report.executed, entry);
  return {
    ...report,
    processedCount: nextExecuted.length,
    errorCount: report.errorCount + 1,
    executed: nextExecuted,
    updated: removeById(report.updated, component.id),
    failed: upsertById(report.failed, entry)
  };
};

const buildSiteUrl = () => {
  return process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.SITE_URL || 'http://localhost:8888';
};

const shouldUseInlineDevRunner = () => {
  return process.env.NETLIFY_DEV === 'true' || buildSiteUrl().includes('localhost');
};

const buildCancelledState = (state = {}, report = null) => ({
  ...(state || {}),
  status: 'cancelled',
  lockUntil: null,
  nextRetryAt: null,
  cancelRequestedAt: null,
  lastCancellationAt: nowIso(),
  lastRunFinishedAt: nowIso(),
  lastReport: report || state?.lastReport || null
});

const buildPartialState = (state = {}, report = null) => ({
  ...(state || {}),
  status: 'partial',
  lockUntil: null,
  nextRetryAt: null,
  cancelRequestedAt: null,
  lastRunFinishedAt: nowIso(),
  lastReport: report || state?.lastReport || null
});

const getTimestamp = (value) => {
  const ts = value ? new Date(value).getTime() : 0;
  return Number.isFinite(ts) ? ts : 0;
};

const isRunningStateStale = (state) => {
  if (!state) return false;
  if (state.status === 'queued') {
    return Date.now() - getTimestamp(state.lastQueuedAt) > QUEUE_STALE_MS;
  }
  if (state.status === 'running' || state.status === 'cancelling') {
    const heartbeatTs = getTimestamp(state.lastHeartbeatAt || state.lastRunStartedAt);
    const lockTs = getTimestamp(state.lockUntil);
    return (heartbeatTs && (Date.now() - heartbeatTs > RUN_HEARTBEAT_STALE_MS))
      || (lockTs && lockTs < Date.now());
  }
  return false;
};

const maybeHealStaleState = async (supabase, state) => {
  if (!isRunningStateStale(state)) {
    return state;
  }

  const healedState = state.status === 'running'
    ? buildPartialState(state, state.lastReport)
    : buildCancelledState(state, state.lastReport);

  await upsertJobRow(supabase, healedState);
  console.warn(`[casanacho-nightly-sync] healed stale state ${state.status} -> ${healedState.status}`);
  return healedState;
};

const buildProgressState = ({
  baseState,
  triggerSource,
  startedAtIso,
  total,
  startIndex,
  processed,
  successCount,
  errorCount,
  nextCursor,
  report,
  rateLimitRetryCounts
}) => ({
  ...(baseState || {}),
  id: JOB_ID,
  status: 'running',
  lockUntil: new Date(Date.now() + LOCK_WINDOW_MS).toISOString(),
  cursor: nextCursor,
  totalComponentsWithLink: total,
  processedThisRun: processed,
  successCount,
  errorCount,
  lastRunStartedAt: startedAtIso,
  lastRunFinishedAt: null,
  nextRetryAt: null,
  remainingCount: Math.max(total - (startIndex + processed), 0),
  lastTriggerSource: triggerSource,
  lastHeartbeatAt: nowIso(),
  lastReport: report,
  lastNightReport: baseState?.lastNightReport || null,
  rateLimitRetryCounts: rateLimitRetryCounts || baseState?.rateLimitRetryCounts || {}
});

export const getNightlySyncState = async () => {
  const supabase = getSupabaseAdmin();
  const state = await getJobRow(supabase);
  return maybeHealStaleState(supabase, state);
};

export const triggerShouldRun = async ({ force = false } = {}) => {
  const supabase = getSupabaseAdmin();
  const rawState = await getJobRow(supabase);
  const state = await maybeHealStaleState(supabase, rawState);
  if (!state) return { shouldRun: true, reason: 'first-run' };

  if (BLOCKING_JOB_STATUSES.has(state.status)) {
    return { shouldRun: false, reason: 'already-active', state };
  }

  const lockUntilTs = state.lockUntil ? new Date(state.lockUntil).getTime() : 0;
  if (lockUntilTs > Date.now()) {
    return { shouldRun: false, reason: 'locked', state };
  }

  if (!force) {
    const lastFullSyncTs = state.lastFullSyncAt ? new Date(state.lastFullSyncAt).getTime() : 0;
    if (lastFullSyncTs && (Date.now() - lastFullSyncTs) < LAST_FULL_SYNC_COOLDOWN_MS) {
      return { shouldRun: false, reason: 'recent-full-sync', state };
    }

    const nextRetryTs = state.nextRetryAt ? new Date(state.nextRetryAt).getTime() : 0;
    if (nextRetryTs && nextRetryTs > Date.now()) {
      return { shouldRun: false, reason: 'retry-wait', state };
    }
  }

  return { shouldRun: true, reason: 'ready', state };
};

export const triggerNightlySync = async ({
  triggerSource = 'scheduled',
  force = false
} = {}) => {
  const supabase = getSupabaseAdmin();
  const gate = await triggerShouldRun({ force });
  if (!gate.shouldRun) {
    return {
      ok: true,
      triggered: false,
      reason: gate.reason,
      state: gate.state || null
    };
  }

  const queuedAt = nowIso();
  const isResume = ['retry-wait', 'partial'].includes(gate.state?.status);
  const nextState = {
    ...(gate.state || {}),
    id: JOB_ID,
    status: 'queued',
    cursor: isResume ? (gate.state?.cursor || null) : null,
    lockUntil: null,
    nextRetryAt: null,
    cancelRequestedAt: null,
    lastCancellationAt: gate.state?.lastCancellationAt || null,
    lastTriggerSource: triggerSource,
    lastQueuedAt: queuedAt,
    lastReport: isResume ? (gate.state?.lastReport || null) : null,
    rateLimitRetryCounts: isResume ? (gate.state?.rateLimitRetryCounts || {}) : {}
  };

  await upsertJobRow(supabase, nextState);

  if (shouldUseInlineDevRunner()) {
    console.info(`[casanacho-nightly-sync] queued (${triggerSource}) using inline dev runner`);
    setTimeout(() => {
      runNightlySync({ triggerSource }).catch((error) => {
        console.error('Error running inline Casanacho nightly sync:', error);
      });
    }, 0);

    return {
      ok: true,
      triggered: true,
      status: 202,
      payload: { mode: 'inline-dev-runner' },
      state: nextState
    };
  }

  const response = await fetch(`${buildSiteUrl()}/.netlify/functions/casanacho-nightly-sync-background`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-nightly-sync-origin': triggerSource
    },
    body: JSON.stringify({
      triggerSource,
      requestedAt: queuedAt
    })
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    const failedState = {
      ...nextState,
      status: 'idle',
      lockUntil: null
    };
    await upsertJobRow(supabase, failedState);
    return {
      ok: false,
      triggered: false,
      status: response.status,
      payload,
      state: failedState
    };
  }

  console.info(`[casanacho-nightly-sync] queued (${triggerSource}) using background function`);

  return {
    ok: response.ok,
    triggered: response.ok,
    status: response.status,
    payload,
    state: nextState
  };
};

export const cancelNightlySync = async ({ triggerSource = 'manual' } = {}) => {
  const supabase = getSupabaseAdmin();
  const rawState = await getJobRow(supabase);
  const state = await maybeHealStaleState(supabase, rawState);

  if (!state) {
    return {
      ok: true,
      cancelled: false,
      reason: 'no-state',
      state: null
    };
  }

  if (!CANCELLABLE_JOB_STATUSES.has(state.status)) {
    return {
      ok: true,
      cancelled: false,
      reason: 'not-active',
      state
    };
  }

  const cancellationRequestedAt = nowIso();

  if (state.status === 'queued' || state.status === 'retry-wait' || state.status === 'partial') {
    console.info(`[casanacho-nightly-sync] cancellation applied immediately from status=${state.status}`);
    const cancelledState = buildCancelledState({
      ...state,
      cancelRequestedAt: cancellationRequestedAt,
      lastTriggerSource: triggerSource
    });
    await upsertJobRow(supabase, cancelledState);
    return {
      ok: true,
      cancelled: true,
      state: cancelledState
    };
  }

  const nextState = {
    ...state,
    status: 'cancelling',
    cancelRequestedAt: cancellationRequestedAt,
    lastTriggerSource: triggerSource
  };
  await upsertJobRow(supabase, nextState);
  console.info(`[casanacho-nightly-sync] cancellation requested while status=${state.status}`);

  return {
    ok: true,
    cancelled: true,
    state: nextState
  };
};

export const runNightlySync = async ({ triggerSource = 'scheduled' } = {}) => {
  const supabase = getSupabaseAdmin();
  const startAt = Date.now();
  const deadline = startAt + RUN_BUDGET_MS;
  const startedAtIso = nowIso();
  const runKey = getNightRunKey();

  const existingRawState = await getJobRow(supabase);
  const existingState = await maybeHealStaleState(supabase, existingRawState);
  console.info(`[casanacho-nightly-sync] run start (${triggerSource})`);
  if (existingState?.status === 'cancelled') {
    return {
      ok: true,
      skipped: true,
      reason: 'cancelled-before-start',
      state: existingState
    };
  }

  const activeLockTs = existingState?.lockUntil ? new Date(existingState.lockUntil).getTime() : 0;
  if (existingState?.status === 'running' && activeLockTs > Date.now()) {
    return {
      ok: true,
      skipped: true,
      reason: 'locked',
      state: existingState
    };
  }

  const components = sortComponentsForRun(await listComponentsWithLink(supabase));
  const total = components.length;
  const cursorId = existingState?.cursor || null;
  let startIndex = 0;
  if (cursorId) {
    const index = components.findIndex(component => String(component.id) === String(cursorId));
    startIndex = index >= 0 ? index : 0;
  }

  let report = existingState?.lastReport && existingState.lastReport.runKey === runKey
    ? {
        ...existingState.lastReport,
        triggerSource,
        totalComponentsWithLink: total
      }
    : createEmptyReport({ runKey, triggerSource, totalComponentsWithLink: total });

  await upsertJobRow(supabase, {
    ...(existingState || {}),
    status: 'running',
    lastRunStartedAt: startedAtIso,
    lastRunFinishedAt: null,
    lockUntil: new Date(Date.now() + LOCK_WINDOW_MS).toISOString(),
    nextRetryAt: null,
    lastTriggerSource: triggerSource,
    cancelRequestedAt: null,
    lastHeartbeatAt: startedAtIso,
    lastReport: report
  });

  let processed = 0;
  let successCount = 0;
  let errorCount = 0;
  let nextCursor = null;
  let nextRetryAt = null;
  let rateLimited = false;
  let rateLimitRetryCounts = { ...(existingState?.rateLimitRetryCounts || {}) };

  for (let index = startIndex; index < components.length; index += 1) {
    const liveState = await getJobRow(supabase);
    if (liveState?.cancelRequestedAt) {
      console.info('[casanacho-nightly-sync] cancellation detected during run');
      report = {
        ...report,
        finishedAt: nowIso(),
        finishedAll: false,
        cancelled: true
      };

      const cancelledState = buildCancelledState({
        ...(liveState || {}),
        cursor: String(components[index].id),
        processedThisRun: processed,
        successCount,
        errorCount,
        remainingCount: Math.max(total - (startIndex + processed), 0),
        lastTriggerSource: triggerSource,
        lastNightReport: triggerSource === 'scheduled'
          ? report
          : (liveState?.lastNightReport || existingState?.lastNightReport || null)
      }, report);

      await upsertJobRow(supabase, cancelledState);
      return {
        ok: true,
        skipped: false,
        cancelled: true,
        state: cancelledState
      };
    }

    if (Date.now() >= deadline) {
      nextCursor = String(components[index].id);
      break;
    }

    const component = components[index];
    try {
      const result = await getCasanachoPrice(component.link);
      if (!result.ok) {
        throw Object.assign(new Error(result.error || 'No se pudo obtener el precio'), result);
      }

      await updateComponentRow(supabase, buildSuccessPayload(component, result.price, result, triggerSource));
      report = mergeReportWithSuccess(report, component, result.price, result);
      processed += 1;
      successCount += 1;
      delete rateLimitRetryCounts[String(component.id)];
      nextCursor = index < components.length - 1 ? String(components[index + 1].id) : null;
      await upsertJobRow(supabase, buildProgressState({
        baseState: existingState,
        triggerSource,
        startedAtIso,
        total,
        startIndex,
        processed,
        successCount,
        errorCount,
        nextCursor,
        report,
        rateLimitRetryCounts
      }));
    } catch (error) {
      const message = String(error?.error || error?.message || error);
      await updateComponentRow(supabase, buildErrorPayload(component, message, triggerSource));
      report = mergeReportWithError(report, component, message);
      processed += 1;
      errorCount += 1;

      if (Number(error?.status) === 429) {
        const componentId = String(component.id);
        const nextAttempts = Number(rateLimitRetryCounts[componentId] || 0) + 1;
        rateLimitRetryCounts[componentId] = nextAttempts;
        const hasNextComponent = index < components.length - 1;
        const shouldAdvanceCursor = nextAttempts >= MAX_RATE_LIMIT_RETRIES_PER_COMPONENT && hasNextComponent;
        const exhaustedLastComponent = nextAttempts >= MAX_RATE_LIMIT_RETRIES_PER_COMPONENT && !hasNextComponent;

        rateLimited = !exhaustedLastComponent;
        nextCursor = shouldAdvanceCursor
          ? String(components[index + 1].id)
          : exhaustedLastComponent
          ? null
          : componentId;
        const retryAfterMs = Number(error?.retryAfterMs);
        nextRetryAt = rateLimited
          ? new Date(
              Date.now() + (Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : 30 * 60 * 1000)
            ).toISOString()
          : null;
      } else {
        delete rateLimitRetryCounts[String(component.id)];
        nextCursor = index < components.length - 1 ? String(components[index + 1].id) : null;
      }

      await upsertJobRow(supabase, buildProgressState({
        baseState: existingState,
        triggerSource,
        startedAtIso,
        total,
        startIndex,
        processed,
        successCount,
        errorCount,
        nextCursor,
        report,
        rateLimitRetryCounts
      }));

      if (Number(error?.status) === 429) {
        break;
      }
    }

    if (Date.now() < deadline) {
      await sleep(300);
    }
  }

  const finishedAll = !nextCursor && !rateLimited;
  report = {
    ...report,
    finishedAt: nowIso(),
    finishedAll,
    rateLimited,
    totalComponentsWithLink: total,
    processedCount: report.executed.length
  };

  const state = {
    ...(existingState || {}),
    id: JOB_ID,
    status: finishedAll ? 'idle' : (rateLimited ? 'retry-wait' : 'partial'),
    lockUntil: null,
    cursor: finishedAll ? null : nextCursor,
    totalComponentsWithLink: total,
    processedThisRun: processed,
    successCount,
    errorCount,
    lastRunStartedAt: startedAtIso,
    lastRunFinishedAt: nowIso(),
    lastFullSyncAt: finishedAll ? nowIso() : (existingState?.lastFullSyncAt || null),
    nextRetryAt,
    lastRateLimitAt: rateLimited ? nowIso() : (existingState?.lastRateLimitAt || null),
    remainingCount: finishedAll
      ? 0
      : Math.max(total - (startIndex + processed), 0),
    lastTriggerSource: triggerSource,
    lastReport: report,
    rateLimitRetryCounts: finishedAll ? {} : rateLimitRetryCounts,
    lastNightReport: triggerSource === 'scheduled'
      ? report
      : (existingState?.lastNightReport || null)
  };

  await upsertJobRow(supabase, state);
  console.info(`[casanacho-nightly-sync] run finished: status=${state.status} processed=${processed} success=${successCount} error=${errorCount}`);

  return {
    ok: true,
    skipped: false,
    finishedAll,
    rateLimited,
    state
  };
};
