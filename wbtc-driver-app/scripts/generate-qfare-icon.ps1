param(
  [string]$SourcePath = "C:\Users\Pranjal Mullick\Downloads\qfare icon.png"
)

Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"

function New-BitmapCopy {
  param([string]$Path)

  $loaded = [System.Drawing.Bitmap]::FromFile($Path)
  $copy = New-Object System.Drawing.Bitmap $loaded
  $loaded.Dispose()
  return $copy
}

function Save-Png {
  param(
    [System.Drawing.Bitmap]$Bitmap,
    [string]$Path
  )

  $dir = Split-Path -Parent $Path
  if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir | Out-Null
  }

  $Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
}

function Save-ResizedPng {
  param(
    [System.Drawing.Bitmap]$Source,
    [int]$Width,
    [int]$Height,
    [string]$Path
  )

  $bitmap = New-Object System.Drawing.Bitmap $Width, $Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.DrawImage($Source, 0, 0, $Width, $Height)
  $graphics.Dispose()

  Save-Png -Bitmap $bitmap -Path $Path
  $bitmap.Dispose()
}

function New-MonochromeBitmap {
  param([System.Drawing.Bitmap]$Source)

  $bitmap = New-Object System.Drawing.Bitmap $Source.Width, $Source.Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

  for ($y = 0; $y -lt $Source.Height; $y++) {
    for ($x = 0; $x -lt $Source.Width; $x++) {
      $pixel = $Source.GetPixel($x, $y)
      $intensity = ($pixel.R + $pixel.G + $pixel.B) / 3.0
      if ($pixel.A -lt 10 -or $intensity -lt 55) {
        $bitmap.SetPixel($x, $y, [System.Drawing.Color]::Transparent)
      } else {
        $bitmap.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($pixel.A, 255, 255, 255))
      }
    }
  }

  return $bitmap
}

$root = Split-Path -Parent $PSScriptRoot
$assetsDir = Join-Path $root "assets\images"
$androidResDir = Join-Path $root "android\app\src\main\res"

$source = New-BitmapCopy -Path $SourcePath
$monochrome = New-MonochromeBitmap -Source $source

Save-Png -Bitmap $source -Path (Join-Path $assetsDir "icon.png")
Save-Png -Bitmap $source -Path (Join-Path $assetsDir "splash-icon.png")
Save-Png -Bitmap $source -Path (Join-Path $assetsDir "favicon.png")
Save-Png -Bitmap $source -Path (Join-Path $assetsDir "android-icon-foreground.png")
Save-Png -Bitmap $source -Path (Join-Path $assetsDir "android-icon-background.png")
Save-Png -Bitmap $monochrome -Path (Join-Path $assetsDir "android-icon-monochrome.png")

$launcherSizes = @{
  "mipmap-mdpi" = 48
  "mipmap-hdpi" = 72
  "mipmap-xhdpi" = 96
  "mipmap-xxhdpi" = 144
  "mipmap-xxxhdpi" = 192
}

foreach ($entry in $launcherSizes.GetEnumerator()) {
  $dir = Join-Path $androidResDir $entry.Key
  Save-ResizedPng -Source $source -Width $entry.Value -Height $entry.Value -Path (Join-Path $dir "ic_launcher.png")
  Save-ResizedPng -Source $source -Width $entry.Value -Height $entry.Value -Path (Join-Path $dir "ic_launcher_round.png")
}

Save-Png -Bitmap $source -Path (Join-Path $androidResDir "drawable-nodpi\ic_launcher_foreground_full.png")

$source.Dispose()
$monochrome.Dispose()
