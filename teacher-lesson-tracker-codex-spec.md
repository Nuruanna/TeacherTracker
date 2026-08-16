# Teacher Lesson Tracker — Codex Specification

## 1. Project goal

Build a working responsive web application called **Teacher Lesson Tracker**.

The app is a practical teacher tool for:

- viewing a fixed weekly teaching schedule;
- tracking which lesson each class is currently on in its Course Map;
- automatically handling lesson cancellations and rescheduling;
- keeping lesson notes;
- keeping homework and homework links;
- carrying unfinished work to the next lesson;
- showing useful reminders on the Dashboard.

This is the **first MVP version** for publication on **GitHub Pages**.

For this version:

- use **localStorage** for persistence;
- do **not** use a backend;
- do **not** use login/registration;
- do **not** use a cloud database yet;
- do **not** implement file/image uploads yet;
- do **not** add AI features;
- do **not** add attendance or grades.

The project must work after being published as a static site on GitHub Pages.

---

# 2. Reference priority — IMPORTANT

Several visual references are attached.

Use them in this priority order:

1. **This Markdown specification** — source of truth for current logic, labels, classes and behavior.
2. **`status-icons-reference`** — source of truth for the 5 approved lesson-status icons.
3. **Page screenshots** — source of truth for layout, palette, spacing, backgrounds, cards, typography and general visual style.
4. If a screenshot contradicts this specification, **follow this specification**.

## Known outdated elements in some screenshots

Some screenshots contain old elements. Do not copy them literally.

### Dashboard screenshot
The Dashboard visual is approved for:
- page composition;
- colors;
- background;
- cards;
- header proportions;
- class-row style;
- overall visual mood.

But these elements are outdated:

- navigation label **Today** must be **Day**;
- examples with **Grade 7 / 7A / 7B** are outdated;
- Grade 7 has been removed from the project;
- the yellow class color now belongs to **Grade 5**;
- status icons shown inside the screenshot are outdated;
- use the dedicated `status-icons-reference` instead.

### Other page screenshots
If any page screenshot contains old status icons, ignore them and use the approved dedicated icon reference.

---

# 3. Recommended stack

Use a simple static frontend stack suitable for GitHub Pages.

Recommended:

- React
- Vite
- CSS / CSS Modules / a lightweight styling solution
- SVG icon components or a lightweight icon library

Avoid unnecessary dependencies.

The app should behave like a small SPA.

---

# 4. General visual system

Follow the attached visual references closely.

## Style

The interface should feel:

- modern;
- elegant;
- light;
- pastel;
- calm;
- polished;
- suitable for an adult teacher;
- not childish;
- not like a generic admin dashboard.

## Background

Use the provided seasonal/main illustration as the source for the page atmosphere.

The same seasonal illustration may be:

- shown clearly in the Dashboard seasonal card;
- reused as a strongly blurred, enlarged background behind the whole app.

Use CSS blur / overlay / opacity / brightness to create the soft lavender-sunset background.

The background must be slightly more saturated than pure white so the light cards remain visually separated from it.

## Cards

Use:

- light cream/white surfaces;
- large rounded corners;
- thin pale borders;
- soft shadows;
- generous spacing;
- no heavy borders.

## Typography

Use:

- elegant serif for major dates / large headings;
- clean modern sans-serif for UI text;
- logo typography visually close to the reference.

---

# 5. Logo

The logo design is:

- open book;
- small lavender element;
- large word **Teacher**;
- smaller **LESSON TRACKER** underneath.

Prefer to use the prepared logo asset if supplied.

If the asset is only the mark, render the text in HTML/CSS.

Do not invent a different logo.

---

# 6. Runtime assets vs code-built UI

## Runtime image assets

Expected prepared assets:

- logo / logo mark;
- seasonal main image;
- small decorative illustration: vase + books + mug.

The seasonal image may also be reused as the blurred global background.

## Visual-only reference

- `status-icons-reference`

Do **not** use the status reference image directly in the interface.

Recreate the icons with SVG/code.

## Build with code, not raster images

Do not rasterize:

- buttons;
- status icons;
- navigation icons;
- cards;
- calendar;
- lesson rows;
- progress bars;
- dropdowns;
- filters;
- modals;
- arrows;
- checkboxes;
- form controls.

