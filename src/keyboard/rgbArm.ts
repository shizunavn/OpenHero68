import asset from './rgbFirmware0320.json'

// Bounded Thumb arithmetic port. Only the extracted RGB call graph is callable.
// SRAM and immutable ROM are the only address spaces; no device/peripheral I/O.
export class RgbArm {
  ram = new Uint8Array(0x10000)
  regs = new Uint32Array(16)
  n = false; z = false; c = false; v = false
  private code = new Map(asset.instructions.map(i => [i[0] as number, i]))
  private rom = Uint8Array.from(atob(asset.rom), c=>c.charCodeAt(0))
  read(p: number, size = 1): number {
    const memory = p >= 0x20000000 && p + size <= 0x20010000 ? this.ram : this.rom
    const offset = p - (memory === this.ram ? 0x20000000 : asset.romBase)
    if (offset < 0 || offset + size > memory.length) throw Error(`RGB read ${p.toString(16)}`)
    let value = 0
    for (let i = 0; i < size; i++) value += memory[offset + i] * 2 ** (8*i)
    return value >>> 0
  }
  write(p: number, value: number, size = 1) {
    const offset = p - 0x20000000
    if (offset < 0 || offset + size > this.ram.length) throw Error(`RGB write ${p.toString(16)}`)
    for (let i = 0; i < size; i++) this.ram[offset+i] = value >>> (8*i)
  }
  private nz(value: number) { this.n = !!(value & 0x80000000); this.z = (value >>> 0) === 0 }
  call(address: number, arg = 0) {
    this.regs[0] = arg; this.regs[13] = 0x2000f000; this.regs[14] = 0xfffffff1
    let pc = address
    for (let budget = 0; budget < 150000; budget++) {
      if (pc === 0xfffffff0) return
      if (asset.hooks.includes(pc)) { this.regs[0] = 0; pc = (this.regs[14] & ~1) >>> 0; continue }
      const entry = this.code.get(pc)
      if (!entry) throw Error(`RGB instruction ${pc.toString(16)}`)
      const [, size, opcode, , flags, writeback, raw] = entry
      const ops = raw as number[][], op = opcode as string
      const next = pc + (size as number)
      this.regs[15] = pc + 4
      const shift = (x: number, type: number, amount: number) => {
        if (!type) return x
        if (type >= 6) { amount = this.regs[amount] & 255; type -= 5 }
        if (!amount) return x
        if (type === 2) return amount >= 32 ? 0 : x << amount
        if (type === 3) return amount >= 32 ? 0 : x >>> amount
        if (type === 1) return amount >= 32 ? (x >> 31) : x >> amount
        if (type === 4) return (x >>> (amount & 31)) | (x << ((32-amount)&31))
        throw Error(`RGB shift ${type}`)
      }
      const value = (o: number[]) => o[0] === 0 ? shift(this.regs[o[1]], o[2], o[3]) >>> 0 : o[1] >>> 0
      // Literal LDR aligns PC; TBB uses the unaligned architectural PC.
      const mem = (o: number[]) => ((o[1]===15&&op.startsWith('ldr')?(this.regs[15]&~3):this.regs[o[1]]) + (o[2] < 0 ? 0 : (this.regs[o[2]] * o[3] * 2**o[5])) + o[4]) >>> 0
      const a = ops[1] ? value(ops[1]) : 0, b = ops[2] ? value(ops[2]) : 0
      let result = 0, assign = false, branch: number | undefined
      if (op === 'push') { this.regs[13] -= 4*ops.length; ops.forEach((o,i) => this.write(this.regs[13]+i*4,value(o),4)) }
      else if (op === 'pop') { ops.forEach((o,i) => { const x=this.read(this.regs[13]+i*4,4); if(o[1]===15) branch=x & ~1; else this.regs[o[1]]=x }); this.regs[13]+=4*ops.length }
      else if (op === 'bl') { this.regs[14] = next | 1; branch = value(ops[0]) }
      else if (op === 'bx') branch = value(ops[0]) & ~1
      else if (op === 'tbb') branch = pc+4+2*this.read(mem(ops[0]))
      else if (op === 'cbz' || op === 'cbnz') { if ((value(ops[0])===0)===(op==='cbz')) branch=value(ops[1]) }
      else if (op.startsWith('b') && !op.startsWith('bic')) {
        const condition: Record<string, boolean> = { b:true,beq:this.z,bne:!this.z,bhs:this.c,blo:!this.c,bls:!this.c||this.z,bmi:this.n,bpl:!this.n,blt:this.n!==this.v,bge:this.n===this.v }
        if (condition[op] === undefined) throw Error(op)
        if(condition[op]) branch=value(ops[0])
      }
      else if (op.startsWith('ldr') || op.startsWith('str')) {
        const double = op.endsWith('d'), m = ops[double ? 2 : 1], p = mem(m)
        const width = op.endsWith('b') ? 1 : op.endsWith('h') ? 2 : 4
        if(op.startsWith('ldr')) { this.regs[ops[0][1]]=this.read(p,width); if(double) this.regs[ops[1][1]]=this.read(p+4,4) }
        else { this.write(p,value(ops[0]),width); if(double) this.write(p+4,value(ops[1]),4) }
        if(writeback) this.regs[m[1]]=p
      }
      else if (op !== 'nop') {
        const left = ops.length === 2 ? value(ops[0]) : a
        const right = ops.length === 2 ? a : b
        assign = !['cmp','tst'].includes(op)
        if (op.startsWith('mov')) result = a
        else if (op === 'uxtb') result = a & 255
        else if (op === 'uxth') result = a & 65535
        else if (op.startsWith('add')) { const sum=left+right; result=sum>>>0; if(flags) { this.c=sum>0xffffffff; this.v=!!((~(left^right)&(left^result))&0x80000000) } }
        else if (op.startsWith('sub') || op === 'cmp' || op === 'rsb') { const x=op==='rsb'?right:left, y=op==='rsb'?left:right; result=(x-y)>>>0; if(flags||op==='cmp') { this.c=x>=y; this.v=!!(((x^y)&(x^result))&0x80000000) } }
        else if (op.startsWith('and') || op==='tst') result=left&right
        else if (op.startsWith('orr')) result=left|right
        else if (op.startsWith('bic')) result=left&~right
        else if (op==='muls') result=Math.imul(left,right)
        else if (op==='smulbb') result=Math.imul(a<<16>>16,b<<16>>16)
        else if (op==='mls') result=value(ops[3])-Math.imul(a,b)
        else if (op==='udiv') result=b ? Math.floor(a/b) : 0
        else if (op.startsWith('lsl') || op.startsWith('lsr')) {
          const count=right&255; result=shift(left,op.startsWith('lsl')?2:3,count)
          if(flags && count) this.c=count<=32 && !!(left & (op.startsWith('lsl') ? 2**(32-count) : 2**(count-1)))
        } else throw Error(`RGB opcode ${op}`)
        if(flags || op==='cmp' || op==='tst') this.nz(result)
        if(assign) this.regs[ops[0][1]]=result>>>0
      }
      pc = (branch ?? next) >>> 0
    }
    throw Error('RGB instruction budget exceeded')
  }
}

export { asset as RGB_FIRMWARE }
