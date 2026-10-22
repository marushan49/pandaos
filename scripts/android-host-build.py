#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import zipfile


def digest(data):
    return hashlib.sha256(data).hexdigest()


def load(path, default=None):
    return json.loads(path.read_text()) if path.exists() else default


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(data, indent=2) + '\n')
    temporary.replace(path)


def run(args, cwd=None, env=None, capture=False):
    result = subprocess.run(args, cwd=cwd, env=env, check=True,
                            stdout=subprocess.PIPE if capture else None,
                            stderr=subprocess.PIPE if capture else None)
    return result.stdout if capture else None


def git(root, *args):
    return run(['git', '-C', str(root), *args], capture=True).decode().strip()


def snapshot(source):
    names = run(['git', '-C', str(source), 'ls-files', '-z', '--cached', '--others',
                 '--exclude-standard'], capture=True).decode().split('\0')
    files = {}
    for name in sorted(set(filter(None, names))):
        if '__pycache__' in Path(name).parts or Path(name).suffix in {'.pyc', '.pyo'}:
            continue
        if '/' in name and not name.startswith(('packages/', 'plugins/', 'scripts/', 'patches/', 'pins/')):
            continue
        path = source / name
        if path.is_symlink():
            raise ValueError('Source must contain regular files: ' + name)
        if not path.exists():
            continue
        if not path.is_file():
            raise ValueError('Source must contain regular files: ' + name)
        files[name] = path.read_bytes()
    return files


def manifest(files):
    return {name: digest(data) for name, data in sorted(files.items())}


def fingerprint(files):
    return digest(json.dumps(manifest(files), sort_keys=True).encode())


def dependency_inputs(files):
    lock = json.loads(files.get('package-lock.json', b'{}'))
    locked_packages = lock.get('packages', {})
    local_versions = {}
    local_paths = {''}
    for link_path, link in locked_packages.items():
        target = link.get('resolved')
        source = files.get(str(target) + '/package.json')
        locked = locked_packages.get(target, {})
        if link.get('link') is not True or source is None:
            continue
        package = json.loads(source)
        name, version = package.get('name'), package.get('version')
        if (isinstance(name, str) and isinstance(version, str) and version
                and link_path == 'node_modules/' + name
                and 'node_modules' not in Path(target).parts
                and locked.get('name') == name and locked.get('version') == version):
            local_versions[name] = version
            local_paths.add(target)

    def normalize_specs(package):
        for section in ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']:
            for name, spec in package.get(section, {}).items():
                if name in local_versions and spec == local_versions[name]:
                    package[section][name] = {'workspace': name}

    result = {}
    for name, data in files.items():
        if name.endswith('package.json'):
            package = json.loads(data)
            if str(Path(name).parent) == '.' or str(Path(name).parent) in local_paths:
                normalize_specs(package)
            result[name] = json.dumps({key: package[key] for key in
                ['name', 'dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies',
                 'overrides', 'workspaces', 'engines', 'packageManager', 'os', 'cpu']
                if key in package}, sort_keys=True).encode()
        elif name == 'package-lock.json':
            lock.pop('version', None)
            for path, package in lock.get('packages', {}).items():
                if path in local_paths:
                    package.pop('version', None)
                    normalize_specs(package)
            result[name] = json.dumps(lock, sort_keys=True).encode()
        elif name.startswith('patches/') or name == 'scripts/postinstall-patches.mjs':
            result[name] = data
    return result


def workspace_inputs(files):
    return {name: data for name, data in files.items()
            if name.startswith(('packages/highlight/', 'packages/protocol/', 'packages/client/',
                                'packages/plugin/', 'packages/expo-two-way-audio/'))
            or name in ['package.json', 'package-lock.json', 'tsconfig.base.json']}


def verify_native_bootstrap(builder, proof):
    for name, expected in {**proof['nativeInputHashes'], **proof['generatedProjectHashes']}.items():
        if digest(safe_path(builder, name).read_bytes()) != expected:
            raise ValueError('Native bootstrap input differs: ' + name)
    package = json.loads((builder / 'packages/app/package.json').read_text())
    package.pop('scripts', None)
    if package != proof['nativePackageManifestWithoutScripts']:
        raise ValueError('Native package configuration differs')
    marker = builder / 'packages/app/android/.paseo-prebuild-fingerprint'
    if marker.read_text().strip() != proof['existingPrebuildMarker']:
        raise ValueError('Native marker changed since the verified build')


