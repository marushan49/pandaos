# OOM-Absicherung, 11. Oktober 2026

## Ursache der SSH-Hänger am 9. Oktober

- Der Emulator `chillbro-editor` lief per `systemd-run --user` ohne Speicherlimit und wuchs auf 26,6 GB.
- Der Kernel beendete zuerst Chrome aus PandaOS (`oom_score_adj 300`), nicht den Emulator.
- `systemd-oomd` beendete fünfmal den ganzen `pandaos.service`. Grund: Druck in `user@1001.service` über 50 % für 20 Sekunden.
- Der sshd-Listener hat schon `oom_score_adj -1000`. SSH hing wegen Thrashing, sshd wurde nicht beendet.

## Messwerte Daemon

- Der Daemon loggt alle 30 Sekunden `memory` und `eventLoopDelay` in `~/.pandaos/daemon.log` (Modul `websocket-server`).
- 10./11. Oktober: `heapUsed` 1,22 bis 1,40 GB, über 2 Stunden etwa stabil. Event-Loop p99 12 bis 30 ms, Maximum 198 ms.
- 8 Plugin-Prozesse brauchen zusammen 2,4 GB. Ursache offen.

## Umgesetzt

- Die Android-Queue deckelt Emulatoren seit dem 9. Oktober (`pandaos-android.slice`, MemoryHigh 6G, MemoryMax 8G).
- Neu: `~/.config/systemd/user/chillbro-.service.d/memory.conf` und `kin-.service.d/memory.conf` mit MemoryHigh 6G und MemoryMax 8G. Gilt auch für transiente Units, geprüft mit `chillbro-limitprobe` und `kin-limitprobe`.
- `system.slice` und `ssh.service`: MemoryMin 256M, geprüft über `memory.min`.
- `user@1001.service`: ManagedOOMMemoryPressureLimit 80 % statt 50 %, `oomctl` zeigt 80 %.
- zram: `systemd-zram-generator` 0.3.2, 16 GB, zstd, Priorität 100 vor `/swapfile`. Version 0.3 kennt `zram-size` nicht und nimmt sonst 4 GB. Deshalb stehen in `/etc/systemd/zram-generator.conf` die Schlüssel `zram-fraction` und `max-zram-size`.

## Bewusst nicht umgesetzt

- `ManagedOOMPreference=avoid` auf `pandaos.service` wirkt unter systemd 249 nicht, weil die cgroup uid 1001 gehört.
- Kein MemoryMax auf `pandaos.service`: Ein cgroup-OOM dort beendet alle Agents.
