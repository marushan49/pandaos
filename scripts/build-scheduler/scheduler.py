#!/usr/bin/python3
import argparse
import asyncio
import base64
import collections
import contextlib
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import shlex
import signal
import socket
import struct
import subprocess
import sys
import time
import uuid
import remote_worker


NAME = 'pandaos-build-scheduler'
RUN = Path('/run/pandaos-build-scheduler')
SOCKET = RUN / 'scheduler.sock'
STATE = Path('/var/lib/pandaos-build-scheduler')
JOBS = STATE / 'jobs'
INSTALL = Path('/usr/local/lib/pandaos-build-scheduler')
CONFIG = Path('/etc/pandaos-build-scheduler/config.json')
PREFIX = 'pandaos-build-job-'
SLICE = 'pandaos-build.slice'
CGROUP = Path('/sys/fs/cgroup/pandaos.slice/pandaos-build.slice')
LEGACY_CGROUP = Path('/sys/fs/cgroup/pandaos.slice/pandaos-android.slice')
JOB_CGROUPS = ('/pandaos.slice/pandaos-build.slice/' + PREFIX,
               '/pandaos.slice/pandaos-android.slice/pandaos-android-job-')
MAX_REQUEST = 1024 * 1024
MAX_RUNTIME = 7200
MAX_WAIT = 3600
MAX_WAIT_DARWIN = 86400
GIB = 1024 ** 3
LEVELS = ['interactive', 'blocking', 'normal', 'background']
CLASSES = ['light', 'medium', 'heavy']

DEFAULTS = {
    'user': 'admin',
    'first_sequence': 1000,
    'reserve_memory_gib': 8,
    'build_memory_budget_gib': 28,
    'reserve_cores': 2,
    'min_build_cores': 4,
    'max_build_cores': 12,
    'max_running': 8,
    'max_heavy': 2,
    'light_backfill': 3,
    'max_per_agent': 3,
    'aging_seconds': 600,
    'starvation_seconds': 900,
    'client_grace_seconds': 20,
    'cpu_pressure_defer': 50,
    'cpu_overcommit': 1.5,
    'cpu_overcommit_below_pressure': 25,
    'cpu_pressure_stop': 80,
    'memory_pressure_defer': 10,
    'memory_pressure_stop': 30,
    'job_memory_max_gib': 12,
    'job_memory_high_min_gib': 6,
    'classes': {
        'light': {'memory_gib': 1.0, 'cores': 1.0},
        'medium': {'memory_gib': 4.0, 'cores': 3.0},
        'heavy': {'memory_gib': 8.0, 'cores': 4.0},
    },
    'priority_cpu_weight': {'interactive': 400, 'blocking': 200, 'normal': 100, 'background': 25},
    'priority_io_weight': {'interactive': 400, 'blocking': 200, 'normal': 100, 'background': 25},
    'gradle': {'workers': 4, 'jvmargs': '-Xmx4g -XX:MaxMetaspaceSize=1g -XX:ActiveProcessorCount=4',
               'caching': True},
    'ccache': True,
    'sccache': '/usr/bin/sccache',
    'history_keep': 4000,
}

HEAVY = [r'gradlew\b[^\n;&|]*\b(assemble|bundle|install|build)\w*', r'\bassemble(release|debug)\b',
         r'expo\s+(run:android|prebuild)', r'\beas\s+build', r'flutter\s+(build|run)\b',
         r'(^|[/\s])emulator\b(?![^\n]*-version)', r'cargo\s+build\b[^\n]*--release', r'xcodebuild',
         r'pandaos-android-build', r'docker\s+build', r'npm\s+run\s+android', r'build-install']
MEDIUM = [r'cargo\s+(build|test|check|clippy|run|nextest|doc)\b', r'\b(npm|pnpm|yarn|bun)\s+(ci|install|i)\b',
          r'(npm|pnpm|yarn)\s+run\s+build', r'\bvite\s+build', r'\bnext\s+build', r'\bvitest\b', r'\bjest\b',
          r'playwright', r'flutter\s+test', r'\bpytest\b', r'\bgo\s+(build|test)\b', r'gradlew', r'remotion',
          r'\bms\s+render', r'e2e']
LIGHT = [r'tsc\b[^\n]*--noemit', r'\btypecheck\b', r'\blint\b', r'\bbiome\b', r'\beslint\b', r'\boxlint\b',
         r'\bprettier\b', r'(^|\s)-{1,2}version\b', r'\bjq\b', r'(^|[/\s])adb\s', r'\baapt2?\b', r'apksigner']
PERMANENT = ('kein macOS', 'Projekt nicht als Snapshot übertragbar', 'kein snapshot_root konfiguriert')
PERMANENT_PREFIX = 'Werkzeug fehlt'
DARWIN = [r'\bxcodebuild\b', r'\bxcrun\b', r'\bpod\s+install\b', r'flutter\s+build\s+(ios|ipa|macos)\b',
          r'expo\s+run:ios', r'\bfastlane\s+ios\b', r'eas\s+build\b[^\n]*--platform\s+ios[^\n]*--local']
TOOLS = [('xcode', r'\bxcodebuild\b|\bxcrun\b'), ('pod', r'\bpod\s+install\b'),
         ('flutter', r'(^|[/\s])flutter\s'), ('cargo', r'(^|[/\s])cargo\s'),
         ('java_home', r'gradlew|\bgradle\b|expo\s+run:android|flutter\s+build\s+(apk|appbundle)'),
         ('android_sdk', r'gradlew|expo\s+run:android|flutter\s+build\s+(apk|appbundle)'),
         ('node', r'(^|[/\s])(node|npm|npx|pnpm|yarn|bun)\s')]
INTERACTIVE = [r'(^|[/\s])adb\s[^\n]*\binstall', r'pandaos-android-build[^\n]*--install']
CARGO_TARGET = re.compile(r'CARGO_TARGET_DIR=("[^"]+"|\'[^\']+\'|\S+)')


def isolated():
    try:
        lines = Path('/proc/self/cgroup').read_text().splitlines()
    except OSError:
        return False
    return any(line.split(':', 2)[-1].strip().startswith(JOB_CGROUPS) for line in lines)


def load_config():
    config = json.loads(json.dumps(DEFAULTS))
    with contextlib.suppress(FileNotFoundError):
        for key, value in json.loads(CONFIG.read_text()).items():
            if isinstance(value, dict) and isinstance(config.get(key), dict):
                config[key].update(value)
            else:
                config[key] = value
    return config


def now():
    return time.time()


def gib(value):
    return round(value / GIB, 2)


def atomic_write(path, data, mode=0o640, gid=None):
    temporary = path.with_name(path.name + '.' + uuid.uuid4().hex[:8])
    with open(temporary, 'w') as f:
        os.fchmod(f.fileno(), mode)
        if gid is not None:
            os.fchown(f.fileno(), 0, gid)
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    temporary.replace(path)


def read_int(path, default=0):
    try:
        return int(path.read_text().split()[0])
    except (OSError, ValueError, IndexError):
        return default


def read_keyed(path):
    values = {}
    with contextlib.suppress(OSError):
        for line in path.read_text().splitlines():
            parts = line.split()
            if len(parts) == 2 and parts[1].isdigit():
                values[parts[0]] = int(parts[1])
    return values


def read_io(path):
    total = [0, 0]
    with contextlib.suppress(OSError):
        for line in path.read_text().splitlines():
            for field in line.split()[1:]:
                key, _, value = field.partition('=')
                if key == 'rbytes':
                    total[0] += int(value)
                elif key == 'wbytes':
                    total[1] += int(value)
    return total


def psi(resource):
    result = {}
    with contextlib.suppress(OSError):
        for line in Path('/proc/pressure/' + resource).read_text().splitlines():
            kind, *fields = line.split()
            result[kind] = float(dict(f.split('=') for f in fields)['avg10'])
    return result


def meminfo():
    values = {}
    for line in Path('/proc/meminfo').read_text().splitlines():
        key, value = line.split(':')
        values[key] = int(value.split()[0]) * 1024
    return values


def cpu_busy_usec():
    fields = [int(v) for v in Path('/proc/stat').read_text().splitlines()[0].split()[1:]]
    idle = fields[3] + fields[4]
    return (sum(fields[:8]) - idle) * 1_000_000 // os.sysconf('SC_CLK_TCK')


def script_text(command, cwd):
    parts = [' '.join(command)]
    for index, arg in enumerate(command[:6]):
        if index and command[index - 1] == '-c':
            continue
        path = Path(arg if os.path.isabs(arg) else os.path.join(cwd, arg))
        if arg.endswith(('.sh', '.bash')) or (index == 1 and Path(command[0]).name in ('bash', 'sh', 'zsh')):
            with contextlib.suppress(OSError, UnicodeDecodeError):
                if path.is_file() and path.stat().st_size < 262144:
                    parts.append(path.read_text()[:65536])
    return '\n'.join(parts)


def project_root(cwd):
    path = Path(cwd)
    for candidate in [path, *path.parents]:
        if (candidate / '.git').exists():
            return str(candidate)
    return cwd


