from pathlib import Path
import subprocess
import json
import urllib.request
import urllib.error

root = Path(__file__).resolve().parents[1]
version = '0.2.1'
result = subprocess.run(['git', 'credential', 'fill'], input='protocol=https\nhost=github.com\n\n', text=True, capture_output=True, check=True)
credential = dict(line.split('=', 1) for line in result.stdout.splitlines() if '=' in line)
token = credential['password']
api = 'https://api.github.com/repos/shizunavn/OpenHero68-RGB-Service'
headers = {'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'User-Agent': 'OpenHero68-release', 'X-GitHub-Api-Version': '2022-11-28'}
def request(url, data=None, content='application/json'):
    request_headers = dict(headers)
    if data is not None:
        request_headers['Content-Type'] = content
    with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=request_headers), timeout=60) as response:
        return json.load(response)
try:
    release = request(api + '/releases/tags/v' + version)
except urllib.error.HTTPError as error:
    if error.code != 404:
        raise SystemExit('GitHub release lookup failed: ' + str(error.code))
    release = request(api + '/releases', json.dumps({
        'tag_name': 'v' + version, 'target_commitish': 'main', 'name': 'OpenHero68 RGB Service v' + version,
        'body': 'The tray Check for updates now checks GitHub directly through the local service. It downloads and installs compatible signed core updates, downloads and verifies the full Windows ZIP when the launcher must change, and shows a window message when there is no update. The check runs in the background so the tray stays responsive.\n\nThis release changes the native launcher, so install the Windows ZIP once: quit the old tray app, extract the ZIP over its folder, and restart Hero68RgbService.exe. Later updates can be downloaded from the new tray menu. Main keyboard LEDs only; side LEDs retain their onboard effect.',
        'draft': False, 'prerelease': False, 'make_latest': 'true'
    }).encode())
names = {asset['name'] for asset in release['assets']}
upload = release['upload_url'].split('{')[0]
for name in ['OpenHero68-RGB-Windows-x64.zip', 'SHA256SUMS.txt']:
    if name in names:
        print('Existing release asset: ' + name)
        continue
    asset = request(upload + '?name=' + name, (root / 'service/releases' / name).read_bytes(), 'application/zip' if name.endswith('.zip') else 'application/json' if name.endswith('.json') else 'application/octet-stream')
    print('Uploaded ' + asset['name'] + ' (' + str(asset['size']) + ' bytes)')
print(release['html_url'])
