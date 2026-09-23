# Real-time data path

How report data gets from a finished fastq to a pixel, and why it is built this
way. Read this before changing anything in `server/taxonstore.mjs`,
`server/protocol.mjs`, `src/store/taxa.js` or `src/services/frames.js` — those
four files are one system and they have to agree.

## The problem this replaced

A sequencing run of 800 fastqs across ~24 barcodes used to drive the browser tab
to about 1.5 GB and make the UI visibly lag. Three compounding causes:

1. **The wire.** `full.report` was re-sent in full, as TSV text, after every
   classified fastq. Each rewrite is the *whole cumulative report*, so the same
   growing document crossed the socket hundreds of times — roughly 500 MB over a
   run, on a channel that also had to carry job status and keepalive pings.
2. **The heap.** Each push was parsed into ~30k row objects per sample, retained
   twice (a full snapshot plus a filtered view), with every taxon name and
   lineage string duplicated in every sample and every copy.
3. **The DOM.** Every tab stayed mounted once visited, each deep-watching the
   whole dataset, each drawing one SVG element per taxon per sample. A single
   arriving report re-rendered thousands of nodes across charts nobody was
   looking at.

## The shape now

```
  fastq classified
        │
        ▼
  full.report on disk
        │  (sample.mjs sendData)
        ▼
  taxonStore.ingest()            server/taxonstore.mjs
        │  parse once, diff against previous
        ▼
  per-run dictionary + per-sample Int32Arrays
        │
        ▼
  protocol.flush()               server/protocol.mjs
        │  per-connection delta, scoped to that client's viewport,
        │  batched on a load-adaptive interval, gated on acks
        ▼
   socket: one `mtx:frame` event
        │
        ▼
  FrameClient._drain()           src/services/frames.js
        │  applied inside an 8ms-per-animation-frame budget, acked after apply
        ▼
  taxaStore                      src/store/taxa.js
        │  columnar, non-reactive; only a version counter is reactive
        ▼
  taxaStore.query()              hydrates ONLY the rows about to be drawn
        │
        ▼
  canvas                         src/render/canvasChart.js
```

## Key invariants

Break any of these and the symptom is *silently wrong numbers*, not a crash.

**The client's state is defined by its cursor.** Every connection has, per
sample, `{ version, mode, topN, visible }`. A delta is only ever computed
against that cursor. If either side throws its state away — the user switches
runs, a sample is deleted — **both** sides must reset together
(`FrameClient.selectRun()` ↔ `Connection.selectRun()` / `protocol.resetRun()`).

**The top-N window is itself a delta.** In `top` mode the client holds the N
highest-count taxa. That set churns: a taxon can enter or leave the window
without its own counts changing in that generation. `encodeFor()` therefore
diffs the *window* as well as the values — entering taxa are sent in full,
leaving taxa are sent as deletions. Sending only changed values leaks, and the
client's row count grows without bound. There is a regression test for exactly
this (`bench/deltaparity.mjs`, scenario 1).

**Dictionary before taxa.** Taxon indices are meaningless without the dictionary
entry that defines them. `flushConnection()` encodes the dictionary *after* the
taxa (so it captures anything newly interned by that encode) but places it in
the same frame, and the client applies `dict` before `taxa`. Do not split them
across frames.

**Viewport scoping is an optimisation, never an authorisation check.** A sample
this connection has never sent anything for gets its first payload regardless of
what the client last said was visible (`Connection.modeFor`). Without that rule
two individually sensible behaviours deadlock — the server waits for the client
to declare a sample visible, the client waits for data before it can render and
therefore declare it. A sample appearing after the last viewport report (a new
barcode mid-run, or a run created after the client connected) satisfies neither
and is stranded until something unrelated makes the client republish its
viewport. Switching tabs did it, which is what "I have to go to Heatmap and back
before it renders" was. Regression test: `bench/livesample.mjs`.

