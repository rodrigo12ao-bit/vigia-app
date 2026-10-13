$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
if (-not $request.text -or $request.text.Length -gt 1500) { throw 'Texto de voz inválido.' }
$target = [System.IO.Path]::GetFullPath($request.path)
$temporary = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
if (-not $target.StartsWith($temporary, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Destino inválido.' }
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $voice = $synth.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -eq 'pt-BR' } | Select-Object -First 1
  if (-not $voice) { throw 'Não há voz brasileira instalada neste computador.' }
  $synth.SelectVoice($voice.VoiceInfo.Name)
  $synth.Rate = 0
  $format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
  $synth.SetOutputToWaveFile($target, $format)
  $synth.Speak([string]$request.text)
} finally { $synth.Dispose() }