---

# 7. Grades used in the project

The project currently uses:

- Grade 2
- Grade 3
- Grade 4
- Grade 5
- Grade 8

There is **no Grade 7**.

## Fixed grade colors

The color belongs to the **grade level**, not to the class letter.

### Grade 2
- pink-lilac background;
- darker pink/fuchsia accent text.

### Grade 3
- soft green.

### Grade 4
- light coral/red.

### Grade 5
- warm yellow / yellow-orange.

### Grade 8
- light blue.

Examples:

- 2A and 2B use the same Grade 2 palette;
- 3A and 3B use the same Grade 3 palette.

Use these colors consistently across:

- Dashboard;
- Day;
- Week;
- Month;
- Classes;
- Class Details;
- class badges;
- lesson rows.

Do not use an arbitrary color picker in the MVP.

---

# 8. Textbooks

Store textbook name in course/class metadata.

Textbook mapping:

- Grade 2 — **Spotlight 2**
- Grade 3 — **Spotlight 3**
- Grade 4 — **Spotlight 4**
- Grade 5 — **Rainbow English 5**
- Grade 8 — **Rainbow English 8**

Display textbook names on:

- Classes;
- Class Details;
- Settings → Classes / Course Maps.

Do not show textbook names on:

- Dashboard;
- Day;
- Week;
- Month;
- Lesson Details

unless added later.

---

# 9. Course Map architecture

Each grade has its own Course Map file.

Recommended structure:

```text
src/
  data/
    course-maps/
      grade-3.json
      grade-4.json
      grade-5.json
      grade-8.json
```

Grade 2 Course Map is not available yet.

The app must work even if Grade 2 has class metadata but no Course Map yet.

## Course Map items

Keep both:

- the structural lesson code;
- the human-readable lesson title.

Example:

```json
{
  "id": "u1-s2-l1",
  "order": 3,
  "unit": 1,
  "step": 2,
  "lesson": 1,
  "code": "Unit 1 Step 2 Lesson 1",
  "title": "Laila Ali and Comparing Progress",
  "type": "lesson"
}
```

For a non-step item:

```json
{
  "id": "u1-dialogue-l1",
  "order": 11,
  "code": "Unit 1 Dialogue Lesson 1",
  "title": "Mini-test 1 + Planning an Active Weekend",
  "type": "lesson"
}
```

For reserve items:

```json
{
  "id": "reserve-1",
  "order": 97,
  "type": "reserve"
}
```

## IMPORTANT — no Term / Quarter entities

Do **not** introduce:

- Term 1;
- Term 2;
- Quarter 1;
- Quarter 2;
- term reserves;
- quarter-specific reserve pools.

This project uses **one annual Course Map per grade** and **one shared annual reserve pool for that Course Map**.

---

# 10. Current Course Maps

Available Course Maps:

- Grade 3 — 60 planned items + 6 Reserve
- Grade 4 — 60 planned items + 6 Reserve
- Grade 5 — 60 planned items + 6 Reserve
- Grade 8 — 96 planned items + 6 Reserve

Grade 2 Course Map will be added later.

The Course Map JSON files will be supplied separately.

---

# 11. Reserve lesson logic

Reserve lessons are stored at the end of the Course Map.

They represent spare yearly lesson capacity.

Example:

```text
planned lesson 1
planned lesson 2
...
planned lesson 96
Reserve
Reserve
Reserve
Reserve
Reserve
Reserve
```

If a lesson is cancelled:

- the cancelled lesson topic is **not lost**;
- the topic moves forward to the next real lesson slot;
- all following topics move forward;
- one Reserve is consumed from the end.

If a Custom Lesson is inserted:

- the custom lesson uses the current real lesson slot;
- the originally planned topic moves forward;
- all following planned topics move forward;
- one Reserve is consumed.

If a cancelled lesson is restored:

- the Course Map sequence is recalculated;
- the previously consumed Reserve is restored.

When no Reserve items remain:

- do not silently drop an important planned lesson;
- show a warning before Cancel or Custom Lesson;
- explain that no reserve capacity remains and a planned lesson may no longer fit into the available yearly schedule.

---

# 12. Classes data model

Do not store a class as only a string such as `"2B"`.

Store separate fields.

Example:

```json
{
  "id": "2B",
  "grade": 2,
  "section": "B",
  "displayName": "2B",
  "courseMapId": "grade-2",
  "textbook": "Spotlight 2"
}
```

This is important for grade-level filtering.

---

# 13. Grade-level filters

Wherever the UI contains **All classes**, the filter is by **grade level**, not by individual class.

Example classes:

- 2A
- 2B
- 3A
- 3B
- 4A
- 5A
- 8A

The filter must dynamically show:

- All classes
- Grade 2
- Grade 3
- Grade 4
- Grade 5
- Grade 8

If no Grade 6 class exists, do not show Grade 6.

Do not hardcode the list.

Build the filter from the actual class data.

Selecting Grade 2 must show both 2A and 2B.

This behavior applies to:

- Day;
- Week;
- Month.

---

# 14. Lesson statuses

Approved icon style:

- white circular background;
- thin pale border;
- soft shadow;
- bright but not neon symbol.

Use the dedicated icon reference as the visual source of truth.

## Primary statuses

### Upcoming
- blue right arrow.

### Completed
- green check.

### Cancelled
- red X.

### Rescheduled
- purple circular arrow.

## Secondary flag

### Needs attention
- yellow warning triangle with exclamation mark.

Needs attention is **not a primary status**.

A lesson can be:

- Upcoming + Needs attention;
- Completed + Needs attention.

---

# 15. Automatic lesson status

Do not require a **Complete lesson** button.

For a normal lesson:

- before its end time → Upcoming;
- after its end time → Completed.

Manual statuses override automatic status:

- Cancelled remains Cancelled;
- Rescheduled remains Rescheduled.

Do not automatically overwrite those with Completed.

If a cancelled lesson is restored:

- if the lesson end time is still in the future → Upcoming;
- if the lesson end time is already in the past → Completed.

---

# 16. Main header

No sidebar.

Use the top header from the visual references.

Navigation:

- Dashboard
- Day
- Week
- Month
- Classes
- Settings icon

## Dashboard header

The Dashboard reference still contains the old label **Today**.

Final label must be:

**Day**

## Internal pages

After the logo, show a compact current-date field.

Example:

`Saturday, 15 August 2026`

Then show the standard navigation.

---

# 17. Reusable date-navigation pill

This is a permanent design element on internal calendar/lesson pages.

It is:

- a separate block;
- translucent;
- very lightly bordered;
- fully pill-shaped;
- maximum radius (`border-radius: 9999px`);
- visually separated from the main content below.

The main content must begin in a **separate block below**.

Do not put the pill inside the main content card.

---

# 18. Dashboard

Use the approved Dashboard screenshot as the main layout reference.

Desktop layout: three columns.

## Left column

### Seasonal image card

Show:

- date;
- weekday;
- Academic Week;
- `X lessons today`.

The information is integrated into the light area of the seasonal illustration.

### Mini calendar

Under the image.

Current day shown in a purple circle.

Clicking a date opens Day for that date.

---

# 19. Dashboard — Today block

Large central block.

It shows lessons for the current day.

Each lesson row contains:

- lesson number;
- time;
- class;
- short lesson code;
- primary status icon;
- Needs attention icon when applicable.

The entire row is clickable.

Do not add an Open button.

Fit approximately 5–7 lessons comfortably.

If no lessons exist:

- show `No lessons today`;
- use a calm seasonal empty state.

---

# 20. Dashboard — right column

Three small information blocks.

## Continue from previous lesson

Show only currently relevant carried-over unfinished work.

## Recently cancelled / rescheduled

Show 1–3 most recent changes.

## Homework missing

Show Completed lessons where Homework is empty.

If there are more items, show something like `+N more`.

Empty states:

- Nothing to continue
- No recent changes
- All homework added

---

# 21. Day page

Use the approved Day reference.

## Left side

- mini calendar;
- Lesson status block.

The title is exactly:

**Lesson status**

Show all five approved icons there.

---

# 22. Day navigation pill

Structure:

```text
←    Saturday / 15 August 2026    [All classes ▾]    →
```

The All classes filter belongs **inside this pill**.

The orange previous/next buttons are round.

Saturday uses the logo-purple family.

The date uses dark navy.

The pill is a separate block.

---

