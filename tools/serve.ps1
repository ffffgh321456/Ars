# Мини-сервер для локального просмотра лендинга «Память рода».
# Запуск: powershell -NoProfile -ExecutionPolicy Bypass -File tools\serve.ps1
# Остановка: Ctrl+C
#
# Кроме статических файлов сервер отдаёт два локальных endpoint'а:
#   /api/heroes?q=Фамилия — поиск по открытой базе «Дорога памяти» (1418museum.ru)
#   /api/hero?id=123456   — подробные сведения одной записи
# Это нужно потому, что сайт 1418museum.ru не отдаёт CORS-заголовки
# и браузер не может обратиться к нему напрямую.

param(
  [int]$Port = 8765
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root = Split-Path -Parent $PSScriptRoot
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()

$UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
$CacheMinutes = 10
$script:SearchCache = @{}
$script:DetailCache = @{}

Write-Host "Сервер запущен: http://localhost:$Port/"
Write-Host "Корень: $root"
Write-Host "Остановка: Ctrl+C"

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".svg"  = "image/svg+xml"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".webp" = "image/webp"
  ".ico"  = "image/x-icon"
  ".docx" = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ".doc"  = "application/msword"
  ".woff2" = "font/woff2"
  ".pdf"  = "application/pdf"
}

function Get-RequestParam($Request, [string]$Name) {
  $raw = $Request.Url.Query
  if ([string]::IsNullOrWhiteSpace($raw)) { return "" }
  $raw = $raw.TrimStart("?")
  foreach ($pair in ($raw -split "&")) {
    if (-not $pair) { continue }
    $kv = $pair -split "=", 2
    $key = [System.Uri]::UnescapeDataString($kv[0].Replace("+", " "))
    if ($key -eq $Name) {
      if ($kv.Count -eq 2) {
        return [System.Uri]::UnescapeDataString($kv[1].Replace("+", " "))
      }
      return ""
    }
  }
  return ""
}

function Write-JsonResponse($Response, [int]$Status, $Data) {
  $json = $Data | ConvertTo-Json -Depth 10 -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $Response.StatusCode = $Status
  $Response.ContentType = "application/json; charset=utf-8"
  $Response.Headers["Cache-Control"] = "no-store"
  $Response.Headers["Access-Control-Allow-Origin"] = "*"
  $Response.ContentLength64 = $bytes.Length
  $Response.OutputStream.Write($bytes, 0, $bytes.Length)
}

function Write-SourceError($Response, [string]$BaseMessage, [string]$Detail) {
  $status = 502
  $text = $BaseMessage
  if ($Detail -match '\(503\)|\(429\)|Сервер не доступен|Too Many|rate limit') {
    $status = 429
    $text = "База «Дорога памяти» временно ограничила запросы с этого адреса. Подождите около 10 минут и нажмите «Повторить»."
  }
  Write-JsonResponse $Response $status ([pscustomobject]@{
    ok = $false
    error = $text
    detail = $Detail
  })
}

function ConvertTo-CleanText([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return "" }
  $text = [regex]::Replace($Value, "(?is)<(script|style)[^>]*>.*?</\1>", " ")
  $text = [regex]::Replace($text, "(?i)<br\s*/?>", " ")
  $text = [regex]::Replace($text, "<[^>]+>", " ")
  $text = [System.Net.WebUtility]::HtmlDecode($text)
  $text = [regex]::Replace($text, "\s+", " ").Trim()
  return $text
}

function Get-FirstValue([string]$Value) {
  $text = ConvertTo-CleanText $Value
  if (-not $text) { return "" }
  foreach ($part in ($text -split '\|')) {
    $part = $part.Trim()
    if ($part) { return $part }
  }
  return $text
}

function Get-ValueList([string]$Value) {
  $text = ConvertTo-CleanText $Value
  if (-not $text) { return @() }
  $seen = @{}
  $list = New-Object System.Collections.ArrayList
  foreach ($part in ($text -split '\|')) {
    $part = $part.Trim()
    if ($part -and -not $seen.ContainsKey($part)) {
      $seen[$part] = $true
      [void]$list.Add($part)
    }
  }
  return @($list)
}