def adopt_verified_native(builder, files, native_proof, apk, apk_hash, signer, apksigner, execute=run):
    if digest(apk.read_bytes()) != apk_hash:
        raise ValueError('Bootstrap APK hash differs from the final build proof')
    verify_native_bootstrap(builder, native_proof)
    verify_signer(apk, signer, apksigner, execute)
    for name, data in files.items():
        if safe_path(builder, name).read_bytes() != data:
            raise ValueError('Bootstrap source ownership differs: ' + name)
    state = builder / '.dev/android-host'
    state.mkdir(parents=True, exist_ok=True)
    save(state / 'sources.json', manifest(files))
    save(state / 'dependencies.json', fingerprint(dependency_inputs(files)))
    (state / 'app-deps.json').unlink(missing_ok=True)
    (state / 'receipt.json').unlink(missing_ok=True)
    save(state / 'bootstrap.json', {'apkSHA256': apk_hash, 'signerSHA256': signer,
         'nativeSnapshotSHA256': digest(json.dumps(native_proof, sort_keys=True).encode())})


def prepare_metro_cache(state, env):
    directory = state / 'tmp'
    if not directory.exists():
        directory.mkdir(parents=True)
        previous = Path(env.get('TMPDIR', '/tmp'))
        cache = previous / 'metro-cache'
        if cache.is_dir():
            shutil.copytree(cache, directory / 'metro-cache')
        for path in previous.glob('metro-file-map-*'):
            if path.is_file():
                shutil.copy2(path, directory / path.name)
    env['TMPDIR'] = str(directory)


def bundle_release(builder, state, step):
    app = builder / 'packages/app'
    output = state / 'bundle'
    assets = output / 'assets'
    shutil.rmtree(assets, ignore_errors=True)
    assets.mkdir(parents=True, exist_ok=True)
    step('metroSeconds', ['npx', 'expo', 'export:embed', '--entry-file', str(app / 'index.ts'),
         '--platform', 'android', '--dev', 'false', '--minify', 'true', '--max-workers', '2',
         '--bundle-output', str(output / 'index.js'), '--sourcemap-output', str(output / 'packager.map'),
         '--assets-dest', str(assets)], cwd=app)
    bytecode = output / 'index.hbc'
    step('hermesSeconds', [str(builder / 'node_modules/react-native/sdks/hermesc/linux64-bin/hermesc'),
         '-w', '-emit-binary', '-max-diagnostic-width=80', '-out', str(bytecode),
         str(output / 'index.js'), '-O', '-fno-inline', '-output-source-map'])
    (output / 'index.hbc.sha256').write_text(digest(bytecode.read_bytes()) + '\n')
    step('sourceMapsSeconds', ['node', 'node_modules/react-native/scripts/compose-source-maps.js',
         str(output / 'packager.map'), str(output / 'index.hbc.map'), '-o', str(output / 'composed.map')])
    return ['-I', str(builder / 'scripts/android-host-prebuilt.gradle'),
            '-Dpandaos.android.bundle=' + str(output)]


def safe_path(root, name):
    path = root / name
    if Path(name).is_absolute() or '..' in Path(name).parts or path.resolve() != path.absolute():
        raise ValueError('Unsafe managed path: ' + name)
    return path


def sync_sources(builder, files, previous):
    for name in set(previous) | set(files):
        safe_path(builder, name)
    for name in previous:
        path = safe_path(builder, name)
        if path.exists() and digest(path.read_bytes()) != previous[name] and path.read_bytes() != files.get(name):
            raise ValueError('Builder has independent edits: ' + name)
    for name in files.keys() - previous.keys():
        path = safe_path(builder, name)
        if path.exists() and path.read_bytes() != files[name]:
            raise ValueError('Builder has an unmanaged file: ' + name)
    for name in previous.keys() - files.keys():
        safe_path(builder, name).unlink(missing_ok=True)
    for name, data in files.items():
        path = safe_path(builder, name)
        if path.exists() and path.read_bytes() == data:
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    return manifest(files)


