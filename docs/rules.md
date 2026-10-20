# Quarti — shift and offer rules (prototype v34: manager + worker + owner)

**Name:** Quarti (chosen Oct 2026, from *quart*, the Québec word for a shift). It replaces the working name ShiftLink, which a health-care staffing app already uses. Before launch: trademark clearance in Canada (CIPO) and the US (USPTO), a domain (quarti.com is listed for sale; quarti.app is taken), and the App Store name.

Agreed before building the worker app (Oct 2026). The worker app must follow these too.

## Shifts
- Every shift is its own record. Periods only organize the schedule. A shift belongs to the period it overlaps most.
- A shift whose end is at or before its start runs past midnight. It is dated by the day it starts. A shift still running after midnight also appears, read-only, at the start of the next day's timeline.
- Lifecycle: draft (assigned, not sent) → pending (sent, waiting) → accepted. If the worker declines, the slot opens again.
- **Nothing is booked in the past.** Today, extra slots, offers and claims start no earlier than now, rounded up to the next 15 minutes. Times that have already ended are refused. An offer whose start time passes before anyone accepts is withdrawn.
- **An accepted offer shorter than its slot** leaves the rest of the original slot open as its own slot.
- **Started shifts are protected.** Automatic changes never touch a shift that has started: setting someone inactive, removing a worker, approving leave, deleting or moving a position, editing periods, stopping a series, clearing a day. Renaming a position does rename a shift under way, since it's the same job.
- **One way to take a shift away.** If the worker was told (pending or accepted), a cancelled copy stays in their history with the reason, and they are notified. A draft was never sent, so it just disappears.
- **Shifts opened up automatically** (by leave, removal, setting someone inactive, a series ending, or a claim taken off) appear in Actions under Needs you.
- **Extra slots:** "Add extra" can be tapped several times. Each tap adds one more slot to place on the timeline.
- **Attendance.** Once a shift has started, the manager can:
  - record the hours actually worked (came late, left early, started early, stayed late);
  - mark a no-show;
  - remove the shift from the record, with a reason.

  Each of these takes an optional free-text note, which the worker sees with the change. For a no-show or an early leave, "Find someone for the rest" opens a replacement slot. A shift has at most one open replacement slot, and undoing the no-show removes it if it's still unfilled. Pay and hours use the worked time, and the schedule is kept. An end time can only be recorded once it has happened. A no-show doesn't count as staffed. The worker is notified.
- Shift notes belong to the shift's id.

## Offers and claims
- An offer can go to several workers for any open slot, today or later. Each worker keeps the exact time and rate they were sent.
- **One offer can fill several identical open slots** (same day, position and times), for example 2 cashier spots 17:00–23:00. The first N workers to accept each get a spot; the offer stays open until every spot is filled, then everyone else is told it's taken.
  - The manager picks how many spots the offer covers.
  - A new identical slot can join an offer already out.
  - A slot filled another way (assigned, claimed, removed) just leaves the offer, and the offer goes on for the other spots.
- Accepting checks again that the worker is free: no clash (including across midnight), no approved leave (an overnight shift counts for both days), still active and on the roster, and has the must-have skills when covering. Offers to anyone who stops being free are withdrawn automatically, and that worker is told.
- Whenever an offer disappears (the slot is removed, the day is cleared or copied over, the last spot is filled another way, or the offer is cancelled), every worker still waiting on it is told.
- Shop setting **Open shifts**:
  - "I assign every shift" (default);
  - or "Workers can claim open shifts".
  - Option: staff from other positions can claim too.
  - Option **"I approve each claim"** (on by default). How claims work with it on:
    - A claim is a request. Several workers can ask for the same slot, and each sees how many others asked (no names).
    - The manager sees one Actions item per slot ("3 want the cook shift…", first asked first, with a "Give to X" button per person) and the list on the slot itself, with Approve or Decline for each.
    - Approving gives the shift to that worker (confirmed, no separate keep-or-undo notice). Everyone else who asked is told it went to someone else.
    - A request ends automatically, and the worker is told, if:
      - the slot is filled another way or removed;
      - the worker stops being free;
      - claiming is turned off.
    - The worker can withdraw a request.
    - With approval off, the first to claim gets the shift straight away, as before.
- **Covering.** A worker can take a shift outside their positions only if they have that position's must-have skills. It is marked as covering. If it came from a claim, the manager gets Keep / Take off shift. If must-have skills are tightened later, covers already booked stay, flagged "missing must-have".

## Skills
- Each position has **must-have** and **nice-to-have** skills.
- Must-have skills:
  - decide who can cover the position from another position (assign, offer or claim);
  - are checked on applicants. A missing one is flagged, but the manager can still hire.
- Nice-to-have skills are only shown, on hiring posts and applicant cards.
- Workers who already hold a position keep it whatever its skills are.

