#!/usr/bin/python3
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import subprocess


SOURCE = Path(__file__).resolve().parent
INSTALL = Path('/usr/local/lib/pandaos-build-scheduler')
CONFIG = Path('/etc/pandaos-build-scheduler')
LEGACY = Path('/usr/local/lib/pandaos-android-queue')
BACKUPS = Path('/var/backups/pandaos-build-scheduler')
LEGACY_ENTRIES = [Path('/usr/local/bin/pandaos-android-queue'), LEGACY / 'guard.py']


def backup(target, stamp):
    if target.exists() or target.is_symlink():
        saved = BACKUPS / stamp / str(target).lstrip('/')
        saved.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(target, saved, follow_symlinks=False)


def place(source, target, mode, stamp):
    target.parent.mkdir(parents=True, exist_ok=True)
    backup(target, stamp)
    temporary = target.with_name(target.name + '.scheduler-new')
    shutil.copyfile(source, temporary)
    temporary.chmod(mode)
    temporary.replace(target)


def systemctl(*args, check=True):
    return subprocess.run(['/usr/bin/systemctl', *args], check=check)


def first_backup_with(path):
    for stamp in sorted(p.name for p in BACKUPS.iterdir()) if BACKUPS.exists() else []:
        saved = BACKUPS / stamp / str(path).lstrip('/')
        if saved.exists() and b'pandaos-build-scheduler' not in saved.read_bytes():
            return saved
    return None


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--switch', action='store_true', help='route pandaos-android-queue and the Java/SDK guards to the scheduler')
    parser.add_argument('--rollback', action='store_true', help='restore the legacy single-slot broker entry points')
    parser.add_argument('--no-restart', action='store_true')
    parser.add_argument('--dry-run', action='store_true', help='with --rollback: show and check the files that would be restored')
    args = parser.parse_args()
    if os.getuid() != 0:
        parser.error('run using sudo -n')
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    if args.rollback and args.dry_run:
        plan = {}
        for entry in LEGACY_ENTRIES:
            saved = first_backup_with(entry)
            if not saved or b'pandaos-build-scheduler' in saved.read_bytes():
                raise SystemExit('no legacy backup for ' + str(entry))
            plan[str(entry)] = str(saved)
        unit = subprocess.run(['/usr/bin/systemctl', 'is-enabled', 'pandaos-android-queue.service'],
                              capture_output=True, text=True).stdout.strip()
        print(json.dumps(dict(restore=plan, legacy_service=unit), indent=2))
        raise SystemExit(0)
    if args.rollback:
        for entry in LEGACY_ENTRIES:
            saved = first_backup_with(entry)
            if not saved:
                raise SystemExit('no legacy backup for ' + str(entry))
            backup(entry, stamp)
            shutil.copy2(saved, entry.with_name(entry.name + '.rollback'))
            entry.with_name(entry.name + '.rollback').replace(entry)
        systemctl('enable', '--now', 'pandaos-android-queue.service')
        print(json.dumps(dict(rolled_back=[str(e) for e in LEGACY_ENTRIES], backups=str(BACKUPS / stamp)), indent=2))
        raise SystemExit(0)
    for name in ['scheduler.py', 'guard.py', 'android_update.py', 'remote_worker.py', 'worker.mjs', 'play_release.py',
                 'ios_release.py']:
        place(SOURCE / name, INSTALL / name, 0o755, stamp)
    place(SOURCE / 'pandaos-build-scheduler', Path('/usr/local/bin/pandaos-build-scheduler'), 0o755, stamp)
    place(SOURCE / 'pandaos-android-update', Path('/usr/local/bin/pandaos-android-update'), 0o755, stamp)
    for name in ['pandaos-play-release', 'pandaos-ios-release']:
        place(SOURCE / name, Path('/usr/local/bin') / name, 0o755, stamp)
    for name in ['pandaos-build.slice', 'pandaos-build-scheduler.service']:
        place(SOURCE / name, Path('/etc/systemd/system') / name, 0o644, stamp)
    CONFIG.mkdir(exist_ok=True)
    if not (CONFIG / 'config.json').exists():
        (CONFIG / 'config.json').write_text(json.dumps({'user': 'admin'}, indent=2) + '\n')
    subprocess.run(['/usr/bin/systemd-analyze', 'verify', str(SOURCE / 'pandaos-build-scheduler.service'),
                    str(SOURCE / 'pandaos-build.slice')], check=True)
    systemctl('daemon-reload')
    systemctl('enable', 'pandaos-build-scheduler.service')
    if not args.no_restart:
        systemctl('restart', 'pandaos-build-scheduler.service')
    if args.switch:
        place(SOURCE / 'pandaos-android-queue', LEGACY_ENTRIES[0], 0o755, stamp)
        place(SOURCE / 'guard.py', LEGACY_ENTRIES[1], 0o755, stamp)
    print(json.dumps(dict(installed=str(INSTALL), switched=args.switch, backups=str(BACKUPS / stamp)), indent=2))
