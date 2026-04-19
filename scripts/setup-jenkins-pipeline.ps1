param(
    [string]$JenkinsUrl = "http://localhost:8080",
    [Parameter(Mandatory = $true)]
    [string]$AdminUser,
    [Parameter(Mandatory = $true)]
    [string]$ApiToken,
    [string]$JobName = "rks-transports-ci-cd",
    [string]$RepoUrl = "",
    [string]$Branch = "main",
    [string]$ScriptPath = "ci-cd/Jenkinsfile",
    [string]$DockerCredentialsId = "dockerhub-creds",
    [string]$DockerUsername = "",
    [string]$DockerPassword = "",
    [bool]$PushImages = $false,
    [bool]$DeployK8s = $false,
    [switch]$TriggerBuild
)

$ErrorActionPreference = "Stop"

function New-BasicAuthHeader {
    param(
        [string]$User,
        [string]$Token
    )

    $raw = "${User}:${Token}"
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($raw)
    $b64 = [Convert]::ToBase64String($bytes)

    return @{ Authorization = "Basic $b64" }
}

function Get-JenkinsCrumb {
    param(
        [string]$BaseUrl,
        [hashtable]$AuthHeaders
    )

    $crumbUri = "$BaseUrl/crumbIssuer/api/json"
    $response = Invoke-RestMethod -Method Get -Uri $crumbUri -Headers $AuthHeaders
    return @{ ($response.crumbRequestField) = $response.crumb }
}

function Merge-Headers {
    param(
        [hashtable]$Left,
        [hashtable]$Right
    )

    $merged = @{}
    foreach ($k in $Left.Keys) { $merged[$k] = $Left[$k] }
    foreach ($k in $Right.Keys) { $merged[$k] = $Right[$k] }
    return $merged
}

function Invoke-JenkinsRequest {
    param(
        [string]$Method,
        [string]$Uri,
        [hashtable]$Headers,
        [string]$Body = "",
        [string]$ContentType = "application/xml"
    )

    if ([string]::IsNullOrWhiteSpace($Body)) {
        return Invoke-WebRequest -Method $Method -Uri $Uri -Headers $Headers -UseBasicParsing
    }

    return Invoke-WebRequest -Method $Method -Uri $Uri -Headers $Headers -Body $Body -ContentType $ContentType -UseBasicParsing
}

function New-PipelineJobConfigXml {
    param(
        [string]$GitRepo,
        [string]$GitBranch,
        [string]$JenkinsfilePath
    )

    $safeRepo = [System.Security.SecurityElement]::Escape($GitRepo)
    $safeBranch = [System.Security.SecurityElement]::Escape($GitBranch)
    $safeScript = [System.Security.SecurityElement]::Escape($JenkinsfilePath)

    @"
<?xml version='1.1' encoding='UTF-8'?>
<flow-definition plugin="workflow-job">
  <actions/>
  <description>RKS Transports CI/CD Pipeline</description>
  <keepDependencies>false</keepDependencies>
  <properties/>
  <definition class="org.jenkinsci.plugins.workflow.cps.CpsScmFlowDefinition" plugin="workflow-cps">
    <scm class="hudson.plugins.git.GitSCM" plugin="git">
      <configVersion>2</configVersion>
      <userRemoteConfigs>
        <hudson.plugins.git.UserRemoteConfig>
          <url>$safeRepo</url>
        </hudson.plugins.git.UserRemoteConfig>
      </userRemoteConfigs>
      <branches>
        <hudson.plugins.git.BranchSpec>
          <name>*/$safeBranch</name>
        </hudson.plugins.git.BranchSpec>
      </branches>
      <doGenerateSubmoduleConfigurations>false</doGenerateSubmoduleConfigurations>
      <submoduleCfg class="empty-list"/>
      <extensions/>
    </scm>
    <scriptPath>$safeScript</scriptPath>
    <lightweight>true</lightweight>
  </definition>
  <triggers>
    <com.cloudbees.jenkins.GitHubPushTrigger plugin="github">
      <spec></spec>
    </com.cloudbees.jenkins.GitHubPushTrigger>
  </triggers>
  <disabled>false</disabled>
</flow-definition>
"@
}

