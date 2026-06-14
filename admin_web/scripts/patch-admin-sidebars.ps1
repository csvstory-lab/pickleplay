$DIR = Split-Path -Parent $PSScriptRoot

$fileActive = [ordered]@{
    'admin_dashboard.html'   = @('dashboard')
    'admin_users.html'       = @('users')
    'admin_categories.html'  = @('categories')
    'admin_board_list.html'  = @('board', 'board_list')
    'admin_post.html'        = @('board', 'board_list')
    'admin_post_detail.html' = @('board', 'board_list')
    'admin_events.html'      = @('events')
    'admin_reports.html'     = @('reports')
    'admin_ai_filter.html'   = @('ai')
    'admin_statistics.html'  = @('statistics')
    'admin_cs.html'          = @('cs')
    'admin_settings.html'    = @('settings')
    'dashboard.html'         = @('dashboard')
}

function Test-Active($set, $key) {
    if ($set.Contains($key)) { return ' active' }
    return ''
}

function Build-Sidebar([string[]]$activeKeys) {
    $set = [System.Collections.Generic.HashSet[string]]::new([string[]]$activeKeys)
    function ac([string]$key) { Test-Active $set $key }

    $sb = New-Object System.Text.StringBuilder
    [void]$sb.AppendLine('<aside class="sidebar">')
    [void]$sb.AppendLine('    <div class="logo-area">')
    [void]$sb.AppendLine('        <h1 class="logo" onclick="location.href=''admin_dashboard.html''">P!CKLE</h1>')
    [void]$sb.AppendLine('        <div class="logo-sub">ADMINISTRATOR 2.6</div>')
    [void]$sb.AppendLine('    </div>')
    [void]$sb.AppendLine('    <ul class="nav-menu">')
    [void]$sb.AppendLine("        <li class=""nav-item$(ac 'dashboard')"" onclick=""location.href='admin_dashboard.html'""><div class=""nav-item-left""><span class=""nav-icon"">📊</span> 대시보드</div></li>")
    [void]$sb.AppendLine("        <li class=""nav-item$(ac 'users')"" onclick=""return false;""><div class=""nav-item-left""><span class=""nav-icon"">👥</span> 회원 관리</div></li>")
    [void]$sb.AppendLine("        <li class=""nav-item$(ac 'categories')"" onclick=""location.href='admin_categories.html'""><div class=""nav-item-left""><span class=""nav-icon"">📁</span> 카테고리 관리</div></li>")
    [void]$sb.AppendLine("        <li class=""nav-item$(ac 'board')"" onclick=""location.href='admin_board_list.html'""><div class=""nav-item-left""><span class=""nav-icon"">🔥</span> 불판 관리</div></li>")
    [void]$sb.AppendLine("        <li class=""nav-sub-item$(ac 'board_list')"" onclick=""location.href='admin_board_list.html'"">· 일반 불판 관리</li>")
    [void]$sb.AppendLine("        <li class=""nav-sub-item$(ac 'spawn')"" onclick=""return false;"">· 스폰(최애) 불판 설정</li>")
    [void]$sb.AppendLine("        <li class=""nav-item$(ac 'ads')"" onclick=""return false;""><div class=""nav-item-left""><span class=""nav-icon"">💰</span> 광고(스폰) 정산</div></li>")
    [void]$sb.AppendLine("        <li class=""nav-sub-item$(ac 'ads_client')"" onclick=""return false;"">· 광고주 및 정산 관리</li>")
    [void]$sb.AppendLine("        <li class=""nav-sub-item$(ac 'ads_partner')"" onclick=""return false;"">· 파트너(대행사) 관리</li>")
    [void]$sb.AppendLine("        <li class=""nav-item$(ac 'events')"" onclick=""location.href='admin_events.html'""><div class=""nav-item-left""><span class=""nav-icon"">🎁</span> 이벤트/프로모션</div></li>")
    [void]$sb.AppendLine("        <li class=""nav-item$(ac 'reports')"" onclick=""location.href='admin_reports.html'""><div class=""nav-item-left""><span class=""nav-icon"">🚨</span> 신고 및 제재 관리</div><span class=""badge-danger"">12</span></li>")
    [void]$sb.AppendLine("        <li class=""nav-item$(ac 'ai')"" onclick=""location.href='admin_ai_filter.html'""><div class=""nav-item-left""><span class=""nav-icon"">🤖</span> AI 필터링 설정</div></li>")
    [void]$sb.AppendLine("        <li class=""nav-item$(ac 'statistics')"" onclick=""location.href='admin_statistics.html'""><div class=""nav-item-left""><span class=""nav-icon"">📈</span> 통계 및 분석</div></li>")
    [void]$sb.AppendLine("        <li class=""nav-item$(ac 'cs')"" onclick=""location.href='admin_cs.html'""><div class=""nav-item-left""><span class=""nav-icon"">🎧</span> 고객센터 (CS)</div></li>")
    [void]$sb.AppendLine("        <li class=""nav-item$(ac 'settings')"" onclick=""location.href='admin_settings.html'""><div class=""nav-item-left""><span class=""nav-icon"">⚙️</span> 시스템 설정</div></li>")
    [void]$sb.AppendLine('    </ul>')
    [void]$sb.AppendLine('</aside>')
    return $sb.ToString().TrimEnd()
}

foreach ($kv in $fileActive.GetEnumerator()) {
    $fp = Join-Path $DIR $kv.Key
    if (-not (Test-Path $fp)) {
        Write-Host "skip missing: $($kv.Key)"
        continue
    }
    $html = [IO.File]::ReadAllText($fp)
    $sidebar = Build-Sidebar $kv.Value
    $newHtml = [regex]::Replace($html, '(?s)<aside class="sidebar">.*?</aside>', $sidebar)
    if ($newHtml -eq $html) {
        Write-Host "skip no match: $($kv.Key)"
        continue
    }
    [IO.File]::WriteAllText($fp, $newHtml)
    Write-Host "patched: $($kv.Key)"
}
