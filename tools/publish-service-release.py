from pathlib import Path
import subprocess
import json
import urllib.request
import urllib.error

root = Path(__file__).resolve().parents[1]
version = '0.2.0'
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
        'body': 'The service now owns the HID connection in both Onboard and Custom modes, so AP, RT and profile Save remain available while RGB runs. Raw keyboard output drives reactive FX, including RT repress and macro output. Hall telemetry is polled once by the service and shared with the web. The tray launcher supervises a signed, independently updatable core and rolls back failed updates.\n\nExtract the Windows ZIP to a permanent folder and run Hero68RgbService.exe. Quit an older copy before replacing its files. The core files are for the new launcher only. Main keyboard LEDs only; side LEDs retain their onboard effect.',
        'draft': False, 'prerelease': False, 'make_latest': 'true'
    }).encode())
names = {asset['name'] for asset in release['assets']}
upload = release['upload_url'].split('{')[0]
for name in ['OpenHero68-RGB-Windows-x64.zip', 'SHA256SUMS.txt', 'OpenHero68-RGB-core.cjs', 'OpenHero68-RGB-core.json']:
    if name in names:
        print('Existing release asset: ' + name)
        continue
    asset = request(upload + '?name=' + name, (root / 'service/releases' / name).read_bytes(), 'application/zip' if name.endswith('.zip') else 'application/json' if name.endswith('.json') else 'application/octet-stream')
    print('Uploaded ' + asset['name'] + ' (' + str(asset['size']) + ' bytes)')
print(release['html_url'])
