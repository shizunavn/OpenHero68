import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import {content} from '../landing/content.mjs';

const root = fileURLToPath(new URL('../',import.meta.url));
const output = path.join(root,'landing-dist');
const html = await readFile(path.join(output,'index.html'),'utf8');
assert.ok(!html.includes('{{'), 'All template values must be rendered');
assert.equal((html.match(/<h1>/g)||[]).length,1, 'One primary heading');
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]));
for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
  const target = match[1];
  if (target.startsWith('#')) {if(target.length>1)assert.ok(ids.has(target.slice(1)),`Broken anchor ${target}`);}
  else if (!target.startsWith('https://')) assert.ok((await stat(path.join(output,target))).isFile(),`Missing asset ${target}`);
}
const app = await readFile(path.join(output,'app.js'),'utf8');
const css = await readFile(path.join(output,'styles.css'),'utf8');
assert.ok(!/navigator\.hid|127\.0\.0\.1|fetch\(/.test(app),'Landing must not open hardware or make API calls');
assert.ok(css.includes('prefers-reduced-motion'),'Reduced motion support');
for (const match of html.matchAll(/data-i18n="([^"]+)"/g)) for(const language of ['en','vi']) assert.ok(content[language][match[1]],`Missing ${language} copy for ${match[1]}`);
const expectedTargets = ['https://open-hero68.pages.dev/','https://github.com/shizunavn/OpenHero68/releases/latest','https://github.com/shizunavn/OpenHero68'];
for(const target of expectedTargets)assert.ok(html.includes(`href="${target}"`),`Missing CTA ${target}`);
const canonical = html.match(/rel="canonical" href="([^"]+)"/)[1];
assert.ok((await readFile(path.join(output,'robots.txt'),'utf8')).includes(canonical+'sitemap.xml'));
assert.ok((await readFile(path.join(output,'sitemap.xml'),'utf8')).includes(`<loc>${canonical}</loc>`));
// Exercise the storage-denied path using the actual runtime function.
const storageFunction = app.match(/export function storedLanguage\(storage\) \{[\s\S]*?\n\}/)[0].replace('export ','');
const context = {storageKey:'openhero68.landing.language'};
vm.createContext(context); vm.runInContext(storageFunction,context);
assert.equal(context.storedLanguage({getItem(){throw Error('Storage denied');}}),'en');
assert.equal(context.storedLanguage({getItem(){return 'vi';}}),'vi');
assert.equal(context.storedLanguage({getItem(){return 'invalid';}}),'en');
console.log('Landing checks passed: translations, assets, anchors, CTAs, metadata, reduced motion and unavailable storage.');
