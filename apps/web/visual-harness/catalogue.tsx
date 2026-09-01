import type { ReactNode } from 'react';
import type { PublicBloodRequest } from '@kapka/shared';
import {
  AppHeader,
  BloodTypeBadge,
  BloodTypeLabel,
  Button,
  Card,
  Cluster,
  Container,
  EmptyState,
  ErrorState,
  Field,
  FilterBar,
  FilterChip,
  FilterGroupLabel,
  Grid,
  Icon,
  ICON_NAMES,
  Input,
  Modal,
  OfflineBanner,
  RequestCard,
  RequestCardSkeleton,
  Select,
  Sheet,
  Skeleton,
  Stack,
  Textarea,
  ThemeToggle,
  UrgencyPill,
  WithSidebar,
} from '../src/components';
import { ApiError } from '../src/lib/api';
import { SessionContext } from '../src/lib/session';
import { Row } from './Row';
import { ToastShelf } from './ToastShelf';

/**
 * Every component variant, as a specimen the camera can find.
 *
 * One entry per visually distinct state. Enumerations of the same shape — the
 * eight blood types, the three urgencies, the whole icon set — are one
 * specimen showing all of them rather than one specimen each: the diff is
 * just as readable and the alternative is three hundred near-identical files
 * for no extra signal.
 */
export interface Specimen {
  id: string;
  /**
   * `full` fills the page's container so container queries and media queries
   * see a real width; `auto` shrinks to the component. RequestCard lays
   * itself out from its own width, so it must be `full` or the whole point of
   * shooting it at three viewports is lost.
   */
  width?: 'auto' | 'full';
  /**
   * Rendered on a page of its own and shot whole.
   *
   * For anything that leaves the flow: a modal <dialog> lives in the top
   * layer and makes the rest of the document inert, and a toast is positioned
   * against the viewport rather than its parent. Both would be invisible to
   * an element screenshot of the specimen box, and the modal would make every
   * specimen after it unreachable.
   */
  solo?: boolean;
  render: () => ReactNode;
}

/* ── Fixtures ──────────────────────────────────────────────────────────────
   Fixed timestamps, because RequestCard prints "posted 4 hours ago" and a
   clock that moves is a snapshot that fails tomorrow. The spec pins the
   browser's clock to NOW; these are offsets from it.                       */
const NOW = new Date('2026-06-15T12:00:00.000Z');
const hoursAgo = (n: number) => new Date(NOW.getTime() - n * 3_600_000).toISOString();
const daysAhead = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

const REQUEST: PublicBloodRequest = {
  id: '11111111-1111-4111-8111-111111111111',
  bloodType: 'O-',
  unitsNeeded: 3,
  urgency: 'critical',
  hospitalName: 'City General Hospital',
  city: 'Skopje',
  note: null,
  status: 'approved',
  createdAt: hoursAgo(4),
  expiresAt: daysAhead(6),
};

/* The header is the only component that reads the session, and there are two
   of it. Given through the context directly rather than through
   SessionProvider, which would try to restore a session over the network the
   moment it mounted — the harness must never make a request. */
const signIn = () => undefined;
const signOut = () => undefined;

const SIGNED_OUT = { session: null, restoring: false, signIn, signOut };

const SIGNED_IN = {
  session: {
    user: {
      id: 'u1',
      email: 'ana@example.com',
      fullName: 'Ana Petrovska',
      role: 'donor' as const,
      emailVerified: true,
    },
    accessToken: 'token',
  },
  restoring: false,
  signIn,
  signOut,
};

const noop = () => undefined;