## Recurring
- One request for the whole series. The worker accepts or declines all of it. This includes a series moved by a position change.
- "Until stopped" is booked 6 weeks ahead, then week by week, including on days that were set up before the series existed.
- A day where the manager removed the booking, or cleared the whole day, is not booked again.
- **If the series' period is deleted,** the series ends: shifts already booked stay, the worker is told, and Actions offers "Set up again". If the period is renamed, the series follows the new name.
- If the worker is set inactive with "Keep them", the series pauses. It stays paused after reactivation until the manager taps Resume.

## Leave
- **Leave planner** (replaces the Vacation requests list). It has three parts:
  - A two-week grid of staff by position, showing approved leave (solid), asked leave (hatched) and blackout days.
  - A **Left** row under each position: how many people are still free that day if every request is approved. Red means short. Tapping a number shows who is off, who asked, who is free, and how the need was worked out.
  - Request cards in the order people asked (first asked, first in line).
- **People needed per position per day** comes from that day's shifts:
  - It is the larger of the most shifts running at the same time and the day's hours ÷ the longest day for one person (10h by default, can be set from 6h to 14h).
  - A minimum per position in Leave rules can raise it, never lower it.
  - Positions are counted by the active workers who hold them. Inactive workers don't count.
- **Each request is checked automatically:**
  - **Conflict (red):** a blackout day; the position would be below what's needed even before other pending requests; or one of the worker's own shifts has nobody free to cover it.
  - **Tight (amber):** short only if other overlapping requests are also approved (the card says who asked first); or a shift can only be covered by someone from another position (who has the must-have skills).
  - **No conflicts (green):** everything else.
  - A worker who could cover but has asked for leave on that day isn't counted as cover.
  - Shifts that a series would book further ahead are counted too.
  - Days already passed are noted, not checked.
