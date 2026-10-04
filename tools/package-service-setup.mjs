import {execFileSync} from 'node:child_process'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import path from 'node:path'
const version=JSON.parse(await readFile('service/version.json','utf8'))
const distribution=path.resolve(process.argv[2]??'service/dist'),release=path.resolve(process.argv[3]??'service/releases')
await mkdir(release,{recursive:true})
const compiler=process.env.HERO68_ISCC??path.resolve('.refactor/setup-tools/inno/ISCC.exe')
const driver=path.resolve('.refactor/setup-tools/ViGEmBus_1.22.0_x64_x86_arm64.exe')
execFileSync(compiler,[`/DAppVersion=${version.version}`,`/DDistribution=${distribution}`,`/DReleaseDirectory=${release}`,`/DDriverInstaller=${driver}`,path.resolve('service/installer/OpenHero68.iss')],{windowsHide:true,stdio:'inherit'})
const asset='OpenHero68-Setup-Windows-x64.exe',bytes=await readFile(path.join(release,asset))
await writeFile(path.join(release,'SHA256SUMS.txt'),createHash('sha256').update(bytes).digest('hex')+'  '+asset+'\n')
