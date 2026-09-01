# Usability sessions: register, and post a request

**Status: not run.** Three sessions need three people, and there are none to
sit with here. This is the protocol ready to run, plus the places to watch
hardest — worked out by walking both flows in the code, which is a way of
generating things to look for and not a way of finding out what people do.

Nothing in the product has been changed on the strength of it. The whole
premise of watching three people is that you do not yet know what is
confusing, and guessing at fixes first is how a session gets spent confirming
someone's opinion.

## Setup

```sh
npm run dev --workspace @kapka/web -- --host
```

Give them the `Network:` URL Vite prints. Their phone has to be on the same
wifi — this does not work over cellular.

No API needed. Without `VITE_API_URL` the app runs on its seed data, and both
flows work all the way through: registration answers, and posting a request
returns a real "waiting for review" screen. That is the right trade here. A
database on the LAN adds ways for the session to break for reasons that have
nothing to do with the participant, and neither task depends on an email
actually arriving.

One thing the seed build cannot show: the confirmation email. When a
participant says they would go and check their inbox, that is the end of that
thread — note it and move on.

## Who to sit with

Three people, and none of them should be us.

- Nobody who has seen the app, read the plan, or heard it described.
- People who could plausibly be either user: someone who might give blood, and
  at least one who could imagine ringing round for a relative. That second
  person is the one the request flow is for and the one most likely to be
  missing from a convenience sample.
- At least one who is not fluent with phones. The two-minute claim is a claim
  about them, not about us.
- Their own phone, their own browser, their own font size. Handing someone a
  test device removes the thing being measured.

## The two tasks

Read them as situations. Do not name a screen, a button, or a step — the
moment the task says "register", the finding about whether they can find
registration is gone.

> **1.** You heard that a site matches blood donors to hospitals near them.
> You would be willing to give blood. Show me what you would do.

> **2.** Someone in your family is in hospital and the doctors have asked the
> family to find donors. Use this site to ask for help.

Give task 2 to at least one person **first**. Doing it second, after
registering, teaches them the interface and hides everything about how a
first-time requester finds their way.

## Running it

Sit beside them, slightly behind. The phone is theirs; do not touch it.

- **Say nothing.** When they get stuck, count to ten before speaking. Most
  recoveries happen at about six seconds, and every one of those is a finding
  you would have destroyed by helping at three.
- When you must speak, ask, never point: "What are you looking at?", "What
  were you expecting there?", "What would you do if I were not here?"
- If they ask "is this right?", say "what do you think?" — and note that they
  asked, because needing reassurance is itself the finding.
- Let them fail. A task abandoned is the most useful result there is, and the
  only one that cannot be recovered afterwards.

Record the screen if they agree to it, and take notes either way. Ask before
recording; say what it is for and that it stays internal.

## What to write down

A hesitation is anything that is not a smooth move to the next thing:

- A pause over three seconds with no touch.
- Reading the same line twice.
- A tap that does nothing, or a tap on something that is not a control.
- Scrolling up and back down looking for something.
- Any question out loud, and any "hmm", "wait", "I suppose".
- A wrong turn, and — more importantly — how they got out of it.
- **Their words.** If three people all say "post a request" but the screen says
  something else, that is the copy, decided.

Note where it happened and what they did next. Do not write down what you think
caused it; that belongs in the analysis, after all three.

## Where to watch hardest

Predictions from reading the code, listed so the note-taking is sharper. Any of
them may be wrong, and a session that refutes one is worth as much as a session
that confirms it.

1. **The feed is a donor pitch.** The hero reads "Register once with your blood
   type and city", the primary button is "Register as donor", and "Post a
   request" sits beside it as a ghost button. The requester in task 2 has to
   read past a page addressed to somebody else. Watch whether they see the
   second button at all.

2. **The sticky button that follows you down the feed says "Register as
   donor".** For the task-2 participant it is the wrong action, in the thumb
   zone, all the way down the page. Watch whether anyone taps it by mistake.

3. **On a phone the header has no nav.** Below 768px `Requests`, `Post a
request` and `How it works` are all `display: none`, with no menu in their
   place — only the brand and a Register button. If somebody leaves the feed
   and then wants to post, watch how they get back.

4. **Posting requires an account, and the only account is a donor account.**
   The task-2 participant is asked to create an account, and the account asks
   for _their_ blood type and _their_ city, and enrols them in the donor pool.
   Watch what they say when a form about giving blood appears in the middle of
   asking for blood. This is the one I would most expect to hear about.

5. **Registration is two steps on a phone.** Watch whether "Continue" reads as
   "next step" or as "submit", and whether anyone is surprised there is more
   after it.

6. **"Confirm your email" is the end of registration**, and its only action is
   "See open requests". A task-2 participant who registered in order to post
   has lost the thread there. Watch whether they find their way back.

7. **The blood type on the request form is the patient's, not the donor's.**
   The field says so — "Blood type the patient needs", "The type the patient
   receives, not the donor's". Watch whether that is enough, because getting it
   backwards is the failure that would send the wrong donors to a hospital.

8. **The map pin is optional and may not read as optional.** Watch whether
   anyone stalls trying to place it exactly.

## Two things a session will not tell you, because they are already true

Neither needs a participant, and both will shape what the sessions can even
cover.

**There is no way to sign in.** Registration is the only way to get an account,
and there is no sign-in screen. A participant who comes back on another day, or
who registered before, is locked out — and what they meet is "That email
already has an account" on a field, with nothing offering a way forward. Inside
a single sitting the sessions will not hit this. Everyone after them will.

**Posting a request makes you a donor.** There is one account type. Someone who
only wants to ask for blood must declare a blood type and a city, and once they
confirm their email they are in the pool and will be emailed about other
people's requests. That is a product decision worth making deliberately rather
than by omission, and prediction 4 is where the sessions will surface it.

## After all three

Three people is enough to find the big things and not enough to measure
anything. So:

- Two or more hit the same thing → a pattern. Fix it.
- One person hit it → write it down, do not act yet. It may be the person.
- Nobody hesitated where you were sure they would → that prediction was wrong.
  Say so; it is the cheapest lesson in the set.

Rank by what it cost them, not by how easy it is to change: abandoned the task,
then needed help, then recovered alone, then noticed and moved on.

## Record

One sheet per participant.

|                                    | P1  | P2  | P3  |
| ---------------------------------- | --- | --- | --- |
| Phone / browser                    |     |     |     |
| Task order                         |     |     |     |
| Task 1 completed unaided?          |     |     |     |
| Task 2 completed unaided?          |     |     |     |
| Time to first tap, task 2          |     |     |     |
| Hesitations (where, what they did) |     |     |     |
| Their words for "post a request"   |     |     |     |
| Needed help — where                |     |     |     |
| Abandoned — where                  |     |     |     |