def classify(command, cwd, env):
    text = script_text(command, cwd)
    lowered = text.lower()
    klass = 'medium'
    matched = 'default'
    for name, patterns in (('heavy', HEAVY), ('medium', MEDIUM), ('light', LIGHT)):
        hit = next((p for p in patterns if re.search(p, lowered, re.M)), None)
        if hit:
            klass, matched = name, hit
            break
    interactive = any(re.search(p, lowered, re.M) for p in INTERACTIVE)
    target = env.get('CARGO_TARGET_DIR')
    found = CARGO_TARGET.search(text)
    if found:
        target = found.group(1).strip('"\'').replace('$HOME', env.get('HOME', '/home/admin'))
    root = project_root(cwd)
    lock = target if target and 'cargo' in lowered else root
    needs = sorted({name for name, pattern in TOOLS if re.search(pattern, lowered, re.M)})
    argv = ' '.join(command).lower()
    darwin = 'ssh' not in argv and any(re.search(p, argv, re.M) for p in DARWIN)
    outside = [a for a in command if a.startswith('/') and not a.startswith(('/usr/', '/bin/', '/opt/homebrew/'))
               and not (a + '/').startswith(root.rstrip('/') + '/')]
    return dict(klass=klass, rule=matched, interactive=interactive, project=root, lock=lock, needs=needs,
                darwin=darwin, portable=os.path.exists(os.path.join(root, '.git')) and not outside,
                cargo='cargo' in lowered, gradle=bool(re.search(r'gradlew|gradle|expo\s+run|flutter', lowered)))


def signature(project, command):
    return hashlib.sha1((project + '\0' + '\0'.join(command)).encode()).hexdigest()[:16]


def gradle_summary(text):
    found = re.findall(r'(\d+) actionable tasks?: ([^\n]+)', text)
    if not found:
        return None
    total, detail = found[-1]
    result = dict(tasks=int(total))
    for count, kind in re.findall(r'(\d+) (executed|from cache|up-to-date)', detail):
        result[kind.replace(' ', '_').replace('-', '_')] = int(count)
    return result


class Job:
    def __init__(self, record):
        self.__dict__.update(record)
        self.clients = set()
        self.detached_at = None
        self.cores = 0.0
        self.memory = 0
        self.sample = None
        self.wait_reason = getattr(self, 'wait_reason', None)
        self.worker = getattr(self, 'worker', 'local')
        for key, default in (('needs', []), ('darwin', False), ('portable', False), ('artifacts', []),
                             ('placement', None)):
            if getattr(self, key, None) is None:
                setattr(self, key, default)
        self.changed = asyncio.Event()

    @property
    def unit(self):
        return PREFIX + self.id + '.service'

    @property
    def directory(self):
        return JOBS / self.id

    @property
    def cgroup(self):
        return CGROUP / self.unit

    def record(self):
        keys = ['id', 'sequence', 'state', 'klass', 'class_source', 'rule', 'priority', 'agent', 'project', 'cwd',
                'lock', 'command', 'timeout', 'queue_timeout', 'detach', 'created', 'started', 'finished', 'exit',
                'reason', 'wait_reason', 'estimate', 'measured', 'signature', 'cache', 'decision', 'label', 'cargo',
                'gradle', 'worker', 'needs', 'darwin', 'portable', 'artifacts', 'placement', 'sccache_port']
        return {key: getattr(self, key, None) for key in keys}

    def view(self, full=False):
        data = self.record()
        if not full:
            data['command'] = ' '.join(self.command)[:240]
        data['unit'] = self.unit
        end = self.started or (self.finished if self.state == 'finished' else now())
        data['waited'] = round(end - self.created)
        if self.state == 'running':
            data['usage'] = dict(memory_gib=gib(self.memory), cores=round(self.cores, 2))
        return data