def secret_plan(source, repository, builder, env):
    previous = load(builder / '.dev/android-host/credentials.json', {})
    plan = {}
    for variant in ['PROD', 'DEBUG']:
        name = f'GOOGLE_SERVICES_FILE_{variant}'
        relative = f'packages/app/.secrets/google-services.{variant.lower()}.json'
        explicit = env.get(name, '').strip()
        if explicit:
            path = Path(explicit)
            path = path if path.is_absolute() else source / 'packages/app' / path
            if not path.is_file():
                raise ValueError('Explicit secret file missing: ' + name)
        else:
            path = next((root / relative for root in [source, repository]
                         if (root / relative).is_file()), None)
            target = builder / relative
            if path is None and target.exists():
                provenance = previous.get(name)
                if not provenance or digest(target.read_bytes()) != provenance['sha256']:
                    raise ValueError('Builder secret lacks matching provenance: ' + name)
                path = target
        if path is not None:
            plan[name] = {'data': path.read_bytes(), 'source': str(path.resolve())}
    return plan


def apply_secrets(builder, env, plan):
    provenance = {}
    for variant in ['PROD', 'DEBUG']:
        name = f'GOOGLE_SERVICES_FILE_{variant}'
        env.pop(name, None)
        if name not in plan:
            continue
        target = builder / f'packages/app/.secrets/google-services.{variant.lower()}.json'
        data = plan[name]['data']
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.read_bytes() != data:
            target.write_bytes(data)
        target.chmod(0o600)
        env[name] = str(target)
        provenance[name] = {'sha256': digest(data), 'source': plan[name]['source']}
    save(builder / '.dev/android-host/credentials.json', provenance)
    return {name: value['sha256'] for name, value in provenance.items()}


def cache_hit(receipt, source_hash, apk, signer):
    return bool(receipt and receipt.get('sourceSHA256') == source_hash
                and receipt.get('signerSHA256') == signer and apk.is_file()
                and receipt.get('apkSHA256') == digest(apk.read_bytes()))


def verify_signer(apk, signer, apksigner, execute=run):
    text = execute([str(apksigner), 'verify', '--print-certs', str(apk)], capture=True).decode()
    certificates = re.findall(r'certificate SHA-256 digest: ([a-fA-F0-9]+)', text)
    if [value.lower() for value in certificates] != [signer.lower()]:
        raise ValueError('APK signer differs from the preserved keystore')


def package_identity(text):
    first_install = re.search(r'^\s*firstInstallTime=([^\r\n]+)', text, re.M)
    identity = re.search(r'^\s*(?:userId|appId)=(\d+)\s*$', text, re.M)
    if not first_install or not identity:
        raise ValueError('Existing package metadata missing firstInstallTime or userId/appId')
    return {'firstInstallTime': first_install.group(1), 'appIdentity': identity.group(1)}


def install(apk, signer, apksigner, serial, package, output, adb_path, execute=run, install_debug=None):
    def adb(*args):
        return execute([str(adb_path), '-s', serial, *map(str, args)], capture=True).decode().strip()

    def info():
        return package_identity(adb('shell', 'dumpsys', 'package', package))

    def remote_apk(allow_absent=False):
        try:
            paths = adb('shell', 'pm', 'path', package).splitlines()
        except subprocess.CalledProcessError as error:
            if allow_absent and error.returncode == 1 and error.stdout in (b'', '') and not error.stderr:
                return None
            raise
        if not paths and allow_absent:
            return None
        if len(paths) != 1 or not paths[0].startswith('package:'):
            raise ValueError('Expected an existing single-APK install of ' + package)
        return paths[0].removeprefix('package:')

    verify_signer(apk, signer, apksigner, execute)
    previous_path = remote_apk(allow_absent=package == 'sh.pandaos.debug')
    before = info() if previous_path else None
    previous = output / 'installed-before.apk'
    if before:
        adb('pull', previous_path, previous)
        verify_signer(previous, signer, apksigner, execute)
    if not before or digest(previous.read_bytes()) != digest(apk.read_bytes()):
        if install_debug:
            install_debug()
        elif 'Success' not in adb('install', '-r', apk):
            raise ValueError('adb install did not report success')
    after = info()
    if before and after != before:
        raise ValueError('Installed package identity or first-install time changed')
    installed_hash = adb('shell', 'sha256sum', remote_apk()).split()[0]
    if installed_hash != digest(apk.read_bytes()):
        raise ValueError('Installed APK hash differs')
    save(output / 'installation.json', {'serial': serial, 'package': package,
         'before': before, 'after': after, 'apkSHA256': installed_hash, 'signerSHA256': signer})


