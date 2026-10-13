$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$vigiaRoot=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$vigiaTools=Join-Path $vigiaRoot '.tools/local-ai'
New-Item -ItemType Directory -Path $vigiaTools -Force | Out-Null
$vigiaDownloads=@(
 @{file='llama-b11577-cpu.zip';url='https://github.com/ggml-org/llama.cpp/releases/download/b11577/llama-b11577-bin-win-cpu-x64.zip';sha='c48e5762bb466a2faba1b880ca8b328a152e7f48e738431eb918ac9078f82ef1';size=19509426;folder='llama-b11577'},
 @{file='whisper-b5454.zip';url='https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip';sha='6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb';size=8928640;folder='whisper-b5454'},
 @{file='Qwen3.5-0.8B-Q4_K_M.gguf';url='https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/resolve/main/Qwen3.5-0.8B-Q4_K_M.gguf';sha='bd258782e35f7f458f8aced1adc053e6e92e89bc735ba3be89d38a06121dc517';size=532517120},
 @{file='mmproj-F16.gguf';url='https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/resolve/main/mmproj-F16.gguf';sha='56e4c6cfe73b0c82e3e82bc518d7591997e61d81f723fc41a586f4fa69ea2453';size=204987232},
 @{file='ggml-base-q5_1.bin';url='https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin';sha='422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898';size=59707625}
)
foreach($vigiaDownload in $vigiaDownloads){
 $vigiaTarget=Join-Path $vigiaTools $vigiaDownload.file
 if(-not(Test-Path -LiteralPath $vigiaTarget)){
  Write-Output ('Baixando componente gratuito: '+$vigiaDownload.file)
  Invoke-WebRequest -Uri $vigiaDownload.url -OutFile ($vigiaTarget+'.part') -TimeoutSec 900
  if((Get-Item -LiteralPath ($vigiaTarget+'.part')).Length -ne $vigiaDownload.size){throw 'Tamanho de download inesperado.'}
  if((Get-FileHash -LiteralPath ($vigiaTarget+'.part') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $vigiaDownload.sha){throw 'Hash do componente não confere com o arquivo oficial.'}
  Move-Item -LiteralPath ($vigiaTarget+'.part') -Destination $vigiaTarget
 }
 if((Get-FileHash -LiteralPath $vigiaTarget -Algorithm SHA256).Hash.ToLowerInvariant() -ne $vigiaDownload.sha){throw ('Arquivo existente não validado: '+$vigiaDownload.file)}
 if($vigiaDownload.folder){$vigiaDestination=Join-Path $vigiaTools $vigiaDownload.folder;if(-not(Test-Path -LiteralPath $vigiaDestination)){Expand-Archive -LiteralPath $vigiaTarget -DestinationPath $vigiaDestination}}
 Write-Output ('Componente validado: '+$vigiaDownload.file)
}
$vigiaLicenses=@(
 @{file='LICENSE-Qwen-Apache-2.0.txt';url='https://huggingface.co/Qwen/Qwen3.5-0.8B/raw/main/LICENSE'},
 @{file='LICENSE-llama-MIT.txt';url='https://raw.githubusercontent.com/ggml-org/llama.cpp/master/LICENSE'},
 @{file='LICENSE-whisper-MIT.txt';url='https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/LICENSE'}
)
foreach($vigiaLicense in $vigiaLicenses){$vigiaTarget=Join-Path $vigiaTools $vigiaLicense.file;if(-not(Test-Path -LiteralPath $vigiaTarget)){Invoke-WebRequest -Uri $vigiaLicense.url -OutFile $vigiaTarget -TimeoutSec 60}}
$vigiaDownloads|ConvertTo-Json -Depth 3|Set-Content -LiteralPath (Join-Path $vigiaTools 'download-manifest.json') -Encoding utf8
Write-Output 'Ferramentas gratuitas locais instaladas sem alterar produção ou criar conta externa.'