class Scheduler:
    def __init__(self):
        self.config = load_config()
        self.account = pwd.getpwnam(self.config['user'])
        self.jobs = collections.OrderedDict()
        self.sequence = self.config['first_sequence'] - 1
        self.history = collections.defaultdict(lambda: collections.deque(maxlen=12))
        self.wakeup = asyncio.Event()
        self.dirty = False
        self.cpu_sample = (time.monotonic(), cpu_busy_usec())
        self.total_cores = 0.0
        self.legacy = dict(memory=0, cores=0.0, usage=None)
        self.capacity = {}
        self.connections = 0
        self.workers = {}
        self.worker_probe_times = {}
        self.worker_probe_tasks = {}

    def log(self, event, job=None, **data):
        entry = dict(ts=round(now(), 3), time=time.strftime('%Y-%m-%dT%H:%M:%S%z'), event=event)
        if job:
            entry.update(job=job.id, sequence=job.sequence, klass=job.klass, priority=job.priority,
                         agent=job.agent, project=job.project)
        entry.update(data)
        line = json.dumps(entry, ensure_ascii=False)
        print(line, flush=True)
        with open(STATE / 'decisions.jsonl', 'a') as f:
            f.write(line + '\n')

    def save(self):
        self.dirty = False
        finished = [j for j in self.jobs.values() if j.state == 'finished']
        for job in finished[:-300]:
            del self.jobs[job.id]
        data = dict(sequence=self.sequence, jobs=[j.record() for j in self.jobs.values()])
        atomic_write(STATE / 'state.json', json.dumps(data), 0o640, self.account.pw_gid)

    def load(self):
        with contextlib.suppress(FileNotFoundError):
            for line in (STATE / 'history.jsonl').read_text().splitlines()[-self.config['history_keep']:]:
                with contextlib.suppress(ValueError, KeyError):
                    entry = json.loads(line)
                    self.history[entry['signature']].append(entry)
        with contextlib.suppress(FileNotFoundError):
            data = json.loads((STATE / 'state.json').read_text())
            self.sequence = max(self.sequence, data['sequence'])
            for record in data['jobs']:
                job = Job(record)
                self.jobs[job.id] = job
                if job.state != 'finished':
                    job.detached_at = time.monotonic()

    def estimate(self, sig, klass):
        runs = [r for r in self.history.get(sig, ()) if r.get('wall', 0) >= 3 and r.get('peak_memory')]
        base = self.config['classes'][klass]
        if not runs:
            return dict(memory=int(base['memory_gib'] * GIB), cores=base['cores'], wall=None, source='heuristic',
                        klass=klass)
        peak = max(r['peak_memory'] for r in runs)
        cores = sorted(r['cpu_seconds'] / max(r['wall'], 1) for r in runs)[int(0.9 * (len(runs) - 1))]
        walls = sorted(r['wall'] for r in runs)
        wall = walls[len(walls) // 2]
        if peak >= 3 * GIB or cores >= 3.5:
            measured = 'heavy'
        elif peak < GIB and cores < 1.5 and wall < 180:
            measured = 'light'
        else:
            measured = 'medium'
        return dict(memory=int(peak * 1.2 + 0.25 * GIB), cores=round(min(max(cores, 0.25), 12), 2), wall=wall,
                    source='measured:' + str(len(runs)), klass=measured)

    def admit(self, req, uid):
        command, env, cwd = req.get('command'), req.get('env'), req.get('cwd')
        if not isinstance(command, list) or not command or len(command) > 4096 or any(
                not isinstance(v, str) or '\0' in v for v in command):
            raise ValueError('command must be a nonempty argv array')
        if not isinstance(env, dict) or any(not isinstance(k, str) or not isinstance(v, str) or not k or '=' in k
                                            or '\0' in k + v for k, v in env.items()):
            raise ValueError('invalid environment')
        if not isinstance(cwd, str) or not os.path.isabs(cwd) or '\0' in cwd:
            raise ValueError('cwd must be absolute')
        info = classify(command, cwd, env)
        for key, maximum in [('timeout', MAX_RUNTIME), ('queue_timeout', MAX_WAIT_DARWIN if info['darwin'] else MAX_WAIT)]:
            if not isinstance(req.get(key), int) or not 1 <= req[key] <= maximum:
                raise ValueError(key + ' outside host bounds')
        artifacts = req.get('artifacts') or []
        if not isinstance(artifacts, list) or len(artifacts) > 32 or any(
                not isinstance(a, str) or not a or a.startswith('/') or '..' in Path(a).parts for a in artifacts):
            raise ValueError('artifacts must be relative project paths')
        if req.get('priority') not in (None, *LEVELS) or req.get('klass') not in (None, *CLASSES):
            raise ValueError('unknown priority or class')
        if sum(j.state == 'queued' for j in self.jobs.values()) >= 128:
            raise ValueError('queue is full')
        worker_name = req.get('worker') or 'local'
        if not isinstance(req.get('worker', 'local'), (str, type(None))):
            raise ValueError('worker must be a configured name')
        if info['darwin'] and worker_name == 'local':
            if not self.worker_names():
                raise ValueError('iOS/Xcode braucht einen aktivierten macOS-Worker; keiner ist aktiviert')
            worker_name = 'auto'
        if worker_name == 'local' and self.config.get('auto_placement') and info['portable']:
            worker_name = 'auto'
        self.sequence += 1
        job_id = uuid.uuid4().hex
        remote = None
        if worker_name not in ('local', 'auto'):
            remote = self.remote_request(req, worker_name, info, job_id, artifacts)
            spec = remote['spec']
        sig = signature(info['project'], command)
        if remote:
            sig = signature(info['project'] + ':' + worker_name, command)
        estimate = self.estimate(sig, info['klass'])
        klass = req.get('klass') or (estimate['klass'] if estimate['source'] != 'heuristic' else info['klass'])
        source = 'requested' if req.get('klass') else estimate['source']
        if estimate['source'] == 'heuristic':
            base = self.config['classes'][klass]
            estimate.update(memory=int(base['memory_gib'] * GIB), cores=base['cores'])
        priority = req.get('priority') or ('interactive' if info['interactive'] else 'normal')
        job = Job(dict(id=job_id, sequence=self.sequence, state='queued', klass=klass, class_source=source,
                       rule=info['rule'], priority=priority, agent=env.get('PASEO_AGENT_ID') or 'uid:' + str(uid),
                       project=info['project'], cwd=cwd,
                       lock=remote_worker.map_path(info['lock'], remote_worker.with_mapping(spec, remote.get('snapshot')))
                       if remote else info['lock'], command=command,
                       timeout=req['timeout'], queue_timeout=req['queue_timeout'], detach=bool(req.get('detach')),
                       created=now(), started=None, finished=None, exit=None, reason=None, wait_reason=None,
                       estimate=dict(memory_gib=gib(estimate['memory']), cores=estimate['cores'],
                                     wall=estimate['wall'], measured_class=estimate['klass']),
                       measured=None, signature=sig, cache=None, decision=None, label=req.get('label'),
                       cargo=info['cargo'], gradle=info['gradle'], worker=worker_name, needs=info['needs'],
                       darwin=info['darwin'], portable=info['portable'], artifacts=artifacts, placement=None))
        job.directory.mkdir(mode=0o750)
        os.chown(job.directory, 0, self.account.pw_gid)
        out = job.directory / 'out'
        out.mkdir(mode=0o700)
        os.chown(out, self.account.pw_uid, self.account.pw_gid)
        for name in ('stdout', 'stderr'):
            (job.directory / name).touch(0o640)
            os.chown(job.directory / name, 0, self.account.pw_gid)
        atomic_write(job.directory / 'request.json', json.dumps(dict(command=command, env=env if not remote else {},
                                                                   cwd=cwd, remote=remote, timeout=req['timeout'],
                                                                   artifacts=artifacts)), 0o640,
                     self.account.pw_gid)
        self.jobs[job.id] = job
        self.log('queued', job, command=' '.join(command)[:300], class_source=source, rule=info['rule'],
                 estimate=job.estimate, lock=job.lock)
        self.save()
        self.wakeup.set()
        return job

    def remote_request(self, req, name, info, job_id, artifacts):
        spec = remote_worker.worker_config(self.config, name)
        mapping = remote_worker.snapshot_mapping(spec, info['project'])
        if artifacts and not mapping:
            raise ValueError('artifacts need a worker snapshot_root')
        payload = remote_worker.prepare(req, remote_worker.with_mapping(spec, mapping), job_id, req['timeout'],
                                        min(self.config['job_memory_max_gib'], spec['memory_budget_gib']))
        return dict(spec=spec, payload=payload, snapshot=mapping, artifacts=artifacts)

    def remote_estimate(self, job, name):
        measured = self.estimate(signature(job.project + ':' + name, job.command), job.klass)
        if measured['source'] == 'heuristic':
            return dict(job.estimate)
        return dict(job.estimate, memory_gib=gib(measured['memory']), cores=measured['cores'], wall=measured['wall'])

    def worker_names(self):
        return [name for name, spec in (self.config.get('workers') or {}).items()
                if isinstance(spec, dict) and spec.get('enabled') is True]

    def compatible(self, job, name, pinned=False):
        if name == 'local':
            return None if not job.darwin else 'iOS/Xcode nur auf macOS'
        probe = self.workers.get(name) or {}
        if probe.get('error') or not probe.get('sampled_at'):
            return 'nicht erreichbar'
        if job.darwin and probe.get('platform') != 'darwin':
            return 'kein macOS'
        missing = [tool for tool in job.needs if tool not in (probe.get('tools') or {})]
        if missing:
            return 'Werkzeug fehlt: ' + ', '.join(missing)
        if pinned:
            return None
        if not (self.config.get('workers') or {}).get(name, {}).get('snapshot_root'):
            return 'kein snapshot_root konfiguriert'
        if not job.portable:
            return 'Projekt nicht als Snapshot übertragbar'
        if job.klass == 'light' and not job.darwin:
            return 'leichte Jobs bleiben lokal'
        return None

    def similar_wall(self, job, name):
        key = [arg for arg in job.command if not arg.startswith('-')]
        walls = sorted(r['wall'] for runs in self.history.values() for r in runs
                       if r.get('wall') and r.get('project') == job.project and r.get('worker', 'local') == name
                       and [a for a in r.get('command', '').split() if not a.startswith('-')] == key)
        return walls[len(walls) // 2] if walls else None

    def expected_wall(self, job, name):
        default = dict(light=30, medium=120, heavy=600)[job.klass]
        local = job.estimate.get('wall') or self.similar_wall(job, 'local') or default
        if name == 'local':
            return local
        spec = (self.config.get('workers') or {}).get(name, {})
        runs = [r for r in self.history.get(signature(job.project + ':' + name, job.command), ()) if r.get('wall')]
        if runs:
            walls = sorted(r['wall'] for r in runs)
            return walls[len(walls) // 2]
        similar = self.similar_wall(job, name)
        if similar:
            return similar
        warm = any(r.get('worker') == name and r.get('project') == job.project
                   for runs in self.history.values() for r in runs)
        return local * spec.get('speed_factor', 0.8) * (1 if warm else spec.get('cold_factor', 1.5))

    def has_remote_history(self, job, name):
        if self.history.get(signature(job.project + ':' + name, job.command)):
            return True
        return self.similar_wall(job, name) is not None

    def expected_sync(self, job, name):
        if name == 'local':
            return 0
        times = [r['sync_seconds'] for runs in self.history.values() for r in runs
                 if r.get('worker') == name and r.get('project') == job.project and r.get('sync_seconds')]
        return sorted(times)[len(times) // 2] if times else 30

    def expected_wait(self, name, reason):
        if not reason:
            return 0
        running = [j for j in self.jobs.values() if j.state == 'running' and j.worker == name]
        remaining = [max((j.estimate.get('wall') or 120) - (now() - (j.started or now())), 10) for j in running]
        return min(remaining) if remaining else 60

    def place(self, job, reserved):
        candidates = []
        for name in ['local'] + self.worker_names():
            incompatible = self.compatible(job, name)
            if incompatible:
                candidates.append(dict(worker=name, blocked=incompatible))
                continue
            snap = self.snapshot(name)
            probe = job
            if name != 'local':
                spec = remote_worker.worker_config(self.config, name)
                mapping = remote_worker.snapshot_mapping(spec, job.project)
                probe = Job(dict(job.record(), lock=remote_worker.map_path(
                    job.lock, remote_worker.with_mapping(spec, mapping)), estimate=self.remote_estimate(job, name)))
            applies = reserved if reserved and reserved.id != job.id and self.reserves(reserved, name) else None
            reason = self.blocker(probe, snap, applies)
            if name != 'local' and not reason:
                reason = self.protect_worker(job, name)
            wall = self.expected_wall(job, name)
            measured_remote = name != 'local' and self.has_remote_history(job, name)
            sync = 0 if measured_remote else self.expected_sync(job, name)
            transfer = 10 * len(job.artifacts) if name != 'local' and not measured_remote else 0
            eta = self.expected_wait(name, reason) + sync + wall + transfer
            candidates.append(dict(worker=name, reason=reason, eta=round(eta), wall=round(wall), sync=round(sync),
                                   snap=snap))
        usable = [c for c in candidates if 'eta' in c]
        ready = [c for c in usable if not c['reason']]
        local = next((c for c in ready if c['worker'] == 'local'), None)
        choice = None
        if ready:
            choice = min(ready, key=lambda c: c['eta'])
            if local and choice['worker'] != 'local' and choice['eta'] > local['eta'] * self.config.get(
                    'remote_advantage', 0.85):
                choice = local
            busy = [c for c in usable if c['reason'] and self.waitable(c['reason'])]
            faster = min(busy, key=lambda c: c['eta']) if busy else None
            if faster and faster['eta'] < choice['eta'] * self.config.get('wait_advantage', 0.6) and \
                    now() - job.created < self.config.get('wait_for_faster_seconds', 600):
                view = [{k: v for k, v in c.items() if k != 'snap'} for c in candidates]
                return None, 'wartet auf schnelleren Host %s (ca. %d s statt %d s)' % (
                    faster['worker'], faster['eta'], choice['eta']), view
        view = [{k: v for k, v in c.items() if k != 'snap'} for c in candidates]
        if not choice:
            if job.darwin and not usable:
                blocked = [c for c in candidates if c['worker'] != 'local']
                if blocked and all(c['blocked'] in PERMANENT or c['blocked'].startswith(PERMANENT_PREFIX)
                                   for c in blocked):
                    return None, 'PERMANENT: ' + '; '.join(c['worker'] + ': ' + c['blocked'] for c in blocked), view
                detail = '; '.join(c['worker'] + ': ' + c['blocked'] for c in blocked) or 'kein Mac-Worker aktiviert'
                return None, 'wartet auf Mac-Worker (iOS): ' + detail, view
            if not usable:
                return None, 'kein passender Worker', view
            return None, '; '.join(c['worker'] + ': ' + c['reason'] for c in sorted(usable, key=lambda c: c['eta'])), view
        return choice, None, view

    def reserves(self, reserved, name):
        if reserved.worker == name:
            return True
        return reserved.worker == 'auto' and self.compatible(reserved, name) is None

    @staticmethod
    def waitable(reason):
        return reason.startswith(('gleicher Build-Ordner', 'Parallel-Limit', 'Heavy-Limit', 'CPU:', 'Build-RAM-Budget'))

    def protect_worker(self, job, name):
        spec = self.config['workers'][name]
        probe = self.workers.get(name) or {}
        if probe.get('on_ac') is False:
            if not job.darwin:
                return 'Mac im Akkubetrieb'
            if (probe.get('battery') or 0) < spec.get('battery_min_percent', 50):
                return 'Mac-Akku unter %d %%' % spec.get('battery_min_percent', 50)
        idle = probe.get('idle_seconds')
        if idle is not None and idle < spec.get('active_idle_seconds', 120) and not job.darwin and job.klass == 'heavy' \
                and job.priority not in ('interactive', 'blocking'):
            return 'Mac wird gerade benutzt'
        return None

    async def bind(self, job, choice, view):
        job.placement = dict(worker=choice['worker'], eta=choice['eta'], candidates=view)
        if choice['worker'] != 'local':
            path = job.directory / 'request.json'
            req = json.loads(path.read_text())
            req.update(timeout=job.timeout, queue_timeout=job.queue_timeout)
            info = dict(project=job.project)
            remote = self.remote_request(req, choice['worker'], info, job.id, job.artifacts)
            job.lock = remote_worker.map_path(job.lock, remote_worker.with_mapping(remote['spec'], remote['snapshot']))
            job.estimate = self.remote_estimate(job, choice['worker'])
            job.signature = signature(job.project + ':' + choice['worker'], job.command)
            atomic_write(path, json.dumps(dict(command=job.command, env={}, cwd=job.cwd, remote=remote,
                                               timeout=job.timeout, artifacts=job.artifacts)),
                         0o640, self.account.pw_gid)
        job.worker = choice['worker']
        self.log('placed', job, worker=job.worker, eta=choice['eta'], candidates=view,
                 why='kürzeste erwartete Fertigstellung' if len(view) > 1 else 'einziger Worker')

    def effective_level(self, job):
        waited = now() - job.created
        return max(0, LEVELS.index(job.priority) - int(waited // self.config['aging_seconds']))

    def measure(self):
        stamp = time.monotonic()
        busy = cpu_busy_usec()
        elapsed = max(stamp - self.cpu_sample[0], 0.001)
        self.total_cores = 0.7 * self.total_cores + 0.3 * ((busy - self.cpu_sample[1]) / 1e6 / elapsed)
        self.cpu_sample = (stamp, busy)
        for job in self.jobs.values():
            if job.state != 'running':
                continue
            if job.worker != 'local':
                with contextlib.suppress(OSError, ValueError, KeyError):
                    data = json.loads((job.directory / 'out' / 'remote.json').read_text())
                    job.memory = data['memory']
                    usage = data['cpu_seconds']
                    if job.sample:
                        job.cores = max((usage - job.sample[1]) / max(stamp - job.sample[0], 0.001), 0)
                    job.sample = (stamp, usage)
                    job.measured = dict(peak_memory=data['peak_memory'], cpu_seconds=usage,
                                        measurement='sampled-process-group')
                continue
            usage = read_keyed(job.cgroup / 'cpu.stat').get('usage_usec')
            job.memory = read_int(job.cgroup / 'memory.current', job.memory)
            peak = read_int(job.cgroup / 'memory.peak', 0)
            if usage is not None:
                if job.sample:
                    rate = (usage - job.sample[1]) / 1e6 / max(stamp - job.sample[0], 0.001)
                    job.cores = rate if job.cores == 0 else 0.6 * job.cores + 0.4 * rate
                job.sample = (stamp, usage)
                read, written = read_io(job.cgroup / 'io.stat')
                job.measured = dict(peak_memory=max(peak, (job.measured or {}).get('peak_memory', 0)),
                                    cpu_seconds=round(usage / 1e6, 1), io_read=read, io_written=written)
        legacy = read_keyed(LEGACY_CGROUP / 'cpu.stat').get('usage_usec')
        if legacy is not None:
            previous = self.legacy['usage']
            if previous:
                rate = (legacy - previous[1]) / 1e6 / max(stamp - previous[0], 0.001)
                self.legacy['cores'] = 0.6 * self.legacy['cores'] + 0.4 * rate
            self.legacy['usage'] = (stamp, legacy)
            self.legacy['memory'] = read_int(LEGACY_CGROUP / 'memory.current')

    def committed(self, job):
        settled = job.started and now() - job.started > 20
        cores = max(job.cores, 0.25) if settled else max(job.estimate['cores'], job.cores)
        memory = max(int(job.estimate['memory_gib'] * GIB), job.memory)
        return cores, memory

    async def refresh_worker(self, name):
        try:
            spec = remote_worker.worker_config(self.config, name)
            self.workers[name] = await remote_worker.probe(spec, self.account)
        except (OSError, ValueError, asyncio.TimeoutError):
            self.workers[name] = dict(error='worker probe unavailable')
        finally:
            self.wakeup.set()

    def refresh_workers(self, names):
        tasks = []
        for name in names:
            if name == 'local':
                continue
            task = self.worker_probe_tasks.get(name)
            if task is None or task.done():
                if now() - self.worker_probe_times.get(name, 0) < 10:
                    continue
                self.worker_probe_times[name] = now()
                task = asyncio.create_task(self.refresh_worker(name))
                self.worker_probe_tasks[name] = task
            tasks.append(task)
        return tasks

    def snapshot(self, worker='local'):
        if worker != 'local':
            running = [j for j in self.jobs.values() if j.state == 'running' and j.worker == worker]
            try:
                spec = remote_worker.worker_config(self.config, worker)
            except ValueError:
                return dict(worker=worker, unavailable=True, running=running, metrics={})
            probe = self.workers.get(worker, {})
            committed = sum(self.committed(j)[1] for j in running)
            growth = sum(self.committed(j)[1] if (j.started or 0) > probe.get('sampled_at', 0)
                         else max(self.committed(j)[1] - j.memory, 0) for j in running)
            free = probe.get('available_memory', 0) - spec['reserve_memory_gib'] * GIB - growth
            cores = sum(self.committed(j)[0] for j in running)
            capacity = max(min(spec['max_cores'], probe.get('cores', 0) - max(
                probe.get('load', 0) - sum(j.cores for j in running), 0)), 0)
            metrics = dict(memory_pressure=0, memory_pressure_full=0, cpu_pressure=0,
                           memory_budget_gib=spec['memory_budget_gib'], cpu_capacity=capacity,
                           memory_free_for_builds_gib=gib(free), cpu_committed=cores, worker=worker)
            return dict(free=free, committed_memory=committed, capacity=capacity, cpu_used=cores,
                        running=running, metrics=metrics, worker=worker, unavailable=probe.get('error') or
                        (now() - probe.get('sampled_at', 0) > 20))
        mem = meminfo()
        running = [j for j in self.jobs.values() if j.state == 'running' and j.worker == 'local']
        build_cores = sum(j.cores for j in running) + self.legacy['cores']
        nonbuild = max(self.total_cores - build_cores, 0)
        nproc = os.cpu_count()
        capacity = min(max(nproc - self.config['reserve_cores'] - nonbuild, self.config['min_build_cores']),
                       self.config['max_build_cores'])
        if psi('cpu').get('some', 0) < self.config['cpu_overcommit_below_pressure']:
            capacity = min(capacity * self.config['cpu_overcommit'], self.config['max_build_cores'])
        cpu_used = sum(self.committed(j)[0] for j in running) + self.legacy['cores']
        committed_memory = sum(self.committed(j)[1] for j in running) + self.legacy['memory']
        growth = sum(max(int(j.estimate['memory_gib'] * GIB) - j.memory, 0) for j in running)
        free = mem['MemAvailable'] - growth - self.config['reserve_memory_gib'] * GIB
        self.capacity = dict(memory_available_gib=gib(mem['MemAvailable']), memory_free_for_builds_gib=gib(free),
                             memory_committed_gib=gib(committed_memory),
                             memory_budget_gib=self.config['build_memory_budget_gib'],
                             cpu_capacity=round(capacity, 1), cpu_committed=round(cpu_used, 1),
                             cores_total_busy=round(self.total_cores, 1), cores_nonbuild=round(nonbuild, 1),
                             cpu_pressure=psi('cpu').get('some', 0), memory_pressure=psi('memory').get('some', 0),
                             memory_pressure_full=psi('memory').get('full', 0), running=len(running),
                             legacy_memory_gib=gib(self.legacy['memory']), legacy_cores=round(self.legacy['cores'], 1))
        return dict(free=free, committed_memory=committed_memory, capacity=capacity, cpu_used=cpu_used,
                    running=running, metrics=self.capacity, worker='local')

    def blocker(self, job, snap, reserved):
        cfg = self.config
        if snap['worker'] != 'local':
            if snap['unavailable']:
                return 'Worker nicht erreichbar: ' + snap['worker']
            spec = remote_worker.worker_config(self.config, snap['worker'])
            cfg = dict(cfg, max_running=spec['max_running'], light_backfill=0,
                       build_memory_budget_gib=spec['memory_budget_gib'])
        running = snap['running']
        light = job.klass == 'light'
        memory = int(job.estimate['memory_gib'] * GIB)
        cores = job.estimate['cores']
        holder = next((j for j in running if j.lock == job.lock and j.klass != 'light'), None)
        if holder and not light:
            return 'gleicher Build-Ordner wie #%d' % holder.sequence
        lights = sum(j.klass == 'light' for j in running)
        if len(running) >= cfg['max_running'] and not (light and lights < cfg['light_backfill']):
            return 'Parallel-Limit %d erreicht' % cfg['max_running']
        mine = sum(j.agent == job.agent for j in running)
        others = any(j.state == 'queued' and j.agent != job.agent and j.id != job.id for j in self.jobs.values())
        if mine >= cfg['max_per_agent'] and others:
            return 'Fairness: Agent hat schon %d laufende Jobs' % mine
        if reserved and not light:
            return 'Vorrang für #%d (wartet länger)' % reserved.sequence
        if job.klass == 'heavy' and sum(j.klass == 'heavy' for j in running) >= cfg['max_heavy']:
            return 'Heavy-Limit %d erreicht' % cfg['max_heavy']
        mp, mpf, cp = (snap['metrics'][key] for key in ('memory_pressure', 'memory_pressure_full', 'cpu_pressure'))
        if running and (mp >= cfg['memory_pressure_stop'] or mpf >= 5):
            return 'Speicherdruck %.0f %%' % mp
        if running and not light and mp >= cfg['memory_pressure_defer']:
            return 'Speicherdruck %.0f %%' % mp
        if snap['free'] < memory:
            return 'RAM: braucht %.1f GiB, frei %.1f GiB' % (memory / GIB, max(snap['free'], 0) / GIB)
        if (running or snap['worker'] != 'local') and snap['committed_memory'] + memory > cfg['build_memory_budget_gib'] * GIB:
            return 'Build-RAM-Budget: %.1f von %d GiB belegt' % (snap['committed_memory'] / GIB,
                                                                  cfg['build_memory_budget_gib'])
        if running and cp >= cfg['cpu_pressure_stop'] and not (light and job.priority == 'interactive'):
            return 'CPU-Druck %.0f %%' % cp
        if running and not light and cp >= cfg['cpu_pressure_defer']:
            return 'CPU-Druck %.0f %%' % cp
        if (running or snap['worker'] != 'local') and not light and snap['cpu_used'] + cores > snap['capacity']:
            return 'CPU: %.1f von %.1f Kernen belegt' % (snap['cpu_used'], snap['capacity'])
        if light and snap['cpu_used'] + cores > snap['capacity'] and (snap['worker'] != 'local' or
                running and lights >= cfg['light_backfill']):
            return 'CPU: %.1f von %.1f Kernen belegt' % (snap['cpu_used'], snap['capacity'])
        return None

    async def schedule(self):
        self.measure()
        names = {j.worker for j in self.jobs.values() if j.state in ('running', 'queued')}
        if 'auto' in names:
            names |= set(self.worker_names())
        self.refresh_workers(names - {'auto'})
        snap = self.snapshot()
        queued = [j for j in self.jobs.values() if j.state == 'queued']
        for job in queued:
            if now() - job.created >= job.queue_timeout:
                await self.finish(job, 124, 'queue wait limit')
            elif not job.detach and not job.clients and job.detached_at and \
                    time.monotonic() - job.detached_at > self.config['client_grace_seconds']:
                await self.finish(job, 130, 'client disconnected')
        queued = [j for j in self.jobs.values() if j.state == 'queued' and (j.clients or j.detach)]
        agent_load = collections.Counter(j.agent for j in snap['running'])
        queued.sort(key=lambda j: (self.effective_level(j), agent_load[j.agent], j.sequence))
        reserved = None
        for job in queued:
            if job.worker == 'auto':
                choice, reason, view = self.place(job, reserved)
                if reason and reason.startswith('PERMANENT: '):
                    self.log('rejected', job, reason=reason[11:], candidates=view)
                    await self.finish(job, 125, 'kein passender Worker: ' + reason[11:])
                    continue
                if choice:
                    await self.bind(job, choice, view)
                    reason = None
                snap = choice['snap'] if choice else self.snapshot('local')
            else:
                snap = self.snapshot(job.worker)
                applies = reserved if reserved and self.reserves(reserved, job.worker) else None
                reason = self.blocker(job, snap, applies)
                if reason is None and job.worker != 'local':
                    reason = self.compatible(job, job.worker, pinned=True) or self.protect_worker(job, job.worker)
            if reason is None:
                job.decision = dict(capacity=dict(snap['metrics']), why='Kapazität frei')
                await self.start(job)
                snap = self.snapshot(job.worker)
                agent_load[job.agent] += 1
                continue
            if reason != job.wait_reason:
                job.wait_reason = reason
                self.log('deferred', job, reason=reason, capacity=dict(snap['metrics']))
                await self.notify(job, event='waiting', reason=reason)
                self.dirty = True
            waited = now() - job.created
            if not reserved and job.klass != 'light' and (self.effective_level(job) == 0 and
                                                          waited > 60 or waited > self.config['starvation_seconds']):
                if not reason.startswith(('gleicher Build-Ordner', 'Fairness')):
                    reserved = job

    def properties(self, job):
        cfg = self.config
        memory_max = cfg['job_memory_max_gib']
        memory_high = min(max(cfg['job_memory_high_min_gib'], job.estimate['memory_gib'] * 1.5), memory_max - 1)
        return ['MemoryAccounting=yes', 'CPUAccounting=yes', 'IOAccounting=yes', 'TasksAccounting=yes',
                'MemoryHigh=%dM' % int(memory_high * 1024), 'MemoryMax=%dG' % memory_max, 'MemorySwapMax=0',
                'CPUWeight=%d' % cfg['priority_cpu_weight'][job.priority],
                'IOWeight=%d' % cfg['priority_io_weight'][job.priority], 'TasksMax=4096', 'OOMPolicy=kill',
                'KillMode=control-group', 'TimeoutStopSec=10s', 'SendSIGKILL=yes',
                'RuntimeMaxSec=%d' % job.timeout, 'NoNewPrivileges=yes', 'RestrictSUIDSGID=yes', 'Nice=5',
                'UMask=0022', 'StandardInput=null',
                'StandardOutput=append:' + str(job.directory / 'stdout'),
                'StandardError=append:' + str(job.directory / 'stderr')]

    async def start(self, job):
        args = ['/usr/bin/systemd-run', '--quiet', '--service-type=exec', '--unit=' + job.unit,
                '--uid=' + self.account.pw_name, '--gid=' + str(self.account.pw_gid), '--slice=' + SLICE,
                '--description=' + ('#%d %s' % (job.sequence, ' '.join(job.command)))[:200]]
        args += ['--property=' + p for p in self.properties(job)]
        args += ['/usr/bin/python3', str(INSTALL / 'scheduler.py'), 'worker', str(job.directory)]
        job.state = 'starting'
        job.started = now()
        job.wait_reason = None
        self.assign_sccache_port(job)
        self.save()
        try:
            proc = await asyncio.create_subprocess_exec(*args, stdin=asyncio.subprocess.DEVNULL,
                                                       stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        except OSError as exc:
            self.log('start_failed', job, error=type(exc).__name__ + ': ' + str(exc)[:200])
            await self.finish(job, 125, 'queue execution failed: spawn')
            return
        try:
            _, err = await asyncio.wait_for(proc.communicate(), 30)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            err = b'systemd-run timed out'
        if job.state != 'starting':
            await self.control('stop', job.unit)
            await self.control('reset-failed', job.unit)
            return
        if proc.returncode:
            self.log('start_failed', job, error=err.decode()[-400:])
            await self.finish(job, 125, 'queue execution failed: systemd-run')
            return
        job.state = 'running'
        self.log('started', job, waited=round(job.started - job.created, 1), why=job.decision['why'],
                 capacity=job.decision['capacity'])
        await self.notify(job, event='running')
        self.save()

    def assign_sccache_port(self, job):
        used = {getattr(j, 'sccache_port', None) for j in self.jobs.values() if j.state in ('running', 'starting')}
        port = next(p for p in range(20000, 29000) if p not in used)
        job.sccache_port = port
        with contextlib.suppress(OSError, ValueError):
            path = job.directory / 'request.json'
            req = json.loads(path.read_text())
            req['sccache_port'] = port
            atomic_write(path, json.dumps(req), 0o640, self.account.pw_gid)

    async def control(self, *args):
        proc = await asyncio.create_subprocess_exec('/usr/bin/systemctl', *args, stdout=asyncio.subprocess.PIPE,
                                                   stderr=asyncio.subprocess.PIPE)
        try:
            out, err = await asyncio.wait_for(proc.communicate(), 15)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            return 1, '', 'timeout'
        return proc.returncode, out.decode(), err.decode()

    async def unit_state(self, job):
        code, out, _ = await self.control('show', job.unit, '--property=ActiveState,Result,ExecMainStatus,LoadState')
        if code:
            return {}
        return dict(line.split('=', 1) for line in out.splitlines() if '=' in line)

    async def reap(self):
        for job in [j for j in self.jobs.values() if j.state == 'running']:
            result = job.directory / 'out' / 'result.json'
            if result.exists():
                with contextlib.suppress(ValueError, OSError):
                    data = json.loads(result.read_text())
                    if job.cgroup.exists() and read_keyed(job.cgroup / 'cgroup.events').get('populated', 0):
                        if now() - data.get('time', 0) < 10:
                            continue
                        await self.control('stop', job.unit)
                    await self.complete(job, data)
                continue
            if job.cgroup.exists() and read_keyed(job.cgroup / 'cgroup.events').get('populated', 1):
                continue
            state = await self.unit_state(job)
            if state.get('ActiveState') in ('active', 'activating', 'deactivating', 'reloading'):
                continue
            if result.exists():
                continue
            outcome = state.get('Result', '')
            code = {'oom-kill': 137, 'timeout': 124}.get(outcome)
            if code is None:
                status = int(state.get('ExecMainStatus') or 0)
                code = status if outcome == 'exit-code' and status else 125
            reason = {'oom-kill': 'out of memory', 'timeout': 'runtime limit'}.get(outcome, job.reason or outcome or
                                                                                   'job ended without result')
            await self.control('reset-failed', job.unit)
            await self.complete(job, dict(exit=code), reason)

    async def complete(self, job, data, reason=None):
        if job.state == 'finished':
            return
        measured = dict(job.measured or {})
        for key in ('peak_memory', 'cpu_seconds', 'io_read', 'io_written'):
            if data.get(key) is not None:
                measured[key] = max(data[key], measured.get(key, 0)) if key == 'peak_memory' else data[key]
        measured['wall'] = round(now() - job.started, 1) if job.worker != 'local' else (
            data.get('wall') or round(now() - job.started, 1))
        job.measured = measured
        cache = {}
        with contextlib.suppress(OSError):
            with open(job.directory / 'stdout', 'rb') as f:
                f.seek(max(f.seek(0, 2) - 262144, 0))
                tail = f.read().decode(errors='replace')
            summary = gradle_summary(tail)
            if summary:
                cache['gradle'] = summary
            compiled = len(re.findall(r'^\s+Compiling ', tail, re.M))
            if job.cargo and compiled:
                cache['cargo_compiled'] = compiled
        for key in ('sccache', 'ccache'):
            if data.get(key):
                cache[key] = data[key]
        if data.get('artifacts'):
            cache['artifacts'] = dict(paths=data['artifacts'], directory=str(job.directory / 'out' / 'artifacts'))
        if data.get('sync_seconds') is not None:
            cache['sync_seconds'] = data['sync_seconds']
        job.cache = cache or None
        code = data.get('exit', 125)
        if not reason and not job.reason and measured['wall'] >= job.timeout - 1:
            code, reason = 124, 'runtime limit'
        await self.finish(job, code, reason or job.reason or data.get('reason'))
        if measured.get('peak_memory') and measured.get('cpu_seconds') is not None and job.reason not in (
                'canceled', 'client disconnected'):
            entry = dict(signature=job.signature, ts=round(now()), project=job.project, klass=job.klass,
                         class_source=job.class_source, peak_memory=measured['peak_memory'],
                         cpu_seconds=measured['cpu_seconds'], wall=measured['wall'],
                         waited=round(job.started - job.created, 1), exit=code, agent=job.agent,
                         command=' '.join(job.command)[:200], cache=job.cache, io_written=measured.get('io_written'),
                         worker=job.worker, sync_seconds=(job.cache or {}).get('sync_seconds'))
            self.history[job.signature].append(entry)
            with open(STATE / 'history.jsonl', 'a') as f:
                f.write(json.dumps(entry) + '\n')

    async def finish(self, job, code, reason):
        if job.state == 'finished':
            return
        was_running = job.state == 'running'
        job.state = 'finished'
        job.finished = now()
        job.exit = code
        job.reason = reason
        job.wait_reason = None
        with contextlib.suppress(OSError):
            (job.directory / 'request.json').unlink()
        self.log('finished', job, exit=code, reason=reason, measured=job.measured, cache=job.cache,
                 ran=was_running, waited=round((job.started or job.finished) - job.created, 1))
        await self.notify(job, event='result')
        self.save()
        self.wakeup.set()

    async def cancel(self, job, reason='canceled'):
        if job.state == 'queued':
            await self.finish(job, 130, reason)
        elif job.state in ('running', 'starting'):
            job.reason = reason
            await self.control('stop', job.unit)
            await self.control('reset-failed', job.unit)
            await self.complete(job, dict(exit=130), reason)

    async def notify(self, job, **event):
        job.changed.set()
        job.changed = asyncio.Event()
        job.last_event = event

    async def stream(self, job, writer, offsets):
        files = {name: open(job.directory / name, 'rb') for name in ('stdout', 'stderr')}
        try:
            for name, f in files.items():
                f.seek(offsets.get(name, 0))
            await send(writer, event='attached', **job.view())
            last_wait = None
            while True:
                changed = job.changed
                for name, f in files.items():
                    while data := f.read(65536):
                        await send(writer, event=name, data=base64.b64encode(data).decode())
                if job.state == 'finished':
                    await send(writer, event='result', **job.view())
                    return
                if job.wait_reason and job.wait_reason != last_wait:
                    last_wait = job.wait_reason
                    await send(writer, event='waiting', reason=job.wait_reason, id=job.id, sequence=job.sequence)
                if job.state == 'running' and getattr(job, 'announced', None) != id(writer):
                    job.announced = id(writer)
                    await send(writer, event='running', **job.view())
                with contextlib.suppress(asyncio.TimeoutError):
                    await asyncio.wait_for(changed.wait(), 0.25)
        finally:
            for f in files.values():
                f.close()

    async def handle(self, reader, writer):
        self.connections += 1
        job = None
        try:
            peer = writer.get_extra_info('socket').getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12)
            _, uid, _ = struct.unpack('3i', peer)
            if uid not in (0, self.account.pw_uid) or self.connections > 512:
                raise ValueError('unauthorized or too many clients')
            req = json.loads(await asyncio.wait_for(reader.readline(), 5))
            operation = req.get('operation', 'submit')
            if operation == 'worker-probe':
                name = req.get('worker')
                remote_worker.worker_config(self.config, name)
                tasks = self.refresh_workers({name})
                if tasks:
                    await asyncio.gather(*(asyncio.shield(task) for task in tasks))
                await send(writer, worker=name, probe=self.workers.get(name),
                           capacity=self.snapshot(name)['metrics'])
                return
            if operation == 'status':
                self.refresh_workers(set(self.worker_names()))
                self.snapshot()
                active = [j.view() for j in self.jobs.values() if j.state != 'finished']
                recent = [j.view() for j in self.jobs.values() if j.state == 'finished'][-int(req.get('recent', 20)):] if int(req.get('recent', 20)) else []
                await send(writer, jobs=recent + active, capacity=self.capacity, workers=self.workers, config=dict(
                    workers={n: bool(isinstance(w, dict) and w.get('enabled') is True)
                             for n, w in (self.config.get('workers') or {}).items()},
                    auto_placement=bool(self.config.get('auto_placement')),
                    max_running=self.config['max_running'], max_heavy=self.config['max_heavy'],
                    build_memory_budget_gib=self.config['build_memory_budget_gib']))
                return
            if operation == 'cancel':
                target = self.jobs.get(req.get('id')) or next(
                    (j for j in self.jobs.values() if str(j.sequence) == str(req.get('id')).lstrip('#')), None)
                if not target or target.state == 'finished':
                    raise ValueError('job is absent or already finished')
                await self.cancel(target)
                await send(writer, **target.view())
                return
            if operation in ('attach', 'logs'):
                job = self.jobs.get(req.get('id'))
                if not job:
                    raise ValueError('unknown job')
                offsets = req.get('offsets') or {}
            else:
                job = self.admit(req, uid)
                offsets = {}
                await send(writer, event='queued', **job.view())
            owner = operation != 'logs'
            if owner:
                job.clients.add(writer)
                job.detached_at = None
            streamer = asyncio.create_task(self.stream(job, writer, offsets))
            listener = asyncio.create_task(reader.readline())
            while True:
                done, _ = await asyncio.wait([streamer, listener], return_when=asyncio.FIRST_COMPLETED)
                if streamer in done:
                    listener.cancel()
                    with contextlib.suppress(asyncio.CancelledError, Exception):
                        await listener
                    streamer.result()
                    break
                message = listener.result()
                if not message:
                    streamer.cancel()
                    with contextlib.suppress(asyncio.CancelledError, Exception):
                        await streamer
                    break
                if json.loads(message).get('cancel') and job.state != 'finished':
                    self.log('cancel_requested', job, via='client')
                    await self.cancel(job)
                listener = asyncio.create_task(reader.readline())
        except (ValueError, KeyError, asyncio.TimeoutError, ConnectionError, OSError) as exc:
            with contextlib.suppress(ConnectionError, OSError):
                await send(writer, event='error', error=str(exc), exit=125)
        finally:
            self.connections -= 1
            if job and writer in job.clients:
                job.clients.discard(writer)
                if not job.clients and job.state != 'finished':
                    job.detached_at = time.monotonic()
                    if not job.detach:
                        asyncio.get_running_loop().call_later(self.config['client_grace_seconds'] + 1,
                                                              self.wakeup.set)
            writer.close()
            with contextlib.suppress(ConnectionError, OSError):
                await writer.wait_closed()

    async def orphan_check(self):
        for job in [j for j in self.jobs.values() if j.state != 'finished' and not j.detach]:
            if job.state == 'running' and not job.clients and job.detached_at and \
                    time.monotonic() - job.detached_at > self.config['client_grace_seconds']:
                self.log('cancel_requested', job, via='client disconnected')
                await self.cancel(job, 'client disconnected')

    async def adopt(self):
        starting = [j for j in self.jobs.values() if j.state == 'starting']
        if starting:
            await asyncio.sleep(2)
        for job in starting:
            state = await self.unit_state(job)
            if state.get('LoadState') == 'loaded' or (job.directory / 'out' / 'result.json').exists():
                job.state = 'running'
                self.log('start_confirmed', job)
            else:
                job.state = 'queued'
                job.started = None
                job.detached_at = time.monotonic()
                self.log('start_not_reached', job, action='requeued')
        code, out, _ = await self.control('list-units', '--all', '--plain', '--no-legend', PREFIX + '*.service')
        known = {j.unit for j in self.jobs.values() if j.state == 'running'}
        units = [line.split()[0] for line in out.splitlines() if line.split()]
        stray = [u for u in units if u.startswith(PREFIX) and u not in known]
        if stray:
            self.log('stray_units_stopped', units=stray)
            await self.control('stop', *stray)
        for job in self.jobs.values():
            if job.state == 'running':
                self.log('adopted', job)
            elif job.state == 'queued':
                self.log('restored', job)

    async def loop(self):
        while True:
            with contextlib.suppress(asyncio.TimeoutError):
                await asyncio.wait_for(self.wakeup.wait(), 1.0)
            self.wakeup.clear()
            try:
                await self.reap()
                await self.orphan_check()
                await self.schedule()
                if self.dirty:
                    self.save()
            except Exception as exc:
                self.log('scheduler_error', error=type(exc).__name__ + ': ' + str(exc)[:300])
                await asyncio.sleep(2)


async def send(writer, **event):
    writer.write((json.dumps(event) + '\n').encode())
    await asyncio.wait_for(writer.drain(), 30)


async def serve():
    notify = os.environ.pop('NOTIFY_SOCKET', None)
    STATE.mkdir(exist_ok=True, mode=0o750)
    JOBS.mkdir(exist_ok=True, mode=0o750)
    scheduler = Scheduler()
    for path in (STATE, JOBS):
        os.chown(path, 0, scheduler.account.pw_gid)
    RUN.mkdir(exist_ok=True, mode=0o750)
    os.chown(RUN, 0, scheduler.account.pw_gid)
    scheduler.load()
    for job in scheduler.jobs.values():
        if job.state != 'finished' and job.directory.exists():
            os.chown(job.directory, 0, scheduler.account.pw_gid)
            for name in ('stdout', 'stderr', 'request.json'):
                with contextlib.suppress(FileNotFoundError):
                    os.chown(job.directory / name, 0, scheduler.account.pw_gid)
            with contextlib.suppress(FileNotFoundError):
                os.chown(job.directory / 'out', scheduler.account.pw_uid, scheduler.account.pw_gid)
    await scheduler.adopt()
    cutoff = now() - 86400
    for path in JOBS.iterdir():
        job = scheduler.jobs.get(path.name)
        if (job is None or job.state == 'finished') and path.stat().st_mtime < cutoff:
            subprocess.run(['/usr/bin/rm', '-rf', '--one-file-system', str(path)], check=False)
    SOCKET.unlink(missing_ok=True)
    server = await asyncio.start_unix_server(scheduler.handle, path=str(SOCKET), limit=MAX_REQUEST)
    os.chmod(SOCKET, 0o660)
    os.chown(SOCKET, 0, scheduler.account.pw_gid)
    scheduler.log('scheduler_started', restored=sum(j.state != 'finished' for j in scheduler.jobs.values()),
                  config={k: v for k, v in scheduler.config.items() if not isinstance(v, dict)})
    if notify:
        with socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM) as ready:
            ready.connect('\0' + notify[1:] if notify.startswith('@') else notify)
            ready.sendall(b'READY=1')
    stop = asyncio.Event()
    for signum in (signal.SIGTERM, signal.SIGINT):
        asyncio.get_running_loop().add_signal_handler(signum, stop.set)
    async with server:
        loop = asyncio.create_task(scheduler.loop())
        await stop.wait()
        loop.cancel()
        scheduler.save()
        scheduler.log('scheduler_stopped', running=sum(j.state == 'running' for j in scheduler.jobs.values()))
        sys.stdout.flush()
        os._exit(0)


def own_cgroup():
    line = Path('/proc/self/cgroup').read_text().splitlines()[0]
    return Path('/sys/fs/cgroup' + line.split(':', 2)[-1].strip())


def worker(directory):
    if not isolated():
        raise SystemExit('build worker requires the system build slice')
    directory = Path(directory)
    req = json.loads((directory / 'request.json').read_text())
    if req.get('remote'):
        data = remote_worker.run(req, directory)
        data['time'] = time.time()
        path = directory / 'out' / 'result.json'
        temporary = path.with_suffix('.tmp')
        temporary.write_text(json.dumps(data))
        temporary.replace(path)
        return
    config = load_config()
    env = dict(req['env'])
    job_id = directory.name
    home = env.get('HOME') or pwd.getpwuid(os.getuid()).pw_dir
    env.update(PANDAOS_ANDROID_QUEUE_ACTIVE='1', PANDAOS_BUILD_JOB_ID=job_id)
    out = directory / 'out'
    if config.get('ccache') and Path('/usr/bin/ccache').exists():
        env.setdefault('CCACHE_DIR', home + '/.cache/ccache')
        env.setdefault('CCACHE_BASEDIR', home)
        env.setdefault('CCACHE_NOHASHDIR', 'true')
        env.setdefault('CCACHE_STATSLOG', str(out / 'ccache.log'))
    sccache = config.get('sccache')
    use_sccache = sccache and Path(sccache).exists() and 'RUSTC_WRAPPER' not in env
    if use_sccache:
        port = req.get('sccache_port')
        if not port:
            with socket.socket() as probe:
                probe.bind(('127.0.0.1', 0))
                port = probe.getsockname()[1]
        env.update(RUSTC_WRAPPER=sccache, SCCACHE_SERVER_PORT=str(port))
        env.setdefault('SCCACHE_DIR', home + '/.cache/sccache')
        env.setdefault('SCCACHE_CACHE_SIZE', '40G')
        env.setdefault('SCCACHE_IDLE_TIMEOUT', '0')
    os.chdir(req['cwd'])
    start = time.time()
    try:
        child = subprocess.Popen(req['command'], env=env, stdin=subprocess.DEVNULL)
    except OSError as exc:
        print('build-scheduler: cannot launch command: ' + exc.strerror, file=sys.stderr, flush=True)
        write_result(out, 127 if exc.errno == 2 else 126, {})
        return
    for signum in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        signal.signal(signum, lambda s, _f: child.send_signal(s))
    code = child.wait()
    code = code if code >= 0 else 128 - code
    extra = {}
    if use_sccache:
        with contextlib.suppress(Exception):
            stats = subprocess.run([sccache, '--show-stats', '--stats-format', 'json'], env=env, timeout=20,
                                   capture_output=True, text=True)
            data = json.loads(stats.stdout)['stats']
            hits = sum(data.get('cache_hits', {}).get('counts', {}).values())
            misses = sum(data.get('cache_misses', {}).get('counts', {}).values())
            if hits or misses:
                extra['sccache'] = dict(hits=hits, misses=misses)
            subprocess.run([sccache, '--stop-server'], env=env, timeout=20, capture_output=True)
    with contextlib.suppress(OSError):
        counts = collections.Counter(line.strip() for line in (out / 'ccache.log').read_text().splitlines()
                                     if line.strip() and not line.startswith('#'))
        hits = counts['direct_cache_hit'] + counts['preprocessed_cache_hit']
        if hits or counts['cache_miss']:
            extra['ccache'] = dict(hits=hits, misses=counts['cache_miss'])
    write_result(out, code, extra, start)


def write_result(out, code, extra, start=None):
    group = own_cgroup()
    data = dict(exit=code, time=time.time(), peak_memory=read_int(group / 'memory.peak', None),
                cpu_seconds=round(read_keyed(group / 'cpu.stat').get('usage_usec', 0) / 1e6, 1))
    read, written = read_io(group / 'io.stat')
    data.update(io_read=read, io_written=written, **extra)
    if start:
        data['wall'] = round(time.time() - start, 1)
    path = out / 'result.json'
    temporary = out / 'result.json.tmp'
    temporary.write_text(json.dumps(data))
    temporary.replace(path)


def connect():
    sock = socket.socket(socket.AF_UNIX)
    sock.settimeout(10)
    sock.connect(str(SOCKET))
    sock.settimeout(None)
    return sock


def request(payload):
    sock = connect()
    try:
        sock.sendall((json.dumps(payload) + '\n').encode())
        with sock.makefile('rb') as f:
            line = f.readline()
        return json.loads(line) if line else dict(event='error', error='no response')
    finally:
        sock.close()


def legacy_request(payload):
    path = '/run/pandaos-android-queue/queue.sock'
    if not os.path.exists(path):
        return None
    sock = socket.socket(socket.AF_UNIX)
    sock.settimeout(10)
    try:
        sock.connect(path)
        sock.sendall((json.dumps(payload) + '\n').encode())
        with sock.makefile('rb') as f:
            line = f.readline()
        return json.loads(line) if line else None
    except (OSError, ValueError):
        return None
    finally:
        sock.close()


def human_workers(data):
    cap = data.get('capacity') or {}
    print('local (Zotac): RAM frei für Builds %.1f GiB, CPU %.1f/%.1f Kerne, %d Jobs' % (
        cap.get('memory_free_for_builds_gib', 0), cap.get('cpu_committed', 0), cap.get('cpu_capacity', 0),
        cap.get('running', 0)))
    configured = (data.get('config') or {}).get('workers') or {}
    for name, enabled in configured.items():
        probe = (data.get('workers') or {}).get(name) or {}
        if not enabled:
            print('%s: deaktiviert' % name)
        elif probe.get('error') or not probe:
            print('%s: nicht erreichbar' % name)
        else:
            power = 'Netzteil' if probe.get('on_ac') else 'Akku %s %%' % probe.get('battery')
            print('%s: %s, %d Kerne, %.1f GiB frei, Last %.1f, %s, Leerlauf %ss, Werkzeuge: %s' % (
                name, probe.get('platform'), probe.get('cores', 0), probe.get('available_memory', 0) / GIB,
                probe.get('load', 0), power, probe.get('idle_seconds'), ', '.join(sorted(probe.get('tools') or {}))))


def human_status(data):
    cap = data['capacity']
    print('Kapazität: RAM frei für Builds %.1f GiB (verfügbar %.1f), CPU %.1f/%.1f Kerne, Druck CPU %.0f %% RAM %.0f %%' % (
        cap['memory_free_for_builds_gib'], cap['memory_available_gib'], cap['cpu_committed'], cap['cpu_capacity'],
        cap['cpu_pressure'], cap['memory_pressure']))
    if cap.get('legacy_memory_gib'):
        print('Alter Android-Broker: %.1f GiB, %.1f Kerne' % (cap['legacy_memory_gib'], cap['legacy_cores']))
    for job in data.get('legacy_jobs', []):
        print('alt #%d %s (alter Android-Broker)' % (job['sequence'], job['state']))
    for job in data['jobs']:
        when = time.strftime('%H:%M:%S', time.localtime(job['finished'] or job['started'] or job['created']))
        usage = job.get('usage') or {}
        measured = job.get('measured') or {}
        if job['state'] == 'starting':
            detail = 'startet'
        elif job['state'] == 'running':
            detail = 'läuft, %.1f GiB, %.1f Kerne' % (usage.get('memory_gib', 0), usage.get('cores', 0))
        elif job['state'] == 'queued':
            detail = 'wartet %ds: %s' % (job['waited'] or 0, job.get('wait_reason') or 'prüfe Kapazität')
        else:
            detail = 'Exit %s%s, %ss, Spitze %.1f GiB' % (
                job['exit'], ' (' + job['reason'] + ')' if job.get('reason') else '', measured.get('wall', '-'),
                (measured.get('peak_memory') or 0) / GIB)
        project = Path(job['project'] or '').name
        if job.get('worker', 'local') != 'local':
            detail = job['worker'] + ': ' + detail
        print('#%-5d %s %-6s %-11s %-22s %s | %s' % (job['sequence'], when, job['klass'], job['priority'],
                                                   project[:22], detail, job['command'][:70]))


def report(days):
    since = now() - days * 86400
    rows = []
    with contextlib.suppress(FileNotFoundError):
        for line in (STATE / 'history.jsonl').read_text().splitlines():
            with contextlib.suppress(ValueError):
                entry = json.loads(line)
                if entry['ts'] >= since:
                    rows.append(entry)
    q = lambda values, p: sorted(values)[int(p * (len(values) - 1))] if values else None
    result = dict(jobs=len(rows), classes={})
    for klass in CLASSES:
        subset = [r for r in rows if r['klass'] == klass]
        if not subset:
            continue
        result['classes'][klass] = dict(
            jobs=len(subset), failed=sum(r['exit'] != 0 for r in subset),
            wait_p50=q([r['waited'] for r in subset], .5), wait_p90=q([r['waited'] for r in subset], .9),
            wall_p50=q([r['wall'] for r in subset], .5), wall_p90=q([r['wall'] for r in subset], .9),
            peak_gib_max=gib(max(r['peak_memory'] for r in subset)),
            cores_p90=round(q([r['cpu_seconds'] / max(r['wall'], 1) for r in subset], .9), 2))
    spans = sorted((r['ts'] - r['wall'], r['ts']) for r in rows)
    events = sorted([(s, 1) for s, _ in spans] + [(e, -1) for _, e in spans])
    level = peak = 0
    for _, delta in events:
        level += delta
        peak = max(peak, level)
    result['max_parallel'] = peak
    mismatch = [r for r in rows if r['class_source'] == 'heuristic']
    result['heuristic_jobs'] = len(mismatch)
    gradle = [r['cache']['gradle'] for r in rows if (r.get('cache') or {}).get('gradle')]
    if gradle:
        tasks = sum(g['tasks'] for g in gradle)
        reused = sum(g.get('from_cache', 0) + g.get('up_to_date', 0) for g in gradle)
        result['gradle_reuse_rate'] = round(reused / max(tasks, 1), 3)
    for key in ('sccache', 'ccache'):
        stats = [r['cache'][key] for r in rows if (r.get('cache') or {}).get(key)]
        if stats:
            hits = sum(s['hits'] for s in stats)
            result[key + '_hit_rate'] = round(hits / max(hits + sum(s['misses'] for s in stats), 1), 3)
    print(json.dumps(result, indent=2))


def client(argv, legacy):
    prog = 'pandaos-android-queue' if legacy else NAME
    tag = 'android-queue' if legacy else 'build-scheduler'
    parser = argparse.ArgumentParser(prog=prog)
    parser.add_argument('--timeout', type=int, default=MAX_RUNTIME)
    parser.add_argument('--queue-timeout', type=int, default=MAX_WAIT)
    parser.add_argument('--priority', choices=LEVELS, default=os.environ.get('PANDAOS_BUILD_PRIORITY') or None)
    parser.add_argument('--class', dest='klass', choices=CLASSES, default=os.environ.get('PANDAOS_BUILD_CLASS') or None)
    parser.add_argument('--detach', action='store_true')
    parser.add_argument('--label')
    parser.add_argument('--worker', default='local', help='local (default), auto or a configured worker name')
    parser.add_argument('--artifact', action='append', default=[], help='project-relative path to fetch from a remote worker')
    parser.add_argument('--json', action='store_true')
    parser.add_argument('command', nargs=argparse.REMAINDER)
    args = parser.parse_args(argv)
    cmd = args.command
    if cmd[:1] == ['--']:
        cmd = cmd[1:]
    elif cmd[:1] == ['run']:
        cmd = cmd[2:] if cmd[1:2] == ['--'] else cmd[1:]
    try:
        if cmd == ['worker-probe']:
            data = request(dict(operation='worker-probe', worker=args.worker))
            print(json.dumps(data, indent=2))
            probe = data.get('probe')
            return 0 if data.get('event') != 'error' and isinstance(probe, dict) and probe and not probe.get('error') else 125
        if cmd == ['workers']:
            data = request(dict(operation='status', recent=0))
            if args.json:
                print(json.dumps(dict(workers=data.get('workers'), local=data.get('capacity')), indent=2))
            else:
                human_workers(data)
            return 0
        if cmd[:1] == ['status']:
            data = request(dict(operation='status', recent=int(cmd[1]) if len(cmd) > 1 else 20))
            legacy_data = legacy_request(dict(operation='status'))
            if legacy_data:
                data['legacy_jobs'] = [j for j in legacy_data.get('jobs', []) if j.get('state') != 'finished']
            if args.json or legacy:
                print(json.dumps(data, indent=2))
            else:
                human_status(data)
            return 0
        if len(cmd) == 2 and cmd[0] == 'cancel':
            data = request(dict(operation='cancel', id=cmd[1]))
            if data.get('event') == 'error':
                data = legacy_request(dict(operation='cancel', id=cmd[1])) or data
            print(json.dumps(data, indent=2))
            return data.get('exit', 125) if data.get('event') != 'error' else 125
        if cmd[:1] == ['report']:
            report(float(cmd[1]) if len(cmd) > 1 else 1)
            return 0
        if len(cmd) == 2 and cmd[0] in ('attach', 'logs'):
            return follow(dict(operation=cmd[0], id=cmd[1]), tag, cmd[0] == 'attach')
    except (OSError, ValueError) as exc:
        print(tag + ': ' + str(exc), file=sys.stderr)
        return 125
    if not cmd:
        parser.error('use -- COMMAND, status, cancel JOB, attach JOB, logs JOB or report [DAYS]')
    if not 1 <= args.timeout <= MAX_RUNTIME or not 1 <= args.queue_timeout <= MAX_WAIT_DARWIN:
        parser.error('timeout exceeds host bounds')
    if isolated():
        if args.worker != 'local':
            parser.error('select the optional worker on the outer queued command')
        os.execvpe(cmd[0], cmd, dict(os.environ))
    payload = dict(operation='submit', command=cmd, env=dict(os.environ), cwd=os.getcwd(), timeout=args.timeout,
                   queue_timeout=args.queue_timeout, priority=args.priority, klass=args.klass, detach=args.detach,
                   label=args.label, worker=args.worker, artifacts=args.artifact)
    if len((json.dumps(payload) + '\n').encode()) > MAX_REQUEST:
        print(tag + ': request exceeds 1 MiB', file=sys.stderr)
        return 125
    return follow(payload, tag, True)


def follow(payload, tag, owner):
    interrupted = []
    state = dict(sock=None, id=payload.get('id'), offsets=dict(stdout=0, stderr=0))

    def cancel(signum, _frame):
        interrupted.append(signum)
        with contextlib.suppress(OSError, AttributeError):
            state['sock'].sendall(b'{"cancel":true}\n')

    if owner:
        for signum in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
            signal.signal(signum, cancel)
    deadline = None
    while True:
        try:
            sock = connect()
            state['sock'] = sock
            sock.sendall((json.dumps(dict(payload, offsets=state['offsets'])) + '\n').encode())
            if interrupted:
                sock.sendall(b'{"cancel":true}\n')
            deadline = None
            with sock.makefile('rb') as f:
                for line in f:
                    event = json.loads(line)
                    kind = event.get('event')
                    if kind in ('stdout', 'stderr'):
                        data = base64.b64decode(event['data'])
                        state['offsets'][kind] += len(data)
                        out = sys.stdout.buffer if kind == 'stdout' else sys.stderr.buffer
                        out.write(data)
                        out.flush()
                    elif kind == 'queued':
                        state['id'] = event['id']
                        print('%s: queued %s #%d (%s, %s, %s)' % (tag, event['id'], event['sequence'], event['klass'],
                                                                   event['priority'], event['class_source']),
                              file=sys.stderr, flush=True)
                    elif kind == 'waiting':
                        print('%s: waiting #%d: %s' % (tag, event['sequence'], event['reason']), file=sys.stderr,
                              flush=True)
                    elif kind == 'running':
                        print('%s: running %s #%d' % (tag, event['id'], event['sequence']), file=sys.stderr,
                              flush=True)
                    elif kind == 'result':
                        if event.get('reason') and event['exit']:
                            print('%s: #%d finished: %s' % (tag, event['sequence'], event['reason']),
                                  file=sys.stderr, flush=True)
                        return 128 + interrupted[0] if interrupted else event['exit']
                    elif kind == 'error':
                        print(tag + ': ' + event['error'], file=sys.stderr)
                        return 125
        except (OSError, ValueError) as exc:
            if not state['id'] or payload.get('operation') not in ('submit', 'attach', 'logs'):
                print(tag + ': ' + str(exc), file=sys.stderr)
                return 125
        finally:
            with contextlib.suppress(OSError, AttributeError):
                state['sock'].close()
        if not state['id']:
            print(tag + ': scheduler disconnected before admission', file=sys.stderr)
            return 125
        deadline = deadline or time.monotonic() + 90
        if time.monotonic() > deadline:
            print(tag + ': scheduler unreachable; job ' + state['id'] + ' may still run, see status', file=sys.stderr)
            return 125
        if payload.get('operation') == 'submit':
            print(tag + ': scheduler connection lost, reattaching ' + state['id'], file=sys.stderr, flush=True)
        payload = dict(payload, operation='attach' if payload.get('operation') == 'submit' else payload['operation'],
                       id=state['id'])
        time.sleep(1)


if __name__ == '__main__':
    mode = sys.argv[1:2]
    if mode == ['serve']:
        asyncio.run(serve())
    elif mode == ['worker']:
        worker(sys.argv[2])
    else:
        legacy = os.environ.pop('PANDAOS_SCHEDULER_LEGACY_NAME', None) == '1'
        raise SystemExit(client(sys.argv[1:], legacy))
