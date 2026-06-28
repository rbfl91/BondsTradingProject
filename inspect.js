const fs = require('fs');
try {
    const c = fs.readFileSync('frontend/src/pages/CryptoMarket.jsx', 'utf8');
    const lines = c.split('\n');
    console.log('Total lines:', lines.length);
    for (let i = 779; i < Math.min(790, lines.length); i++) {
        console.log(`L${i}: ${JSON.stringify(lines[i])}`);
    }
} catch(e) {
    console.error('Error:', e.message);
}
