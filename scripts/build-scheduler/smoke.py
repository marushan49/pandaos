#!/usr/bin/python3
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time


CLI = '/usr/local/bin/pandaos-build-scheduler'
results = []


def check(name, ok, detail=''):
    results.append(ok)
    print(('PASS ' if ok else 'FAIL ') + name + (': ' + detail if detail and not ok else ''), flush=True)


def run(*command, **kwargs):
    return subprocess.run([CLI, *command], capture_output=True, text=True, **kwargs)


def start(*command, **kwargs):
    return subprocess.Popen([CLI, *command], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, **kwargs)


def status():
    return json.loads(run('--json', 'status', '200').stdout)


def job_of(proc_stderr):
    for line in proc_stderr.splitlines():
        if ' queued ' in line:
            return line.split()[2]
    return None


def wait_for(predicate, timeout=30):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if predicate():
            return True
        time.sleep(0.3)
    return False


def main():
    work = Path(tempfile.mkdtemp(prefix='scheduler-smoke-'))
    a = work / 'a'
    b = work / 'b'
    a.mkdir()
    b.mkdir()
    subprocess.run(['git', 'init', '-q', str(a)], check=True)
    subprocess.run(['git', 'init', '-q', str(b)], check=True)

    result = run('--class', 'light', '--', 'sh', '-c', 'printf out; printf err >&2; exit 7')
    check('exit status and separate streams', result.returncode == 7 and result.stdout == 'out' and
          'err' in result.stderr, repr(result))

    result = run('--class', 'light', '--', '/nonexistent/tool')
    check('missing executable returns 127', result.returncode == 127, str(result.returncode))

    result = run('--class', 'light', '--', 'sh', '-c', CLI + ' -- cat /proc/self/cgroup')
    check('nested call runs inside the same job', result.returncode == 0 and
          'pandaos-build-job-' in result.stdout and result.stdout.count('\n') == 1, result.stdout + result.stderr)

    began = time.time()
    procs = [start('--class', 'medium', '--', 'sh', '-c', 'sleep 4', cwd=str(d)) for d in (a, b)]
    procs += [start('--class', 'light', '--', 'sh', '-c', 'sleep 4', cwd=str(a)) for _ in range(2)]
    codes = [p.wait() for p in procs]
    elapsed = time.time() - began
    check('four jobs run in parallel', codes == [0, 0, 0, 0] and elapsed < 12, '%s %.1fs' % (codes, elapsed))

    began = time.time()
    procs = [start('--class', 'medium', '--', 'sh', '-c', 'sleep 3', cwd=str(a)) for _ in range(2)]
    outputs = [p.communicate() for p in procs]
    elapsed = time.time() - began
    waited = any('gleicher Build-Ordner' in err for _, err in outputs)
    check('same build directory is serialized', elapsed >= 5.5 and waited, '%.1fs %s' % (elapsed, outputs))

    proc = start('--class', 'light', '--', 'sh', '-c', 'trap "" TERM; sleep 60 & wait')
    time.sleep(2)
    proc.send_signal(signal.SIGTERM)
    _, err = proc.communicate(timeout=30)
    check('SIGTERM cancels and returns 143', proc.returncode == 143, str(proc.returncode) + err)

    proc = start('--class', 'light', '--', 'sleep', '60')
    time.sleep(1.5)
    proc.kill()
    proc.wait()
    ok = wait_for(lambda: any(j['state'] == 'finished' and j['reason'] == 'client disconnected'
                              and 'sleep 60' in j['command'] for j in status()['jobs']), 45)
    check('killed client cancels its job after the grace period', ok)

    result = run('--class', 'light', '--timeout', '2', '--', 'sleep', '30')
    check('runtime limit returns 124', result.returncode == 124, str(result.returncode) + result.stderr)

    proc = start('--class', 'light', '--detach', '--', 'sh', '-c', 'sleep 3; echo detached-done')
    time.sleep(1)
    proc.kill()
    proc.wait()
    first = proc.stderr.read()
    job = job_of(first)
    time.sleep(4)
    result = run('logs', job) if job else None
    check('detached job survives client exit and logs replay', bool(result) and 'detached-done' in result.stdout
          and result.returncode == 0, repr(result))

    proc = start('--class', 'light', '--', 'sh', '-c', 'for i in 1 2 3 4 5 6 7 8; do echo tick$i; sleep 1; done')
    time.sleep(2.5)
    subprocess.run(['sudo', '-n', 'systemctl', 'restart', 'pandaos-build-scheduler.service'], check=True)
    out, err = proc.communicate(timeout=60)
    check('scheduler restart keeps the running job and reattaches the client', proc.returncode == 0 and
          all('tick%d' % i in out for i in range(1, 9)) and out.count('tick1') == 1, out + err)

    result = run('--class', 'light', '--', 'sh', '-c', 'echo $PANDAOS_BUILD_JOB_ID $CCACHE_BASEDIR')
    check('job environment carries id', result.returncode == 0 and len(result.stdout.split()[0]) == 32, result.stdout)

    data = status()
    check('status exposes capacity and reasons', 'capacity' in data and 'cpu_capacity' in data['capacity'])
    legacy = subprocess.run(['/usr/local/bin/pandaos-android-queue', 'status'], capture_output=True, text=True)
    check('legacy status still answers', legacy.returncode == 0 and '"jobs"' in legacy.stdout)
    subprocess.run(['rm', '-rf', str(work)], check=False)
    print('%d/%d passed' % (sum(results), len(results)))
    return 0 if all(results) else 1


if __name__ == '__main__':
    if sys.argv[1:] == ['--optional-worker']:
        import worker_tests
        sys.exit(worker_tests.main())
    else:
        sys.exit(main())
