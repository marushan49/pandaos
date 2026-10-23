#!/usr/bin/python3
import argparse
import fnmatch
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, '/usr/local/lib/pandaos-build-scheduler')
from scheduler import isolated


DEPENDENCY = ['package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lock', 'bun.lockb',
              '*.gradle', '*.gradle.kts', 'gradle.properties', 'libs.versions.toml', 'gradle-wrapper.properties',
              'pubspec.yaml', 'pubspec.lock', 'app.json', 'app.config.js', 'app.config.ts', 'eas.json',
              'patches/*', '*/patches/*', 'plugins/*', '*/plugins/*']
NATIVE = ['*.kt', '*.kts', '*.java', '*.c', '*.cc', '*.cpp', '*.h', '*.hpp', 'CMakeLists.txt', '*.mk',
          'AndroidManifest.xml', '*/res/*', '*.aidl', '*.so', '*.pro']
SOURCE = ['*.ts', '*.tsx', '*.js', '*.jsx', '*.mjs', '*.cjs', '*.json', '*.dart', '*.png', '*.jpg', '*.svg',
          '*.ttf', '*.otf', '*.wav', '*.mp3', '*.lottie']
SKIP = ['*.md', 'docs/*', '*/docs/*', 'journal/*', '*/__tests__/*', '*.test.*', '*.spec.*', '.github/*']
SDK = Path(os.environ.get('ANDROID_SDK_HOME_REAL', '/home/admin/Android/Sdk'))


def log(message):
    print('android-update: ' + message, file=sys.stderr, flush=True)


def git(root, *args):
    return subprocess.run(['git', '-C', str(root), *args], capture_output=True, text=True, check=True).stdout


def matches(path, patterns):
    name = path.rsplit('/', 1)[-1]
    return any(fnmatch.fnmatch(path, p) or fnmatch.fnmatch(name, p) for p in patterns)


def fingerprints(root, scope):
    groups = dict(dependency=hashlib.sha1(), native=hashlib.sha1(), source=hashlib.sha1())
    index = {}
    for line in git(root, 'ls-files', '-s', '--', scope).splitlines():
        meta, path = line.split('\t', 1)
        index[path] = meta.split()[1]
    dirty = set(git(root, 'ls-files', '-m', '-o', '--exclude-standard', '--', scope).splitlines())
    for path in sorted(set(index) | dirty):
        if matches(path, SKIP) or '/node_modules/' in path or path.startswith('node_modules/'):
            continue
        group = 'dependency' if matches(path, DEPENDENCY) else 'native' if matches(path, NATIVE) else \
            'source' if matches(path, SOURCE) else None
        if not group:
            continue
        if path in dirty:
            try:
                digest = hashlib.sha1((root / path).read_bytes()).hexdigest()
            except OSError:
                digest = 'deleted'
        else:
            digest = index[path]
        groups[group].update((path + '\0' + digest + '\n').encode())
    return {key: value.hexdigest() for key, value in groups.items()}


def detect(project):
    project = Path(project).resolve()
    root = Path(git(project, 'rev-parse', '--show-toplevel').strip())
    if (project / 'pubspec.yaml').exists():
        return dict(kind='flutter', app=project, gradle=project / 'android', root=root)
    if (project / 'gradlew').exists():
        app = project.parent if (project.parent / 'package.json').exists() else project
        kind = 'expo' if (app / 'app.json').exists() or (app / 'app.config.ts').exists() or (
            app / 'app.config.js').exists() else 'gradle'
        return dict(kind=kind, app=app, gradle=project, root=root)
    if (project / 'android' / 'gradlew').exists() or (project / 'app.json').exists():
        kind = 'expo' if (project / 'package.json').exists() else 'gradle'
        return dict(kind=kind, app=project, gradle=project / 'android', root=root)
    raise SystemExit('android-update: no Android, Expo or Flutter project in ' + str(project))


def state_path(info):
    directory = Path.home() / '.cache' / 'pandaos-android-update'
    directory.mkdir(parents=True, exist_ok=True)
    return directory / (hashlib.sha1(str(info['app']).encode()).hexdigest()[:16] + '.json')


