const fs = require('fs');
let c = fs.readFileSync('frontend/src/pages/CryptoMarket.jsx', 'utf8');

// Fix all Spin tip usages - replace <Spin size="large" tip="..." /> with nested div pattern
c = c.replace(
  /<Spin size="large" tip="(Loading chart\.\.\.)" \/>/g,
  '<Spin size="large"><div>$1</div></Spin>'
);

fs.writeFileSync('frontend/src/pages/CryptoMarket.jsx', c, 'utf8');
console.log('Fixed CryptoMarket.jsx Spin tips');

// Also fix BondDetail.jsx
let b = fs.readFileSync('frontend/src/pages/BondDetail.jsx', 'utf8');
b = b.replace(
  /<Spin size="large" tip="(Loading bond details\.\.\.)" \/>/g,
  '<Spin size="large"><div>$1</div></Spin>'
);
fs.writeFileSync('frontend/src/pages/BondDetail.jsx', b, 'utf8');
console.log('Fixed BondDetail.jsx Spin tips');

// Also fix Dashboard.jsx
let d = fs.readFileSync('frontend/src/pages/Dashboard.jsx', 'utf8');
d = d.replace(
  /<Spin size="large" tip="(Loading dashboard\.\.\.)" \/>/g,
  '<Spin size="large"><div>$1</div></Spin>'
);
fs.writeFileSync('frontend/src/pages/Dashboard.jsx', d, 'utf8');
console.log('Fixed Dashboard.jsx Spin tips');
