const fs = require('fs');
const exists = fs.existsSync('frontend/src/pages/CryptoMarket.jsx');
console.log('exists:', exists);
if (exists) {
    const c = fs.readFileSync('frontend/src/pages/CryptoMarket.jsx', 'utf8');
    console.log('length:', c.length);
    const lines = c.split('\n');
    console.log('line count:', lines.length);
    console.log('lines 779-785:');
    for (let i = 779; i < Math.min(785, lines.length); i++) {
        console.log(`L${i}: [${JSON.stringify(lines[i])}]`);
    }
}
