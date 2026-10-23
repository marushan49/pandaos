#!/usr/bin/python3
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/'
UPLOAD = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/'
SCOPE = 'https://www.googleapis.com/auth/androidpublisher'
TESTING = ('internal', 'alpha', 'beta')
JAVA = os.environ.get('PANDAOS_RELEASE_JAVA', '/home/admin/.local/share/mise/installs/java/21.0.2')


def log(message):
    print('play-release: ' + message, file=sys.stderr, flush=True)


class Play:
    def __init__(self, credentials, package, evidence=None):
        import jwt
        account = json.loads(Path(credentials).expanduser().read_text())
        issued = int(time.time())
        assertion = jwt.encode(dict(iss=account['client_email'], scope=SCOPE, aud=account['token_uri'],
                                    iat=issued, exp=issued + 3600), account['private_key'], algorithm='RS256')
        body = urllib.parse.urlencode(dict(grant_type='urn:ietf:params:oauth:grant-type:jwt-bearer',
                                           assertion=assertion)).encode()
        with urllib.request.urlopen(urllib.request.Request(account['token_uri'], data=body), timeout=30) as reply:
            self.token = json.loads(reply.read())['access_token']
        self.package = package
        self.calls = []
        self.evidence = evidence

    def call(self, method, path, body=None, data=None, upload=False):
        url = (UPLOAD if upload else API) + self.package + path
        headers = {'Authorization': 'Bearer ' + self.token}
        if body is not None:
            data = json.dumps(body).encode()
            headers['Content-Type'] = 'application/json'
        elif data is not None:
            headers['Content-Type'] = 'application/octet-stream'
            url += ('&' if '?' in url else '?') + 'uploadType=media'
        request = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=600) as reply:
                status, payload = reply.status, reply.read()
        except urllib.error.HTTPError as error:
            status, payload = error.code, error.read()
        entry = dict(method=method, path=path.split('?')[0], status=status)
        try:
            result = json.loads(payload) if payload else {}
        except ValueError:
            result = dict(error=dict(message='unreadable response'))
            status = status if status >= 400 else 502
            entry['status'] = status
        if status >= 400:
            entry['error'] = (result.get('error') or {}).get('message', '')[:300]
        self.calls.append(entry)
        if self.evidence:
            Path(self.evidence).write_text(json.dumps(self.calls, indent=2))
        if status >= 400:
            raise RuntimeError('%s %s -> %d: %s' % (method, entry['path'], status, entry.get('error')))
        return result

    def edit(self):
        return self.call('POST', '/edits', body={})['id']

    def discard(self, edit):
        self.call('DELETE', '/edits/' + edit)


def tracks(play, edit):
    data = play.call('GET', '/edits/%s/tracks' % edit)
    result = {}
    for track in data.get('tracks', []):
        result[track['track']] = [dict(status=r.get('status'), versionCodes=r.get('versionCodes', []),
                                       name=r.get('name'), userFraction=r.get('userFraction'))
                                  for r in track.get('releases', [])]
    return result


def highest_version(play, edit):
    codes = [int(v) for releases in tracks(play, edit).values() for r in releases for v in r['versionCodes']]
    codes += [int(b['versionCode']) for b in play.call('GET', '/edits/%s/bundles' % edit).get('bundles', [])]
    return max(codes) if codes else 0


def protobuf_fields(data):
    pos = 0
    while pos < len(data):
        key, pos = varint(data, pos)
        field, kind = key >> 3, key & 7
        if kind == 0:
            value, pos = varint(data, pos)
        elif kind == 2:
            length, pos = varint(data, pos)
            value, pos = data[pos:pos + length], pos + length
        elif kind == 5:
            value, pos = data[pos:pos + 4], pos + 4
        elif kind == 1:
            value, pos = data[pos:pos + 8], pos + 8
        else:
            raise ValueError('unsupported protobuf wire type')
        yield field, value


def varint(data, pos):
    result = shift = 0
    while True:
        byte = data[pos]
        pos += 1
        result |= (byte & 0x7f) << shift
        if not byte & 0x80:
            return result, pos
        shift += 7


def manifest_attributes(aab):
    import zipfile
    with zipfile.ZipFile(aab) as bundle:
        node = bundle.read('base/manifest/AndroidManifest.xml')
    element = next(value for field, value in protobuf_fields(node) if field == 1)
    attributes = {}
    for field, value in protobuf_fields(element):
        if field == 4:
            parts = dict((f, v) for f, v in protobuf_fields(value) if f in (2, 3))
            attributes[parts.get(2, b'').decode()] = parts.get(3, b'').decode()
    return attributes


def inspect(aab):
    attributes = manifest_attributes(aab)
    package = attributes.get('package')
    version = int(attributes.get('versionCode') or 0)
    name = attributes.get('versionName')
    if not package or not version:
        raise SystemExit('play-release: cannot read package and versionCode from ' + aab)
    verify = subprocess.run([JAVA + '/bin/jarsigner', '-verify', aab], capture_output=True, text=True)
    if 'jar verified' not in verify.stdout:
        raise SystemExit('play-release: AAB signature does not verify: ' + verify.stdout.strip()[-300:])
    certs = subprocess.run([JAVA + '/bin/keytool', '-printcert', '-jarfile', aab], capture_output=True, text=True).stdout
    digests = sorted(set(re.findall(r'SHA256: ([0-9A-F:]+)', certs)))
    if 'debug' in certs.lower() and 'CN=Android Debug' in certs:
        raise SystemExit('play-release: AAB is signed with the Android debug key')
    return dict(package=package, version_code=version, version_name=name, certificates=[d[:23] for d in digests])