export const SPECIMENS: Specimen[] = [
  /* ── Button ───────────────────────────────────────────────────────────── */
  { id: 'button-primary', render: () => <Button>Register as donor</Button> },
  {
    id: 'button-secondary',
    render: () => <Button variant="secondary">Reject</Button>,
  },
  { id: 'button-ghost', render: () => <Button variant="ghost">Cancel</Button> },
  {
    id: 'button-danger',
    render: () => <Button variant="danger">Delete my account</Button>,
  },
  { id: 'button-size-sm', render: () => <Button size="sm">Register</Button> },
  { id: 'button-size-lg', render: () => <Button size="lg">Post a request</Button> },
  {
    id: 'button-loading',
    render: () => (
      <Button loading loadingLabel="Approving and emailing…">
        Approve and notify
      </Button>
    ),
  },
  { id: 'button-disabled', render: () => <Button disabled>Continue</Button> },
  {
    id: 'button-full-width',
    width: 'full',
    render: () => <Button fullWidth>Register as donor</Button>,
  },
  {
    id: 'button-as-link',
    render: () => <Button to="/register">Back to requests</Button>,
  },

  /* ── Card ─────────────────────────────────────────────────────────────── */
  { id: 'card-default', width: 'full', render: () => <Card>Default padding.</Card> },
  {
    id: 'card-flush',
    width: 'full',
    render: () => <Card padding="flush">Flush, for edge-to-edge media.</Card>,
  },
  {
    id: 'card-tight',
    width: 'full',
    render: () => <Card padding="tight">Tight padding.</Card>,
  },
  {
    id: 'card-roomy',
    width: 'full',
    render: () => <Card padding="roomy">Roomy, for a page&rsquo;s lead card.</Card>,
  },
  {
    id: 'card-alt-tone',
    width: 'full',
    render: () => <Card tone="alt">A card nested inside another card.</Card>,
  },
  {
    id: 'card-interactive',
    width: 'full',
    render: () => <Card interactive>Interactive, so it is a real button.</Card>,
  },

  /* ── Blood type ───────────────────────────────────────────────────────── */
  {
    id: 'blood-type-badge-all',
    width: 'full',
    render: () => (
      <Row>
        {(['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'] as const).map((type) => (
          <BloodTypeBadge key={type} type={type} />
        ))}
      </Row>
    ),
  },
  {
    id: 'blood-type-badge-sizes',
    render: () => (
      <Row>
        <BloodTypeBadge type="O-" size="sm" />
        <BloodTypeBadge type="O-" size="md" />
        <BloodTypeBadge type="O-" size="lg" />
      </Row>
    ),
  },
  {
    id: 'blood-type-label',
    render: () => (
      <p>
        A donor with <BloodTypeLabel type="AB+" /> blood.
      </p>
    ),
  },

  /* ── Urgency ──────────────────────────────────────────────────────────── */
  {
    id: 'urgency-pill-all',
    render: () => (
      <Row>
        <UrgencyPill urgency="routine" />
        <UrgencyPill urgency="urgent" />
        <UrgencyPill urgency="critical" />
      </Row>
    ),
  },

  /* ── Icon ─────────────────────────────────────────────────────────────── */
  {
    id: 'icon-all',
    width: 'full',
    render: () => (
      <Row>
        {ICON_NAMES.map((name) => (
          <Icon key={name} name={name} size={1.5} />
        ))}
      </Row>
    ),
  },

  /* ── Skeleton ─────────────────────────────────────────────────────────── */
  {
    id: 'skeleton-shapes',
    width: 'full',
    render: () => (
      <Stack gap={2}>
        <Skeleton width="60%" height="1.4rem" />
        <Skeleton width="100%" shape="text" />
        <Skeleton width="3rem" height="3rem" shape="circle" />
      </Stack>
    ),
  },

  /* ── Field and controls ───────────────────────────────────────────────── */
  {
    id: 'field-with-help',
    width: 'full',
    render: () => (
      <Field label="Email" help="Where the notifications go.">
        <Input type="email" defaultValue="ana@example.com" />
      </Field>
    ),
  },
  {
    id: 'field-required',
    width: 'full',
    render: () => (
      <Field label="Full name" required>
        <Input defaultValue="Ana Petrovska" />
      </Field>
    ),
  },
  {
    id: 'field-optional',
    width: 'full',
    render: () => (
      <Field
        label="Phone"
        optional
        help="Only shared with a hospital you have agreed to help."
      >
        <Input type="tel" />
      </Field>
    ),
  },
  {
    id: 'field-error',
    width: 'full',
    render: () => (
      <Field label="Email" required error="That email already has an account.">
        <Input type="email" defaultValue="ana@example.com" />
      </Field>
    ),
  },
  {
    id: 'field-hidden-label',
    width: 'full',
    render: () => (
      <Field label="City" hideLabel>
        <Select defaultValue="Skopje">
          <option>Skopje</option>
        </Select>
      </Field>
    ),
  },
  {
    id: 'input-disabled',
    width: 'full',
    render: () => (
      <Field label="Email" help="This cannot be changed here.">
        <Input defaultValue="ana@example.com" disabled />
      </Field>
    ),
  },
  {
    id: 'select-placeholder',
    width: 'full',
    render: () => (
      <Field label="City" required>
        <Select placeholder="Choose a city" defaultValue="">
          <option value="Skopje">Skopje</option>
          <option value="Bitola">Bitola</option>
        </Select>
      </Field>
    ),
  },
  {
    id: 'textarea',
    width: 'full',
    render: () => (
      <Field label="Why is this being rejected?" help="The requester sees this.">
        <Textarea rows={3} defaultValue="The hospital could not be reached to confirm." />
      </Field>
    ),
  },

  /* ── Empty and error states ───────────────────────────────────────────── */
  {
    id: 'empty-state-full',
    width: 'full',
    render: () => (
      <EmptyState
        icon="droplet"
        headline="No requests match those filters"
        body="Nothing open right now for that blood type in that city."
        action={<Button>Clear filters</Button>}
      />
    ),
  },
  {
    id: 'empty-state-no-action',
    width: 'full',
    render: () => (
      <EmptyState
        icon="checkCircle"
        headline="Nothing is waiting"
        body="Every request has been decided. New ones appear here as they are posted."
      />
    ),
  },
  {
    id: 'empty-state-headline-only',
    width: 'full',
    render: () => <EmptyState headline="Nothing here yet" />,
  },
  {
    id: 'error-state-retryable',
    width: 'full',
    render: () => (
      <ErrorState
        error={new ApiError('INTERNAL', 'We could not reach the server.', 500)}
        subject="requests"
        onRetry={noop}
      />
    ),
  },
  {
    id: 'error-state-offline',
    width: 'full',
    render: () => (
      <ErrorState
        error={new ApiError('OFFLINE', 'You are offline.', 0)}
        subject="requests"
        onRetry={noop}
      />
    ),
  },

  /* ── Filters ──────────────────────────────────────────────────────────── */
  {
    id: 'filter-bar',
    width: 'full',
    render: () => (
      <FilterBar label="Filter requests">
        <FilterGroupLabel>Blood type</FilterGroupLabel>
        <FilterChip selected onClick={noop}>
          All
        </FilterChip>
        <FilterChip selected={false} onClick={noop}>
          O&minus;
        </FilterChip>
        <FilterChip selected={false} onClick={noop}>
          A+
        </FilterChip>
        <FilterChip selected={false} onClick={noop}>
          AB&minus;
        </FilterChip>
      </FilterBar>
    ),
  },
  {
    id: 'filter-chip-states',
    render: () => (
      <Row>
        <FilterChip selected onClick={noop}>
          Selected
        </FilterChip>
        <FilterChip selected={false} onClick={noop}>
          Not selected
        </FilterChip>
      </Row>
    ),
  },

  /* ── RequestCard ──────────────────────────────────────────────────────── */
  {
    id: 'request-card-critical',
    width: 'full',
    render: () => <RequestCard request={REQUEST} />,
  },
  {
    id: 'request-card-urgent',
    width: 'full',
    render: () => (
      <RequestCard request={{ ...REQUEST, urgency: 'urgent', unitsNeeded: 1 }} />
    ),
  },
  {
    id: 'request-card-routine',
    width: 'full',
    render: () => (
      <RequestCard
        request={{
          ...REQUEST,
          urgency: 'routine',
          bloodType: 'AB+',
          city: 'Bitola',
          hospitalName: 'Clinical Hospital Bitola',
        }}
      />
    ),
  },
  {
    id: 'request-card-with-note',
    width: 'full',
    render: () => (
      <RequestCard
        request={{ ...REQUEST, note: 'Ask for the haematology ward on the third floor.' }}
      />
    ),
  },
  {
    id: 'request-card-in-sidebar',
    width: 'full',
    /* The card lays itself out from its own width, not the viewport's. A
       narrow column is the case container queries exist for, and it is
       invisible to every other specimen here. */
    render: () => (
      <div style={{ maxWidth: '20rem' }}>
        <RequestCard request={REQUEST} />
      </div>
    ),
  },
  {
    id: 'request-card-skeleton',
    width: 'full',
    render: () => <RequestCardSkeleton />,
  },

  /* ── Layout primitives ────────────────────────────────────────────────── */
  {
    id: 'layout-stack',
    width: 'full',
    render: () => (
      <Stack gap={4}>
        <Card>One</Card>
        <Card>Two</Card>
        <Card>Three</Card>
      </Stack>
    ),
  },
  {
    id: 'layout-cluster',
    width: 'full',
    render: () => (
      <Cluster gap={2}>
        <Button size="sm">One</Button>
        <Button size="sm" variant="secondary">
          Two
        </Button>
        <Button size="sm" variant="ghost">
          Three
        </Button>
      </Cluster>
    ),
  },
  {
    id: 'layout-grid',
    width: 'full',
    render: () => (
      <Grid minColumn="12rem" gap={4}>
        <Card>One</Card>
        <Card>Two</Card>
        <Card>Three</Card>
        <Card>Four</Card>
      </Grid>
    ),
  },
  {
    id: 'layout-with-sidebar',
    width: 'full',
    render: () => (
      <WithSidebar sidebar={<Card tone="alt">Sidebar</Card>}>
        <Card>Main column</Card>
      </WithSidebar>
    ),
  },
  {
    id: 'layout-container',
    width: 'full',
    render: () => (
      <Container>
        <Card>Inside the page container.</Card>
      </Container>
    ),
  },

  /* ── Header ───────────────────────────────────────────────────────────── */
  {
    id: 'app-header-signed-out',
    width: 'full',
    render: () => (
      <SessionContext value={SIGNED_OUT}>
        <AppHeader />
      </SessionContext>
    ),
  },
  {
    id: 'app-header-signed-in',
    width: 'full',
    render: () => (
      <SessionContext value={SIGNED_IN}>
        <AppHeader />
      </SessionContext>
    ),
  },
  { id: 'theme-toggle', render: () => <ThemeToggle /> },

  /* ── Overlays and banners, each on a page of its own ──────────────────── */
  {
    id: 'modal-centre',
    solo: true,
    render: () => (
      <Modal
        open
        shape="centre"
        title="Delete your account?"
        onClose={noop}
        footer={
          <>
            <Button variant="danger">Delete everything</Button>
            <Button variant="ghost">Keep my account</Button>
          </>
        }
      >
        This removes your profile and stops every email. It cannot be undone.
      </Modal>
    ),
  },
  {
    id: 'modal-sheet',
    solo: true,
    render: () => (
      <Sheet
        open
        title="Filter requests"
        onClose={noop}
        footer={<Button fullWidth>Show 12 requests</Button>}
      >
        Blood type, city and urgency, all optional.
      </Sheet>
    ),
  },
  { id: 'toast-info', solo: true, render: () => <ToastShelf tone="info" /> },
  { id: 'toast-success', solo: true, render: () => <ToastShelf tone="success" /> },
  { id: 'toast-error', solo: true, render: () => <ToastShelf tone="error" /> },
  {
    id: 'offline-banner-offline',
    solo: true,
    /* Renders nothing until the browser says the connection has gone, so the
       spec takes this page offline before it shoots. */
    render: () => <OfflineBanner />,
  },
  {
    id: 'offline-banner-back',
    solo: true,
    render: () => <OfflineBanner />,
  },
];
