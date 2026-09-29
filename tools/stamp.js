// Writes a build stamp into index.html so browsers never mix old and new modules after a deploy.
// The stamp is a hash of the files the page loads; the pre-commit hook runs this and stages index.html.
// Usage: node tools/stamp.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.resolve(__dirname, '..');
const files = ['app.js', 'styles.css', ...fs.readdirSync(path.join(root, 'src')).filter(f => f.endsWith('.js')).sort().map(f => 'src/' + f)];
const hash = crypto.createHash('sha1');
for (const f of files) hash.update(fs.readFileSync(path.join(root, f)));
const stamp = hash.digest('hex').slice(0, 8);
const indexPath = path.join(root, 'index.html');
const before = fs.readFileSync(indexPath, 'utf8');
const after = before.replace(/\?v=[A-Za-z0-9]+/g, `?v=${stamp}`);
if (!/\?v=/.test(before)) { console.error('index.html has no ?v= stamps to update'); process.exit(1); }
if (after !== before) fs.writeFileSync(indexPath, after);
console.log(`stamp ${stamp}${after !== before ? ' written to index.html' : ' (unchanged)'}`);
