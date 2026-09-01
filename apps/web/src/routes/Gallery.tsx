import { useState, type ReactNode } from 'react';
import type { PublicBloodRequest } from '@kapka/shared';
import {
  BloodTypeBadge,
  BloodTypeLabel,
  Button,
  Card,
  Cluster,
  Field,
  Grid,
  Icon,
  ICON_NAMES,
  EmptyState,
  FilterBar,
  FilterChip,
  FilterGroupLabel,
  Input,
  RequestCard,
  Select,
  Skeleton,
  ThemeToggle,
  UrgencyPill,
  Stack,
  Textarea,
  WithSidebar,
} from '../components';
import { BLOOD_TYPES } from '@kapka/shared';
import { cx } from '../lib/cx';
import styles from './KitchenSink.module.css';

/* ── Small local helpers, only used by this page ───────────────────────── */

function Section({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className={styles.section} aria-labelledby={`${id}-heading`}>
      <div className={styles.sectionHead}>
        <h2 id={`${id}-heading`}>{title}</h2>
        {note && <p className={styles.note}>{note}</p>}
      </div>
      {children}
    </section>
  );
}

function Specimen({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Cluster gap={4} align="center">
      <span className={styles.specimenLabel}>{label}</span>
      <Cluster gap={3}>{children}</Cluster>
    </Cluster>
  );
}

function Swatch({ token }: { token: string }) {
  return (
    <div className={styles.swatch}>
      <div className={styles.swatchChip} style={{ backgroundColor: `var(${token})` }} />
      <code className={styles.swatchName}>{token}</code>
    </div>
  );
}

const SEMANTIC_TOKENS = [
  '--bg-canvas',
  '--bg-surface',
  '--bg-surface-alt',
  '--bg-inset',
  '--fg-primary',
  '--fg-secondary',
  '--fg-muted',
  '--border-subtle',
  '--border-default',
  '--border-strong',
  '--accent',
  '--accent-hover',
  '--accent-active',
  '--accent-surface',
  '--accent-border',
];

const STATUS_TOKENS = [
  '--success',
  '--success-surface',
  '--warning',
  '--warning-surface',
  '--danger',
  '--danger-surface',
  '--info',
  '--info-surface',
];

const TYPE_STEPS = [
  ['--text-4xl', 'Blood needed now'],
  ['--text-3xl', 'Blood needed now'],
  ['--text-2xl', 'Blood needed now'],
  ['--text-xl', 'Blood needed now'],
  ['--text-lg', 'Every donor within reach'],
  ['--text-base', 'Every donor within reach, notified in seconds.'],
  ['--text-sm', 'Every donor within reach, notified in seconds.'],
  ['--text-xs', 'Every donor within reach, notified in seconds.'],
] as const;

const SPACE_STEPS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24] as const;
const RADII = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'] as const;
const ELEVATIONS = [1, 2, 3, 4] as const;
const BUTTON_VARIANTS = ['primary', 'secondary', 'ghost', 'danger'] as const;
const BUTTON_SIZES = ['sm', 'md', 'lg'] as const;
const BADGE_SIZES = ['sm', 'md', 'lg'] as const;
const URGENCIES = ['routine', 'urgent', 'critical'] as const;

/** One request, so the composites have something real to render. */
const DEMO_REQUEST: PublicBloodRequest = {
  id: 'demo',
  bloodType: 'O-',
  unitsNeeded: 3,
  urgency: 'critical',
  hospitalName: 'City General Hospital 8th September',
  city: 'Skopje',
  note: 'Road traffic accident, theatre is prepped and waiting on units.',
  status: 'approved',
  createdAt: new Date(Date.now() - 12 * 60_000).toISOString(),
  expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
};

/* ── The gallery ───────────────────────────────────────────────────────── */

