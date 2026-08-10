$ErrorActionPreference = "Continue"
$repo = "C:\Users\hazvi\Synops-Consulting Build\synops-src\synops"
$log  = Join-Path $repo ".mono-commit-log.txt"
Set-Location $repo
"DEPLOY RUN $(Get-Date -Format o)" | Out-File -Encoding ascii $log
git add -A 2>&1 | Out-File -Encoding ascii -Append $log
git commit -F .mono-commit-msg.txt 2>&1 | Out-File -Encoding ascii -Append $log
"COMMIT_EXIT=$LASTEXITCODE" | Out-File -Encoding ascii -Append $log
git pull --rebase --autostash origin main 2>&1 | Out-File -Encoding ascii -Append $log
"PULL_EXIT=$LASTEXITCODE" | Out-File -Encoding ascii -Append $log
git push origin main 2>&1 | Out-File -Encoding ascii -Append $log
"PUSH_EXIT=$LASTEXITCODE" | Out-File -Encoding ascii -Append $log
"---RECENT COMMITS---" | Out-File -Encoding ascii -Append $log
git log --oneline -3 2>&1 | Out-File -Encoding ascii -Append $log
"---DONE---" | Out-File -Encoding ascii -Append $log
Remove-Item (Join-Path $repo ".mono-commit-msg.txt") -ErrorAction SilentlyContinue
Remove-Item (Join-Path $repo "RUN-DEPLOY.bat") -ErrorAction SilentlyContinue
Remove-Item $PSCommandPath -ErrorAction SilentlyContinue
