$DIR = Split-Path -Parent $PSScriptRoot
$files = Get-ChildItem -Path $DIR -Filter '*.html' -File
foreach ($file in $files) {
    $html = [IO.File]::ReadAllText($file.FullName)
    $orig = $html
    $html = $html.Replace("onclick=`"location.href='admin_users.html'`"", "onclick=`"return false;`"")
    $html = $html.Replace('<li class="nav-sub-item">· 스폰(최애) 불판 설정</li>', '<li class="nav-sub-item" onclick="return false;">· 스폰(최애) 불판 설정</li>')
    $html = $html.Replace('<li class="nav-item"><div class="nav-item-left"><span class="nav-icon">💰</span> 광고(스폰) 정산</div></li>', '<li class="nav-item" onclick="return false;"><div class="nav-item-left"><span class="nav-icon">💰</span> 광고(스폰) 정산</div></li>')
    $html = $html.Replace('<li class="nav-sub-item">· 광고주 및 정산 관리</li>', '<li class="nav-sub-item" onclick="return false;">· 광고주 및 정산 관리</li>')
    $html = $html.Replace('<li class="nav-sub-item">· 파트너(대행사) 관리</li>', '<li class="nav-sub-item" onclick="return false;">· 파트너(대행사) 관리</li>')
    if ($html -ne $orig) {
        [IO.File]::WriteAllText($file.FullName, $html)
        Write-Host "updated:" $file.Name
    }
}
