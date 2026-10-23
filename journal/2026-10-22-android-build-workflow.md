# Persistent Android builds

## Goal

Keep normal APK updates below three minutes where possible. Preserve tests, signatures and
app data. Reuse native work across caller worktrees, avoid routine clean builds, and use
Metro/Fast Refresh for JS development. The existing installation build was not interrupted.

## Causes and implementation

The former host script created a checkout per revision and always ran Expo prebuild with
`--clean`. Native outputs disappeared or lived at another absolute path. Shared Gradle
dependency downloads survived, but that did not preserve project incremental state. CMake
outputs contain checkout paths; copying `.cxx` between paths does not solve that.
[Gradle build cache](https://docs.gradle.org/current/userguide/build_cache.html) and
[cache relocation](https://docs.gradle.org/current/userguide/build_cache_debugging.html)
explain the distinction.

The release builder now stays at `.worktrees/android-build`; development has a separate
`.worktrees/android-build-debug`. The host runner synchronizes source without changing
unchanged file timestamps, keeps dependencies and native outputs, enables the shared Gradle
task cache, and keeps Metro transforms in a persistent builder directory. A matching APK
receipt reuses the actual hash- and signer-verified artifact. Bare CLI invocation builds the
canonical repository; unsupported older sources fail before any builder mutation.

Native configuration fingerprints use current file bytes, including uncommitted plugins.
Package scripts and proven exact local workspace version metadata do not force reinstall or
clean prebuild. Actual dependency resolutions, native app versions and configuration changes
do. Bootstrap checked 50 native and 10 generated-project hashes against the installed build
before adopting metadata and migrating the known-equivalent marker. It did not run prebuild
or invent an APK/app-dependency cache hit. The custom diff module now respects the existing
ARM64 property; its Gradle task plan contains no other ABI tasks.

Hermes stalled on one generated 13,880,147-byte validator function. The generator now extracts
discriminated-union helpers; validation semantics and wire schemas stay unchanged. Fourteen
focused validation tests passed. The fixed full bundle compiled in 16.7 seconds with the same
compiler flags. Original application sources differed in sidebar files, so no controlled
compiler speedup ratio is claimed. JSC would require fragile vendor patches on this stack;
Hermes remains in use.

## Measurements

| Case                                | Work time | Definition                                                                                                                                                     |
| ----------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Historical cold release             | 23m53s    | Job292, fresh native worktree with existing dependency-download cache;819tasks executed.                                                                       |
| Historical warm release             | 1m59.035s | Job306, frozen JS overlay in the same builder;45executed/774up-to-date. Queue wait9m32.747s excluded.                                                          |
| First permanent-workflow activation | 4m29.773s | Job1090; workspace build35.631s, Metro14.674s, Hermes18.029s, maps6.519s, Gradle180.789s.480executed/29fromcache/768up-to-date.                                |
| Actual changed-JS warm APK          | 1m12.795s | Same job, source from a different caller worktree; no npm/workspace rebuild. Metro12.268s, Hermes16.853s, maps5.587s, Gradle33.633s.40executed/1237up-to-date. |
| Exact signed APK reuse              | 1.914s    | Matching source/config/APK/signer; no Metro, Hermes or Gradle execution.                                                                                       |
| Initial separate debug native build | 9m47s     | Job1093;744tasks,590executed/154fromcache. Build and signature passed; subsequent installDebug was rejected by the phone.                                      |
| Physical Fast Refresh               | 0.296s    | Zotac, five visible edits; state/ref/PID retained. Median296ms to frame marker;675ms to captured display (upper bound incl. ADB).                              |

The permanent workflow has one actual changed-JS sample and one artifact hit. Outer queue wait
was 0.934s, excluded. Receipts prove the changed module was bundled and its verified Hermes
bytecode entered the signed APK. No experimental release APK was installed. Temporary probes
were restored in both caller and builder; the experimental receipt was invalidated afterward.

At23:24CEST a separate host task migrated the public queue to the adaptive build scheduler,
added ccache and changed resource admission. New runs recorded memory.high11GiB,
memory.max12GiB and no per-job CPU quota. The runner kept one Gradle worker, no parallel tasks,
2GiB heap and ActiveProcessorCount2. Old and new times are not a controlled speedup comparison.
Host scheduler settings belong to its separate task. No host limits were changed here.

## Verification and current blocker

The final host workflow has26passing focused tests, including source ownership, unchanged
mtimes, caches, external dependency invalidation, signatures, device selection, missing debug
packages and failed-install timing/cache preservation. Python and shell syntax passed. The
compiler/prebuild fix has focused tests, typecheck, lint, format, advisor review and the actual
ARM64 task-plan proof. Nine existing CI-contract tests passed after adding the Python tests to
the existing CI job. Hosted CI and the full suite were not run.

Xiaomi production update was installed and viewed with the existing chat restored. The separate
debug APK passed signing checks. Both legacy TCP and authenticated WLAN streaming installation
returned `INSTALL_FAILED_USER_RESTRICTED` while the phone was unlocked. Device logs identify
MIUI's `AdbInstallActivity`; its confirmation says “Installieren über USB” even over WLAN.
The bounded non-streaming WLAN installation then succeeded in17.479s. A screenshot captured
the confirmation; this does not prove that non-streaming alone resolved the earlier refusal.
Installed debug APK hash matches the signed artifact. Production APK hash, app identity and
first-install time stayed identical. No settings were weakened, no package uninstalled and
no APK rebuilt for installation. Bare `--install` now resolves the known Xiaomi's connected
authenticated WLAN endpoint and verifies its physical serial instead of using port5555.

The first two real Metro runs failed with `ENOSPC`, errno-28, from Node's `watch` syscall.
This was inotify exhaustion, not disk space or an `EMFILE` process-descriptor failure.
The scoped exclusion keeps Expo defaults and all6795checked bundled runtime paths visible;
it reduces observations from23219to17076directories. Twenty-four focused cases, formatting
and lint passed. That reduction alone did not fit the old shared budget.

A fresh root read-only audit used kernel `kcmp(KCMP_FILE)` to distinguish open file descriptions.
With Metro alive, UID1001 had77330watch registrations across131independent inotify instances.
One Metro PID held17076watches; the other processes already used60254, leaving5282under the
old65536cap. No duplicate Metro cwd/port was present. The PandaOS daemon, concurrent agent
processes and Syncthing were the largest groups. Independent agents watch common skills and
configuration: one physical skills directory appeared in22groups and `/etc` in33. Those were
independent watches, not inherited-descriptor double counting. The sampled path audit resolves
4000handles; its coverage is bounded. It found no justification to stop another agent/service.

Marushan explicitly authorized persistent host tuning. The primary Zotac now uses
`/etc/sysctl.d/99-pandaos-inotify.conf`:262144watches and512instances. Available RAM exceeded30GiB
on this64GBhost. A conservative1.5KiB-per-watch capacity allowance totals384MiB, below1%of RAM;
it is not measured or preallocated memory. The queue-events cap remains16384. Readback and
persistent-file bytes matched; only these two inotify keys changed. No service restarted.
The shared host setting benefits every agent and React Native project. Operational details
belong to [File observation](../docs/file-observation.md#shared-linux-capacity).

After tuning, job1180 completed five real component edits on the WLAN-connected Xiaomi:
median302ms, range264–369ms to the physical next-frame log marker. A second run added a visible
token and an actual screenshot after every edit: median296ms, range290–331ms to the frame marker;
median675ms, range670–735ms until the captured screen was read. All five images were actually
viewed and show HMR edit-1through edit-5. The screenshot time is an upper bound including ADB
encoding/transport; neither metric is pure pixel-paint latency. PID, component state and ref
identity stayed fixed through each set of five edits. First load is separate and includes
bringing the test app forward; it is not a Fast Refresh sample.

Both runs used the existing signed debug APK. No APK rebuild, uninstall, data clear or security
setting change occurred. Production and debug APK hashes, first-install times and app IDs
matched before/after. All probes and layout bytes were restored exactly; only owned Metro,
logcat and reverse mappings were cleaned up. The normal production app was brought forward
after testing. The captures show the temporary marker over the debug startup/Expo introduction
screen, not an app-wide visual approval. An existing native debug-context teardown exception
was logged during initial reload setup; it did not occur during the five state-preserving
edits and no native source was changed in this watcher task.

Zotac remains the primary development host. No independent Mac development checkout was
created. An additive optional Mac worker is being integrated into the existing scheduler;
activation and final remote-job evidence remain pending. The stopped original scheduler
session remains stopped. This work uses its hash-recorded source baseline in an isolated
implementation worktree and does not introduce a second broker or queue.

## Evidence and ownership

Current state: `.dev/claude-account-rollout/checkpoint.json`. Production install proof:
`.dev/android-build-result/`. Permanent-runner measurements and per-run receipts:
`.dev/android-workflow/`. Native fix commit: `93d4a4b08223aeeee662ca29c419c8ec9475bae0`.
Persistent release and debug worktrees intentionally retain native caches under this task.
Frozen app-source overlays are build-only and must never be staged. Agent sessions and
browser tabs stay open. Debug installation is complete; the physical Fast Refresh measurement
is verified on the Zotac; optional Mac scheduler-worker activation remains in progress.