# 23. Day lesson list

The lesson list is a **separate large card below the pill**.

Each row contains:

- lesson number in a white circle;
- time;
- class badge;
- short lesson code;
- primary status icon;
- Needs attention icon when needed;
- chevron.

The full row is clickable → Lesson Details.

Use grade colors and slightly darker matching borders.

---

# 24. Week page

Use the approved Week reference.

## Week navigation pill

Structure:

```text
← Previous week     11–15 August 2026     [All classes ▾]     Next week →
```

Requirements:

- separate translucent pill;
- maximum border radius;
- orange round arrows near the outer edges;
- Previous week / Next week in grey text;
- All classes grade-level filter inside the pill.

---

# 25. Week content block

Separate large block below the pill.

Six columns:

1. Lesson / Time
2. Monday
3. Tuesday
4. Wednesday
5. Thursday
6. Friday

## First column

- white time cards;
- lesson number in purple circle.

## Weekday names

- larger than ordinary UI text;
- purple color matching logo typography.

## Lesson cells

Compact.

Show only:

- class;
- short course code;
- one small primary status icon.

Do not show Needs attention in Week.

Lesson cell layout should stay one-line where possible.

Example:

`2B   M1 · L3A   →`

Use:

- grade-color background;
- slightly darker border;
- larger class label.

Full cell clickable → Lesson Details.

On mobile, horizontal scroll is allowed.

---

# 26. Month page

No dedicated reference exists.

Continue the same design system.

## Month navigation pill

```text
← Previous month     August 2026     [All classes ▾]     Next month →
```

Use the same translucent pill design.

## Month calendar

Large separate card.

7 weekday columns.

Inside each day cell show compact lesson chips/rows, for example:

- `2B · M1 L3A`
- `8A · U1 S2 L1`

Use grade colors.

Do not use full long lesson cards.

Interaction:

- click a specific lesson → Lesson Details;
- click date / empty part of day → Day for that date.

---

# 27. Classes page

No dedicated reference exists.

Continue the approved visual system.

Use a simple heading/navigation pill if appropriate.

Below it show class cards.

Each card may show:

- class name;
- textbook;
- current Course Map position;
- weekly schedule summary;
- next lesson date.

Example:

```text
8A
Rainbow English 8
Current: Unit 1 · Step 2 · Lesson 1
Tue / Fri
Next: 18 August
```

Do not show the module progress bar on the Classes overview.

Click → Class Details.

---

# 28. Class Details

Show:

- class name;
- textbook;
- current position;
- weekly schedule;
- next lesson;
- remaining Reserve lessons;
- progress bar for current Module / Unit.

Do not show whole-year percentage.

## Tabs

- History
- Course Map

### History

Show lesson rows with:

- date;
- lesson code/title;
- status icon;
- homework summary if useful.

Click → Lesson Details.

### Course Map

Show all Course Map items vertically.

Visually distinguish:

- completed;
- current;
- upcoming;
- reserve.

Add:

**Change current position**

This is a manual recovery/correction tool and requires confirmation.

---

# 29. Lesson Details — navigation pill

Use the approved Lesson Details reference.

The top pill contains:

### Far left
Purple button:

**← Back to day**

This returns to Day for the same date.

### Then
Orange arrow + grey label:

**Previous lesson**

### Center
Example:

**Saturday / 15 August / Lesson 3**

No Edit button here.

Nothing in the navigation pill is directly editable.

### Right
Grey label:

**Next lesson**

+ orange arrow.

Previous / Next lesson only navigate between lessons **within the selected day**.

---

# 30. Lesson Details — top info row

Below the pill, create **four separate cards in one row**.

The page background remains visible between them.

## Time
Narrow card.

## Class
Narrow card.

Use class/grade color.

## Lesson content
Wide card.

Show both:

- structural code;
- human-readable lesson title when available.

Example:

```text
Unit 1 · Step 2 · Lesson 1
Laila Ali and Comparing Progress
```

Inside the same card, on the right:

**Change lesson ▾**

## Status
Separate card.

Show primary status and, if applicable, Needs attention.

---

# 31. Lesson Details — main working area

Two large separate blocks below.

Approximate desktop proportions:

- left: 47%
- right: 53%

The page background must be visible between the two blocks.

---

