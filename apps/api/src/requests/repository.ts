import type {
  AuthedBloodRequest,
  BloodType,
  CreateRequestInput,
  PublicBloodRequest,
  RequestFilterInput,
  Urgency,
} from '@kapka/shared';
import { pool, type Queryable } from '../db';

/** Who is asking. `null` is an anonymous caller. */
export interface Viewer {
  userId: string;
}

interface RequestRow {
  id: string;
  blood_type: BloodType;
  units_needed: number;
  urgency: Urgency;
  hospital_name: string;
  hospital_lat: string | null;
  hospital_lng: string | null;
  city: string;
  note: string | null;
  status: PublicBloodRequest['status'];
  created_at: Date;
  expires_at: Date;
  contact_phone?: string;
}

/**
 * The columns every caller may see.
 *
 * contact_phone is deliberately absent. §4 returns the requester's contact
 * only to authenticated users and §12 says contact details are never in a
 * public response — so for an anonymous caller the column is not selected at
 * all rather than selected and stripped afterwards. A column that was never
 * read cannot be leaked by a serialisation mistake later.
 */
const PUBLIC_COLUMNS = `
  r.id, r.blood_type, r.units_needed, r.urgency, r.hospital_name,
  r.hospital_lat, r.hospital_lng, r.city, r.note, r.status,
  r.created_at, r.expires_at`;

const AUTHED_COLUMNS = `${PUBLIC_COLUMNS}, r.contact_phone`;

function toPublic(row: RequestRow): PublicBloodRequest {
  return {
    id: row.id,
    bloodType: row.blood_type,
    unitsNeeded: row.units_needed,
    urgency: row.urgency,
    hospitalName: row.hospital_name,
    // NUMERIC comes back as a string; the API speaks numbers.
    hospitalLat: row.hospital_lat === null ? null : Number(row.hospital_lat),
    hospitalLng: row.hospital_lng === null ? null : Number(row.hospital_lng),
    city: row.city,
    note: row.note,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
  };
}

function toAuthed(row: RequestRow): AuthedBloodRequest {
  return { ...toPublic(row), contactPhone: row.contact_phone ?? '' };
}

/** Never return an unbounded feed; §11 measures the payload on a 3G phone. */
const FEED_LIMIT = 100;

export interface RequestsRepository {
  create(input: CreateRequestInput, requesterId: string): Promise<AuthedBloodRequest>;
  list(
    filters: RequestFilterInput,
    viewer: Viewer | null,
  ): Promise<PublicBloodRequest[] | AuthedBloodRequest[]>;
  findById(
    id: string,
    viewer: Viewer | null,
  ): Promise<PublicBloodRequest | AuthedBloodRequest | null>;
}

export function createPgRequestsRepository(db: Queryable = pool): RequestsRepository {
  return {
    async create(input, requesterId) {
      // Status is left to the column default, 'pending'. A request reaches
      // donors only after an admin approves it (§4), and letting a client
      // choose its own status would be the whole moderation step gone.
      const { rows } = await db.query<RequestRow>(
        `INSERT INTO blood_requests
           (requester_id, blood_type, units_needed, urgency, hospital_name,
            hospital_lat, hospital_lng, city, contact_phone, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING ${AUTHED_COLUMNS.replace(/r\./g, '')}`,
        [
          requesterId,
          input.bloodType,
          input.unitsNeeded,
          input.urgency,
          input.hospitalName,
          input.hospitalLat ?? null,
          input.hospitalLng ?? null,
          input.city,
          input.contactPhone,
          input.note ?? null,
        ],
      );
      const row = rows[0];
      if (!row) throw new Error('request insert returned no row');
      // The person who just posted it is authenticated by definition.
      return toAuthed(row);
    },

    async list(filters, viewer) {
      const columns = viewer ? AUTHED_COLUMNS : PUBLIC_COLUMNS;

      /*
       * Approved and unexpired only. A pending request has not been checked
       * by anyone yet, and §3 gives requests an expiry precisely so the feed
       * does not fill with stale ones.
       *
       * compatibleWithMe joins the matrix in the same direction as §5.1: the
       * request's type is what the patient NEEDS (recipient_type) and the
       * viewer's own type is the donor side. Reversed, it would show a donor
       * exactly the requests they cannot help with.
       */
      const { rows } = await db.query<RequestRow>(
        `SELECT ${columns}
         FROM blood_requests r
         WHERE r.status = 'approved'
           AND r.expires_at > now()
           AND ($1::text IS NULL OR r.city = $1)
           AND ($2::text IS NULL OR r.blood_type = $2::blood_type)
           AND ($3::text IS NULL OR r.urgency = $3::urgency_level)
           AND ($4::boolean IS NOT TRUE OR EXISTS (
                 SELECT 1
                 FROM donor_profiles dp
                 JOIN blood_compatibility bc ON bc.donor_type = dp.blood_type
                 WHERE dp.user_id = $5
                   AND bc.recipient_type = r.blood_type))
         ORDER BY r.created_at DESC
         LIMIT ${String(FEED_LIMIT)}`,
        [
          filters.city ?? null,
          filters.bloodType ?? null,
          filters.urgency ?? null,
          filters.compatibleWithMe ?? null,
          viewer?.userId ?? null,
        ],
      );
      return viewer ? rows.map(toAuthed) : rows.map(toPublic);
    },

    async findById(id, viewer) {
      const columns = viewer ? AUTHED_COLUMNS : PUBLIC_COLUMNS;
      const { rows } = await db.query<RequestRow>(
        `SELECT ${columns} FROM blood_requests r
         WHERE r.id = $1 AND r.status = 'approved'`,
        [id],
      );
      const row = rows[0];
      if (!row) return null;
      return viewer ? toAuthed(row) : toPublic(row);
    },
  };
}
