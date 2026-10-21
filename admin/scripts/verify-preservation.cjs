const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { parse } = require('@vue/compiler-sfc')
const { baseParse } = require('@vue/compiler-dom')
const source = process.argv[2]
assert.ok(source, 'Pass the original admin-v3 directory')
const target = path.resolve(__dirname, '..')
function files(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(f => f.isDirectory() ? files(path.join(root, f.name)) : [path.join(root, f.name)])
}
let exactFiles = 0
for (const dir of ['src/api', 'src/router']) {
  for (const file of files(path.join(source, dir))) {
    const rel = path.relative(source, file)
    assert.ok(fs.readFileSync(file).equals(fs.readFileSync(path.join(target, rel))), rel + ' changed')
    exactFiles++
  }
}
function bindings(template) {
  const output = new Map()
  function visit(node) {
    for (const prop of node.props || []) {
      if (prop.type === 7 && ['on', 'model'].includes(prop.name)) {
        const key = JSON.stringify([node.tag, prop.name, prop.arg?.content, prop.exp?.content])
        output.set(key, (output.get(key) || 0) + 1)
      }
    }
    for (const child of node.children || []) visit(child)
  }
  visit(baseParse(template))
  return output
}
let views = 0, preservedBindings = 0
for (const file of files(path.join(source, 'src/views')).filter(f => f.endsWith('.vue'))) {
  const rel = path.relative(source, file)
  const before = bindings(parse(fs.readFileSync(file, 'utf8')).descriptor.template.content)
  const after = bindings(parse(fs.readFileSync(path.join(target, rel), 'utf8')).descriptor.template.content)
  for (const [key, count] of before) {
    assert.ok((after.get(key) || 0) >= count, rel + ': missing original interaction ' + key)
    preservedBindings += count
  }
  views++
}
console.log(JSON.stringify({ exactApiAndRouterFiles: exactFiles, preservedViews: views, preservedEventAndModelBindings: preservedBindings }, null, 2))