function Format-HeroDate([string]$Value) {
  $text = Get-FirstValue $Value
  if (-not $text) { return "" }
  if ($text -match '^\d{2}\.\d{2}\.\d{4}$') { return $text }
  if ($text -match '^__\.__\.(\d{4})$') { return $Matches[1] + " г." }
  if ($text -match '^(\d{4})$') { return $Matches[1] + " г." }
  return ""
}

function Get-DateRangeValue([string]$Value) {
  $text = ConvertTo-CleanText $Value
  if (-not $text) { return "" }
  $parts = @($text -split '\|' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  foreach ($part in $parts) {
    if ($part -match '\d\s*[—–-]\s*\d') { return $part }
  }
  if ($parts.Count -gt 0) { return $parts[0] }
  return $text
}

function Get-BestName([string]$Value) {
  $text = ConvertTo-CleanText $Value
  if (-not $text) { return "" }
  $parts = @($text -split '\|' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  if ($parts.Count -eq 0) { return "" }
  $best = $parts[0]
  foreach ($part in $parts) {
    if (($part -split '\s+').Count -gt ($best -split '\s+').Count) { $best = $part }
  }
  return $best
}

function Get-RemoteHtml([string]$Url) {
  $attempts = 2
  $lastError = $null

  for ($attempt = 1; $attempt -le $attempts; $attempt++) {
    $response = $null
    $stream = $null
    $reader = $null
    try {
      # HttpWebRequest с KeepAlive = false: у Invoke-WebRequest в долгоживущем
      # процессе «залипают» keep-alive соединения, и музей начинает отвечать 503.
      $request = [System.Net.HttpWebRequest]::Create($Url)
      $request.UserAgent = $UserAgent
      $request.Accept = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      $request.Headers.Add("Accept-Language", "ru-RU,ru;q=0.9,en;q=0.8")
      $request.CachePolicy = New-Object System.Net.Cache.RequestCachePolicy("NoCacheNoStore")
      $request.KeepAlive = $false
      $request.Timeout = 12000
      $request.ReadWriteTimeout = 12000
      $request.AutomaticDecompression = [System.Net.DecompressionMethods]::GZip -bor [System.Net.DecompressionMethods]::Deflate

      $response = $request.GetResponse()
      $stream = $response.GetResponseStream()
      $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8, $true)
      return $reader.ReadToEnd()
    } catch {
      $lastError = $_
      if ($attempt -lt $attempts) {
        Start-Sleep -Milliseconds 700
      }
    } finally {
      if ($reader) { $reader.Close() }
      if ($stream) { $stream.Close() }
      if ($response) { $response.Close() }
    }
  }

  throw $lastError
}

function Get-HeroSearch([string]$Query) {
  $cacheKey = $Query.ToLowerInvariant()
  if ($script:SearchCache.ContainsKey($cacheKey)) {
    $cached = $script:SearchCache[$cacheKey]
    if (((Get-Date) - $cached.Time).TotalMinutes -lt $CacheMinutes) {
      return $cached.Data
    }
  }

  $url = "https://1418museum.ru/search/?q=" + [System.Uri]::EscapeDataString($Query)
  try {
    $html = Get-RemoteHtml $url
  } catch {
    if ($script:SearchCache.ContainsKey($cacheKey)) {
      return $script:SearchCache[$cacheKey].Data
    }
    throw
  }
  $chunks = [regex]::Split($html, '(?i)<div class="search__bodyItem')
  $records = New-Object System.Collections.ArrayList

  for ($i = 1; $i -lt $chunks.Count; $i++) {
    $chunk = $chunks[$i]
    $hrefMatch = [regex]::Match($chunk, 'href="(/heroes/(\d+)/\?SEARCH=Y)"')
    if (-not $hrefMatch.Success) { continue }

    $id = $hrefMatch.Groups[2].Value
    $names = @([regex]::Matches($chunk, 'personHero__nameItemElem">([^<]+)</span>') | ForEach-Object { Get-FirstValue $_.Groups[1].Value })
    $dates = @([regex]::Matches($chunk, 'personHero__dateItem">([^<]+)</span>') | ForEach-Object { Get-FirstValue $_.Groups[1].Value })
    $rankMatch = [regex]::Match($chunk, 'personHero__militaryRankName">([^<]*)</span>')

    $photoMatch = [regex]::Match($chunk, '(?is)<img[^>]+src="([^"]+)"[^>]*class="[^"]*personHero__image[^"]*"')
    if (-not $photoMatch.Success) {
      $photoMatch = [regex]::Match($chunk, '(?is)<img[^>]+class="[^"]*personHero__image[^"]*"[^>]*src="([^"]+)"')
    }
    $photo = ""
    if ($photoMatch.Success) {
      $photo = $photoMatch.Groups[1].Value
      if ($photo.StartsWith("/")) { $photo = "https://1418museum.ru" + $photo }
    }

    $lastName = if ($names.Count -gt 0) { $names[0] } else { "" }
    $firstName = if ($names.Count -gt 1) { $names[1] } else { "" }
    $middleName = if ($names.Count -gt 2) { $names[2] } else { "" }
    $birthRaw = if ($dates.Count -gt 0) { $dates[0] } else { "" }
    $deathRaw = if ($dates.Count -gt 1) { $dates[1] } else { "" }

    [void]$records.Add([pscustomobject]@{
      id = $id
      url = "https://1418museum.ru/heroes/$id/?SEARCH=Y"
      lastName = $lastName
      firstName = $firstName
      middleName = $middleName
      name = (($lastName + " " + $firstName + " " + $middleName).Trim())
      birth = (Format-HeroDate $birthRaw)
      death = (Format-HeroDate $deathRaw)
      rank = (ConvertTo-CleanText $rankMatch.Groups[1].Value)
      photo = $photo
    })
  }

  $pageMatches = [regex]::Matches($html, '/search/\?page=(\d+)&(?:amp;)?q=')
  $maxPage = 1
  foreach ($match in $pageMatches) {
    $page = [int]$match.Groups[1].Value
    if ($page -gt $maxPage) { $maxPage = $page }
  }
  $perPage = if ($records.Count -gt 0) { $records.Count } else { 17 }
  $found = if ($maxPage -gt 1) { ($maxPage - 1) * $perPage + $records.Count } else { $records.Count }

  $data = [pscustomobject]@{
    ok = $true
    source = "Дорога памяти"
    sourceUrl = $url
    query = $Query
    found = $found
    foundApprox = ($maxPage -gt 1)
    pages = $maxPage
    pageCount = $records.Count
    records = @($records)
  }

  $script:SearchCache[$cacheKey] = [pscustomobject]@{ Time = (Get-Date); Data = $data }
  return $data
}

function Get-HeroDetail([string]$Id) {
  if ($Id -notmatch '^\d{1,12}$') { throw "Неверный идентификатор записи." }

  if ($script:DetailCache.ContainsKey($Id)) {
    $cached = $script:DetailCache[$Id]
    if (((Get-Date) - $cached.Time).TotalMinutes -lt $CacheMinutes) {
      return $cached.Data
    }
  }

  $url = "https://1418museum.ru/heroes/$Id/?SEARCH=Y"
  try {
    $html = Get-RemoteHtml $url
  } catch {
    if ($script:DetailCache.ContainsKey($Id)) {
      return $script:DetailCache[$Id].Data
    }
    throw
  }

  $nameMatch = [regex]::Match($html, '(?is)<h1[^>]*class="[^"]*oneHero__title[^"]*"[^>]*>(.*?)</h1>')
  $dateMatch = [regex]::Match($html, '(?is)<span[^>]*class="[^"]*oneHero__date[^"]*"[^>]*>(.*?)</span>')

  $photoMatch = [regex]::Match($html, '(?is)<img[^>]*oneHero__image[^>]*>')
  $photo = ""
  if ($photoMatch.Success) {
    $srcMatch = [regex]::Match($photoMatch.Value, 'src="([^"]+)"')
    if ($srcMatch.Success) {
      $photo = $srcMatch.Groups[1].Value
      if ($photo.StartsWith("/")) { $photo = "https://1418museum.ru" + $photo }
    }
  }

  $properties = [regex]::Matches($html, '(?is)<span[^>]*class="[^"]*infoList__property[^"]*"[^>]*>(.*?)</span>\s*<p[^>]*class="[^"]*infoList__value[^"]*"[^>]*>(.*?)</p>')
  $facts = New-Object System.Collections.ArrayList
  $bio = ""

  foreach ($property in $properties) {
    $label = ConvertTo-CleanText $property.Groups[1].Value
    $values = @(Get-ValueList $property.Groups[2].Value)
    if (-not $label -or $values.Count -eq 0) { continue }

    if ($label -match '(?i)История|Биография') {
      $bio = $values -join " "
    } else {
      [void]$facts.Add([pscustomobject]@{
        label = $label
        value = ($values -join "; ")
      })
    }
  }

  $name = Get-BestName $nameMatch.Groups[1].Value
  $dateText = Get-DateRangeValue $dateMatch.Groups[1].Value
  $birth = ""
  $death = ""
  if ($dateText -match '^(.*?)\s*[—–-]\s*(.*)$') {
    $birth = Format-HeroDate $Matches[1]
    $death = Format-HeroDate $Matches[2]
  } else {
    $birth = Format-HeroDate $dateText
  }

  $data = [pscustomobject]@{
    ok = $true
    id = $Id
    url = $url
    name = $name
    birth = $birth
    death = $death
    photo = $photo
    facts = @($facts)
    bio = $bio
  }

  $script:DetailCache[$Id] = [pscustomobject]@{ Time = (Get-Date); Data = $data }
  return $data
}

while ($listener.IsListening) {
  try {
    $context = $listener.GetContext()
  } catch {
    break
  }

  $request = $context.Request
  $response = $context.Response

  try {
    $path = $request.Url.AbsolutePath

    if ($path -eq "/api/heroes") {
      $query = Get-RequestParam $request "q"
      if ([string]::IsNullOrWhiteSpace($query)) {
        Write-JsonResponse $response 400 ([pscustomobject]@{ ok = $false; error = "Введите фамилию для поиска." })
        continue
      }
      $query = $query.Trim()
      if ($query.Length -gt 80) { $query = $query.Substring(0, 80) }

      try {
        $data = Get-HeroSearch $query
        Write-JsonResponse $response 200 $data
      } catch {
        Write-SourceError $response "Не удалось получить сведения из открытой базы. Проверьте подключение к интернету." $_.Exception.Message
      }
      continue
    }

    if ($path -eq "/api/hero") {
      $id = Get-RequestParam $request "id"
      if ([string]::IsNullOrWhiteSpace($id) -or $id -notmatch '^\d{1,12}$') {
        Write-JsonResponse $response 400 ([pscustomobject]@{ ok = $false; error = "Неверный идентификатор записи." })
        continue
      }

      try {
        $data = Get-HeroDetail $id
        Write-JsonResponse $response 200 $data
      } catch {
        Write-SourceError $response "Не удалось загрузить подробности записи." $_.Exception.Message
      }
      continue
    }

    $relative = [System.Uri]::UnescapeDataString($request.Url.AbsolutePath).TrimStart("/")
    if ([string]::IsNullOrWhiteSpace($relative)) { $relative = "index.html" }

    $full = [System.IO.Path]::GetFullPath((Join-Path $root $relative))
    $rootFull = [System.IO.Path]::GetFullPath($root)

    if (-not $full.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
      $response.StatusCode = 403
      $response.Close()
      continue
    }

    if (Test-Path $full -PathType Container) {
      $full = Join-Path $full "index.html"
    }

    if (Test-Path $full -PathType Leaf) {
      $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
      $type = $mime[$ext]
      if (-not $type) { $type = "application/octet-stream" }

      $bytes = [System.IO.File]::ReadAllBytes($full)
      $response.ContentType = $type
      $response.ContentLength64 = $bytes.Length
      $response.Headers["Cache-Control"] = "no-store"
      $response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $response.StatusCode = 404
      $response.ContentType = "text/html; charset=utf-8"
      $body = [System.Text.Encoding]::UTF8.GetBytes("<h1>404</h1><p>Файл не найден: " + [System.Net.WebUtility]::HtmlEncode($relative) + "</p>")
      $response.OutputStream.Write($body, 0, $body.Length)
    }
  } catch {
    try {
      $response.StatusCode = 500
      $response.ContentType = "text/html; charset=utf-8"
      $body = [System.Text.Encoding]::UTF8.GetBytes("<h1>500</h1><p>Внутренняя ошибка сервера.</p>")
      $response.OutputStream.Write($body, 0, $body.Length)
    } catch { }
  } finally {
    try { $response.Close() } catch { }
  }
}

$listener.Stop()
