import os

files = [
    'frontend/src/pages/CryptoMarket.jsx',
    'frontend/src/pages/BondDetail.jsx',
    'frontend/src/pages/Dashboard.jsx',
]

for fpath in files:
    with open(fpath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Replace Spin tip pattern with nested div
    old_pattern = '<Spin size="large" tip="'
    if old_pattern in content:
        import re
        new_content = re.sub(
            r'<Spin size="large" tip="(.*?)" />',
            lambda m: f'<Spin size="large"><div>{m.group(1)}</div></Spin>',
            content
        )
        with open(fpath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f'Fixed {fpath}')
    else:
        print(f'Spin tip not found in {fpath}')
