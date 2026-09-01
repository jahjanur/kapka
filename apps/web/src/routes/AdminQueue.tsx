import { useEffect, useState } from 'react';
import type { ModerationQueueItem } from '@kapka/shared';
import { BREAKPOINTS } from '@kapka/tokens';
import {
  AppHeader,
  BloodTypeBadge,
  Button,
  Container,
  EmptyState,
  Icon,
  Skeleton,
  Textarea,
  UrgencyPill,
} from '../components';
import { api, ApiError, type ApprovalOutcome } from '../lib/api';
import { cx } from '../lib/cx';
import { useMediaQuery } from '../lib/useMediaQuery';
import { usePendingRequests } from '../lib/useRequests';
import { useSession } from '../lib/session';
import { timeAgo } from '../lib/relativeTime';
import { PATHS } from './paths';
import styles from './AdminQueue.module.css';

/**
 * The table arrives at lg, and not before.
 *
 * Below it the same rows are stacked cards. A table of eight columns on a
 * 360px screen is either a horizontal scroller or four characters per column,
 * and both are worse than a card — §7.1 puts 360px as the floor with no
 * sideways scroll, and the way to keep that promise is to not render a table
 * there at all rather than to wrap one in an overflow box.
 */
const TABLE = `(min-width: ${String(BREAKPOINTS.lg / 16)}rem)`;

