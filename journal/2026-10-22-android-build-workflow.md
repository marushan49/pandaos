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

| Case                                | Work time   | Definition                                                                                                                                                     |
| ----------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Historical cold release             | 23m53s      | Job292, fresh native worktree with existing dependency-download cache;819tasks executed.                                                                       |
| Historical warm release             | 1m59.035s   | Job306, frozen JS overlay in the same builder;45executed/774up-to-date. Queue wait9m32.747s excluded.                                                          |
| First permanent-workflow activation | 4m29.773s   | Job1090; workspace build35.631s, Metro14.674s, Hermes18.029s, maps6.519s, Gradle180.789s.480executed/29fromcache/768up-to-date.                                |
| Actual changed-JS warm APK          | 1m12.795s   | Same job, source from a different caller worktree; no npm/workspace rebuild. Metro12.268s, Hermes16.853s, maps5.587s, Gradle33.633s.40executed/1237up-to-date. |
| Exact signed APK reuse              | 1.914s      | Matching source/config/APK/signer; no Metro, Hermes or Gradle execution.                                                                                       |
| Initial separate debug native build | 9m47s       | Job1093;744tasks,590executed/154fromcache. Build and signature passed; subsequent installDebug was rejected by the phone.                                      |
| Physical Fast Refresh               | Unconfirmed | Five state-preserving edits prepared; blocked until the Xiaomi is unlocked and the debug client installed.                                                     |

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

The final host workflow has23passing focused tests, including source ownership, unchanged
mtimes, caches, external dependency invalidation, signatures, device selection, missing debug
packages and failed-install timing/cache preservation. Python and shell syntax passed. The
compiler/prebuild fix has focused tests, typecheck, lint, format, advisor review and the actual
ARM64 task-plan proof. Nine existing CI-contract tests passed after adding the Python tests to
the existing CI job. Hosted CI and the full suite were not run.

Xiaomi production update was already installed and viewed with the existing chat restored.
APK signer, app identity and first-install time matched the prior installation. The separate
debug APK also built and passed signing checks. `installDebug` then returned
`INSTALL_FAILED_USER_RESTRICTED`. Inspection showed a dozing phone with keyguard visible and
screen off; the actual screenshot was viewed and was black. The debug package is absent.
No additional build is needed. An async request asks the user to unlock the Xiaomi; the exact
OS confirmation/restriction must be resolved during installation-only retry. Build-stage
measurements and a valid signed APK are now retained even when installation fails.

The prepared Fast Refresh driver preserves PID, component state and ref identity through five
actual edits. It reports first Metro/full-bundle startup separately, includes ADB log transport
in the update latency and measures a next-frame commit marker rather than pixel paint. It
removes inherited CI so Expo file watching remains enabled. It restores source bytes, removes
only its own reverse mapping and stops only its own Metro/logcat children. It has not run at
the device yet; no Fast Refresh time is claimed.

## Evidence and ownership

Current state: `.dev/claude-account-rollout/checkpoint.json`. Production install proof:
`.dev/android-build-result/`. Permanent-runner measurements and per-run receipts:
`.dev/android-workflow/`. Native fix commit: `93d4a4b08223aeeee662ca29c419c8ec9475bae0`.
Persistent release and debug worktrees intentionally retain native caches under this task.
Frozen app-source overlays are build-only and must never be staged. Agent sessions and
browser tabs stay open. Installation-only retry and Fast Refresh remain pending user input.
