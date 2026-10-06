/** Site-wide share of voice is measured in delivered banner slots, not viewed impressions. */
export type Advertiser = {
  id: string;
  name: string;
  label: string;
  sub: string;
  url: string;
  image: string;
  enabled: boolean;
  sharePercent: number;
};

export const AD_CYCLE_SIZE = 10_000;
export const HOUSE_AD_ID = '__house__';
export const houseAdvertiser: Advertiser = {
  id: HOUSE_AD_ID,
  name: 'Jew Knows',
  label: 'A little space. A lasting impression.',
  sub: 'Advertise with Jew Knows.',
  url: '',
  image: '',
  enabled: true,
  sharePercent: 100,
};

export type AdAllocation = {
  advertisers: Advertiser[];
  weights: number[];
  /** Only active IDs and percentages affect the allocation revision. */
  revisionInput: string;
  paidPercent: number;
  housePercent: number;
};

const safeText = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

export function shareToBasisPoints(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error('Each advertiser percentage must be a number from 0 to 100.');
  }
  const basisPoints = Math.round(value * 100);
  if (Math.abs(value * 100 - basisPoints) > 0.000001) {
    throw new Error('Advertiser percentages can have at most two decimal places.');
  }
  return basisPoints;
}

/** Also upgrades the previous placement-specific ad records without inventing paid shares. */
export function normalizeAdvertisers(input: unknown): Advertiser[] {
  if (!Array.isArray(input) || input.length > 100) {
    throw new Error('Advertisers must be a list of at most 100 campaigns.');
  }
  const ids = new Set<string>();
  let activeBasisPoints = 0;
  const result = input.map((item: unknown): Advertiser => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('Each advertiser must be a campaign object.');
    }
    const raw = item as Record<string, unknown>;
    const id = safeText(raw.id, 80);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(id) || ids.has(id)) {
      throw new Error('Advertisers need unique IDs containing letters, numbers, hyphens or underscores.');
    }
    ids.add(id);
    const share = raw.sharePercent === undefined ? 0 : raw.sharePercent;
    const basisPoints = shareToBasisPoints(share);
    const enabled = raw.enabled === undefined ? true : raw.enabled;
    if (typeof enabled !== 'boolean') throw new Error('Advertiser enabled must be true or false.');
    if (enabled) activeBasisPoints += basisPoints;
    const label = safeText(raw.label, 180);
    const name = safeText(raw.name, 120) || label || id;
    return {
      id,
      name,
      label: label || name,
      sub: safeText(raw.sub, 260),
      url: safeText(raw.url, 2_000),
      image: safeText(raw.image, 2_000),
      enabled,
      sharePercent: basisPoints / 100,
    };
  });
  if (activeBasisPoints > AD_CYCLE_SIZE) {
    throw new Error('Enabled advertiser percentages must total 100% or less. The remainder belongs to Jew Knows.');
  }
  return result;
}

export function buildAllocation(input: unknown): AdAllocation {
  const paid = normalizeAdvertisers(input)
    .filter(ad => ad.enabled && ad.sharePercent > 0)
    .sort((a, b) => a.id.localeCompare(b.id, 'en'));
  const weights = paid.map(ad => shareToBasisPoints(ad.sharePercent));
  const paidBasisPoints = weights.reduce((sum, value) => sum + value, 0);
  const houseBasisPoints = AD_CYCLE_SIZE - paidBasisPoints;
  const advertisers = [...paid];
  if (houseBasisPoints > 0) {
    advertisers.push({ ...houseAdvertiser, sharePercent: houseBasisPoints / 100 });
    weights.push(houseBasisPoints);
  }
  return {
    advertisers,
    weights,
    revisionInput: JSON.stringify({ version: 1, allocations: advertisers.map((ad, index) => [ad.id, weights[index]]) }),
    paidPercent: paidBasisPoints / 100,
    housePercent: houseBasisPoints / 100,
  };
}

// Smooth weighted round robin spreads each campaign throughout the cycle. The cycle
// contains exactly its integer basis-point allocation and repeats after 10,000 slots.
const cycleCache = new Map<string, Uint8Array>();
function allocationCycle(allocation: AdAllocation): Uint8Array {
  const existing = cycleCache.get(allocation.revisionInput);
  if (existing) return existing;
  const current = new Array<number>(allocation.weights.length).fill(0);
  const cycle = new Uint8Array(AD_CYCLE_SIZE);
  for (let slot = 0; slot < AD_CYCLE_SIZE; slot++) {
    let selected = 0;
    for (let campaign = 0; campaign < current.length; campaign++) {
      current[campaign] += allocation.weights[campaign];
      if (current[campaign] > current[selected]) selected = campaign;
    }
    cycle[slot] = selected;
    current[selected] -= AD_CYCLE_SIZE;
  }
  if (cycleCache.size >= 4) cycleCache.delete(cycleCache.keys().next().value!);
  cycleCache.set(allocation.revisionInput, cycle);
  return cycle;
}

export function selectAdvertiserForTicket(allocation: AdAllocation, ticket: number): Advertiser {
  if (!Number.isSafeInteger(ticket) || ticket < 0) throw new Error('Invalid advertising delivery ticket.');
  return allocation.advertisers[allocationCycle(allocation)[ticket % AD_CYCLE_SIZE]];
}

export function deliveryCounts(allocation: AdAllocation, deliveredSlots: number): Record<string, number> {
  if (!Number.isSafeInteger(deliveredSlots) || deliveredSlots < 0) throw new Error('Invalid delivered slot count.');
  const completeCycles = Math.floor(deliveredSlots / AD_CYCLE_SIZE);
  const result: Record<string, number> = Object.fromEntries(
    allocation.advertisers.map((ad, index) => [ad.id, completeCycles * allocation.weights[index]]),
  );
  const cycle = allocationCycle(allocation);
  for (let slot = 0; slot < deliveredSlots % AD_CYCLE_SIZE; slot++) {
    result[allocation.advertisers[cycle[slot]].id]++;
  }
  return result;
}
