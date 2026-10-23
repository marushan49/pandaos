#!/usr/bin/python3
import json
import os
from pathlib import Path
import sys

sys.path.insert(0, '/usr/local/lib/pandaos-build-scheduler')
from scheduler import isolated, load_config


config = json.loads(Path('/etc/pandaos-android-queue/config.json').read_text())
name = Path(sys.argv[0]).name
real = config['tools'].get(name)
if not real or not os.access(real, os.X_OK):
    raise SystemExit('build-scheduler: no installed ' + name + '; use ./gradlew or an explicit queued command')
args = sys.argv[1:]
if name == 'java' and any(v in ('org.gradle.wrapper.GradleWrapperMain', 'org.gradle.launcher.GradleMain') for v in args):
    gradle = load_config()['gradle']
    args = ['-Dorg.gradle.daemon=false', '-Dorg.gradle.workers.max=' + str(gradle['workers']),
            '-Dorg.gradle.parallel=' + ('true' if gradle['workers'] > 1 else 'false'),
            '-Dorg.gradle.caching=' + ('true' if gradle['caching'] else 'false'),
            '-Dorg.gradle.jvmargs=' + gradle['jvmargs']] + args
os.environ['JAVA_HOME'] = config['real_java_home']
os.environ['ANDROID_HOME'] = config['android_home']
os.environ['ANDROID_SDK_ROOT'] = config['android_home']
if isolated():
    os.execv(real, [real] + args)
os.execv('/usr/local/bin/pandaos-build-scheduler', ['pandaos-build-scheduler', '--', real] + args)