def build(args, execute=run, environment=None):
    started = time.time()
    source = Path(args.source).resolve()
    files = snapshot(source)
    missing = [name for name in ['scripts/prebuild-android.mjs', 'scripts/android-host-prebuilt.gradle']
               if name not in files]
    if missing:
        raise ValueError('Outdated Android build source, missing required tooling: ' + ', '.join(missing))
    repository = (source / git(source, 'rev-parse', '--git-common-dir')).resolve().parent
    if repository.name != 'pandaos':
        raise ValueError('This workflow is scoped to the PandaOS host checkout')
    builder = Path(args.builder or repository / '.worktrees' /
                   ('android-build-debug' if args.debug else 'android-build')).absolute()
    if builder.parent != repository / '.worktrees' or builder == source or builder.is_symlink():
        raise ValueError('Builder must be a separate direct child of the project .worktrees directory')
    environment = dict(os.environ if environment is None else environment)
    secrets_to_copy = secret_plan(source, repository, builder, environment)
    if not builder.exists():
        run(['git', '-C', str(repository), 'worktree', 'add', '--detach', str(builder),
             git(source, 'rev-parse', 'HEAD')])
    state = builder / '.dev/android-host'
    previous = load(state / 'sources.json')
    if previous is None:
        if git(builder, 'status', '--porcelain', '--untracked-files=no'):
            raise ValueError('Finish existing builder edits before first adoption')
        previous = manifest(snapshot(builder))
    synced = sync_sources(builder, files, previous)
    for name in files:
        shutil.copymode(source / name, builder / name)
    save(state / 'sources.json', synced)
    env = dict(environment, CI='1', EXPO_NO_TELEMETRY='1',
               APP_VARIANT='development' if args.debug else 'production',
               CMAKE_BUILD_PARALLEL_LEVEL='1', NODE_OPTIONS='--max-old-space-size=3072')
    for key in ['PASEO_HOME', 'PANDAOS_HOME', 'PASEO_WEB_PLATFORM', 'EXPO_PUBLIC_PASEO_DEV_BUILD_LABEL']:
        env.pop(key, None)
    env.setdefault('GRADLE_USER_HOME', str(Path.home() / '.gradle'))
    prepare_metro_cache(state, env)
    app = builder / 'packages/app'
    keystore = Path(args.keystore or repository / 'packages/app/android/app/debug.keystore').resolve()
    certificate = execute(['keytool', '-exportcert', '-alias', 'androiddebugkey', '-keystore',
                       str(keystore), '-storepass', 'android'], env=env, capture=True)
    signer = digest(certificate)
    sdk = Path(env['ANDROID_HOME'])
    tools = sorted((sdk / 'build-tools').glob('*/apksigner'),
                   key=lambda path: tuple(int(n) for n in re.findall(r'\d+', path.parent.name)))
    if not tools:
        raise ValueError('No installed apksigner in the injected Android SDK')
    apksigner = tools[-1]
    secrets = apply_secrets(builder, env, secrets_to_copy)
    configuration = {key: value for key, value in env.items()
                     if key.startswith(('EXPO_PUBLIC_', 'PASEO_PROFILE_', 'PASEO_FDROID_'))}
    configuration.update(debug=args.debug, signer=signer, secrets=secrets,
                         workflow=digest(Path(__file__).read_bytes()),
                         java=env.get('JAVA_HOME'), android=str(sdk),
                         node=execute(['node', '--version'], env=env, capture=True).decode().strip())
    source_hash = digest(json.dumps([synced, configuration], sort_keys=True).encode())
    receipt_path = state / 'receipt.json'
    receipt = load(receipt_path)
    apk = state / 'PandaOS.apk'
    hit = cache_hit(receipt, source_hash, apk, signer)
    timings = {'queueWaitSeconds': max(0, started - args.requested_at)}

    def step(name, command, cwd=builder, env_override=None):
        before = time.monotonic()
        try:
            execute(command, cwd=cwd, env=env if env_override is None else {**env, **env_override})
        finally:
            timings[name] = round(time.monotonic() - before, 3)

    if hit:
        verify_signer(apk, signer, apksigner, execute)
    else:
        receipt_path.unlink(missing_ok=True)
        deps_hash = fingerprint(dependency_inputs(files))
        if load(state / 'dependencies.json') != deps_hash or not (builder / 'node_modules').is_dir():
            step('npmSeconds', ['npm', 'ci', '--no-audit', '--no-fund'])
            save(state / 'dependencies.json', deps_hash)
            (state / 'app-deps.json').unlink(missing_ok=True)
        workspace_hash = fingerprint(workspace_inputs(files))
        if load(state / 'app-deps.json') != workspace_hash:
            step('appDepsSeconds', ['npm', 'run', 'build:app-deps'])
            save(state / 'app-deps.json', workspace_hash)
        step('verifyDistSeconds', ['node', 'scripts/verify-app-dist.mjs'])
        step('prebuildSeconds', ['node', 'scripts/prebuild-android.mjs'])
        shutil.copy2(keystore, app / 'android/app/debug.keystore')
        variant = 'debug' if args.debug else 'release'
        bundle_flags = [] if args.debug else bundle_release(builder, state, step)
        step('gradleSeconds', gradle_command(':app:assemble' + variant.capitalize()) + bundle_flags,
             cwd=app / 'android')
        built = app / f'android/app/build/outputs/apk/{variant}/app-{variant}.apk'
        if not args.debug:
            with zipfile.ZipFile(built) as archive:
                if digest(archive.read('assets/index.android.bundle')) != (state / 'bundle/index.hbc.sha256').read_text().strip():
                    raise ValueError('Packaged bytecode differs from the verified Hermes bundle')
        verify_signer(built, signer, apksigner, execute)
        shutil.copy2(built, apk)
        receipt = {'sourceSHA256': source_hash, 'source': str(source),
                   'sourceHEAD': git(source, 'rev-parse', 'HEAD'), 'files': synced,
                   'configuration': configuration, 'signerSHA256': signer,
                   'apkSHA256': digest(apk.read_bytes()), 'builder': str(builder)}
        save(receipt_path, receipt)
    timings.update(totalWorkSeconds=round(time.time() - started, 3), artifactReused=hit, apkReady=True)
    save(state / 'last-run.json', timings)
    if args.install:
        before = time.monotonic()
        timings['installSucceeded'] = False
        try:
            install(apk, signer, apksigner, args.install,
                    'sh.pandaos.debug' if args.debug else 'sh.pandaos', state, sdk / 'platform-tools/adb', execute,
                    install_debug=(lambda: step('gradleInstallSeconds',
                        gradle_command(':app:installDebug'), cwd=app / 'android',
                        env_override={'ANDROID_SERIAL': args.install})) if args.debug else None)
            timings['installSucceeded'] = True
        finally:
            timings.update(installSeconds=round(time.monotonic() - before, 3),
                           totalWorkSeconds=round(time.time() - started, 3))
            save(state / 'last-run.json', timings)
    print(json.dumps({'apk': str(apk), 'receipt': str(receipt_path), **timings}, indent=2))