# 32. Lesson Details — left block

Contains:

## What we did
Large textarea.

## Didn’t finish
Textarea.

Directly below:

`☐ Carry unfinished work to next lesson`

Rules:

- checkbox disabled when Didn’t finish is empty;
- when text appears, checkbox becomes available;
- if text is cleared, checkbox is automatically reset.

## Teacher notes
Large textarea.

All these fields autosave.

---

# 33. Lesson Details — right block

Contains:

## Homework
Large textarea.

## Homework links
For MVP, store links only.

Provide:

**+ Add link**

Each item can show:

- icon;
- title;
- type;
- three-dot menu.

Example items:

- Video: Daily routines
- Vocabulary practice
- Grammar rules
- Useful phrases

## Future-proof data model

Internally name this collection something like:

`homeworkMaterials`

not only `links`.

Future types may include:

- image;
- file;
- video;
- PDF;
- URL.

Do not implement file uploads now.

---

# 34. Autosave

Do not add a large Save button.

Text fields and ordinary notes save automatically to localStorage.

Show subtle status:

- Saving…
- ✓ Saved

Suggested location:
bottom of the right working block.

---

# 35. Lesson action buttons

At the bottom of the right working block:

## Cancel
Coral/red filled button.

Use a clean X/cancel icon.

## Reschedule
Purple filled button.

Use a clean circular-arrow icon.

No Complete button.

---

# 36. Cancelled lesson page state

When a lesson is Cancelled:

replace the Cancel button with:

**Restore lesson**

Do not show Restore on normal lessons.

Restore:

- returns the lesson to normal schedule behavior;
- recalculates the Course Map;
- returns the consumed Reserve;
- status becomes Upcoming or Completed according to current time.

---

# 37. Change lesson behavior

Clicking **Change lesson** opens a dropdown/popover.

Show:

## Current lesson

The current planned lesson.

## Upcoming Course Map lessons

Only not-yet-completed planned lessons.

Show both lesson code and lesson title.

Example:

```text
Unit 1 Step 2 Lesson 2
Popular Sports
```

At the bottom:

**+ Custom lesson**

---

# 38. Reordering to another planned lesson

Example Course Map queue:

```text
A → B → C → D
```

Today is A.

Teacher chooses C.

Result:

- today = C;
- future queue = A → B → D.

A is not lost.

This is only a reorder.

It does **not** consume Reserve capacity.

---

# 39. Custom lesson

Teacher selects:

**+ Custom lesson**

and enters a custom title.

Example:

`Revision games`

Behavior:

- custom topic is used for the current lesson slot;
- original planned lesson returns to the future queue;
- all following planned lessons shift forward;
- one Reserve is consumed.

Before confirmation show:

```text
This will use 1 reserve lesson.
5 reserve lessons will remain.
```

If no reserves remain, show warning.

---

# 40. Cancel lesson

Cancel is a structural action.

Before confirmation:

```text
Cancel this lesson?

1 reserve lesson will be used.
5 reserve lessons will remain.
```

Buttons:

- Keep lesson
- Cancel lesson

Do not ask for a reason.

After cancellation:

- status = Cancelled;
- planned topic moves forward;
- one Reserve is consumed.

---

# 41. No reserves warning

If reserve count is 0 and user attempts Cancel or Custom Lesson:

show a clear warning.

Example:

```text
No reserve lessons left

There is no reserve capacity remaining in this Course Map.
Continuing may push a planned lesson beyond the available yearly schedule.
```

Require explicit confirmation.

Do not silently delete a planned topic.

---

# 42. Restore lesson

Only visible on cancelled lesson pages.

No separate Undo system is required.

Restore:

- removes Cancelled state;
- returns the Reserve capacity;
- recalculates the future queue;
- sets automatic status based on date/time.

---

# 43. Reschedule

Reschedule does **not** consume Reserve capacity.

Open a modal/popover.

Suggested flow:

1. show several upcoming dates;
2. allow `Choose another date…`;
3. after date selection, choose time;
4. detect schedule conflicts;
5. disable conflicting options.

The original event remains marked Rescheduled.

The moved lesson is placed on the selected new date/time.

---

# 44. Weekly schedule

The teacher has a fixed weekly schedule.

Store:

