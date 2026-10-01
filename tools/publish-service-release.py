from pathlib import Path
import subprocess
import json
import urllib.request
import urllib.error
import sys

root = Path(__file__).resolve().parents[1]
version = '0.2.3'
commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
remote_commit = subprocess.check_output(['git', 'ls-remote', 'origin', 'refs/heads/main'], cwd=root, text=True).split()[0]
if commit != remote_commit:
    raise SystemExit('Push the release commit to main before publishing.')
names = ['OpenHero68-RGB-Windows-x64.zip', 'SHA256SUMS.txt', 'OpenHero68-RGB-core.cjs', 'OpenHero68-RGB-core.json']
payloads = {name: (root / 'service/releases' / name).read_bytes() for name in names}
result = subprocess.run(['git', 'credential', 'fill'], input='protocol=https\nhost=github.com\n\n', text=True, capture_output=True, check=True)
credential = dict(line.split('=', 1) for line in result.stdout.splitlines() if '=' in line)
token = credential['password']
api = 'https://api.github.com/repos/shizunavn/OpenHero68-RGB-Service'
headers = {'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'User-Agent': 'OpenHero68-release', 'X-GitHub-Api-Version': '2022-11-28'}
def request(url, data=None, content='application/json', method=None):
    request_headers = dict(headers)
    if data is not None:
        request_headers['Content-Type'] = content
    with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=request_headers, method=method), timeout=60) as response:
        body = response.read()
        return json.loads(body) if body else None
body = '''Custom RGB now includes an Aurora base, Comet and Pressure Wave, a cleaner layer editor, and a local Demo that works without the background app. Pressure Wave uses Hall movement speed to estimate press intensity; Hall sensors do not measure physical force. RGB settings open Onboard Effects without changing playback.

The service supports https://open-hero68.pages.dev and the launcher opens this website. Allow the browser's local app/service permission when prompted. Background Service setup and recovery preserve your editor draft and require Apply before live updates resume.

Switch profiles are saved calibration IDs, not automatic identification of physical switches. The retired Ice King Axle label is removed; unknown IDs remain intact, and incomplete switch readback is rejected. Saving a full Meteor selection is covered by protocol tests.

This is the corrected v0.2.3 package. The first v0.2.3 package had a stale tray version label and an updater that could miss a launcher upgrade when the core already equaled the latest release. The new tray displays Launcher: 0.2.3 and reports core and launcher separately. Update checks now inspect signed launcher requirements even for an equal core version, share concurrent requests, reuse the verified manifest, and cache checksum-verified ZIP downloads. Consecutive core updates and rollback are covered by tests.

Download this full Windows x64 ZIP, quit the old tray app, extract every file over its folder, then run Hero68RgbService.exe. An old tray can incorrectly report the 0.2.3 core as latest; in that case download the ZIP manually. This release requires launcher 0.2.3; a core-only update cannot upgrade the launcher. Keep all included files together. If Auto-start points to another folder, choose Auto-start: replace old app path in the new tray. Auto-start remains optional.

Main keyboard LEDs only; side LEDs retain their onboard effect. Hall sampling targets up to 100 Hz for ten selected keys, while LED output targets 40 FPS. Tests, production build, native service build and signed package verification passed. A read-only hardware check confirmed all 68 saved switches as Meteor in profile 0; new RGB behavior and sustained FPS were not revalidated on hardware for this release.'''
def create_release():
    return request(api + '/releases', json.dumps({
        'tag_name': 'v' + version, 'target_commitish': commit, 'name': 'OpenHero68 RGB Service v' + version,
        'body': body, 'draft': True, 'prerelease': False
    }).encode())
try:
    release = request(api + '/releases/tags/v' + version)
except urllib.error.HTTPError as error:
    if error.code != 404:
        raise SystemExit('GitHub release lookup failed: ' + str(error.code))
    release = create_release()
if '--replace' in sys.argv and not release['draft']:
    # Only run when the user explicitly authorizes replacing this release.
    backup = root / 'service/releases/replaced-v0.2.3.json'
    backup.write_text(json.dumps(release, indent=2), encoding='utf-8')
    request(api + '/releases/' + str(release['id']), method='DELETE')
    request(api + '/git/refs/tags/v' + version, method='DELETE')
    release = create_release()
assets = {asset['name']: asset for asset in release['assets']}
upload = release['upload_url'].split('{')[0]
for name, payload in payloads.items():
    import hashlib
    asset = assets.get(name)
    expected = 'sha256:' + hashlib.sha256(payload).hexdigest()
    if asset:
        if asset['size'] != len(payload) or asset.get('digest') != expected:
            raise SystemExit('Existing release asset differs: ' + name)
    else:
        if not release['draft']:
            raise SystemExit('Published release is missing asset: ' + name)
        asset = request(upload + '?name=' + name, payload, 'application/zip' if name.endswith('.zip') else 'application/json' if name.endswith('.json') else 'application/octet-stream')
        if asset['size'] != len(payload) or asset.get('digest') != expected:
            raise SystemExit('Uploaded asset verification failed: ' + name)
    print('Verified ' + name + ' (' + str(asset['size']) + ' bytes)')
if release['draft']:
    release = request(api + '/releases/' + str(release['id']), json.dumps({
        'draft': False, 'prerelease': False, 'make_latest': 'true', 'body': body
    }).encode(), method='PATCH')
latest = request(api + '/releases/latest')
if latest['tag_name'] != 'v' + version or latest['draft']:
    raise SystemExit('Latest release verification failed.')
print(release['html_url'])
