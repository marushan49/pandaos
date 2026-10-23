#!/usr/bin/python3
import argparse
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = 'https://api.appstoreconnect.apple.com/v1'


def read_env(path):
    values = {}
    for line in Path(path).expanduser().read_text().splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            key, value = line.split('=', 1)
            values[key.strip()] = value.strip().strip('"\'')
    return values


class AppStoreConnect:
    def __init__(self, env_file):
        import jwt
        env = read_env(env_file)
        key_path = Path(env['ASC_KEY_PATH']).expanduser()
        if not key_path.is_absolute():
            key_path = Path(env_file).expanduser().parent / key_path
        issued = int(time.time())
        self.token = jwt.encode(dict(iss=env['ASC_ISSUER_ID'], iat=issued, exp=issued + 1200,
                                     aud='appstoreconnect-v1'), key_path.read_text(), algorithm='ES256',
                                headers=dict(kid=env['ASC_KEY_ID'], typ='JWT'))
        self.key_id = env['ASC_KEY_ID']
        self.issuer = env['ASC_ISSUER_ID']

    def get(self, path, **query):
        url = API + path + ('?' + urllib.parse.urlencode(query) if query else '')
        request = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + self.token})
        try:
            with urllib.request.urlopen(request, timeout=60) as reply:
                return json.loads(reply.read())
        except urllib.error.HTTPError as error:
            detail = json.loads(error.read() or b'{}').get('errors', [{}])[0].get('detail', '')
            raise SystemExit('ios-release: GET %s -> %d %s' % (path, error.code, detail[:200]))


def status(args):
    asc = AppStoreConnect(args.asc_env)
    apps = asc.get('/apps', **{'filter[bundleId]': args.bundle_id, 'fields[apps]': 'name,bundleId'})['data']
    if not apps:
        raise SystemExit('ios-release: no app with bundle id ' + args.bundle_id)
    app = apps[0]
    builds = asc.get('/builds', **{'filter[app]': app['id'], 'sort': '-uploadedDate', 'limit': '5',
                                   'fields[builds]': 'version,processingState,uploadedDate,expired'})['data']
    versions = asc.get('/apps/%s/appStoreVersions' % app['id'], **{
        'limit': '3', 'fields[appStoreVersions]': 'versionString,appStoreState,platform'})['data']
    return dict(app=app['attributes']['name'], bundle_id=args.bundle_id,
                builds=[dict(version=b['attributes']['version'], state=b['attributes']['processingState'],
                             uploaded=b['attributes']['uploadedDate'], expired=b['attributes'].get('expired'))
                        for b in builds],
                store_versions=[dict(version=v['attributes']['versionString'], state=v['attributes']['appStoreState'])
                                for v in versions])


def project_relative(value, project):
    if not value or not os.path.isabs(value):
        return value
    path = Path(value).resolve()
    try:
        return str(path.relative_to(Path(project).resolve()))
    except ValueError:
        raise SystemExit('ios-release: %s lies outside the project; pass a path inside %s' % (value, project))


def build_script(args, key_id, issuer):
    for name in ('workspace', 'xcodeproj', 'export_options'):
        setattr(args, name, project_relative(getattr(args, name), args.project))
    key = '"$HOME/.appstoreconnect/private_keys/AuthKey_%s.p8"' % key_id
    auth = '-authenticationKeyPath %s -authenticationKeyID %s -authenticationKeyIssuerID %s' % (
        key, shlex.quote(key_id), shlex.quote(issuer))
    project = '-workspace %s' % shlex.quote(args.workspace) if args.workspace else (
        '-project %s' % shlex.quote(args.xcodeproj) if args.xcodeproj else '')
    scheme = shlex.quote(args.scheme)
    lines = ['set -euo pipefail', 'export PATH=/opt/homebrew/bin:$PATH',
             'if ! security show-keychain-info "$HOME/Library/Keychains/login.keychain-db" >/dev/null 2>&1; then '
             'echo "ios-release: der Anmelde-Schlüsselbund des Macs ist gesperrt; einmal am Mac '
             '\\`security unlock-keychain ~/Library/Keychains/login.keychain-db\\` ausführen, dann erneut starten" >&2; '
             'exit 75; fi']
    if Path(args.project, 'project.yml').exists():
        lines.append('xcodegen generate -q')
    if Path(args.project, 'Podfile').exists():
        lines.append('pod install')
    if args.test_destination:
        lines.append('xcodebuild test -quiet %s -scheme %s -destination %s' % (
            project, scheme, shlex.quote(args.test_destination)))
    lines += ['rm -rf build/pandaos.xcarchive build/pandaos-export',
              'xcodebuild archive -quiet %s -scheme %s -destination "generic/platform=iOS" '
              '-archivePath build/pandaos.xcarchive CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO '
              'CODE_SIGN_IDENTITY=""' % (project, scheme),
              '/usr/bin/plutil -replace destination -string %s %s -o build/pandaos-export-options.plist' % (
                  'upload' if args.upload else 'export', shlex.quote(args.export_options)),
              'xcodebuild -exportArchive -quiet -archivePath build/pandaos.xcarchive '
              '-exportOptionsPlist build/pandaos-export-options.plist -exportPath build/pandaos-export '
              '-allowProvisioningUpdates ' + auth,
              'ls -la build/pandaos-export']
    return '\n'.join(lines)


def build(args):
    env = read_env(args.asc_env)
    script = build_script(args, env['ASC_KEY_ID'], env['ASC_ISSUER_ID'])
    if args.upload and not args.confirm_upload:
        raise SystemExit('ios-release: --upload sends the build to App Store Connect; add --confirm-upload '
                         'after the owner approved it')
    root = Path(subprocess.run(['git', '-C', args.project, 'rev-parse', '--show-toplevel'], capture_output=True,
                               text=True, check=True).stdout.strip())
    relative = Path(args.project).resolve().relative_to(root)
    command = ['/usr/local/bin/pandaos-build-scheduler', '--worker', args.worker, '--class', 'heavy',
               '--priority', 'blocking', '--label', 'ios-release', '--queue-timeout', str(args.queue_timeout),
               '--artifact', str(relative / 'build/pandaos-export'), '--', '/bin/bash', '-c', script]
    if args.dry_run:
        return dict(command=command[:command.index('--', 1) + 1] + ['/bin/bash', '-c', '<script>'], script=script)
    result = subprocess.run(command, cwd=args.project)
    return dict(exit=result.returncode, upload=args.upload)


def main():
    parser = argparse.ArgumentParser(prog='pandaos-ios-release')
    sub = parser.add_subparsers(dest='action', required=True)
    p = sub.add_parser('status')
    p.add_argument('--bundle-id', required=True)
    p.add_argument('--asc-env', required=True, help='file with ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH')
    p = sub.add_parser('build')
    p.add_argument('--project', required=True, help='directory with the Xcode project')
    p.add_argument('--scheme', required=True)
    p.add_argument('--workspace')
    p.add_argument('--xcodeproj')
    p.add_argument('--export-options', default='ExportOptions.plist')
    p.add_argument('--test-destination', help='for example "platform=iOS Simulator,name=iPhone 17"')
    p.add_argument('--asc-env', required=True)
    p.add_argument('--worker', default='auto')
    p.add_argument('--queue-timeout', type=int, default=86400)
    p.add_argument('--upload', action='store_true')
    p.add_argument('--confirm-upload', action='store_true')
    p.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    result = status(args) if args.action == 'status' else build(args)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    if isinstance(result.get('exit'), int):
        sys.exit(result['exit'])


if __name__ == '__main__':
    main()