/** Moderation queue (§9.6). */
export default function AdminQueue() {
  const { session } = useSession();
  const showTable = useMediaQuery(TABLE);

  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ id: string; result: ApprovalOutcome } | null>(
    null,
  );
  const [confirming, setConfirming] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const token = session?.accessToken;
  const isAdmin = session?.user.role === 'admin';

  const { data, isLoading, error, refetch } = usePendingRequests(
    isAdmin ? token : undefined,
  );

  /* Decided requests are filtered out here rather than refetched. The server
     has already dropped them; asking again would be a round trip to be told
     something this tab watched happen. */
  const [settled, setSettled] = useState<string[]>([]);
  const queue = data?.filter((item) => !settled.includes(item.id));

  const settle = (id: string) => {
    setSettled((current) => [...current, id]);
    setOpenId((current) => (current === id ? null : current));
    setConfirming(null);
    setRejecting(null);
    setReason('');
  };

  /* The confirmation is announced by moving focus to its heading. A panel that
     appears silently below the button is a panel a screen-reader user does not
     know is there, and this is the one control in the product that mails
     strangers. */
  useEffect(() => {
    if (!confirming) return;
    document.getElementById(`confirm-${confirming}`)?.focus();
  }, [confirming]);

  async function approve(item: ModerationQueueItem) {
    if (!token) return;
    setActionError(null);
    setBusyId(item.id);
    try {
      const result = await api.approveRequest(item.id, token);
      // Reported rather than toasted away: §9.6 wants sent, failed and
      // skipped in front of the admin, and a budget warning is the one thing
      // here nobody may miss.
      setOutcome({ id: item.id, result });
      settle(item.id);
    } catch (caught) {
      setActionError(
        caught instanceof ApiError ? caught.message : 'That did not go through.',
      );
    } finally {
      setBusyId(null);
    }
  }

  async function reject(item: ModerationQueueItem) {
    if (!token) return;
    setActionError(null);
    setBusyId(item.id);
    try {
      await api.rejectRequest(item.id, reason, token);
      settle(item.id);
    } catch (caught) {
      setActionError(
        caught instanceof ApiError ? caught.message : 'That did not go through.',
      );
    } finally {
      setBusyId(null);
    }
  }

  /* ── Not an admin ───────────────────────────────────────────────────────
     Said plainly rather than 404'd. Hiding the route from someone who is
     signed in and simply lacks the role wastes their time; the API refuses
     them regardless, which is where access control actually lives (§12).  */
  if (!isAdmin) {
    return (
      <>
        <AppHeader />
        <div className={styles.page}>
          <Container>
            <EmptyState
              icon="alertCircle"
              headline="This page is for administrators"
              body={
                session
                  ? 'Your account does not moderate requests. If that is wrong, ask another admin to change it.'
                  : 'Sign in with an administrator account to work through the queue.'
              }
              action={<Button to={PATHS.feed}>Back to requests</Button>}
            />
          </Container>
        </div>
      </>
    );
  }

  const open = queue?.find((item) => item.id === openId) ?? null;

  /** The reach, worded so the number is never a bare digit. */
  const reach = (n: number) =>
    n === 0 ? 'nobody yet' : `${String(n)} ${n === 1 ? 'donor' : 'donors'}`;

  const detail = (item: ModerationQueueItem) => (
    <>
      <div className={styles.detailTop}>
        <BloodTypeBadge type={item.bloodType} size="lg" />
        <UrgencyPill urgency={item.urgency} />
      </div>
      <h3 className={styles.detailTitle}>{item.hospitalName}</h3>
      <p className={styles.detailMeta}>
        {item.city} · {item.unitsNeeded}
        {item.unitsNeeded === 1 ? ' unit' : ' units'} · posted {timeAgo(item.createdAt)}
      </p>

      <dl className={styles.facts}>
        <div>
          <dt>Posted by</dt>
          <dd>{item.requesterName}</dd>
        </div>
        <div>
          <dt>Contact</dt>
          <dd>{item.contactPhone}</dd>
        </div>
        <div>
          <dt>Will email</dt>
          <dd>{reach(item.matchedDonors)}</dd>
        </div>
      </dl>

      {item.note && <p className={styles.note}>{item.note}</p>}

      {/* The number sits with the button, not three rows above it. Approving
          is irreversible and mails strangers (§9.6). */}
      <p className={styles.reach}>
        <Icon name="alertCircle" />
        Approving emails {reach(item.matchedDonors)} immediately. It cannot be undone.
      </p>

      {actionError && (
        <p className={styles.actionError} role="alert">
          {actionError}
        </p>
      )}

      {rejecting === item.id ? (
        <div className={styles.rejectBox}>
          <label className={styles.reasonLabel} htmlFor={`reason-${item.id}`}>
            Why is this being rejected? The requester sees this.
          </label>
          <Textarea
            id={`reason-${item.id}`}
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <div className={styles.actions}>
            <Button
              variant="danger"
              onClick={() => void reject(item)}
              loading={busyId === item.id}
              loadingLabel="Rejecting…"
            >
              Confirm rejection
            </Button>
            <Button variant="ghost" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : confirming === item.id ? (
        /*
         * The gate. Approving used to be one click that mailed strangers and
         * could not be taken back — the count was on the screen, but nothing
         * made anyone read it. Now the number is the last thing between the
         * decision and the send, and it is in the button's own label: whatever
         * else gets skimmed, the control being clicked says what it does.
         */
        <div
          className={styles.confirmBox}
          role="group"
          aria-labelledby={`confirm-${item.id}`}
        >
          <h4 id={`confirm-${item.id}`} className={styles.confirmHeadline} tabIndex={-1}>
            {item.matchedDonors === 0
              ? 'Approve without emailing anyone?'
              : `Email ${reach(item.matchedDonors)} now?`}
          </h4>
          <p className={styles.confirmBody}>
            {item.matchedDonors === 0 ? (
              <>
                Nobody matches this request yet. Approving publishes it to the feed and
                emails no one — donors who register later are not sent past requests.
              </>
            ) : (
              <>
                {reach(item.matchedDonors)} in {item.city} will be emailed about{' '}
                <strong>{item.hospitalName}</strong> straight away. This cannot be undone,
                and it cannot be sent again.
              </>
            )}
          </p>
          <div className={styles.actions}>
            <Button
              onClick={() => void approve(item)}
              loading={busyId === item.id}
              loadingLabel="Approving and emailing…"
            >
              {item.matchedDonors === 0
                ? 'Approve without emailing'
                : `Yes, email ${reach(item.matchedDonors)}`}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.actions}>
          <Button onClick={() => setConfirming(item.id)}>Approve and notify</Button>
          <Button variant="secondary" onClick={() => setRejecting(item.id)}>
            Reject
          </Button>
        </div>
      )}
    </>
  );

  return (
    <>
      <AppHeader />
      <div className={styles.page}>
        <Container>
          <div className={styles.head}>
            <h1 className={styles.title}>Moderation queue</h1>
            <p className={styles.lead}>
              Nothing here has reached a donor yet. Approving one emails every matching
              donor in its city at once.
            </p>
          </div>

          {outcome && (
            <div className={styles.outcome} role="status">
              <Icon name="checkCircle" />
              <div>
                <p className={styles.outcomeHeadline}>
                  Approved — {String(outcome.result.sent)} of{' '}
                  {String(outcome.result.matchedDonors)} emailed
                </p>
                {outcome.result.failed > 0 && (
                  <p className={styles.outcomeBody}>
                    {String(outcome.result.failed)} failed to send and stay recorded for a
                    retry.
                  </p>
                )}
                {outcome.result.warning && (
                  <p className={styles.outcomeWarning}>{outcome.result.warning}</p>
                )}
              </div>
            </div>
          )}

          {error && (
            <EmptyState
              icon="alertTriangle"
              headline="We couldn’t load the queue"
              body="The connection dropped on the way. Nothing is lost — try again."
              action={<Button onClick={refetch}>Try again</Button>}
            />
          )}

          {!error && isLoading && (
            <div className={styles.skeletons}>
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} width="100%" height="6rem" />
              ))}
            </div>
          )}

          {!error && queue?.length === 0 && (
            <EmptyState
              icon="checkCircle"
              headline="Nothing is waiting"
              body="Every request has been decided. New ones appear here as they are posted."
            />
          )}

          {!error && queue && queue.length > 0 && (
            <div className={styles.layout}>
              {showTable ? (
                <table className={styles.table}>
                  <caption className="visually-hidden">
                    Requests waiting for a decision, oldest first
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Type</th>
                      <th scope="col">Hospital</th>
                      <th scope="col">City</th>
                      <th scope="col">Urgency</th>
                      <th scope="col">Units</th>
                      <th scope="col">Will email</th>
                      <th scope="col">Waiting</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queue.map((item) => (
                      <tr
                        key={item.id}
                        className={cx(styles.row, openId === item.id && styles.rowOpen)}
                      >
                        <td>
                          <BloodTypeBadge type={item.bloodType} />
                        </td>
                        <th scope="row" className={styles.rowHospital}>
                          {/* The whole row is not a link: a table row that
                              navigates is unreachable by keyboard. One real
                              button, in the cell that names the request. */}
                          <button
                            type="button"
                            className={styles.rowButton}
                            aria-expanded={openId === item.id}
                            onClick={() => setOpenId(openId === item.id ? null : item.id)}
                          >
                            {item.hospitalName}
                          </button>
                        </th>
                        <td>{item.city}</td>
                        <td>
                          <UrgencyPill urgency={item.urgency} />
                        </td>
                        <td data-numeric>{item.unitsNeeded}</td>
                        <td data-numeric>{item.matchedDonors}</td>
                        <td className={styles.age}>{timeAgo(item.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                /* Cards, not a table squeezed sideways. Everything a decision
                   needs is on the card, so there is no drawer to open. */
                <ul className={styles.cards}>
                  {queue.map((item) => (
                    <li key={item.id} className={styles.card}>
                      {detail(item)}
                    </li>
                  ))}
                </ul>
              )}

              {showTable && (
                <aside
                  className={cx(styles.drawer, open && styles.drawerOpen)}
                  aria-label="Request detail"
                >
                  {open ? (
                    detail(open)
                  ) : (
                    <p className={styles.drawerEmpty}>
                      Choose a hospital to see the request and decide on it.
                    </p>
                  )}
                </aside>
              )}
            </div>
          )}
        </Container>
      </div>
    </>
  );
}
