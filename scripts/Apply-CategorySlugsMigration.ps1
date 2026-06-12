# supabase/20_posts_category_slugs.sql 적용 (Npgsql)
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$sqlPath = Join-Path $root 'supabase\20_posts_category_slugs.sql'
$passFile = Join-Path $root 'pass_supabase.txt'
$projectRef = 'jszgznanptutwxcsnrep'
$nugetDir = Join-Path $PSScriptRoot '.nuget'
$npgsqlDll = Join-Path $nugetDir 'lib\netstandard2.0\Npgsql.dll'

function Get-DbPassword {
    if ($env:SUPABASE_DB_PASSWORD) { return $env:SUPABASE_DB_PASSWORD.Trim() }
    if (Test-Path $passFile) { return (Get-Content $passFile -Raw).Trim() }
    throw 'DB password missing: pass_supabase.txt or SUPABASE_DB_PASSWORD'
}

if (-not (Test-Path $npgsqlDll)) {
    Write-Host '[P!CKLE] Downloading Npgsql 6.0.11...'
    New-Item -ItemType Directory -Force -Path $nugetDir | Out-Null
    $zip = Join-Path $PSScriptRoot 'npgsql.zip'
    Invoke-WebRequest -Uri 'https://www.nuget.org/api/v2/package/Npgsql/6.0.11' -OutFile $zip
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $nugetDir)
    Remove-Item $zip -Force
}

Add-Type -Path $npgsqlDll

$password = Get-DbPassword
$builder = New-Object Npgsql.NpgsqlConnectionStringBuilder
$builder.Host = "db.$projectRef.supabase.co"
$builder.Port = 5432
$builder.Database = 'postgres'
$builder.Username = 'postgres'
$builder.Password = $password
$builder.SslMode = [Npgsql.SslMode]::Require
$builder.TrustServerCertificate = $true

$sql = Get-Content $sqlPath -Raw
$conn = New-Object Npgsql.NpgsqlConnection($builder.ConnectionString)
try {
    $conn.Open()
    Write-Host '[P!CKLE] Connected. Applying migration...'
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = $sql
    [void]$cmd.ExecuteNonQuery()

    $verifyCmd = $conn.CreateCommand()
    $verifyCmd.CommandText = @"
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.posts'::regclass
  AND conname = 'posts_category_check';
"@
    $reader = $verifyCmd.ExecuteReader()
    if ($reader.Read()) {
        Write-Host '[P!CKLE] Migration OK'
        Write-Host ('[P!CKLE] Constraint: ' + $reader['def'])
    } else {
        throw 'posts_category_check constraint not found after migration'
    }
    $reader.Close()

    $countCmd = $conn.CreateCommand()
    $countCmd.CommandText = 'SELECT COUNT(*) FROM public.posts;'
    $count = $countCmd.ExecuteScalar()
    Write-Host ("[P!CKLE] posts rows: $count")
}
finally {
    if ($conn.State -eq 'Open') { $conn.Close() }
    $conn.Dispose()
}
