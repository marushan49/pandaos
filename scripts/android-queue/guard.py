#!/usr/bin/python3
import json
import os
from pathlib import Path
import sys

sys.path.insert(0, '/usr/local/lib/pandaos-android-queue')
from android_queue import isolated


config = json.loads(Path('/etc/pandaos-android-queue/config.json').read_text())
name = Path(sys.argv[0]).name
real = config['tools'].get(name)
if not real or not os.access(real, os.X_OK):
    raise SystemExit('android-queue: no installed ' + name + '; use ./gradlew or an explicit queued command')
args = sys.argv[1:]
if name == 'java' and any(v in ('org.gradle.wrapper.GradleWrapperMain', 'org.gradle.launcher.GradleMain') for v in args):
    args = ['-Dorg.gradle.daemon=false', '-Dorg.gradle.workers.max=1',
            '-Dorg.gradle.parallel=false',
            '-Dorg.gradle.jvmargs=-Xmx3g -XX:MaxMetaspaceSize=768m -XX:ActiveProcessorCount=2'] + args
os.environ['JAVA_HOME'] = config['real_java_home']
os.environ['ANDROID_HOME'] = config['android_home']
os.environ['ANDROID_SDK_ROOT'] = config['android_home']
if isolated():
    os.execv(real, [real] + args)
os.execv('/usr/local/bin/pandaos-android-queue', ['pandaos-android-queue', '--', real] + args)