export function Gallery({ frameMode = false }: { frameMode?: boolean }) {
  const [showPassword, setShowPassword] = useState(false);
  const [chip, setChip] = useState<string | null>('O-');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const NOTE_LIMIT = 500; // matches the CHECK constraint on blood_requests.note

  return (
    <Stack gap={16} className={cx(frameMode && styles.frameMode)}>
      <Section
        id="colour"
        title="Colour"
        note="Semantic tokens only. Components never reference a raw --crimson-500 or --slate-700; they reference the role. Flip the theme in the header — every swatch below is derived, not duplicated."
      >
        <Stack gap={6}>
          <div>
            <h3>Semantic</h3>
            <div
              className={styles.swatchGrid}
              style={{ marginBlockStart: 'var(--space-4)' }}
            >
              {SEMANTIC_TOKENS.map((token) => (
                <Swatch key={token} token={token} />
              ))}
            </div>
          </div>
          <div>
            <h3>Status</h3>
            <div
              className={styles.swatchGrid}
              style={{ marginBlockStart: 'var(--space-4)' }}
            >
              {STATUS_TOKENS.map((token) => (
                <Swatch key={token} token={token} />
              ))}
            </div>
          </div>
        </Stack>
      </Section>

      <Section
        id="blood-type"
        title="Blood type badge"
        note="Hue carries the ABO group, fill vs outline carries the Rh sign, and the literal text is always visible. A screen reader hears “O negative”, never “O minus”. The glyph is U+2212, not a hyphen."
      >
        <Stack gap={5}>
          {BADGE_SIZES.map((size) => (
            <Specimen key={size} label={size}>
              {BLOOD_TYPES.map((type) => (
                <BloodTypeBadge key={type} type={type} size={size} />
              ))}
            </Specimen>
          ))}
        </Stack>
      </Section>

      <Section
        id="type"
        title="Typography"
        note="Fluid scale, interpolating between 360px and 1440px. Resize the window and every step moves together. Negative tracking is applied at --text-2xl and above only; body text never gets it."
      >
        <div>
          {TYPE_STEPS.map(([token, sample]) => {
            const big = ['--text-4xl', '--text-3xl', '--text-2xl'].includes(token);
            return (
              <div key={token} className={styles.typeRow}>
                <code className={styles.swatchName}>{token}</code>
                <div
                  className={cx(styles.typeSample, big && styles.typeBig)}
                  style={{ fontSize: `var(${token})` }}
                >
                  {sample}
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section
        id="space"
        title="Spacing"
        note="4px base, named by step so the whole scale can be retuned in one place."
      >
        <Stack gap={2}>
          {SPACE_STEPS.map((step) => (
            <div key={step} className={styles.spaceRow}>
              <code className={styles.specimenLabel}>--space-{step}</code>
              <div
                className={styles.spaceBar}
                style={{ inlineSize: `var(--space-${step})` }}
              />
            </div>
          ))}
        </Stack>
      </Section>

      <Section
        id="surface"
        title="Radius and elevation"
        note="Nesting convention: inner radius = outer radius − padding. In dark mode the elevation tokens resolve to a hairline border instead of a shadow — switch themes and watch the tiles keep their separation."
      >
        <Stack gap={6}>
          <div>
            <h3>Radius</h3>
            <div
              className={styles.tileGrid}
              style={{ marginBlockStart: 'var(--space-4)' }}
            >
              {RADII.map((radius) => (
                <div
                  key={radius}
                  className={styles.tile}
                  style={{
                    borderRadius: `var(--radius-${radius})`,
                    borderColor: 'var(--border-default)',
                  }}
                >
                  {radius}
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3>Elevation</h3>
            <div
              className={styles.tileGrid}
              style={{ marginBlockStart: 'var(--space-4)' }}
            >
              {ELEVATIONS.map((level) => (
                <div
                  key={level}
                  className={styles.tile}
                  style={{
                    borderRadius: 'var(--radius-lg)',
                    boxShadow: `var(--elevation-${level})`,
                  }}
                >
                  level {level}
                </div>
              ))}
            </div>
          </div>
        </Stack>
      </Section>

      <Section
        id="button"
        title="Button"
        note="Hover, focus-visible and press are interactive — reach for them with a mouse and with Tab. Hover styling is scoped to (hover: hover) so a phone never gets a stuck hover state, and the press is a 0.97 scale over 80ms."
      >
        <Stack gap={6}>
          {BUTTON_SIZES.map((size) => (
            <Specimen key={size} label={size}>
              {BUTTON_VARIANTS.map((variant) => (
                <Button key={variant} variant={variant} size={size}>
                  Post request
                </Button>
              ))}
            </Specimen>
          ))}

          <Specimen label="disabled">
            {BUTTON_VARIANTS.map((variant) => (
              <Button key={variant} variant={variant} disabled>
                Post request
              </Button>
            ))}
          </Specimen>

          <Specimen label="loading">
            {BUTTON_VARIANTS.map((variant) => (
              <Button key={variant} variant={variant} loading>
                Post request
              </Button>
            ))}
          </Specimen>

          <Specimen label="with icon">
            <Button>
              <Icon name="droplet" />
              Donate
            </Button>
            <Button variant="secondary">
              Directions
              <Icon name="arrowRight" />
            </Button>
            <Button variant="ghost">
              <Icon name="filter" />
              Filters
            </Button>
          </Specimen>

          <div>
            <p className={styles.note}>
              The loading state keeps the button’s width, so nothing around it shifts
              mid-action. Press this one:
            </p>
            <div style={{ marginBlockStart: 'var(--space-3)', maxInlineSize: '22rem' }}>
              <Button
                fullWidth
                size="lg"
                loading={submitting}
                onClick={() => {
                  setSubmitting(true);
                  window.setTimeout(() => setSubmitting(false), 1600);
                }}
              >
                Post request
              </Button>
            </div>
          </div>
        </Stack>
      </Section>

      <Section
        id="form"
        title="Form controls"
        note="Every control goes through Field, which owns the label, the help text, the error text and the ARIA that links them. There is no label prop on Input by design — a placeholder can never stand in for a label."
      >
        <Grid minColumn="20rem" gap={6}>
          <Stack gap={5}>
            <Field label="Full name" required>
              <Input type="text" autoComplete="name" placeholder="Ana Petrovska" />
            </Field>

            <Field
              label="Email"
              required
              help="We only email you when a matching request is approved."
            >
              <Input type="email" autoComplete="email" placeholder="ana@example.com" />
            </Field>

            <Field
              label="Phone"
              optional
              help="Shown to no one. Used only if you respond to a request."
            >
              <Input
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                placeholder="+389 7X XXX XXX"
              />
            </Field>

            <Field
              label="Password"
              required
              error="Password must be at least 10 characters."
            >
              <Cluster gap={2} align="stretch" style={{ flexWrap: 'nowrap' }}>
                <Input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                />
                <Button
                  variant="secondary"
                  onClick={() => setShowPassword((shown) => !shown)}
                  aria-pressed={showPassword}
                >
                  <Icon name={showPassword ? 'eyeOff' : 'eye'} />
                  <span className="visually-hidden">
                    {showPassword ? 'Hide password' : 'Show password'}
                  </span>
                </Button>
              </Cluster>
            </Field>
          </Stack>

          <Stack gap={5}>
            <Field label="Blood type" required>
              <Select placeholder="Select a blood type" defaultValue="">
                {BLOOD_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="City"
              required
              help="A fixed list, never free text — “bitola ” and “Битола” would silently never match."
            >
              <Select placeholder="Select a city" defaultValue="">
                {['Skopje', 'Bitola', 'Kumanovo', 'Prilep', 'Tetovo', 'Ohrid'].map(
                  (city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ),
                )}
              </Select>
            </Field>

            <Field
              label="Last donation date"
              optional
              help="Leave empty if you have never donated."
            >
              <Input type="date" />
            </Field>

            <Field label="Note to donors" optional>
              <Textarea
                value={note}
                maxLength={NOTE_LIMIT}
                rows={4}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Anything that helps a donor decide quickly."
              />
              <p
                className={styles.note}
                style={{ marginBlockStart: 'var(--space-1)', textAlign: 'end' }}
              >
                <span data-numeric>{note.length}</span> / {NOTE_LIMIT}
              </p>
            </Field>

            <Field
              label="Disabled control"
              help="Shown for completeness — state five of five."
            >
              <Input type="text" defaultValue="Skopje" disabled />
            </Field>
          </Stack>
        </Grid>
      </Section>

      <Section
        id="card"
        title="Card"
        note="Surface, radius, elevation, and an optional interactive state. A card sets no outer margin — spacing is always the parent’s job, which is what keeps layouts composable."
      >
        <Grid minColumn="17rem" gap={4}>
          <Card>
            <Stack gap={3}>
              <Cluster gap={3} justify="between">
                <BloodTypeBadge type="O-" />
                <Cluster gap={1}>
                  <Icon name="clock" />
                  <span className={styles.note}>12 min ago</span>
                </Cluster>
              </Cluster>
              <h3>Clinical Hospital Bitola</h3>
              <Cluster gap={1}>
                <Icon name="mapPin" />
                <span className={styles.note}>Bitola · 2 units</span>
              </Cluster>
            </Stack>
          </Card>

          <Card interactive>
            <Stack gap={3}>
              <Cluster gap={3} justify="between">
                <BloodTypeBadge type="AB+" />
                <Icon name="chevronRight" />
              </Cluster>
              <h3 style={{ textAlign: 'start' }}>Interactive card</h3>
              <p className={styles.note} style={{ textAlign: 'start' }}>
                Hover and press me. Rendered as a real button, so it is keyboard reachable
                and announces as one.
              </p>
            </Stack>
          </Card>

          <Card tone="alt" padding="roomy">
            <Stack gap={2}>
              <h3>Muted surface</h3>
              <p className={styles.note}>
                For a panel nested inside another card. Never straight on the canvas.
              </p>
            </Stack>
          </Card>
        </Grid>
      </Section>

      <Section
        id="urgency"
        title="Urgency pill"
        note="Colour, a word and an icon — never colour alone. Someone who cannot separate red from amber still reads “Critical”."
      >
        <Cluster gap={3}>
          {URGENCIES.map((level) => (
            <UrgencyPill key={level} urgency={level} />
          ))}
        </Cluster>
      </Section>

      <Section
        id="blood-type-label"
        title="Blood type label"
        note="The glyph a sighted reader sees plus the words a screen reader says. Use it anywhere a type appears outside a badge — rendering the stored value announces “O hyphen”."
      >
        <Cluster gap={4}>
          {BLOOD_TYPES.map((type) => (
            <span key={type} className={styles.note}>
              <BloodTypeLabel type={type} />
            </span>
          ))}
        </Cluster>
      </Section>

      <Section
        id="request-card"
        title="Request card"
        note="Lays itself out from its OWN width, not the viewport's. All three below are the same component at the same viewport size: a 14rem rail, a 20rem feed column, and a row to itself. Watch the meta line stack, the age move, and the type grow. No breakpoint is involved."
      >
        <Stack gap={5}>
          <div style={{ maxInlineSize: '14rem' }}>
            <RequestCard request={DEMO_REQUEST} />
          </div>
          <div style={{ maxInlineSize: '20rem' }}>
            <RequestCard request={{ ...DEMO_REQUEST, id: 'demo-column' }} />
          </div>
          <RequestCard request={{ ...DEMO_REQUEST, id: 'demo-wide' }} />
        </Stack>
      </Section>

      <Section
        id="filters"
        title="Filter bar"
        note="A chip row that scrolls sideways when it must and wraps when it has room. The scroller is a containing block, or an absolutely positioned label inside it escapes the clip and stretches the page."
      >
        <FilterBar label="Filter by blood type">
          <FilterGroupLabel>Type</FilterGroupLabel>
          {BLOOD_TYPES.map((type) => (
            <FilterChip
              key={type}
              selected={chip === type}
              onClick={() => {
                setChip(chip === type ? null : type);
              }}
            >
              <BloodTypeLabel type={type} />
            </FilterChip>
          ))}
        </FilterBar>
      </Section>

      <Section
        id="skeleton"
        title="Skeleton"
        note="Shape-matched to the content it stands in for, never a centred spinner on a blank page. Only opacity animates, and it stops entirely under reduced motion."
      >
        <Stack gap={3} style={{ maxInlineSize: '24rem' }}>
          <Cluster gap={2}>
            <Skeleton width="4rem" height="2.25rem" shape="circle" />
            <Skeleton width="5.5rem" height="1.75rem" shape="circle" />
          </Cluster>
          <Skeleton width="80%" height="1.4rem" />
          <Skeleton width="60%" shape="text" />
          <Skeleton width="9rem" height="2.75rem" />
        </Stack>
      </Section>

      <Section
        id="empty-state"
        title="Empty states"
        note="Where most products look unfinished. Each one says what will appear here, or what to change, and offers exactly one action."
      >
        <Grid minColumn="18rem" gap={4}>
          <Card>
            <EmptyState
              headline="No open requests right now"
              body="That is good news. Register and we will email you the moment someone with your blood type needs help."
              action={<Button>Register as donor</Button>}
            />
          </Card>
          <Card>
            <EmptyState
              icon="filter"
              headline="No requests match these filters"
              body="Widen the search and the open requests will reappear."
              action={<Button variant="secondary">Clear filters</Button>}
            />
          </Card>
          <Card>
            <EmptyState
              icon="alertTriangle"
              headline="We couldn’t load the requests"
              body="The connection dropped on the way. Nothing is lost — try again."
              action={<Button>Try again</Button>}
            />
          </Card>
        </Grid>
      </Section>

      <Section
        id="theme-toggle"
        title="Theme toggle"
        note="Three states: match the system, or pin light or dark. Each target is 44×44."
      >
        <ThemeToggle />
      </Section>

      <Section
        id="icon"
        title="Icons"
        note="One inline SVG sprite on currentColor, sized in em so a glyph always matches the text beside it. No icon font and no icon library in the bundle."
      >
        <div className={styles.iconGrid}>
          {ICON_NAMES.map((name) => (
            <div key={name} className={styles.iconCell}>
              <Icon name={name} className={styles.iconGlyph} />
              <code>{name}</code>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="layout"
        title="Layout primitives"
        note="These reflow with no media query at all. Narrow the window — or read them in the 360px frame at the top of this page — and watch each one reorganise on its own."
      >
        <Stack gap={8}>
          <div>
            <h3>Grid — auto-fitting columns</h3>
            <Grid
              minColumn="12rem"
              gap={3}
              style={{ marginBlockStart: 'var(--space-4)' }}
            >
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className={styles.demoBlock}>
                  item {index + 1}
                </div>
              ))}
            </Grid>
          </div>

          <div>
            <h3>WithSidebar — collapses on its own</h3>
            <div style={{ marginBlockStart: 'var(--space-4)' }}>
              <WithSidebar
                sidebarWidth="12rem"
                mainMin="20rem"
                sidebar={<div className={styles.demoBlock}>sidebar</div>}
              >
                <div className={styles.demoBlock} style={{ minBlockSize: '6rem' }}>
                  main content
                </div>
              </WithSidebar>
            </div>
          </div>

          <div>
            <h3>Cluster — wrapping row</h3>
            <Cluster gap={2} style={{ marginBlockStart: 'var(--space-4)' }}>
              {[
                'All',
                'O−',
                'O+',
                'A−',
                'A+',
                'B−',
                'B+',
                'AB−',
                'AB+',
                'Critical',
                'Urgent',
              ].map((chip) => (
                <span key={chip} className={styles.demoBlock}>
                  {chip}
                </span>
              ))}
            </Cluster>
          </div>

          <div>
            <h3>Stack — vertical rhythm</h3>
            <Stack gap={3} style={{ marginBlockStart: 'var(--space-4)' }}>
              <div className={styles.demoBlock}>first</div>
              <div className={styles.demoBlock}>second</div>
              <div className={styles.demoBlock}>third</div>
            </Stack>
          </div>
        </Stack>
      </Section>
    </Stack>
  );
}