function New-DockerCredentialXml {
    param(
        [string]$CredentialsId,
        [string]$User,
        [string]$Password
    )

    $safeId = [System.Security.SecurityElement]::Escape($CredentialsId)
    $safeUser = [System.Security.SecurityElement]::Escape($User)
    $safePass = [System.Security.SecurityElement]::Escape($Password)

    @"
<com.cloudbees.plugins.credentials.impl.UsernamePasswordCredentialsImpl>
  <scope>GLOBAL</scope>
  <id>$safeId</id>
  <description>Docker registry credential used by CI/CD pipeline</description>
  <username>$safeUser</username>
  <password>$safePass</password>
</com.cloudbees.plugins.credentials.impl.UsernamePasswordCredentialsImpl>
"@
}

$JenkinsUrl = $JenkinsUrl.TrimEnd("/")

if ([string]::IsNullOrWhiteSpace($RepoUrl)) {
    $RepoUrl = (& git config --get remote.origin.url 2>$null)
    if ([string]::IsNullOrWhiteSpace($RepoUrl)) {
        throw "RepoUrl is required when git remote.origin.url is not configured."
    }
}

$auth = New-BasicAuthHeader -User $AdminUser -Token $ApiToken
$crumb = Get-JenkinsCrumb -BaseUrl $JenkinsUrl -AuthHeaders $auth
$headers = Merge-Headers -Left $auth -Right $crumb

Write-Host "Connected to Jenkins: $JenkinsUrl"

if (-not [string]::IsNullOrWhiteSpace($DockerUsername) -and -not [string]::IsNullOrWhiteSpace($DockerPassword)) {
    $credXml = New-DockerCredentialXml -CredentialsId $DockerCredentialsId -User $DockerUsername -Password $DockerPassword
    $credCreateUri = "$JenkinsUrl/credentials/store/system/domain/_/createCredentials"

    try {
        Invoke-JenkinsRequest -Method Post -Uri $credCreateUri -Headers $headers -Body $credXml | Out-Null
        Write-Host "Created Jenkins credentials: $DockerCredentialsId"
    }
    catch {
        if ($_.Exception.Message -like "*409*" -or $_.Exception.Message -like "*already exists*") {
            Write-Host "Credentials $DockerCredentialsId already exist. Skipping create."
        }
        else {
            Write-Warning "Could not create credentials automatically: $($_.Exception.Message)"
        }
    }
}

$jobConfigXml = New-PipelineJobConfigXml -GitRepo $RepoUrl -GitBranch $Branch -JenkinsfilePath $ScriptPath
$encodedJobName = [System.Uri]::EscapeDataString($JobName)
$jobApiUri = "$JenkinsUrl/job/$encodedJobName/api/json"

$jobExists = $true
try {
    Invoke-JenkinsRequest -Method Get -Uri $jobApiUri -Headers $headers | Out-Null
}
catch {
    $jobExists = $false
}

if ($jobExists) {
    $configUri = "$JenkinsUrl/job/$encodedJobName/config.xml"
    Invoke-JenkinsRequest -Method Post -Uri $configUri -Headers $headers -Body $jobConfigXml | Out-Null
    Write-Host "Updated Jenkins pipeline job: $JobName"
}
else {
    $createUri = "$JenkinsUrl/createItem?name=$encodedJobName"
    Invoke-JenkinsRequest -Method Post -Uri $createUri -Headers $headers -Body $jobConfigXml | Out-Null
    Write-Host "Created Jenkins pipeline job: $JobName"
}

if ($TriggerBuild.IsPresent) {
    $buildUri = "$JenkinsUrl/job/$encodedJobName/buildWithParameters"
    $form = "PUSH_IMAGES=$PushImages&DEPLOY_K8S=$DeployK8s&DOCKER_CREDENTIALS_ID=$DockerCredentialsId&GIT_BRANCH=$Branch"
    Invoke-JenkinsRequest -Method Post -Uri $buildUri -Headers $headers -Body $form -ContentType "application/x-www-form-urlencoded" | Out-Null
    Write-Host "Triggered build for $JobName with parameters: PUSH_IMAGES=$PushImages, DEPLOY_K8S=$DeployK8s"
}

Write-Host "Jenkins pipeline setup complete."
