/**
 * Simulated tenant provisioning. A real implementation would call the platform's
 * provisioning API; here a timer finishes the run after a short delay.
 *
 * Delay: TENANT_PROVISION_DELAY_MS (default 1500 ms), or setProvisionDelay() in tests.
 * Deterministic failure: subdomains starting with "fail-".
 */

const store = require('../data/store');

const DEFAULT_DELAY_MS = 1500;
const envDelay = Number.parseInt(process.env.TENANT_PROVISION_DELAY_MS, 10);
let delayMs = Number.isFinite(envDelay) && envDelay >= 0 ? envDelay : DEFAULT_DELAY_MS;

// customerId -> latest run token, so a superseded timer cannot finish a newer run.
const runs = new Map();
let nextRun = 0;

function setProvisionDelay(ms) {
  delayMs = Math.max(0, Number(ms) || 0);
}

function getProvisionDelay() {
  return delayMs;
}

/** Returns a readable failure reason, or null when provisioning would succeed. */
function simulateProvisioningOutcome(config) {
  if (config.subdomain.startsWith('fail-')) {
    return `The provisioning service could not create "${config.subdomain}" (simulated failure for subdomains starting with "fail-"). Choose a different subdomain and retry.`;
  }
  return null;
}

/** Schedules the end of a provisioning run started with store.startTenantProvisioning. */
function scheduleProvisioning(customerId, config) {
  const run = ++nextRun;
  runs.set(customerId, run);
  const timer = setTimeout(() => {
    if (runs.get(customerId) !== run) return;
    runs.delete(customerId);
    store.finishTenantProvisioning(customerId, { failureReason: simulateProvisioningOutcome(config) });
  }, delayMs);
  timer.unref?.();
}

module.exports = { setProvisionDelay, getProvisionDelay, simulateProvisioningOutcome, scheduleProvisioning };
