import {
  buildAllocation,
  deliveryCounts,
  HOUSE_AD_ID,
  selectAdvertiserForTicket,
  type Advertiser,
} from './advertising-core';

type AdvertisingDatabase = Pick<D1Database, 'prepare'>;
export type AdDelivery = {
  advertiser: Advertiser;
  ticket: number;
  allocationRevision: string;
  house: boolean;
};

export const RESERVE_AD_SLOTS_SQL = `
  INSERT INTO ad_allocations (revision, next_ticket, allocation, created_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(revision) DO UPDATE SET next_ticket = ad_allocations.next_ticket + excluded.next_ticket
  RETURNING next_ticket
`;

export async function advertisingRevision(advertisers: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(buildAllocation(advertisers).revisionInput));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** One atomic D1 statement reserves disjoint global tickets even for concurrent readers. */
export async function reserveAdSlots(db: AdvertisingDatabase, advertisers: unknown, count: number): Promise<AdDelivery[]> {
  if (!Number.isInteger(count) || count < 1 || count > 20) throw new Error('Request between 1 and 20 banner slots.');
  const allocation = buildAllocation(advertisers);
  const revision = await advertisingRevision(advertisers);
  const result = await db.prepare(RESERVE_AD_SLOTS_SQL)
    .bind(revision, count, JSON.stringify(allocation.advertisers), new Date().toISOString())
    .first<{ next_ticket: number }>();
  if (!result || !Number.isSafeInteger(result.next_ticket) || result.next_ticket < count) {
    throw new Error('Unable to reserve advertising slots.');
  }
  const firstTicket = result.next_ticket - count;
  return Array.from({ length: count }, (_, index) => {
    const ticket = firstTicket + index;
    const advertiser = selectAdvertiserForTicket(allocation, ticket);
    return { advertiser, ticket, allocationRevision: revision, house: advertiser.id === HOUSE_AD_ID };
  });
}

export async function getAdvertisingStats(db: AdvertisingDatabase, advertisers: unknown) {
  const allocation = buildAllocation(advertisers);
  const revision = await advertisingRevision(advertisers);
  const row = await db.prepare('SELECT next_ticket, created_at FROM ad_allocations WHERE revision=?')
    .bind(revision).first<{ next_ticket: number; created_at: string }>();
  const deliveredSlots = row?.next_ticket || 0;
  const counts = deliveryCounts(allocation, deliveredSlots);
  return {
    allocationRevision: revision,
    startedAt: row?.created_at || null,
    deliveredSlots,
    paidPercent: allocation.paidPercent,
    housePercent: allocation.housePercent,
    measurement: 'Delivered banner slots; these are not verified viewed impressions.',
    advertisers: allocation.advertisers.map(ad => ({
      id: ad.id,
      name: ad.name,
      sharePercent: ad.sharePercent,
      deliveredSlots: counts[ad.id] || 0,
      actualPercent: deliveredSlots ? Math.round((counts[ad.id] || 0) / deliveredSlots * 10_000) / 100 : 0,
      house: ad.id === HOUSE_AD_ID,
    })),
  };
}
