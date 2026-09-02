# Moderating the queue

For whoever works the request queue day to day. Everything here is one screen
and two buttons; the care is in what you check before pressing one.

## Getting in

Sign in normally, then go to **`/admin`** — `https://kapka.mk/admin`. There is
no link to it in the navigation, on purpose: it is one screen for a handful of
people, and a nav item everyone else sees only to be refused is noise.

If the page says "This page is for administrators", your account does not have
the role. There is no screen for granting it — somebody with database access
has to set `users.role = 'admin'` for you. The role is read from the database
on every request, not from your login, so a change takes effect on your next
click; you do not need to sign in again.

## What the queue is

Requests waiting on a decision, **oldest first** — the opposite of the public
feed, because the one that has been waiting longest is the one somebody is
still waiting on an answer for.

- **Pending only.** Approved, rejected and expired requests are not here, and
  there is no way to look at a decided one from this screen.
- **Expired ones are already gone.** A request lives seven days from posting.
  Past that it drops out of the queue, whether or not anyone looked at it.
- **Fifty at a time.** If the queue is ever full, that is worth telling
  somebody about — three requests an hour from one connection is the posting
  limit, so
  fifty pending means either a real surge or somebody organised.
- **The requester's phone number is on it.** This screen is the only place in
  the product that shows it before approval. Treat it accordingly.

On a phone each request is a card with everything on it. On a wide screen it is
a table — click the hospital name to open the detail panel on the right.

## Before approving

Approving is the whole product: it publishes the request to the public feed and
**emails every matching donor in that city, immediately**. It cannot be undone
and it cannot be sent a second time. So the check is worth a minute:

- **Is the hospital real, and in that city?** The pairing is the easiest thing
  for a hoax to get wrong.
- **Does the phone number look like a real Macedonian number** somebody will
  answer? Donors are told to call it. If in doubt, call it yourself first.
- **Do the blood type and units make sense** for what the note describes?
- **Does the note contain anything that should not be public?** A patient's
  name, a diagnosis, an ID number. The note is shown to everyone on the feed.
  There is no way to edit it — if it has to go, reject and ask them to repost.

**"Will email"** on each row is how many donors that request would reach right
now: compatible blood type, same city, available, verified email, and not in
the 56-day window since their last donation. It is computed live, so it can be
different by the time you press the button.

Approving asks you to confirm, with that number in the button's own label. Read
it. It is the last thing between the decision and a few dozen strangers' inboxes.

**Zero is not an error.** It means nobody registered matches this request yet.
Approving still publishes it to the feed, but donors who register later are not
sent past requests — so a request approved at zero reaches people only if they
find it themselves.

## After approving

You get a line saying how many of the matched donors were actually emailed.
Read it rather than dismissing it; the two numbers differ for real reasons.

| What you see                  | What it means                       | What to do                                                           |
| ----------------------------- | ----------------------------------- | -------------------------------------------------------------------- |
| `Approved — 12 of 12 emailed` | Everything went.                    | Nothing.                                                             |
| `n failed to send`            | The email provider refused those.   | Tell the requester their reach was smaller than the screen promised. |
| An orange budget warning      | The day's email allowance is spent. | Read the next section. It needs a human.                             |

**The daily budget is 100 emails, across the whole platform, and it resets at
midnight server time (UTC).** One approval sends at most 50. When a request needs more than
is left, the donors beyond the limit get a row saying `queued` and no email.

The warning says they are "queued for tomorrow". **Nothing sends them
tomorrow** — there is no retry job yet. A queued or failed donor is a donor who
was not contacted and will not be, and approving again is not possible. If that
warning appears on an urgent request, the reach has to be made up off-platform:
call the requester, tell them how many were reached, and let them work the
phones. This is the failure mode most worth catching, which is why it is orange
and why it is also written to the server log.

## Rejecting

The reason is required, at least a few words, and it is stored against the
request.

**The requester will not see it.** There is no screen where they can look at
their own requests, and no rejection email. So if a request is rejected for
something fixable — a wrong phone number, a note that needs rewriting — the
reason in the box is a record for us, and **the phone call is the actual
notification**. The number is on the queue card in front of you.

Write the reason for the next moderator, not for the void: "hospital not in
Bitola, no answer on the number" is useful in a way that "spam" is not.

## When something refuses

| Message                                       | Why                                                         | What to do                                                        |
| --------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------- |
| "That request was already approved/rejected." | Another moderator got there first.                          | Nothing. Refresh; it is gone from the queue.                      |
| "That request has expired."                   | Its seven days ran out while it sat there.                  | Nothing to approve. If it is still needed, the requester reposts. |
| "That request does not exist."                | Deleted, or a stale tab.                                    | Refresh.                                                          |
| "You do not have access to that."             | The role was removed, or you are signed in as someone else. | Sign in again; if it persists, the role is gone.                  |

Two people working the queue at once is safe — the second approve loses
cleanly, and nobody gets emailed twice.

## What you cannot do yet

Worth knowing before somebody asks you to:

- **Undo an approval**, or re-send its emails.
- **Mark a request fulfilled.** The status exists in the database but nothing
  in the product sets it. A satisfied request sits on the feed until its seven
  days run out.
- **Edit a request.** Reject and ask for a repost.
- **See what was decided earlier.** Every decision writes an audit row, but
  reading it takes database access.
