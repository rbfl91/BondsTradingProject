$files = @(
    "frontend/src/pages/CryptoMarket.jsx",
    "frontend/src/pages/BondDetail.jsx", 
    "frontend/src/pages/Dashboard.jsx"
)

foreach ($f in $files) {
    if (Test-Path $f) {
        $content = Get-Content $f -Raw -Encoding UTF8
        $pattern = '<Spin size="large" tip="(.*?)" />'
        $replacement = '<Spin size="large"><div>$1</div></Spin>'
        $newContent = [regex]::Replace($content, $pattern, $replacement)
        if ($content -ne $newContent) {
            Set-Content $f $newContent -Encoding UTF8 -NoNewline
            Write-Output "Fixed: $f"
        } else {
            Write-Output "No changes in: $f"
        }
    } else {
        Write-Output "Not found: $f"
    }
}
