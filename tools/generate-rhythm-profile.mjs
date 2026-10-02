import {readFileSync,writeFileSync} from 'node:fs'
// Development-time derivation only. The generated profile is compiled into the helper.
const source=readFileSync('docs/HEROMusicServe_RE_full_v2.md','utf8').split('# 47.')[1].split('# 48.')[0]
const positions=[1,15,16,17,18,19,20,21,22,23,24,25,26,27,98,28,29,30,31,32,33,34,35,36,37,38,39,40,41,99,42,43,44,45,46,47,48,49,50,51,52,53,54,102,55,56,57,58,59,60,61,62,63,64,65,66,74,103,67,68,69,70,71,72,73,76,75,77]
function rows(section){
  const text=source.split('['+section+']')[1].split('\n[')[0]
  return [...text.matchAll(/RowButton_\d+\s*=\s*"([^"]+)"/g)].map(m=>m[1])
}
function ids(text){
  const values=text.split(',').map(Number).filter(id=>positions.includes(id))
  // HERO68 has AltRight at POS71, absent from the reference's larger layout.
  // Place it beside Fn (POS72) in that reference's topology.
  if(values.includes(72))values.push(71)
  return [...new Set(values)]
}
const groups=section=>rows(section).map(ids).filter(group=>group.length)
const bloom=rows('Blooming_passion').map(row=>row.split('|').map(ids).filter(group=>group.length))
for(const [name,table] of [['rings',groups('Dazzling_rock')],['columns',groups('The_gurgling_stream')],...bloom.map((v,i)=>['bloom '+i,v])]){
  const seen=new Set(table.flat());if(positions.some(id=>!seen.has(id)))throw Error('Incomplete '+name)
}
const literal=value=>Array.isArray(value)?'{'+value.map(literal).join(',')+'}':String(value)
const out=`#pragma once\n// Derived from RE pass 2 profile, filtered to HERO68 POS. POS71 follows POS72.\nnamespace rhythm {\ninline const std::vector<std::vector<uint8_t>> dazzlingRings=${literal(groups('Dazzling_rock'))};\ninline const std::vector<std::vector<uint8_t>> gurglingColumns=${literal(groups('The_gurgling_stream'))};\ninline const std::vector<std::vector<std::vector<uint8_t>>> bloomPatterns=${literal(bloom)};\n}\n`
writeFileSync('service/native/rhythm_profile.h',out)
console.log('Generated HERO68 rhythm profile: 68 positions, 8 bloom patterns')
