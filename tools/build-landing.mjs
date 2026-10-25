import {readFile, writeFile, mkdir, copyFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {content} from '../landing/content.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'landing-dist');
const configuredUrl = process.env.LANDING_SITE_URL || 'https://openhero68-site.pages.dev';
const url = new URL(configuredUrl);
assert.ok(url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash, 'LANDING_SITE_URL must be an HTTPS origin without credentials, path, query or hash');
const siteUrl = url.origin;
assert.deepEqual(Object.keys(content.en).sort(), Object.keys(content.vi).sort(), 'EN and VI must have the same translation keys');
const template = await readFile(path.join(root, 'landing/index.html'), 'utf8');
for (const match of template.matchAll(/data-i18n="([^"]+)"/g)) assert.ok(content.en[match[1]] && content.vi[match[1]], `Missing translation: ${match[1]}`);
const escape = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const html = template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
  const value = key === 'siteUrl' ? siteUrl : content.en[key];
  assert.equal(typeof value, 'string', `Unknown template key: ${key}`);
  return escape(value);
});
await mkdir(path.join(output, 'assets/fonts'), {recursive:true});
for (const name of ['styles.css', 'app.js', 'content.mjs']) await copyFile(path.join(root, 'landing', name), path.join(output, name));
for (const [source, destination] of [
  ['docs/images/Open-hero68.png', 'assets/configurator.png'],
  ['docs/images/RGB-Setting-Page.png', 'assets/rhythm.png'],
  ['src/assets/openhero68-logo.png', 'assets/logo.png'],
  ['src/assets/fonts/cd31765d.woff2', 'assets/fonts/cd31765d.woff2'],
  ['src/assets/fonts/d47ab3c3.woff2', 'assets/fonts/d47ab3c3.woff2']
]) await copyFile(path.join(root, source), path.join(output, destination));
await writeFile(path.join(output, 'index.html'), html);
await writeFile(path.join(output, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`);
await writeFile(path.join(output, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${siteUrl}/</loc></url></urlset>\n`);
await writeFile(path.join(output, '_headers'), '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=(), hid=(), usb=(), serial=()\n  Content-Security-Policy: default-src \'self\'; script-src \'self\'; style-src \'self\'; img-src \'self\'; font-src \'self\'; connect-src \'none\'; object-src \'none\'; base-uri \'self\'; frame-ancestors \'none\'\n  X-Frame-Options: DENY\n');

export async function distributionFiles(directory = output, prefix = '') {
  const files = [];
  for (const item of await readdir(directory, {withFileTypes:true})) {
    assert.ok(!item.isSymbolicLink(), 'Symlinks must not enter the landing package');
    const relative = prefix + item.name;
    if (item.isDirectory()) files.push(...await distributionFiles(path.join(directory, item.name), relative + '/'));
    else files.push(relative);
  }
  return files.sort();
}

if (process.argv.includes('--package')) {
  // ZIP STORE entries keep this tiny static build dependency-free and portable.
  const crcTable = Array.from({length:256}, (_, n) => {
    let crc = n;
    for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    return crc >>> 0;
  });
  const localEntries = [], centralEntries = [];
  let offset = 0;
  const files = await distributionFiles();
  const expected = ['_headers','app.js','assets/configurator.png','assets/fonts/cd31765d.woff2','assets/fonts/d47ab3c3.woff2','assets/logo.png','assets/rhythm.png','content.mjs','index.html','robots.txt','sitemap.xml','styles.css'];
  assert.deepEqual(files, expected.sort(), 'Unexpected files in landing-dist; inspect before packaging');
  for (const file of files) {
    const bytes = await readFile(path.join(output, file));
    const name = Buffer.from(file);
    let crc = 0xffffffff;
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
    crc = (crc ^ 0xffffffff) >>> 0;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20,4); header.writeUInt16LE(0x800,6);
    header.writeUInt16LE(33,12); header.writeUInt32LE(crc,14); header.writeUInt32LE(bytes.length,18); header.writeUInt32LE(bytes.length,22); header.writeUInt16LE(name.length,26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20,4); central.writeUInt16LE(20,6); central.writeUInt16LE(0x800,8);
    central.writeUInt16LE(33,14); central.writeUInt32LE(crc,16); central.writeUInt32LE(bytes.length,20); central.writeUInt32LE(bytes.length,24); central.writeUInt16LE(name.length,28); central.writeUInt32LE(offset,42);
    localEntries.push(header, name, bytes); centralEntries.push(central,name);
    offset += header.length + name.length + bytes.length;
  }
  const central = Buffer.concat(centralEntries), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length,8); end.writeUInt16LE(files.length,10); end.writeUInt32LE(central.length,12); end.writeUInt32LE(offset,16);
  const bytes = Buffer.concat([...localEntries,central,end]);
  const name = 'openhero68-landing-pages.zip';
  await writeFile(path.join(root,name),bytes);
  await writeFile(path.join(root,name+'.sha256'),createHash('sha256').update(bytes).digest('hex')+'  '+name+'\n');
  console.log(`Packaged ${files.length} files, ${(bytes.length/1024).toFixed(0)} KB: ${name}`);
}
console.log(`Landing page built: ${output}\nCanonical: ${siteUrl}/`);