def gradle_command(task):
    return ['./gradlew', task, '--build-cache', '--no-daemon', '--no-parallel',
            '--max-workers=1', '--console=plain', '-Pkotlin.compiler.execution.strategy=in-process',
            '-Dorg.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=768m -XX:ActiveProcessorCount=2 -XX:+UseSerialGC',
            '-PreactNativeArchitectures=arm64-v8a']


def in_build_cgroup(content):
    slices = {'pandaos-android.slice', 'pandaos-build.slice'}
    return any(slices.intersection(line.split(':', 2)[-1].strip().split('/'))
               for line in content.splitlines())


def main():
    parser = argparse.ArgumentParser(description='Persistent Linux PandaOS Android builder')
    parser.add_argument('--source', default=os.getcwd())
    parser.add_argument('--builder')
    parser.add_argument('--debug', action='store_true')
    parser.add_argument('--keystore')
    parser.add_argument('--install', metavar='ADB_SERIAL')
    parser.add_argument('--requested-at', type=float,
                        default=float(os.environ.get('PANDAOS_ANDROID_REQUESTED_AT', time.time())),
                        help=argparse.SUPPRESS)
    args = parser.parse_args()
    if sys.platform != 'linux':
        parser.error('Use the existing npm Android scripts on macOS')
    if not in_build_cgroup(Path('/proc/self/cgroup').read_text()):
        return subprocess.call(['pandaos-android-queue', '--', sys.executable, str(Path(__file__).resolve()),
                                *sys.argv[1:], '--requested-at', str(args.requested_at)])
    build(args)
    return 0


if __name__ == '__main__':
    sys.exit(main())
