#!/usr/bin/python3
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import pwd
import shutil
import subprocess
import sys


SOURCE = Path(__file__).resolve().parent
INSTALL = Path('/usr/local/lib/pandaos-android-queue')
CONFIG = Path('/etc/pandaos-android-queue')


def install_file(source, target, mode=0o644):
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        saved = BACKUP / str(target).lstrip('/')
        saved.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(target, saved)
    shutil.copyfile(source, target)
    target.chmod(mode)


def write_file(target, content, mode=0o644):
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        saved = BACKUP / str(target).lstrip('/')
        saved.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(target, saved)
    temporary = target.with_name(target.name + '.android-queue-new')
    temporary.write_text(content)
    temporary.chmod(mode)
    temporary.replace(target)


def install_link(target, source):
    if not target.parent.resolve().is_relative_to(INSTALL.resolve()):
        raise ValueError('facade link must stay inside the installation directory')
    if target.is_symlink():
        if target.lstat().st_uid != os.geteuid():
            raise PermissionError('refusing to replace a link owned by another account: ' + str(target))
        if target.readlink() == source:
            return
        saved = BACKUP / str(target).lstrip('/')
        saved.parent.mkdir(parents=True, exist_ok=True)
        if not saved.exists() and not saved.is_symlink():
            shutil.copy2(target, saved, follow_symlinks=False)
    elif target.exists():
        raise FileExistsError('refusing to replace a non-symlink facade entry: ' + str(target))
    temporary = target.with_name(target.name + '.android-queue-new')
    if temporary.is_symlink() or temporary.exists():
        raise FileExistsError('facade update already exists: ' + str(temporary))
    try:
        temporary.symlink_to(source)
        temporary.replace(target)
    finally:
        if temporary.is_symlink():
            temporary.unlink()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--user', required=True)
    parser.add_argument('--java-home', required=True)
    parser.add_argument('--android-home', required=True)
    args = parser.parse_args()
    if os.getuid() != 0:
        parser.error('run using sudo -n')
    account = pwd.getpwnam(args.user)
    real_java = Path(args.java_home).resolve()
    sdk = Path(args.android_home).resolve()
    if not (real_java / 'bin/java').is_file() or not (sdk / 'emulator/emulator').is_file():
        parser.error('installed JDK and Android SDK required')
    status = subprocess.run(['/usr/bin/systemctl', 'is-active', 'pandaos-android-queue.service'], capture_output=True)
    if status.returncode == 0:
        parser.error('queue already active; cancel or drain its jobs and stop only its service before updating')
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    BACKUP = Path('/var/backups/pandaos-android-queue') / stamp
    BACKUP.mkdir(parents=True, mode=0o700)
    for name in ['android_queue.py', 'guard.py']:
        install_file(SOURCE / name, INSTALL / name, 0o755)
    install_file(SOURCE / 'pandaos-android-queue', Path('/usr/local/bin/pandaos-android-queue'), 0o755)
    for name in ['pandaos-android.slice', 'pandaos-android-queue.service']:
        install_file(SOURCE / name, Path('/etc/systemd/system') / name)
    tools = dict(java=str(real_java / 'bin/java'), sdkmanager=str(sdk / 'cmdline-tools/latest/bin/sdkmanager'),
                 avdmanager=str(sdk / 'cmdline-tools/latest/bin/avdmanager'), emulator=str(sdk / 'emulator/emulator'))
    gradle = shutil.which('gradle', path='/usr/local/bin:/usr/bin:/bin')
    if gradle:
        tools['gradle'] = gradle
    write_file(CONFIG / 'config.json', json.dumps(dict(user=args.user, real_java_home=str(real_java),
                                                     android_home=str(sdk), tools=tools), indent=2) + '\n')
    write_file(CONFIG / 'service.env', 'QUEUE_USER=' + args.user + '\n')
    facade = INSTALL / 'jdk'
    facade.mkdir(parents=True, exist_ok=True)
    for path in real_java.iterdir():
        if path.name == 'bin':
            continue
        link = facade / path.name
        install_link(link, path)
    (facade / 'bin').mkdir(exist_ok=True)
    for path in (real_java / 'bin').iterdir():
        link = facade / 'bin' / path.name
        install_link(link, INSTALL / 'guard.py' if path.name == 'java' else path)
    (INSTALL / 'bin').mkdir(exist_ok=True)
    for name in ['java', 'gradle', 'emulator', 'sdkmanager', 'avdmanager']:
        link = INSTALL / 'bin' / name
        install_link(link, INSTALL / 'guard.py')
    sdk_facade = INSTALL / 'sdk'
    sdk_facade.mkdir(exist_ok=True)
    for path in sdk.iterdir():
        if path.name == 'emulator':
            continue
        link = sdk_facade / path.name
        install_link(link, path)
    (sdk_facade / 'emulator').mkdir(exist_ok=True)
    for path in (sdk / 'emulator').iterdir():
        link = sdk_facade / 'emulator' / path.name
        install_link(link, INSTALL / 'guard.py' if path.name == 'emulator' else path)
    env = dict(JAVA_HOME=str(facade), ANDROID_HOME=str(sdk_facade), ANDROID_SDK_ROOT=str(sdk_facade),
               PANDAOS_ANDROID_QUEUE_BIN=str(INSTALL / 'bin'))
    write_file(CONFIG / 'agent-env.json', json.dumps(env, indent=2) + '\n')
    write_file(INSTALL / 'env.sh', '\n'.join("export " + k + "='" + v + "'" for k, v in env.items()) +
               '\nexport PATH="$PANDAOS_ANDROID_QUEUE_BIN:$JAVA_HOME/bin:$PATH"\n')
    gradle_home = Path(account.pw_dir) / '.gradle'
    gradle_home.mkdir(exist_ok=True)
    os.chown(gradle_home, account.pw_uid, account.pw_gid)
    props = gradle_home / 'gradle.properties'
    settings = {'org.gradle.daemon': 'false', 'org.gradle.parallel': 'false', 'org.gradle.workers.max': '1',
                'org.gradle.jvmargs': '-Xmx3g -XX:MaxMetaspaceSize=768m -XX:ActiveProcessorCount=2',
                'kotlin.compiler.execution.strategy': 'in-process',
                'kotlin.daemon.jvmargs': '-Xmx1g -XX:ActiveProcessorCount=2'}
    lines = props.read_text().splitlines() if props.exists() else []
    lines = [line for line in lines if line.split('=', 1)[0].strip() not in settings]
    write_file(props, '\n'.join(lines + [key + '=' + value for key, value in settings.items()]) + '\n', 0o600)
    os.chown(props, account.pw_uid, account.pw_gid)
    subprocess.run(['/usr/bin/systemd-analyze', 'verify', str(SOURCE / 'pandaos-android-queue.service'),
                    str(SOURCE / 'pandaos-android.slice')], check=True)
    subprocess.run(['/usr/bin/systemctl', 'daemon-reload'], check=True)
    subprocess.run(['/usr/bin/systemctl', 'enable', '--now', 'pandaos-android-queue.service'], check=True)
    print(json.dumps(dict(installed=str(INSTALL), backups=str(BACKUP), env=str(CONFIG / 'agent-env.json')), indent=2))