- lesson number;
- start time;
- end time;
- class.

Generate the academic-year schedule from this pattern.

Do not manually hardcode hundreds of dated lesson events.

---

# 45. Academic calendar

Settings must support:

## Academic year
- start date;
- end date.

## School breaks
Date ranges.

## Holidays / No-school days
Individual dates.

Ordinary weekly lessons should not be generated on excluded dates.

---

# 46. Settings

Use tabs:

- Academic Calendar
- Schedule
- Classes
- Course Maps
- Data

## Academic Calendar
Edit year dates, breaks and holidays.

## Schedule
Edit weekly timetable.

## Classes
Manage class metadata.

## Course Maps
Choose grade/course and inspect/edit sequence.

## Data
Backup tools.

---

# 47. Backup

Because MVP uses localStorage, add:

## Export backup
Export all user data as JSON.

## Import backup
Restore from JSON.

This is required for practical safety.

---

# 48. Homework missing logic

Dashboard Homework missing includes lessons where:

```text
primary status = Completed
AND
homework is empty
```

Do not include:

- Cancelled;
- Rescheduled original events.

---

# 49. Continue from previous lesson logic

If:

- `didntFinish` contains text;
- `carryToNextLesson === true`;

then the next real lesson for that class gets:

**Needs attention**

Dashboard shows it under:

**Continue from previous lesson**

The warning should remain relevant only until the carry-over has reached the next lesson. Do not let old warnings remain forever.

---

# 50. Responsive behavior

No sidebar.

## Dashboard mobile
Stack:

1. seasonal/date block;
2. Today block;
3. attention blocks.

## Day mobile
- date pill stays on top;
- lesson rows remain touch-friendly;
- calendar/status panels may stack or collapse.

## Week mobile
Horizontal scroll is allowed.

Do not make text tiny just to fit.

## Lesson Details mobile
- 4 top cards → 2×2 or vertical;
- left/right working columns → single column;
- action buttons remain large and touch-friendly.

---

# 51. Demo data

Keep demo data separate from application logic.

Do not hardcode business logic around the example classes shown in screenshots.

Actual available Course Maps are supplied separately.

---

# 52. MVP exclusions

Do not implement:

- backend;
- accounts;
- authentication;
- cloud DB;
- file/image upload;
- student portal;
- parent portal;
- grades;
- attendance;
- Google Calendar sync;
- AI generation;
- email notifications;
- unnecessary animations;
- mascots or decorative characters.

---

# 53. Development priority

Recommended order:

1. data model;
2. Course Map / reserve logic;
3. localStorage persistence;
4. shared design system;
5. header;
6. Dashboard;
7. Day;
8. Week;
9. Lesson Details;
10. Month;
11. Classes;
12. Class Details;
13. Settings;
14. backup import/export;
15. responsive polish;
16. GitHub Pages deployment.

---

# 54. Acceptance criteria

The MVP is ready when the user can:

- open Dashboard;
- navigate Day / Week / Month;
- filter by grade level;
- open Lesson Details;
- see automatic Upcoming / Completed statuses;
- cancel a lesson;
- restore a cancelled lesson;
- reschedule a lesson;
- choose a different upcoming planned lesson;
- create a Custom Lesson;
- see Reserve count decrease/increase correctly;
- keep Course Map topics without silently losing them;
- edit What we did;
- edit Didn’t finish;
- use Carry unfinished work;
- edit Homework;
- add Homework links;
- edit Teacher notes;
- see autosave status;
- see Needs attention on the next lesson;
- see Homework missing on Dashboard;
- browse class history;
- browse Course Map;
- edit academic calendar;
- edit weekly schedule;
- reload the browser without losing data;
- export backup;
- import backup;
- use the app on mobile;
- publish it successfully to GitHub Pages.

---

# 55. Final reminder

The visual references are deliberately polished.

Do not simplify them into a generic white dashboard.

Preserve:

- the lavender/sunset blurred background;
- the warm pastel palette;
- the cream/light cards;
- thin borders;
- soft shadows;
- generous rounded corners;
- approved grade colors;
- elegant serif headings;
- purple navigation controls;
- orange previous/next arrows;
- fully rounded translucent date-navigation pills;
- the approved status-icon language.

Do not add new decorative concepts that are not present in the references.