def notes_from(value, language):
    if not value:
        return []
    text = Path(value).read_text().strip() if os.path.isfile(value) else value.strip()
    if len(text) > 500:
        raise SystemExit('play-release: release notes exceed 500 characters')
    return [dict(language=language, text=text)]


def upload(args, play):
    meta = inspect(args.aab)
    if meta['package'] != args.package:
        raise SystemExit('play-release: AAB package %s differs from %s' % (meta['package'], args.package))
    if args.track == 'production' and not args.allow_production:
        raise SystemExit('play-release: production needs --allow-production and the owner\'s approval')
    edit = play.edit()
    committed = False
    try:
        highest = highest_version(play, edit)
        if meta['version_code'] <= highest:
            raise SystemExit('play-release: versionCode %d is already used; next is %d' % (meta['version_code'],
                                                                                          highest + 1))
        bundle = play.call('POST', '/edits/%s/bundles' % edit, data=Path(args.aab).read_bytes(), upload=True)
        status = 'draft' if args.track == 'production' else args.status
        release = dict(versionCodes=[str(bundle['versionCode'])], status=status,
                       releaseNotes=notes_from(args.notes, args.language))
        if args.release_name:
            release['name'] = args.release_name
        play.call('PUT', '/edits/%s/tracks/%s' % (edit, args.track), body=dict(track=args.track, releases=[release]))
        play.call('POST', '/edits/%s:validate' % edit)
        if not args.commit:
            committed = True
            discarded = discard_safely(play, edit)
            return dict(committed=False, validated=True, track=args.track, release=release, aab=meta,
                        discarded=discarded,
                        note='validation only; ' + ('the edit was discarded' if discarded else
                                                    'discarding the edit failed, it expires unpublished'))
        play.call('POST', '/edits/%s:commit' % edit)
        committed = True
    finally:
        if not committed:
            discard_safely(play, edit)
    result = dict(committed=True, track=args.track, release=release, aab=meta)
    try:
        after = play.edit()
        try:
            result['readback'] = tracks(play, after).get(args.track)
        finally:
            discard_safely(play, after)
    except Exception as error:
        result['readback_error'] = str(error)[:300]
    return result


def discard_safely(play, edit):
    try:
        play.discard(edit)
        return True
    except Exception as error:
        log('could not discard edit %s: %s' % (edit, str(error)[:200]))
        return False


def build(args):
    gradle_dir = Path(args.project).resolve()
    command = [str(gradle_dir / 'gradlew'), '--no-daemon', '--build-cache'] + args.tests + [args.task]
    log('$ ' + ' '.join(command))
    queued = ['/usr/local/bin/pandaos-build-scheduler', '--class', 'heavy', '--priority', 'blocking',
              '--label', 'play-release', '--'] + command
    env = dict(os.environ, JAVA_HOME=JAVA)
    subprocess.run(queued, cwd=gradle_dir, env=env, check=True)
    found = sorted((gradle_dir / 'app/build/outputs/bundle/release').glob('*.aab'), key=lambda p: p.stat().st_mtime)
    if not found:
        raise SystemExit('play-release: no AAB in ' + str(gradle_dir / 'app/build/outputs/bundle/release'))
    return str(found[-1])


def main():
    parser = argparse.ArgumentParser(prog='pandaos-play-release')
    sub = parser.add_subparsers(dest='action', required=True)
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument('--package', required=True)
    common.add_argument('--credentials', required=True, help='Play service account JSON')
    common.add_argument('--evidence', help='write method, path and status of every API call here')
    sub.add_parser('status', parents=[common])
    p = sub.add_parser('verify')
    p.add_argument('aab')
    for name in ('upload', 'release'):
        p = sub.add_parser(name, parents=[common])
        if name == 'upload':
            p.add_argument('aab')
        else:
            p.add_argument('--project', required=True, help='Gradle project directory containing gradlew')
            p.add_argument('--task', default=':app:bundleRelease')
            p.add_argument('--tests', nargs='*', default=['testDebugUnitTest'])
        p.add_argument('--track', default='internal', choices=TESTING + ('production',))
        p.add_argument('--status', default='completed', choices=['completed', 'draft'])
        p.add_argument('--notes')
        p.add_argument('--language', default='de-DE')
        p.add_argument('--release-name')
        p.add_argument('--commit', action='store_true', help='publish to the track; without it only validate')
        p.add_argument('--allow-production', action='store_true')
    args = parser.parse_args()
    if args.action == 'verify':
        print(json.dumps(inspect(args.aab), indent=2))
        return
    play = Play(args.credentials, args.package, args.evidence)
    if args.action == 'status':
        edit = play.edit()
        try:
            print(json.dumps(dict(package=args.package, tracks=tracks(play, edit),
                                  highest_version_code=highest_version(play, edit)), indent=2))
        finally:
            play.discard(edit)
        return
    if args.action == 'release':
        args.aab = build(args)
    print(json.dumps(upload(args, play), indent=2))


if __name__ == '__main__':
    main()