def classify(info, variant):
    scope = str(info['app'].relative_to(info['root'])) if info['app'] != info['root'] else '.'
    current = fingerprints(info['root'], '.' if info['kind'] == 'expo' else scope)
    previous = {}
    if state_path(info).exists():
        previous = json.loads(state_path(info).read_text()).get(variant, {})
    apk = previous.get('apk')
    if not previous:
        category = 'full'
    elif current['dependency'] != previous['inputs'].get('dependency'):
        category = 'dependency'
    elif current['native'] != previous['inputs'].get('native'):
        category = 'native'
    elif current['source'] != previous['inputs'].get('source'):
        category = 'js-only'
    elif apk and Path(apk).exists() and sha256(apk) == previous.get('apk_sha256'):
        category = 'up-to-date'
    else:
        category = 'native'
    return category, current, previous


def sha256(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            digest.update(chunk)
    return digest.hexdigest()


def build_tool(name):
    tools = sorted((SDK / 'build-tools').glob('*/' + name), key=lambda p: [int(x) if x.isdigit() else 0 for x in
                                                                           re.split(r'[.-]', p.parent.name)])
    if not tools:
        raise SystemExit('android-update: ' + name + ' not found in ' + str(SDK / 'build-tools'))
    return str(tools[-1])


def badging(apk):
    out = subprocess.run([build_tool('aapt2'), 'dump', 'badging', apk], capture_output=True, text=True).stdout
    found = re.search(r"package: name='([^']+)' versionCode='(\d+)' versionName='([^']*)'", out)
    if not found:
        raise SystemExit('android-update: cannot read package from ' + apk)
    return dict(package=found.group(1), version_code=int(found.group(2)), version_name=found.group(3))


def signing_certificates(apk):
    data = Path(apk).read_bytes()
    eocd = data.rfind(b'PK\x05\x06')
    directory = int.from_bytes(data[eocd + 16:eocd + 20], 'little')
    if data[directory - 16:directory] != b'APK Sig Block 42':
        return []
    size = int.from_bytes(data[directory - 24:directory - 16], 'little')
    offset = directory - size
    end = directory - 24
    found = set()

    def sequence(blob):
        items, pos = [], 0
        while pos + 4 <= len(blob):
            length = int.from_bytes(blob[pos:pos + 4], 'little')
            items.append(blob[pos + 4:pos + 4 + length])
            pos += 4 + length
        return items

    while offset + 12 <= end:
        length = int.from_bytes(data[offset:offset + 8], 'little')
        block_id = int.from_bytes(data[offset + 8:offset + 12], 'little')
        value = data[offset + 12:offset + 8 + length]
        offset += 8 + length
        if block_id not in (0x7109871a, 0xf05368c0):
            continue
        for signers in sequence(value):
            for signer in sequence(signers):
                signed = sequence(signer)[0]
                parts = sequence(signed)
                for cert in sequence(parts[1]):
                    found.add(hashlib.sha256(cert).hexdigest())
    return sorted(found)


def certificates(apk, sdk=None):
    limit = ['--max-sdk-version', str(sdk)] if sdk else []
    out = subprocess.run([build_tool('apksigner'), 'verify', '--print-certs', *limit, apk], capture_output=True,
                         text=True)
    errors = [l for l in (out.stdout + out.stderr).splitlines() if l.startswith('ERROR')]
    if out.returncode and errors and all('v3.2' in l or 'ML-DSA' in l for l in errors):
        log('apksigner cannot check the v3.2 PQC signer with this JDK; the device verifies it on install')
    elif out.returncode:
        raise SystemExit('android-update: apksigner rejected ' + apk + ': ' + out.stderr.strip()[-300:])
    return sorted(set(re.findall(r'certificate SHA-256 digest: ([0-9a-f]+)', out.stdout)))


def adb(serial, *args, check=True, timeout=120):
    command = ['adb'] + (['-s', serial] if serial else []) + list(args)
    result = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
    if check and result.returncode:
        raise SystemExit('android-update: ' + ' '.join(command[:4]) + ' failed: ' + (result.stderr or result.stdout)[-400:])
    return result.stdout


def choose_device(requested):
    if requested:
        return requested
    devices = [line.split()[0] for line in adb(None, 'devices').splitlines()[1:] if line.endswith('\tdevice')]
    if not devices:
        raise SystemExit('android-update: no connected device')
    physical = {}
    for serial in devices:
        physical.setdefault(adb(serial, 'shell', 'getprop', 'ro.serialno').strip(), []).append(serial)
    if len(physical) > 1:
        raise SystemExit('android-update: several devices connected, pass --device: ' + ', '.join(devices))
    return sorted(next(iter(physical.values())), key=lambda s: (not re.match(r'^[\d.]+:\d+$', s), s))[0]


def package_info(serial, package):
    out = adb(serial, 'shell', 'dumpsys', 'package', package, check=False)
    if 'versionCode=' not in out:
        return None
    grab = lambda key: (re.search(key + r'=([^\s]+(?: [\d:]+)?)', out) or [None, None])[1]
    return dict(version_code=int(grab('versionCode')), first_install=grab('firstInstallTime'),
                last_update=grab('lastUpdateTime'))


def installed_certificates(serial, package, sdk):
    paths = [line.split(':', 1)[1] for line in adb(serial, 'shell', 'pm', 'path', package).splitlines()
             if line.startswith('package:')]
    base = next((p for p in paths if p.endswith('/base.apk')), paths[0] if paths else None)
    if not base:
        return None
    with tempfile.TemporaryDirectory(prefix='android-update-') as directory:
        local = os.path.join(directory, 'base.apk')
        adb(serial, 'pull', base, local)
        return signing_certificates(local)


def install(apk, serial, expected_package, allow_downgrade):
    meta = badging(apk)
    if expected_package and meta['package'] != expected_package:
        raise SystemExit('android-update: APK package %s differs from expected %s' % (meta['package'], expected_package))
    serial = choose_device(serial)
    sdk = int(adb(serial, 'shell', 'getprop', 'ro.build.version.sdk').strip())
    certificates(apk, sdk)
    certs = signing_certificates(apk)
    before = package_info(serial, meta['package'])
    if before:
        installed = installed_certificates(serial, meta['package'], sdk)
        if installed and installed != certs:
            raise SystemExit('android-update: signature differs from the installed %s; refusing because an '
                             'update would require uninstalling and lose app data' % meta['package'])
        if meta['version_code'] < before['version_code'] and not allow_downgrade:
            raise SystemExit('android-update: versionCode %d is older than installed %d; pass --allow-downgrade'
                             % (meta['version_code'], before['version_code']))
    args = ['install', '-r'] + (['-d'] if allow_downgrade else []) + [apk]
    started = time.time()
    try:
        adb(serial, *args, timeout=240)
    except subprocess.TimeoutExpired:
        focus = adb(serial, 'shell', 'dumpsys', 'window', check=False)
        prompt = 'PlayProtect' in focus or 'packageinstaller' in focus.lower()
        raise SystemExit('android-update: install did not finish within 240 s' +
                         ('; the device shows an install confirmation (Play Protect), confirm it on the phone'
                          if prompt else ''))
    after = package_info(serial, meta['package'])
    preserved = bool(before) and after['first_install'] == before['first_install']
    result = dict(device=serial, package=meta['package'], version_code=meta['version_code'],
                  certificates=[c[:12] for c in certs], seconds=round(time.time() - started, 1),
                  first_install=after['first_install'], last_update=after['last_update'],
                  data_preserved=preserved if before else 'fresh install')
    log('installed ' + json.dumps(result))
    return result


def run(command, cwd, env=None):
    log('$ ' + ' '.join(shlex.quote(c) for c in command))
    subprocess.run(command, cwd=cwd, env=env, check=True)


def build(info, args):
    category, inputs, previous = classify(info, args.variant)
    log('change: ' + category + ' (' + info['kind'] + ')')
    gradle_dir = info['gradle']
    task = args.task or ('assemble' + args.variant.capitalize())
    started = time.time()
    if category == 'up-to-date' and not args.force:
        log('artifact is current: ' + previous['apk'])
        return dict(category=category, apk=previous['apk'], seconds=0)
    live = dict(expo='Metro/Fast Refresh', flutter='Flutter Hot Reload (r) oder Hot Restart (R)').get(info['kind'])
    if category == 'js-only' and args.variant == 'debug' and live and not (args.apk or args.force):
        log('only %s source changed; the installed debug build picks it up through %s. Pass --apk to build anyway'
            % ('JavaScript' if info['kind'] == 'expo' else 'Dart', live))
        return dict(category=category, apk=previous.get('apk'), seconds=0, workflow=live)
    env = dict(os.environ)
    if args.prepare:
        run(['bash', '-c', args.prepare], info['root'], env)
    if info['kind'] == 'expo':
        lock = info['root'] / 'package-lock.json'
        if not (info['root'] / 'node_modules').exists() or (
                category in ('full', 'dependency') and lock.exists() and
                sha256(lock) != previous.get('lock_sha256')):
            run(['npm', 'ci', '--no-audit', '--no-fund', '--prefer-offline'], info['root'], env)
        if category in ('full', 'dependency') or not (gradle_dir / 'gradlew').exists():
            run(['npx', 'expo', 'prebuild', '--platform', 'android', '--non-interactive'] +
                (['--clean'] if category == 'dependency' or args.clean else []), info['app'], env)
            for hook in args.after_prebuild or []:
                run(['bash', '-c', hook], info['app'], env)
    if info['kind'] == 'flutter':
        if category in ('full', 'dependency'):
            run(['flutter', 'pub', 'get'], info['app'], env)
        run(['flutter', 'build', 'apk', '--' + args.variant] + args.gradle_arg, info['app'], env)
        apk = info['app'] / 'build/app/outputs/flutter-apk' / ('app-' + args.variant + '.apk')
    else:
        gradle = [str(gradle_dir / 'gradlew'), task, '--no-daemon', '--build-cache'] + args.gradle_arg
        if args.clean and info['kind'] != 'expo':
            gradle.insert(1, 'clean')
        run(gradle, gradle_dir, env)
        outputs = sorted((gradle_dir / 'app/build/outputs/apk' / args.variant).glob('*.apk'),
                         key=lambda p: p.stat().st_mtime)
        if not outputs:
            raise SystemExit('android-update: no APK in ' + str(gradle_dir / 'app/build/outputs/apk' / args.variant))
        apk = outputs[-1]
    lock = info['root'] / 'package-lock.json'
    record = dict(inputs=inputs, apk=str(apk), apk_sha256=sha256(apk), built=time.time(), category=category,
                  lock_sha256=sha256(lock) if lock.exists() else None,
                  commit=git(info['root'], 'rev-parse', 'HEAD').strip())
    data = json.loads(state_path(info).read_text()) if state_path(info).exists() else {}
    data[args.variant] = record
    state_path(info).write_text(json.dumps(data, indent=2))
    seconds = round(time.time() - started, 1)
    log('built %s in %ss: %s' % (category, seconds, apk))
    return dict(category=category, apk=str(apk), seconds=seconds)


def main():
    parser = argparse.ArgumentParser(prog='pandaos-android-update')
    sub = parser.add_subparsers(dest='action', required=True)
    for name in ('classify', 'build', 'update'):
        p = sub.add_parser(name)
        p.add_argument('--project', default='.')
        p.add_argument('--variant', default='debug', choices=['debug', 'release'])
        p.add_argument('--task')
        p.add_argument('--prepare')
        p.add_argument('--after-prebuild', action='append')
        p.add_argument('--gradle-arg', action='append', default=[])
        p.add_argument('--clean', action='store_true')
        p.add_argument('--force', action='store_true')
        p.add_argument('--apk', action='store_true', help='build an APK even when live reload covers the change')
        p.add_argument('--device')
        p.add_argument('--package')
        p.add_argument('--allow-downgrade', action='store_true')
    p = sub.add_parser('install')
    p.add_argument('apk')
    p.add_argument('--device')
    p.add_argument('--package')
    p.add_argument('--allow-downgrade', action='store_true')
    args = parser.parse_args()
    if args.action == 'classify':
        info = detect(args.project)
        category, _, previous = classify(info, args.variant)
        print(json.dumps(dict(category=category, kind=info['kind'], last=previous.get('commit'))))
        return
    if args.action in ('build', 'update') and not isolated():
        argv = [a if not a.startswith('--project=') else '--project=' + str(Path(a[10:]).resolve()) for a in sys.argv[1:]]
        if '--project' in argv:
            index = argv.index('--project') + 1
            argv[index] = str(Path(argv[index]).resolve())
        os.chdir(Path(args.project).resolve())
        os.execv('/usr/local/bin/pandaos-build-scheduler', ['pandaos-build-scheduler', '--class', 'heavy',
                                                             '--label', 'android-' + args.action, '--',
                                                             sys.executable, os.path.abspath(__file__), *argv])
    if args.action == 'install' and not isolated():
        os.execv('/usr/local/bin/pandaos-build-scheduler', ['pandaos-build-scheduler', '--class', 'light',
                                                             '--priority', 'interactive', '--',
                                                             sys.executable, os.path.abspath(__file__), *sys.argv[1:]])
    if args.action == 'install':
        print(json.dumps(install(args.apk, args.device, args.package, args.allow_downgrade)))
        return
    info = detect(args.project)
    result = build(info, args)
    if args.action == 'update' and not result.get('workflow'):
        result['install'] = install(result['apk'], args.device, args.package, args.allow_downgrade)
    print(json.dumps(result))


if __name__ == '__main__':
    main()