**Taxa and job queue must arrive together.** A sample with taxon data but an
empty job queue is impossible in a steady state — the data had to come from a
job — so if the UI ever shows one, frames were lost. It happens when the job
frames were emitted at a moment the connection could not receive them: before it
selected the run, or before the sample had finished initialising and had a queue
to report. Two mechanisms keep it consistent, and both matter:

* *Proactive* — `flushConnection` attaches a sample's queue and rollup to that
  sample's FIRST taxa payload, via the `sampleProvider` injected in `index.mjs`.
  The row is right the moment it appears.
* *Reactive* — the client detects the contradiction (`checkQueueConsistency`)
  and asks for `mtx:resync`, rate-limited per sample. This catches any future
  race in the same class rather than only the ones known today.

Regression tests: `bench/livesample.mjs`, scenarios 5 and 6.

**Off-screen means skip, not discard.** `flushConnection` leaves a skipped
sample's dirty flag set. Clearing it dropped the update outright, so delivery
depended on the client happening to republish its viewport later rather than on
the sample simply scrolling back into view.

**Ack after apply, not on receipt.** The server's flow-control window is meant
to track how fast the client can *absorb* updates. Acking on arrival turns
backpressure into a no-op and the client falls behind invisibly.

**Nothing bulk becomes reactive.** Vue 2 walks every object handed to it and
installs a getter/setter pair plus a `Dep` per key. A 30k-row report costs
~270 MB of observer overhead alone. The store keeps typed arrays outside Vue and
exposes only `state.tick` and per-sample scalars. If you ever find yourself
putting a row array into `data()` or passing one as a prop, that is the
regression.

## Verifying changes

```
node server/bench/deltaparity.mjs      # correctness: client == server, 65 checks
node server/bench/e2eframe.mjs         # integration: real pipeline, mock socket
node server/bench/clientstore.mjs      # client store: queries, hierarchy, hasTaxon
node server/bench/livesample.mjs       # live updates: new samples mid-run
node server/bench/frameload.mjs        # 800-file load profile
```

`deltaparity` is the important one — it replays a run through the real encoder
and asserts the client's reconstruction matches the server's table exactly after
every push, including stalls deep enough to blow the delta history, viewport
changes mid-run, and taxa disappearing on a rerun.

Measured on the 800-file / 24-sample / 30k-taxon profile:

| | before | after |
|---|---|---|
| wire volume, whole run | 500 MB | 6.4 MB (top-N viewer) |
| mean update frame | 626 KB | 5.2 KB |
| client taxon memory | ~500 MB | ~13 MB |
| chart tabs mounted | all visited | 1 |
| DOM nodes per sample chart | ~4 per taxon | 1 |

## Things that are deliberately NOT optimised

* **Sunbursts stay on d3/SVG**, cards included. They were briefly moved to
  canvas for the paint win; that lost the animated zoom transition, the legend
  (populated as a side effect of the d3 path's `refreshLegend`) and the zoom API
  that lets one card's legend drive every other card. Those are what make the
  view usable. Cost is contained by only drawing sunbursts that are on screen
  and by mounting one tab at a time. Bar/lollipop panels, which have no
  equivalent interaction to lose, do render on canvas.
* **Visibility fails open.** `isVisible()` returns true until the
  IntersectionObserver has reported at least once. Answering "not visible"
  during that async gap meant a panel was skipped by `redraw()` and — because
  the legend is populated by drawing — sat on its "building…" placeholder
  forever. One redundant draw is cheaper than that.
* **Control-plane events** (alerts, run lists, database installs, health) are
  still individual broadcasts in `messenger.mjs`. There are a handful per
  session; folding them into the frame would add coupling for no gain.
* **Report parsing cost** (~9 ms per push) still happens on the server's event
  loop. It is the largest remaining single cost. If it ever becomes a problem
  the fix is a worker thread, not a different encoding — but note it is now paid
  once per run rather than once per connected browser.
