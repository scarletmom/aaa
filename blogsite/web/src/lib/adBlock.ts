// Our ad network: Brave Shields and block lists refuse it outright.
const AD_TAG_URL = 'https://quge5.com/88/tag.min.js';
// Blockers that don't know our network still refuse this. Brave instead swaps it for a harmless stand-in that
// "loads", so it can't be the only signal.
const REFERENCE_AD_URL = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';

const PROBE_TIMEOUT_MS = 6000;
// A blocker refuses inside the browser in a few milliseconds; a real network failure (an outage at the ad network)
// takes at least a round trip, so it isn't mistaken for a blocker.
const INSTANT_REFUSAL_MS = 250;
const BAIT_CLASSES = 'adsbox ad-banner ad-placement textads banner-ads pub_300x250';

export interface AdBlockResult {
  blocked: boolean;
  brave: boolean;
}

/** Whether the browser refused `url` before it could reach the network. */
async function refusedInstantly(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const started = performance.now();
  try {
    await fetch(url, { mode: 'no-cors', cache: 'no-store', credentials: 'omit', signal: controller.signal });
    return false;
  } catch {
    return !controller.signal.aborted && performance.now() - started < INSTANT_REFUSAL_MS;
  } finally {
    clearTimeout(timer);
  }
}

async function networkBlocked(): Promise<boolean> {
  if (!navigator.onLine) return false;
  const [ours, reference] = await Promise.all([refusedInstantly(AD_TAG_URL), refusedInstantly(REFERENCE_AD_URL)]);
  return ours || reference;
}

/** Cosmetic filters hide anything that looks like an ad slot, so a hidden bait element gives them away. */
async function baitHidden(): Promise<boolean> {
  const bait = document.createElement('div');
  bait.className = BAIT_CLASSES;
  bait.setAttribute('aria-hidden', 'true');
  bait.dataset.adBait = '';
  bait.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:300px;height:10px;';
  bait.innerHTML = '&nbsp;';
  document.body.append(bait);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const style = getComputedStyle(bait);
  const hidden = bait.offsetHeight === 0 || style.display === 'none' || style.visibility === 'hidden';
  bait.remove();
  return hidden;
}

async function isBrave(): Promise<boolean> {
  const brave = (navigator as Navigator & { brave?: { isBrave?: () => Promise<boolean> } }).brave;
  try {
    return Boolean(await brave?.isBrave?.());
  } catch {
    return false;
  }
}

let check: Promise<AdBlockResult> | null = null;

/** Checked once per page load; reloading after allowing ads checks again. */
export function detectAdBlock(): Promise<AdBlockResult> {
  check ||= Promise.all([networkBlocked(), baitHidden(), isBrave()])
    .then(([network, cosmetic, brave]) => ({ blocked: network || cosmetic, brave }));
  return check;
}