- **Deciding:**
  - The manager can always approve anyway. The confirmation repeats the warnings.
  - **Partial approval:** "Approve only …" (every day that isn't red) or Choose days. The days don't have to be next to each other. The rest are declined. The worker is told which days were approved and can ask again for the rest. Only approved days count as leave.
  - **Approve all with no conflicts:** approves every green request in one step. This is safe because approving a pending request never makes another one worse; every pending request is already counted as off.
- **Approving** takes the worker off shifts on the approved days that haven't started, including an overnight shift from the evening before. Those shifts appear in Actions as needing cover. Offers on those days are withdrawn.
- **Leave rules** (from the planner or Shop setup):
  - a minimum per position;
  - the longest day for one person;
  - **blackout days**, chosen three ways:
    - weekly (e.g. every Saturday);
    - tapped on a month calendar (pick days, add a label, then make them a blackout; tap a red day to take it out, which splits a longer blackout);
    - from a Calendar day ("Make it a blackout day"; a holiday blackout takes the holiday's name).
  - Only today or later can be blacked out. Requests on blackout days show as conflicts but can still be approved.
- Actions and Manage show each request's verdict, for example "conflict on Oct 5–6", and open the planner on that request.

## Calendar
- Each day in the month view has **one bar per period** (3 periods → 3 bars), so staffing reads at a glance:
  - confirmed (solid green);
  - filled, waiting for replies (green outline);
  - assigned, not sent (dashed amber);
  - partly filled (amber);
  - nobody assigned (grey);
  - no shifts in that period (dotted).
  Past days have no bars.
- **Weekends** are tinted blue, in the Calendar, the leave planner and the blackout picker.
- **Holidays:**
  - Québec statutory holidays (New Year's Day, Good Friday, Easter Monday, National Patriots' Day, Fête nationale, Canada Day, Labour Day, Thanksgiving, Christmas) are marked "Holiday" in red.
  - Usually-busy days for restaurants (Valentine's Day, Mother's and Father's Day, Halloween, Christmas Eve, Boxing Day, New Year's Eve) are marked in purple.
  - Moving dates are worked out for any year.
  - Each holiday has a tip with its English and French name.
  - The month's holidays are listed as text under the calendar.
  - The day panel names the holiday.
- The Calendar has a **Leave** button (with the number of requests waiting) that opens the leave planner. The day panel shows who is off or has asked for that day, and opens the planner on that request.

## Copying schedules (v32)
The day panel offers, on any day with people booked (today and past days too, as the source):
- **Copy to…:** pick one or more days on a month picker, from tomorrow up to 8 weeks ahead. A dot marks days that already have shifts.
- **Repeat this day…:** the same weekday for the next 1–8 weeks (Thursday → the next X Thursdays).
- **Repeat this week…:** Monday to Sunday of that week, onto the next 1–8 weeks. Days of the source week with nobody booked are skipped (their targets aren't touched). It's also offered on an empty day of a week that has bookings.
- **Copy to rest of week:** kept (not on Sundays). "Repeat next week" is gone: Repeat this day with 1 week does the same.

**Days that already have shifts** (someone placed by hand, or an offer out). The manager is asked once per copy, listing those days:
- **Leave them alone** (the default, and the old behaviour): only empty days get the copy.
- **Fill only empty spots:** per position and period. Where a position already has someone (or an offer out) in a period, it stays exactly as it is. Empty ones are replaced by the copy, open slots included.
- **Add to what's there:** copied workers fill open slots first, then new slots, up to the usual staffing for that period and position (Period setup). Nobody is removed. Someone already on that part of the day is skipped quietly. Someone who can't come doesn't leave a new empty slot behind.
If no target has shifts, the copy runs straight away.

**In every case:**
- Copies are drafts; nobody is told until the manager sends each day.
- Each copied shift gets the worker's current rate for that position (a one-off raise on the source isn't copied).
- Someone on leave, booked elsewhere (other jobs too), inactive or unable to cover is left out. The slot stays open (fresh days) and the summary gives the reason.
- Recurring series keep filling their own slots, and those count as part of the copy (no extra slots).
- Today and past days are never targets. Shifts in a period that no longer exists are skipped and mentioned.
- A summary on the source day says how many days were copied, what happened on days that had shifts, and what was left open.

## Staffing (v33)
Built after talking to restaurant owners: most use paper, staff turnover is high (especially students), and when someone is missing the owner works the shift. Taking staff from another restaurant isn't done, so Quarti never suggests it.

**Covering a shift yourself**
- "I'll cover it" on any open slot (calendar, Fill slot) and on every call-out; hidden while an offer is out.
- The manager is booked on the shift as themselves: confirmed, **hours only, no pay**, never offered, swapped, copied, or counted in tips. Workers see them on the shift like a coworker.
- You can't cover two shifts at the same time. Removing yourself needs no confirmation.
- A stand-in who is also on staff covers it as themselves, at their rate. The owner covers under her own name.
- Today shows "You covered 6 shifts (34 h) this month", plus the ones booked ahead. It can be hidden there and turned back on in Shop settings.

**"I want more hours"**
- A switch in the worker's Me, with an optional limit (20, 30 or 40 h a week). Only this shop sees it.
- In Fill slot and the calendar picker, those workers come first among the free ones, marked "Wants more hours". Past their limit it says so instead, and they're no longer moved up.

**Student seasons**
- Semesters follow the Québec school year: winter Jan–Apr, summer May–Aug, fall Sep–Dec.
- Availability ("When I can work") has a grid for this semester and the next. Changing the next one doesn't touch this one; pickers read the semester of the shift's date.
- **Exam dates:** a date range (today or later, up to 6 weeks). The manager sees "Exams until Dec 18" when filling shifts. It never blocks.
- **Semester check:** from the Roster ("Winter 2027 starts Jan 1 · Ask staff"), everyone is asked to confirm their availability for the next semester. Workers answer from Home ("Same as now" or update it). The manager sees "5 of 7 confirmed" and can remind the rest.
- **Coming back on:** setting someone inactive takes an optional return date. That day they're active again by themselves and told. A week before, the manager gets "Alex is back Thu Oct 1".

**Shortage warning**
- In Actions: "Short of cooks from Tue Oct 13 · 11 days · dinner · 1 cook short a day", with Post a job, Why? and Hide.
- It compares the usual staffing (Period setup) with who could work each day for the next 8 weeks. It counts approved leave, away dates, semester availability and exam weeks. Each person counts for one slot per period and at most two periods a day.
- It's optimistic (it assumes everyone free would work), so a shortage it shows is real.
- "Why?" lists the weeks and the reasons (for example "Kevin: exams"). Hide lasts until the forecast changes.

**Referrals and the window sign**
- Workers get "Know someone? Share our job" on Home for open public posts: a link that carries who shared it. Inactive or removed workers don't.
- The applicant shows "Referred by Sophie L." The referrer is told when the friend applies and when they're hired. No bonus is tracked.
- **Window sign** (Hiring, on each open public post): French first and larger ("ON EMBAUCHE", the position in French, pay in "$/h"), English below, and a QR code to the job page. It can be printed. Applicants from it show "From your window sign".
- The public job page shows the post, pay, periods and address. The person sends name and phone or email, or signs in with a Quarti profile. A closed post takes no applications.

**Clock in and out**
- On by default (Shop settings). The manager prints a "Pointez ici / Clock in here" code to post at the shop, and can make a new code, which stops the old one working.
- Workers on the roster clock in from Home by scanning the shop's code, from 30 minutes before the start until the end. They clock out after clocking in, never later than now, within 16 hours. A code from anywhere else is refused.
- Clocking out turns the clocked times into the worked hours, so pay, history and tips use them. If the manager already recorded the hours, theirs stand and the clock-out is only logged.
- Today shows who is on site and who hasn't clocked in for a shift that has started. Shift detail shows the clock history (in, out, fixes and who made them).
- Clock times belong to the person: they're cleared if the shift changes hands (call-out, swap, unassigned).
- **Real app:** the code is a signed, rotating token per shop. Taps work offline and sync later. Every change keeps an edit history, overtime past 40 h a week is flagged, and timesheets export to payroll.

**Tip sharing (LNT art. 50)**
- Tips belong to the employee who served. The employer can't impose a sharing arrangement or take part in setting it up; it must come from the tipped employees' free consent.
- So the arrangement lives in the worker app. A tipped worker proposes weights per position (0 leaves a position out). It starts the day after **every** member of the pool accepts. Members are the roster workers who hold a weighted position. Anyone can decline ("Not now"), the proposer can withdraw, and past days never change.
- **Split:** hours worked × the position's weight; cents go by largest remainder, so shares add up exactly to the total. The manager or owner covering a shift is never in the pool.
- **The manager's Tips screen:** pick a day (the last 7), enter cash and card totals, see each share and the pay-period totals (every 2 weeks). There's no way to change the weights there. Each worker is told their share; Home and Me show their tips for the pay period.
- Without an agreement, nothing is split: each person keeps their own tips.
- Have this checked by a lawyer before launch; this is how the prototype reads art. 50.

## People and hiring
- Every application, leave request and verification request has its own id.
- A hire gets the post's position. Hiring someone already on staff adds the position and keeps their status and history. An inactive staff member who is hired is reactivated, and this is shown and logged.
- A declined person can apply again (a new application) until the manager blocks their applications. Blocking ends every waiting application. It can be done from any profile. Unblocking allows applying again.
- Reopening a post brings back the applicants whose application closed or was filled out with it.
- Positions have stable ids. A rename updates the workers who hold it. When a position is deleted, workers lose it, and past shifts keep the old name with a date stamp.
- **Removing a worker:**
  - closes their pending leave, their future approved leave, their verification requests and their waiting applications;
  - is logged;
  - their history stays viewable, read-only.
- Verification answers that arrive after the request ended are ignored.

## Chat
- A removed worker can still message the manager.
- A blocked worker (on the roster or not) can't send messages, and the manager can't reply until they unblock. People off the roster are blocked or unblocked from the Chat screen.

## Holidays by region, read from a table (v30)
- **Source of truth:** a holiday table, not rules in the app.
  - Real app: a Supabase `holidays` table with region (`CA-QC`, `CA-ON`, `US-NY`…), date, English and French names, kind (statutory / optional / busy) and an observed flag.
  - A yearly server job fills 3 years ahead from open data ([date-holidays](https://www.npmjs.com/package/date-holidays); data is CC BY 3.0, so the app credits it, for example on an About screen). Rows can be corrected by hand.
  - At install and login the app downloads only its region, keeps it on the phone for offline use, and refreshes about monthly.
- **Prototype:** the table is generated from date-holidays 3.37.0 for 2025–2028: 13 Canadian provinces and territories plus 50 US states and DC, about 5,300 rows. `holFetch(region)` stands in for the download.
- **Shop settings → Holidays:**
  - **Region:** grouped Canada / United States. If the address points elsewhere, it offers "Your address looks like Ontario, Canada. Use it". Shows the next holidays and where the dates come from.
  - **Show busy days:** Valentine's, Mother's/Father's Day, Halloween, St. Patrick's, Christmas Eve, New Year's Eve, Black Friday (US). On by default.
  - **Your own days:** a date and a name (a festival, an event nearby). It can't be in the past, and there's one per date. These count as busy days.
- **What's shown:**
  - one entry per day: a statutory holiday beats an optional one, which beats your own day, which beats a busy day;
  - labels: "holiday", "optional holiday" (e.g. Easter Monday in Québec, Civic Holiday in Ontario: not every employer gives it), "observed holiday" (e.g. July 3 when July 4 is a Saturday), "busy day", "your day";
  - French names are shown in tips for Canadian shops.
- The calendar, leave planner, worker calendar and leave form all read the same table, so changing the region changes all of them.

## Long chats (v29)
- Every chat, on both sides (worker ↔ manager, team chat, coworker chats, the manager's Chat screen and its team chat), opens at the **latest 15 messages**, scrolled to the end.
- **Show earlier messages** at the top adds 15 more at a time and says how many are still hidden. Your place stays where it was.
- Unread messages are never folded away: if more than 15 are unread, all of them are shown.
- A chat starts folded again when you open a different one; it stays open while you come back to the same chat.
- On the manager's Chat screen the conversation scrolls in its own box under the chat list, and opening a chat brings it into view.

## Worker app (v20)
- The prototype has a **Manager / Worker** switch, and you pick which staff member you are. Both sides share the same data, so an action on one side shows on the other.
- **Home (v23), from most to least urgent:**
  1. **Alerts:** things to answer (red if one starts within 24 hours), two jobs overlapping in the next 2 weeks, new messages from the manager, new updates. Each opens the right place.
  2. **Today:** a **timeline bar** first:
     - a time axis with a red "now" line;
     - one bar per shift, coloured by job;
     - a shift to answer is dashed, an asked-for claim is outlined, finished shifts are faded;
     - overlapping shifts go on separate rows and are outlined red, with a note;
     - back-to-back shifts share a row;
     - tapping a bar jumps to its row below.

     Then the list: every shift today across all jobs, including last night's overnight shift (shown as Done once it ends). Each shows "Now · until 12:00", "Starts in 2 h 19 min" or "Done". A shift to answer has Accept/Decline right there. Also shown: leave and holidays; "No shifts today" with the next shift.
  3. **Needs your answer:** offers, sent shifts, a recurring series (one answer for the whole series), and trade requests.
  4. **Coming up:** the next 7 days across all jobs, colour-coded; tapping one opens that day in the calendar.
  5. **Waiting for the manager:** the worker's claims, swaps and leave requests.
  6. **This week:** hours confirmed here, estimated pay, and hours across all jobs.
  7. **Updates:** the latest 3 (or all new ones), with Show all.
- **My shifts:**
  - Upcoming shifts, with Accept/Decline when needed, and recurring series.
  - "Past & pay": worked times, the manager's attendance notes, no-shows and cancellations, and pay this week and last week (rate × hours worked).
  - A shift that hasn't started isn't listed in Past.
  - **Calendar day (v25):** tapping a date shows the same timeline bar above that day's list. Overlaps go on separate rows with the note, and tapping a bar jumps to its row. The "now" line shows only on today. Past days are faded. An overnight shift from the day before starts at the left edge, is listed as "from the day before", and counts in overlap checks.
- **Offers:**
  - A worker sees their own time and rate (with any raise), how many spots are left, and a note if it falls in a time they marked unavailable.
  - Accepting re-checks everything. A stale offer does nothing.
  - Workers only ever see worker-facing messages, never the manager's wording.
- **Claiming:**
  - Only when the shop allows it.
  - Only open shifts on days the manager has set up, from now to 4 weeks ahead.
  - Their own positions, or covering when allowed and they have the must-have skills.
  - Only when they're free.
- **Swaps (the manager always approves):**
  - **Give away:** coworkers who are free and able see it under "Up for grabs". The first to take it waits for the manager's approval.
  - **Trade:** pick a coworker's confirmed shift in the next 3 weeks that fits both of you (two shifts at the same time can be traded). The coworker agrees or says no, then the manager approves.
  - Each worker keeps their shift until approval. On approval, each works the shift at their own rate. A shift from a series is skipped by that series.
  - A request ends automatically if:
    - either shift changes, starts, or is cancelled;
    - the taker is no longer free or able (leave, clash, inactive, removed).
    Everyone involved is told.
  - One live request per shift. The requester can cancel.
  - Only coworkers can take a give-away. Inactive staff can't give away, trade or take shifts (they can still call out), and setting someone inactive ends their live swaps.
- **Leave:**
  - Pick the first and last day on a calendar. It shows blackout days, holidays, the worker's own requests, and how many coworkers in the same position are already off or asking (counts only, no names).
  - An optional note goes to the manager.
  - Refused: past days, more than 31 days at a time, and overlaps with the worker's own pending or approved leave.
  - A pending request can be withdrawn. A partly approved or declined request offers "Ask again" for the declined days.
- **Availability ("When I can work"):**
  - For each weekday and period, the worker can mark that they can't work.
  - It's soft: it never blocks. The manager sees "Said unavailable Mon morning" (or "on Sundays") in the calendar picker and in Fill slot, and the manager's Actions show it on a swap.
- **Chat:** with the manager, both ways, with unread badges on both sides. Blocked: can't send. Removed from the roster: can still send. Coworker chats: see "Chat between workers" below.
- **Jobs:** open posts at the shop, except positions the worker already holds. Applying is refused if the worker is blocked from applying; no duplicate applications.
- **Inactive:** a banner, and no claims or swaps. **Removed:** a banner; history and chat only.

## Worker calendar and other jobs (v21)
- **My shifts** opens on a **calendar**, with List and Past & pay views next to it:
  - Each day has one bar per shift, coloured by job: green for this shop, blue for another Quarti shop, purple for outside work. A shift to answer is dashed; an asked-for claim is outlined.
  - It also shows leave (Off / Asked), holidays and weekends, and a red dot where two jobs overlap.
  - Tapping a day lists everything that day, with Accept/Decline, Withdraw, Swap or Remove.
- **Other Quarti shops:**
  - Their shifts come from that shop and appear in the calendar.
  - A shop switcher appears when the worker has more than one Quarti shop. In the prototype, only Café Olympico has full data.
- **Jobs outside Quarti:**
  - The worker adds the job (the name is private), then adds hours: a day, times, and repeat weekly for 1–12 weeks.
  - Adding hours that overlap one of their shifts asks first. The shift is kept, so the worker should give it away or swap it.
  - Hours can be removed one day at a time, or with the rest of the series. Removing a job removes its hours.
- **Managers never see other jobs' names.**
  - A worker busy at another Quarti shop shows as "Booked at another shop". Outside work shows as "Busy with another job".
  - Offers and claims that clash are withdrawn or refused.
- Home shows the hours across all jobs this week. Me lists each job with its hours this week.

## Calendar subscription link (v22)
- In **Me › Add my shifts to my calendar**, each worker has a private link (24 random characters) to subscribe to in Google Calendar, Apple Calendar or Outlook. "How to add it" gives the steps for each.
- **What the feed contains:**
  - Shifts at this shop from 30 days back to 90 days ahead, including days a recurring series will book.
  - Shifts at their other Quarti shops.
  - Approved leave, as all-day events (a partly approved request gives one event per run of days).
- **What it leaves out:** outside work (already in their own calendar), assignments not sent yet, and no-shows.
- Shifts waiting for the worker's answer are included as "to confirm" (tentative), unless the worker turns that off.
- **Each event has:** "Cashier · Café Olympico", the shop address, the period, the rate, and the worked time when the manager adjusted it.
- **Ids are stable**, so changes update the same event instead of duplicating it:
  - a shift keeps its id;
  - a recurring day is identified by series and date, so it doesn't duplicate when the day gets planned;
  - a cancelled or swapped-away shift simply disappears.
- **Time:** Montréal time with daylight saving (America/Toronto). An overnight shift ends the next day.
- **Format:** strict iCalendar text (escaping, line folding, CRLF). The feed asks for hourly refresh, but Google and Outlook refresh on their own schedule (usually every few hours), and the app says so. Quarti notifications remain the real-time channel.
- **Reset link** creates a new link and the old one stops working. A removed worker's link returns nothing.
- **Real app:** a Supabase Edge Function at `GET /w/:token.ics` (token stored hashed), built from the database on each request, served as `text/calendar`.

## Shift actions for workers (v26)
Each confirmed shift has an **Options** sheet (from Home, the calendar day and the list). It also shows who else is working during the shift, directions to the shop, and "Message the manager" with the shift prefilled.
- **Give away or swap:** as before; the manager approves.
- **Can't make it (call out):**
  - Possible until the shift starts, including while a swap or request is waiting (that ends it, and the coworker is told).
  - A reason is required (Sick, Family emergency, Transport, Other); a note is optional. Only the manager sees them. No doctor's note is asked for.
  - No approval: the shift is taken off the worker right away and stays as an open slot. The worker's history keeps it as "Called out: sick", with one update, not two.
  - Inside the notice window it is marked **late**.
  - Manager: a red Needs-you item ("Sophie L. can't make it…") with **Find cover** (opens Fill slot) and **Leave it open**. The item goes away when the slot is filled, offered or dismissed. It isn't counted again under "open shifts today". Shift detail explains why the slot is open.
  - A recurring day not yet planned is planned first, and the series won't rebook it.
- **Running late:** only today, from 3 h before the start until the end. The worker picks an arrival time; before the start it's counted from the start, after the start from now. The manager sees "running late, arrives around 12:20 (20 min late)" with OK, also on Shift detail. The worker can say "I made it on time". The note clears if the shift changes hands.
- **Ask to drop:** only when the shift is more than the notice window away (Shop settings: 12, 24, 48 or 72 h; default 24). The worker keeps the shift until the manager answers.
  - Approve: the slot opens and shows as a shift to cover.
  - Decline: the worker keeps it.
  - Both tell the worker.
- **Ask to change times:**
  - Same rules for the new times: at least 1 h, at most 16 h, the start not already passed, and the worker free then (other jobs included).
  - The manager sees the part it would leave uncovered. Approval re-checks; if something clashes now, it isn't approved and the request ends.
- **Requests in general:**
  - One live swap or request per shift.
  - A request ends automatically if the shift changes hands, is removed or starts, and the worker is told.
  - The worker can withdraw it.
  - Requests show in "Waiting for the manager".
- **Manage worker:** "Last 90 days: 2 call-outs (1 late) · ran late 1 time · 1 shift dropped with notice", shown only when there's something.

## Chat between workers (v26)
- **Messages is a list:**
  - the manager;
  - a **team chat** (everyone on the roster, plus the manager);
  - one-to-one chats with coworkers, with **New message**.
  The Chat badge counts all unread.
- **Privacy:** the manager can't read private chats unless one is reported. Phone numbers are never shown.
- **Block:**
  - The blocked person can't message you, and isn't told why beyond "You can't send messages to Sophie".
  - Their team chat messages are hidden for you and don't count as unread.
  - It never changes the schedule; if two people shouldn't work together, they tell the manager or report.
  - You can unblock.
- **Report:**
  - A reason is required, plus an optional note; blocking at the same time is on by default.
  - The manager gets a Needs-you item and reads a copy of the last messages of that chat (later messages don't change it). The item reminds that Québec employers must have a psychological-harassment policy.
  - "Mark as handled" closes it.
- **Shop setting "Workers can message each other"** (on by default). When off:
  - no team or private chats on either side;
  - nothing can be sent;
  - coworker messages don't count as unread.
- Only people on the roster can use team or private chats. A removed worker keeps only the manager chat.
- Nobody can message, block or report themselves.

## Positions and pay per worker (v28)
- A worker can hold several positions (a cook can also be a cashier). Booking, offers, claims, swaps and leave count every position they hold, and the roster lists them under each one.
- **Manage worker → Positions and pay → Edit:**
  - Tick the positions they can work, each with its own hourly rate ($15–60); at least one is required.
  - The **main** position is listed first. Its rate is their usual rate, and it's what they're paid when **covering** a position they don't hold. Unticking the main one makes the next one main.
  - A position whose must-have skills they lack can still be added; it says which skills are missing ("you're vouching for them").
  - Saving tells the worker their positions and rates. Labels of deleted positions are cleared.
- **Which rate a shift gets:** the rate for that shift's position, wherever the shift is booked:
  - assigning from the calendar, Fill slot and offers ("Normal rate" and +$2/+$5 start from it), claims and approved claims;
  - swaps (the taker gets their own rate for that position);
  - recurring series (switching the position switches the rate);
  - seeded schedules and pay estimates.
  An offer's raise is shown against the position's rate.
- **Changes don't touch booked shifts:**
  - New rates apply to shifts booked from then on; booked shifts keep their rate.
  - Removing a position never cancels a shift: booked shifts in it stay, marked "covering". Adding the position back clears the mark.
- Renaming a position keeps everyone's rate for it.
- Deleting a position in Shop settings: if it was someone's main position, their next one becomes main, and its rate becomes their usual (and covering) rate.
- Worker app (Me): "Barista $21/hr · Cook $23/hr at Café Olympico". Workers can't change their own positions.

## Plan and access (v27)
Instead of separate owner and stand-in roles, there are only two actions: **share** and **transfer**. Everyone with access has the same rights.
- **Free plan:**
  - One shop, one person who manages it, and 2 service periods.
  - Everything else is included: shifts, offers, leave, worker app, chat, Find shops.
  - **Transfer is always free.**
- **Quarti Pro** (paid per shop):
  - share access, which covers co-managers and stand-ins;
  - the 3rd service period;
  - owner mode.
- **Paywall:** one sheet, "Pay now for more features", lists what Pro adds and offers two ways to pay:
  - **Pay myself:** checkout; that person becomes the payer.
  - **Send a payment link to the owner:** name and email; the shop stays free until they pay. When they pay, Pro turns on and they can manage the shop. A new link replaces the old one, and a link can be cancelled.
  - It opens from Plan & access, from "Share access" on the free plan, and from adding or changing a 3rd period on the free plan.
- **Plan & access screen** (Shop settings): the plan, who pays, and everyone who can manage the shop, with tags "Pays", "Stand-in until Oct 2" and "Also on staff".
- **Share (Pro):**
  - Pick someone on the staff, or someone else by name and email (the same email twice is refused).
  - An optional **until** date makes it a stand-in: access ends by itself after that day, and a worker is told.
  - A worker with access sees "Manage Café Olympico" on Home and Me. It opens the manager app with a strip ("Rémi Lapointe · managing until Oct 2", "My worker app").
- **Remove (Pro):** anyone with access can remove another person, except the payer and themselves. Workers are told and stay on the staff.
- **Stop managing:** you can leave if someone else still manages, unless you're the payer (the payer cancels the plan instead).
- **Transfer (free):**
  - Pick a person; they're asked in their app and must accept.
  - Until then the sender keeps access and can cancel; one transfer at a time.
  - On accept, the receiver takes the sender's place and the sender loses access.
  - If the payer transfers, paying passes to the receiver too.
  - If the sender lost access meanwhile, the transfer does nothing.
- **Cancel the plan:** only the payer.
  - They pick who keeps managing on the free plan; everyone else loses access (workers are told). Nothing is deleted.
  - A 3rd period keeps running as it is, but on the free plan the periods can't be changed until one is removed or Pro is back.
- **Who's in the manager app:**
  - The prototype's Manager button is the shop's manager, Nadia.
  - Someone who loses access sees "You don't manage Café Olympico anymore" with who manages it now.
  - A stand-in or the owner whose access ends while inside is sent back to their own app.
  - **Every tap re-checks access.** A screen left open after access ended elsewhere (the stand-in date passed, the plan was cancelled, the shop was handed over on another phone) does nothing when tapped: the person is sent back to their own app, or to the No access screen.
  - Workers always see changes as coming from "the manager".
- **Owner mode (Pro):** the owner is anyone with access to several shops.
  - The owner home shows totals (shops, hours, wages this week) and each shop with working now, open today, waiting on a manager, leave requests, staff, hours, wages and who manages it.
  - Open (enter the manager app), Who manages (Plan & access), and Billing ("You pay for … on one bill").
  - The second shop is a summary in this prototype.
- **Real app:**
  - access is a table (shop, person, until, payer);
  - the end date is checked on the server;
  - every manager action is checked on the server against the access table at the moment it arrives, never against what the phone was showing;
  - the transfer is an invite the receiver accepts;
  - payment links are Stripe Checkout links tied to the shop.

## Find shops (v26)
- In Find, a **Shifts | Shops near me** switch. Shops show on a **map** of Montréal (river, mountain, canal, neighbourhoods; pins for "you work here", hiring and not hiring) or in a **list** sorted by distance.
- **Filters:** My positions, Hiring now, and distance (2, 5 or 10 km, drawn as a circle on the map). Distance is from the worker's area, which they can change; only they see it. Shops they already work at always show.
- **Shop page:** about, hours, positions with pay ranges, and **Ask to join** (pick a position, optional note). The shop sees the worker's name, rating, skills and availability, not their phone number or other jobs.
  - One waiting request per shop; it can be withdrawn.
  - After a decline, the worker can ask again.
- **Café Olympico** is listed only while "Public shop" is on. Its positions and pay come from the shop's own setup and hiring posts.
- **Joining Café Olympico:** the manager gets "Noah asks to join · Barista" (with "worked here before" for former staff).
  - Add to roster: the person joins as New, or gets the extra position if they're already back.
  - Decline tells them.
  - Workers blocked from applying can't ask.
- **Other shops** answer through a Prototype button. When accepted, the shop becomes another Quarti job in the worker's calendar, jobs list and shop switcher.
- **Real app:** a native map with the shop's real location, and a Supabase (PostGIS) distance search over shops that are listed.

## Languages (plan for the real app; prototype has the chooser only)
- **Why:** Québec's Charter of the French Language (as amended by Bill 96) requires that software an employer gives staff for their work be available in French. Ship English and French (Canada) from day one, and confirm the details with a lawyer.
- **Prototype (v31):** a Language chooser (English / Français) on the worker's Me screen, at the top of the manager's Shop settings, and on the owner home.
  - The choice is saved per person. Choosing Français says it's coming soon; the app stays in English.
- **Real app (React Native/Expo):**
  - **Strings:** in translation files (`en.json`, `fr-CA.json`) with i18next / react-i18next. expo-localization picks the phone's language as the default. Another language is one more file.
  - **Per person, not per shop:** stored on the profile, so a manager in English and a cook in French share the same shop.
  - **Events, not sentences:**
    - updates, notifications and logs are stored as an event code plus details (e.g. `shift.called_out {pos, date, why}`) and written out in each reader's language when shown;
    - push notifications are built per recipient's language;
    - today's prototype logs are English sentences; convert them when building.
  - **Formats** come from the platform (Intl): fr-CA "25 sept.", "21,00 $"; en "Sep 25", "$21.00"; 24-hour time; plural rules.
  - **Data:** holiday names already have English and French. Positions and periods the manager types stay as typed. Chat and notes are never machine-translated automatically (a "Translate" button could come later).
  - **Layout:** French runs about 20–30% longer. Check every screen in French, and avoid fixed-width buttons and chips.
  - **Translation:** draft with AI, then a native Québécois reviewer for restaurant terms (quart de travail, remplacement, congé, période de service). A tool like Crowdin or Lokalise once there are regular updates.
- **Build order:**
  1. Worker app and shared pieces (dates, money, holidays, events).
  2. Manager and owner.
  3. A French layout pass.

## Still for later (worker app)
- Full data for every Quarti shop in the switcher (the prototype has one).
- Push notifications.
- Creating "until stopped" series records week by week on the server.
