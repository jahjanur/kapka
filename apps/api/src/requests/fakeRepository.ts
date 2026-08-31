import type { AuthedBloodRequest, PublicBloodRequest } from '@kapka/shared';
import type { RequestsRepository } from './repository';

/**
 * An in-memory RequestsRepository, for tests about routing and validation
 * rather than about SQL. The queries themselves are covered against a real
 * PostgreSQL in requests.test.ts.
 */
export function createFakeRequestsRepository(): RequestsRepository {
  let sequence = 0;
  const stored: AuthedBloodRequest[] = [];

  return {
    create(input, _requesterId) {
      sequence += 1;
      const created: AuthedBloodRequest = {
        id: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
        bloodType: input.bloodType,
        unitsNeeded: input.unitsNeeded,
        urgency: input.urgency,
        hospitalName: input.hospitalName,
        hospitalLat: input.hospitalLat ?? null,
        hospitalLng: input.hospitalLng ?? null,
        city: input.city,
        note: input.note ?? null,
        contactPhone: input.contactPhone,
        status: 'pending',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      };
      stored.push(created);
      return Promise.resolve(created);
    },

    list(_filters, viewer) {
      const approved = stored.filter((request) => request.status === 'approved');
      return Promise.resolve(viewer ? approved : approved.map(withoutContact));
    },

    findById(id, viewer) {
      const found = stored.find((request) => request.id === id);
      // A pending request is not public, so it answers the same as a missing
      // one — see the route.
      if (found?.status !== 'approved') return Promise.resolve(null);
      return Promise.resolve(viewer ? found : withoutContact(found));
    },
  };
}

function withoutContact(request: AuthedBloodRequest): PublicBloodRequest {
  const { contactPhone: _contactPhone, ...rest } = request;
  return rest;
}
