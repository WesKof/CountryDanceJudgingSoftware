param(
  [Parameter(Mandatory=$true)][string]$ProjectRoot,
  [Parameter(Mandatory=$true)][string]$NodeExecutable,
  [Alias('Profile')][ValidateSet('owner','test')][string]$StatusProfile='owner',
  [uint32]$OrganizerPid=0,
  [uint32]$ReceiverPid=0
)
$ErrorActionPreference='Stop'

function Normalize-PathText([string]$Value) { return $Value.Replace('\','/').TrimEnd('/').ToLowerInvariant() }
function Read-Arguments([string]$Value) {
  $result=@();$end=0
  foreach($match in [regex]::Matches($Value,'"([^"]*)"|([^\s"]+)')) {
    if($Value.Substring($end,$match.Index-$end).Trim() -or ($end -gt 0 -and $match.Index -eq $end)){return $null}
    if($match.Groups[1].Success){$result+=,$match.Groups[1].Value}else{$result+=,$match.Groups[2].Value}
    $end=$match.Index+$match.Length
  }
  if($Value.Substring($end).Trim()){return $null}
  return ,$result
}
function Match-Process($Process,[string]$Role,[int]$Port) {
  if(!$Process){return 'absent'}
  if(!$Process.ExecutablePath -or !$Process.CommandLine){return 'unknown'}
  if((Normalize-PathText $Process.ExecutablePath) -ne (Normalize-PathText $NodeExecutable)){return 'different'}
  $tokens=Read-Arguments $Process.CommandLine
  if(!$tokens -or $tokens.Count -lt 2){return 'unknown'}
  if((Normalize-PathText $tokens[0]) -ne (Normalize-PathText $NodeExecutable)){return 'different'}
  if($StatusProfile -eq 'test') {
    $expected=@((Join-Path $ProjectRoot ('work/local-status-fixtures/'+$Role+'.mjs')))
  }elseif($Role -eq 'organizer') {
    $expected=@((Join-Path $ProjectRoot 'node_modules/vinext/dist/cli.js'),'dev','--hostname','127.0.0.1','--port',[string]$Port)
  }else {
    $expected=@('--env-file=.dev.vars','--experimental-strip-types',(Join-Path $ProjectRoot 'scripts/fake-publisher.mts'))
  }
  if($tokens.Count -ne $expected.Count+1){return 'different'}
  for($index=0;$index -lt $expected.Count;$index++) {
    $pathArgument=($StatusProfile -eq 'test' -or ($Role -eq 'organizer' -and $index -eq 0) -or ($Role -eq 'receiver' -and $index -eq 2))
    if($pathArgument){if((Normalize-PathText $tokens[$index+1]) -ne (Normalize-PathText $expected[$index])){return 'different'}}
    elseif($tokens[$index+1] -cne $expected[$index]){return 'different'}
  }
  return 'match'
}
function Read-Process([uint32]$Identifier) {
  if(!$Identifier){return $null}
  $key=[string]$Identifier
  if(!$processes.ContainsKey($key)){$processes[$key]=Get-CimInstance Win32_Process -Filter ('ProcessId='+$Identifier) -ErrorAction Stop}
  return $processes[$key]
}
function Trace-Ancestry([uint32]$ListenerId,[uint32]$SavedId,[scriptblock]$Lookup) {
  $checked=@{};$seen=@{};$cursor=$ListenerId;$child=$null;$found=$false;$stable=$true
  if(!$SavedId){return @{matches=$false;stable=$true;checked=$checked}}
  for($step=0;$step -lt 64 -and $cursor -gt 0 -and !$seen.ContainsKey([string]$cursor);$step++) {
    $seen[[string]$cursor]=$true;$node=& $Lookup $cursor
    if(!$node -or !$node.CreationDate -or ($child -and $node.CreationDate -gt $child.CreationDate)){$stable=$false;break}
    $checked[[string]$cursor]=$node
    if($cursor -eq $SavedId){$found=$true;break}
    $child=$node;$cursor=[uint32]$node.ParentProcessId
  }
  return @{matches=$found;stable=$stable;checked=$checked}
}
function Test-ListenerSnapshot($Before,$After) {
  $left=@($Before|ForEach-Object {$_.LocalAddress+'|'+[string]$_.LocalPort+'|'+[string]$_.OwningProcess}|Sort-Object)
  $right=@($After|ForEach-Object {$_.LocalAddress+'|'+[string]$_.LocalPort+'|'+[string]$_.OwningProcess}|Sort-Object)
  return (($left -join "`n") -ceq ($right -join "`n"))
}
if($MyInvocation.InvocationName -eq '.'){return}
try {
  $processes=@{}
  $listeners=@(Get-NetTCPConnection -State Listen -ErrorAction Stop)
  $ports=if($StatusProfile -eq 'owner'){@{organizer=3000;receiver=3100}}else{@{organizer=3001;receiver=3110}}
  $pids=@{organizer=$OrganizerPid;receiver=$ReceiverPid};$services=@{}
  foreach($role in @('organizer','receiver')) {
    $saved=$pids[$role];$process=Read-Process $saved;$observed=@($listeners|Where-Object LocalPort -eq $ports[$role])
    $state=Match-Process $process $role $ports[$role];$ancestry=$true;$stable=$true
    $checked=@{};$owned=@($observed|Select-Object -ExpandProperty OwningProcess -Unique)
    foreach($listenerId in $owned) {
      if($state -ne 'match'){$ancestry=$false;continue}
      $trace=Trace-Ancestry $listenerId $saved {param($identifier) Read-Process $identifier}
      if(!$trace.matches){$ancestry=$false};if(!$trace.stable){$stable=$false}
      foreach($entry in $trace.checked.GetEnumerator()){$checked[$entry.Key]=$entry.Value}
    }
    if($process){$checked[[string]$saved]=$process}
    foreach($entry in $checked.GetEnumerator()) {
      $fresh=Get-CimInstance Win32_Process -Filter ('ProcessId='+[uint32]$entry.Key) -ErrorAction Stop
      if(!$fresh -or !$fresh.CreationDate -or !$entry.Value.CreationDate -or $fresh.CreationDate -ne $entry.Value.CreationDate -or $fresh.ExecutablePath -cne $entry.Value.ExecutablePath -or $fresh.CommandLine -cne $entry.Value.CommandLine){$stable=$false}
    }
    $listener=if(!$observed.Count){'absent'}elseif(@($observed|Where-Object {$_.LocalAddress -notin @('127.0.0.1','::1')}).Count){'nonloopback'}else{'loopback'}
    if(!$stable){$state='unknown';$listener='unknown';$ancestry=$false}
    $services[$role]=@{process=$state;listener=$listener;listenerPids=@($owned|ForEach-Object {[uint32]$_});ancestryMatches=($ancestry -and $observed.Count -gt 0)}
  }
  $lastListeners=@(Get-NetTCPConnection -State Listen -ErrorAction Stop)
  foreach($role in @('organizer','receiver')) {
    $first=@($listeners|Where-Object LocalPort -eq $ports[$role]);$last=@($lastListeners|Where-Object LocalPort -eq $ports[$role])
    if(!(Test-ListenerSnapshot $first $last)){$services[$role].process='unknown';$services[$role].listener='unknown';$services[$role].ancestryMatches=$false}
  }
  @{state='observed';services=$services}|ConvertTo-Json -Depth 5 -Compress
}catch {
  # Never print raw CIM command lines, errors, environment values or manifest fields.
  @{state='unknown'}|ConvertTo-Json -Compress
}
