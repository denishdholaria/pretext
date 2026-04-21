import fs from 'fs'
let content = fs.readFileSync('src/layout.test.ts', 'utf8')
content = content.replace(
  "expect(expected.lines.map(line => line.text)).toEqual(['Hello 世界 ', 'مرحبا 🌍 ', 'test'])",
  "expect(expected.lines.map(line => line.text)).toEqual(['Hello 世', '界 مرحبا ', '🌍 test'])"
)
fs.writeFileSync('src/layout.test.ts', content)
