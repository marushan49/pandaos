Shows how much RAM and swap the machine running this daemon has free, and what uses them.

The sidebar footer shows the free RAM. The screen shows memory, swap and load, the largest processes grouped by owner, and the open connections per listening port. A cost card estimates what a typical heavy start takes. A short narrative sums up the current state and the last 30 minutes.

Requires Linux with /proc, ps and ss. The daemon samples every 30 seconds and keeps one hour of samples in memory. The plugin reads only the host of the daemon it runs in. For another host, install it there with `paseo --host <url> plugin install <path on that host>`; the app then shows one Host screen per host. Start verdicts scale with the host's RAM, so a 4 GB server is judged against its own size.

Stop ends emulators, watchers, dev servers, Gradle and daemons other than this one. A process in its own systemd unit stops through `systemctl --user stop`, which ends the whole unit. A process in the daemon's own unit gets SIGTERM; for an extra daemon the signal goes to its Paseo Supervisor so it does not restart. This daemon and its parents never get a Stop button, and neither does any daemon with the same `PASEO_HOME`. Every stop is logged.

Browser tabs lists the daemon browser's tabs from `browser-profiles/open-tabs.json`. Loaded tabs hold 0.1 to 0.4 GB each. Saved tabs that are not loaded cost nothing now but reopen when an agent uses the browser in their workspace. Close and the age of each tab need a host whose plugin API has `browser.execute`; older hosts show the list only. Listing tabs does not reopen saved ones.

The Agents card lists this daemon's agents. A process belongs to an agent only through the `PASEO_AGENT_ID` variable in its environment, which the plugin reads and nothing else. Check need asks an idle agent whether it still needs its processes, which costs one turn of that agent per click. A cheap triage agent (`codex-plus/gpt-6-luna`, low effort) then judges the answer. Automatic stop is narrow. Under acute pressure (less than 5 GB available and swap at least 95% full), an emulator with a systemd unit and no ADB connection for 30 minutes gets `systemctl --user stop`. Idle time counts from when the plugin first sees the emulator idle. Each automatic or manual stop is logged to `~/.pandaos/host-monitor/stopped.log`. Create `~/.pandaos/host-monitor/autostop-off` to turn it off. The daemon allows plugin clients one agent list per 30 seconds, so the plugin reuses its last list for 31 seconds.

The plugin reads process names, systemd unit names, working directories, listening ports and connection counts. It never shows command lines, so arguments that contain tokens are not displayed. Emulators show their AVD name.

A process's memory is its proportional share of RAM (PSS) where the kernel reports it, so shared libraries count once. Otherwise the resident size is used.

The cost estimates come from measurements on the Zotac on 2026-10-09 and live in server/profiles.ts. A start gets the verdict Fits when at least 10 GB stay free after the expected use and at least 5 GB stay free at the peak. It gets Avoid when less than 5 GB stay free after the expected use, and Tight otherwise. Every verdict is Avoid while less than 8 GB is available. The peak value shows how far a start can grow when nothing limits it.
