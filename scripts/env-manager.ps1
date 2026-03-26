# ============================================================================
# 环境变量管理脚本 (PowerShell)
# ============================================================================
# 
# 功能：
# 1. 从统一的 .env.shared 文件生成各服务的 .env 文件
# 2. 支持按服务过滤环境变量
# 3. 支持生成 Docker 部署的 .env 文件
#
# 使用方式：
#   .\scripts\env-manager.ps1 [选项]
#
# 选项：
#   --source <文件>     源环境变量文件（默认: .env.shared）
#   --target <目录>     目标目录（默认: deployment/docker）
#   --service <服务名>  生成特定服务的 .env 文件
#   --help              显示帮助信息
#
# ============================================================================

param(
    [string]$Source = ".env.shared",
    [string]$Target = "deployment/docker",
    [string]$Service = "",
    [switch]$Help
)

# 显示帮助信息
if ($Help) {
    Write-Host @"
环境变量管理脚本

用法:
    .\scripts\env-manager.ps1 [选项]

选项:
    --Source <文件>     源环境变量文件（默认: .env.shared）
    --Target <目录>     目标目录（默认: deployment/docker）
    --Service <服务名>  生成特定服务的 .env 文件（gateway, api, webhooks, worker, logging）
    --Help              显示此帮助信息

示例:
    # 从 .env.shared 生成所有服务的环境变量文件
    .\scripts\env-manager.ps1

    # 为特定服务生成 .env 文件
    .\scripts\env-manager.ps1 -Service gateway

    # 使用自定义源文件
    .\scripts\env-manager.ps1 -Source .env.production -Target deployment/docker

服务列表:
    gateway  - Gateway 服务环境变量
    api      - API 服务环境变量
    webhooks - Webhooks 服务环境变量
    worker   - Worker 服务环境变量
    logging  - Logging 服务环境变量
    docker   - Docker 部署统一环境变量
"@
    exit 0
}

# 检查源文件是否存在
if (-not (Test-Path $Source)) {
    Write-Error "源文件不存在: $Source"
    Write-Host "提示: 请先复制 env.shared.example 为 .env.shared 并修改配置值"
    exit 1
}

# 读取源文件
Write-Host "读取源文件: $Source" -ForegroundColor Green
$envContent = Get-Content $Source -Raw

# 服务配置映射（定义每个服务需要的环境变量）
$serviceConfigs = @{
    "gateway" = @(
        "NODE_ENV", "PORT", "JWT_SECRET", "JWT_REFRESH_SECRET", "JWT_EXPIRES_IN", "JWT_REFRESH_EXPIRES_IN",
        "DB_HOST", "DB_PORT", "DB_USERNAME", "DB_PASSWORD", "DB_DATABASE", "DB_SYNCHRONIZE", "DB_LOGGING",
        "REDIS_HOST", "REDIS_PORT", "REDIS_PASSWORD", "REDIS_DB",
        "API_SERVICE_URL", "WEBHOOKS_SERVICE_URL", "WORKER_SERVICE_URL", "LOGGING_SERVICE_URL",
        "RMQ_URL",
        "RATE_LIMIT_TTL", "RATE_LIMIT_MAX_REQUESTS", "RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS",
        "CIRCUIT_BREAKER_ENABLED", "CIRCUIT_BREAKER_FAILURE_THRESHOLD", "CIRCUIT_BREAKER_SUCCESS_THRESHOLD",
        "CIRCUIT_BREAKER_TIMEOUT", "CIRCUIT_BREAKER_RESET_TIMEOUT",
        "WECHAT_APP_ID", "WECHAT_APP_SECRET", "WECHAT_REDIRECT_URI", "WECHAT_SCOPE", "FRONTEND_URL",
        "AUTHORIZATION_ENABLED", "METRICS_ADAPTER", "METRICS_ENABLE_DEFAULT_COLLECTORS",
        "PROMETHEUS_COLLECT_DEFAULT_METRICS", "PROMETHEUS_PREFIX",
        "HTTP_TIMEOUT", "CORS_ORIGIN", "CORS_CREDENTIALS",
        "SWAGGER_ENABLED", "SWAGGER_PATH",
        "ENCRYPTION_ADAPTER", "AES_KEY", "AES_ALGORITHM", "AES_KEY_LENGTH",
        "CONSUL_ENABLED", "CONSUL_HOST", "CONSUL_PORT", "CONSUL_CONFIG_PREFIX", "CONSUL_SECURE", "CONSUL_TOKEN", "CONSUL_DATACENTER"
    )
    "api" = @(
        "NODE_ENV", "PORT", "JWT_SECRET", "JWT_REFRESH_SECRET", "JWT_EXPIRES_IN", "JWT_REFRESH_EXPIRES_IN",
        "DB_HOST", "DB_PORT", "DB_USERNAME", "DB_PASSWORD", "DB_DATABASE", "DB_SYNCHRONIZE", "DB_LOGGING",
        "REDIS_HOST", "REDIS_PORT", "REDIS_PASSWORD", "REDIS_DB",
        "CACHE_ADAPTER_TYPE", "METRICS_ADAPTER", "METRICS_ENABLED", "PROMETHEUS_COLLECT_DEFAULT_METRICS", "PROMETHEUS_PREFIX",
        "RMQ_URL",
        "HTTP_TIMEOUT", "CORS_ORIGIN", "CORS_CREDENTIALS",
        "ENCRYPTION_ADAPTER", "AES_KEY", "HASHING_ADAPTER", "BCRYPT_SALT_ROUNDS",
        "STORAGE_TYPE", "STORAGE_LOCAL_BASE_PATH", "STORAGE_LOCAL_BASE_URL",
        "STORAGE_MINIO_ENDPOINT", "STORAGE_MINIO_PORT", "STORAGE_MINIO_USE_SSL",
        "STORAGE_MINIO_ACCESS_KEY", "STORAGE_MINIO_SECRET_KEY", "STORAGE_MINIO_BUCKET_NAME",
        "SWAGGER_ENABLED", "SWAGGER_PATH",
        "TEST_AUTH_ENABLED",
        "CONSUL_ENABLED", "CONSUL_HOST", "CONSUL_PORT", "CONSUL_CONFIG_PREFIX", "CONSUL_SECURE", "CONSUL_TOKEN", "CONSUL_DATACENTER"
    )
    "webhooks" = @(
        "NODE_ENV", "PORT", "APP_VERSION",
        "CONSUL_ENABLED", "CONSUL_HOST", "CONSUL_PORT", "CONSUL_CONFIG_PREFIX", "CONSUL_SECURE", "CONSUL_TOKEN", "CONSUL_DATACENTER"
    )
    "worker" = @(
        "NODE_ENV", "PORT", "APP_VERSION",
        "RABBITMQ_HOST", "RABBITMQ_PORT", "RABBITMQ_USER", "RABBITMQ_PASSWORD", "RABBITMQ_VHOST",
        "RABBITMQ_URI", "RABBITMQ_PREFETCH_COUNT", "RABBITMQ_RECONNECT_DELAY", "RABBITMQ_MAX_RETRIES",
        "CONSUL_ENABLED", "CONSUL_HOST", "CONSUL_PORT", "CONSUL_CONFIG_PREFIX", "CONSUL_SECURE", "CONSUL_TOKEN", "CONSUL_DATACENTER"
    )
    "logging" = @(
        "NODE_ENV", "PORT", "HOSTNAME",
        "LOKI_URL",
        "ELASTICSEARCH_URL", "ELASTICSEARCH_INDEX_PREFIX",
        "LOG_DIR",
        "CONSUL_ENABLED", "CONSUL_HOST", "CONSUL_PORT", "CONSUL_CONFIG_PREFIX", "CONSUL_SECURE", "CONSUL_TOKEN", "CONSUL_DATACENTER"
    )
}

# 解析环境变量文件
function Parse-EnvFile {
    param([string]$content)
    
    $variables = @{}
    $lines = $content -split "`n"
    
    foreach ($line in $lines) {
        $line = $line.Trim()
        # 跳过空行和注释
        if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith("#")) {
            continue
        }
        
        # 解析 KEY=VALUE
        if ($line -match '^([^#=]+?)\s*=\s*(.*)$') {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            
            # 移除引号（如果存在）
            if ($value -match '^["''](.*)["'']$') {
                $value = $matches[1]
            }
            
            $variables[$key] = $value
        }
    }
    
    return $variables
}

# 生成服务的 .env 文件
function Generate-ServiceEnvFile {
    param(
        [hashtable]$variables,
        [string[]]$requiredVars,
        [string]$outputPath,
        [string]$serviceName
    )
    
    Write-Host "生成 $serviceName 服务的环境变量文件: $outputPath" -ForegroundColor Cyan
    
    $output = @()
    $output += "# $serviceName 服务环境变量配置"
    $output += "# 此文件由 env-manager.ps1 自动生成，请勿手动编辑"
    $output += "# 如需修改，请编辑 .env.shared 文件后重新运行脚本"
    $output += "# 生成时间: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    $output += ""
    
    # 添加服务特定的配置
    if ($serviceName -eq "gateway") {
        $output += "# 应用配置"
        $output += "NODE_ENV=$($variables['NODE_ENV'])"
        $output += "PORT=$($variables['GATEWAY_SERVICE_PORT'])"
        $output += ""
        if ($variables.ContainsKey('GATEWAY_DB_DATABASE')) {
            $variables['DB_DATABASE'] = $variables['GATEWAY_DB_DATABASE']
        }
        if ($variables.ContainsKey('REDIS_DB_GATEWAY')) {
            $variables['REDIS_DB'] = $variables['REDIS_DB_GATEWAY']
        }
        # 如果是在 Docker 环境中，更新服务 URL
        if ($outputPath -like "*docker*") {
            $variables['REDIS_HOST'] = 'redis'
            $variables['DB_HOST'] = 'postgres'
            $variables['API_SERVICE_URL'] = 'http://api-service:3000'
            $variables['WEBHOOKS_SERVICE_URL'] = 'http://webhooks-service:3003'
            $variables['WORKER_SERVICE_URL'] = 'http://worker-service:3004'
            $variables['LOGGING_SERVICE_URL'] = 'http://logging-service:3001'
        }
    }
    elseif ($serviceName -eq "api") {
        $output += "# 应用配置"
        $output += "NODE_ENV=$($variables['NODE_ENV'])"
        $output += "PORT=$($variables['API_SERVICE_PORT'])"
        $output += ""
        if ($variables.ContainsKey('API_DB_DATABASE')) {
            $variables['DB_DATABASE'] = $variables['API_DB_DATABASE']
        }
        if ($variables.ContainsKey('REDIS_DB_API')) {
            $variables['REDIS_DB'] = $variables['REDIS_DB_API']
        }
        if ($outputPath -like "*docker*") {
            $variables['REDIS_HOST'] = 'redis'
            $variables['DB_HOST'] = 'postgres'
        }
    }
    elseif ($serviceName -eq "webhooks") {
        $output += "# 应用配置"
        $output += "NODE_ENV=$($variables['NODE_ENV'])"
        $output += "PORT=$($variables['WEBHOOKS_SERVICE_PORT'])"
        if ($variables.ContainsKey('APP_VERSION')) {
            $output += "APP_VERSION=$($variables['APP_VERSION'])"
        }
        $output += ""
    }
    elseif ($serviceName -eq "worker") {
        $output += "# 应用配置"
        $output += "NODE_ENV=$($variables['NODE_ENV'])"
        $output += "PORT=$($variables['WORKER_SERVICE_PORT'])"
        if ($variables.ContainsKey('APP_VERSION')) {
            $output += "APP_VERSION=$($variables['APP_VERSION'])"
        }
        $output += ""
        if ($outputPath -like "*docker*") {
            $variables['RABBITMQ_HOST'] = 'rabbitmq'
        }
    }
    elseif ($serviceName -eq "logging") {
        $output += "# 应用配置"
        $output += "NODE_ENV=$($variables['NODE_ENV'])"
        $output += "PORT=$($variables['LOGGING_SERVICE_PORT'])"
        if ($variables.ContainsKey('HOSTNAME')) {
            $output += "HOSTNAME=$($variables['HOSTNAME'])"
        }
        $output += ""
        if ($outputPath -like "*docker*") {
            $variables['LOKI_URL'] = 'http://loki:3100'
        }
    }
    
    # 按分类组织变量
    $categories = @{
        "JWT" = @("JWT_SECRET", "JWT_REFRESH_SECRET", "JWT_EXPIRES_IN", "JWT_REFRESH_EXPIRES_IN")
        "数据库" = @("DB_HOST", "DB_PORT", "DB_USERNAME", "DB_PASSWORD", "DB_DATABASE", "DB_SYNCHRONIZE", "DB_LOGGING")
        "Redis" = @("REDIS_HOST", "REDIS_PORT", "REDIS_PASSWORD", "REDIS_DB", "REDIS_URL")
        "RabbitMQ" = @("RABBITMQ_HOST", "RABBITMQ_PORT", "RABBITMQ_USER", "RABBITMQ_PASSWORD", "RABBITMQ_VHOST", "RABBITMQ_URI", "RMQ_URL")
        "监控" = @("METRICS_ADAPTER", "METRICS_ENABLED", "METRICS_ENABLE_DEFAULT_COLLECTORS", "PROMETHEUS_COLLECT_DEFAULT_METRICS", "PROMETHEUS_PREFIX")
        "HTTP" = @("HTTP_TIMEOUT", "CORS_ORIGIN", "CORS_CREDENTIALS")
        "Swagger" = @("SWAGGER_ENABLED", "SWAGGER_PATH")
        "加密" = @("ENCRYPTION_ADAPTER", "AES_KEY", "AES_ALGORITHM", "AES_KEY_LENGTH")
        "哈希" = @("HASHING_ADAPTER", "BCRYPT_SALT_ROUNDS")
        "缓存" = @("CACHE_ADAPTER_TYPE")
        "存储" = @("STORAGE_TYPE", "STORAGE_LOCAL_BASE_PATH", "STORAGE_LOCAL_BASE_URL", "STORAGE_MINIO_ENDPOINT", "STORAGE_MINIO_PORT", "STORAGE_MINIO_USE_SSL", "STORAGE_MINIO_ACCESS_KEY", "STORAGE_MINIO_SECRET_KEY", "STORAGE_MINIO_BUCKET_NAME")
        "服务地址" = @("API_SERVICE_URL", "WEBHOOKS_SERVICE_URL", "WORKER_SERVICE_URL", "LOGGING_SERVICE_URL")
        "限流" = @("RATE_LIMIT_TTL", "RATE_LIMIT_MAX_REQUESTS", "RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS")
        "断路器" = @("CIRCUIT_BREAKER_ENABLED", "CIRCUIT_BREAKER_FAILURE_THRESHOLD", "CIRCUIT_BREAKER_SUCCESS_THRESHOLD", "CIRCUIT_BREAKER_TIMEOUT", "CIRCUIT_BREAKER_RESET_TIMEOUT")
        "微信" = @("WECHAT_APP_ID", "WECHAT_APP_SECRET", "WECHAT_REDIRECT_URI", "WECHAT_SCOPE", "FRONTEND_URL")
        "授权" = @("AUTHORIZATION_ENABLED")
        "测试" = @("TEST_AUTH_ENABLED")
        "Consul" = @("CONSUL_ENABLED", "CONSUL_HOST", "CONSUL_PORT", "CONSUL_CONFIG_PREFIX", "CONSUL_SECURE", "CONSUL_TOKEN", "CONSUL_DATACENTER")
        "Logging" = @("LOKI_URL", "ELASTICSEARCH_URL", "ELASTICSEARCH_INDEX_PREFIX", "LOG_DIR", "HOSTNAME")
        "应用" = @("APP_VERSION")
    }
    
    # 添加环境变量（按分类）
    $addedVars = @()
    foreach ($category in $categories.Keys) {
        $categoryVars = @()
        foreach ($var in $categories[$category]) {
            if ($requiredVars -contains $var -and $variables.ContainsKey($var)) {
                $categoryVars += "$var=$($variables[$var])"
                $addedVars += $var
            }
        }
        if ($categoryVars.Count -gt 0) {
            $output += "# $category 配置"
            $output += $categoryVars
            $output += ""
        }
    }
    
    # 添加其他必需的变量
    foreach ($var in $requiredVars) {
        if (-not ($addedVars -contains $var) -and $variables.ContainsKey($var)) {
            $output += "$var=$($variables[$var])"
        }
    }
    
    # 写入文件
    $outputDir = Split-Path $outputPath -Parent
    if (-not [string]::IsNullOrWhiteSpace($outputDir) -and -not (Test-Path $outputDir)) {
        New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
    }
    
    $output -join "`n" | Out-File -FilePath $outputPath -Encoding utf8 -NoNewline
    Write-Host "✓ 已生成: $outputPath" -ForegroundColor Green
}

# 生成 Docker 统一的 .env 文件
function Generate-DockerEnvFile {
    param(
        [hashtable]$variables,
        [string]$outputPath
    )
    
    Write-Host "生成 Docker 统一环境变量文件: $outputPath" -ForegroundColor Cyan
    
    $output = @()
    $output += "# Docker Compose 环境变量配置"
    $output += "# 此文件由 env-manager.ps1 自动生成，请勿手动编辑"
    $output += "# 生成时间: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    $output += ""
    
    # 生成 Docker 环境变量（修改服务地址为 Docker 服务名）
    $dockerVars = $variables.Clone()
    $dockerVars['DB_HOST'] = 'postgres'
    $dockerVars['REDIS_HOST'] = 'redis'
    $dockerVars['RABBITMQ_HOST'] = 'rabbitmq'
    $dockerVars['RABBITMQ_URI'] = "amqp://$($dockerVars['RABBITMQ_USER']):$($dockerVars['RABBITMQ_PASSWORD'])@rabbitmq:$($dockerVars['RABBITMQ_PORT'])/"
    $dockerVars['RMQ_URL'] = $dockerVars['RABBITMQ_URI']
    $dockerVars['API_SERVICE_URL'] = 'http://api-service:3000'
    $dockerVars['WEBHOOKS_SERVICE_URL'] = 'http://webhooks-service:3003'
    $dockerVars['WORKER_SERVICE_URL'] = 'http://worker-service:3004'
    $dockerVars['LOGGING_SERVICE_URL'] = 'http://logging-service:3001'
    $dockerVars['LOKI_URL'] = 'http://loki:3100'
    if ($dockerVars.ContainsKey('CONSUL_HOST')) {
        $dockerVars['CONSUL_HOST'] = 'consul'
    }
    
    # 按分类输出
    $categories = @{
        "应用配置" = @("NODE_ENV")
        "JWT 配置" = @("JWT_SECRET", "JWT_REFRESH_SECRET", "JWT_EXPIRES_IN", "JWT_REFRESH_EXPIRES_IN")
        "数据库配置" = @("DB_HOST", "DB_PORT", "DB_USERNAME", "DB_PASSWORD", "DB_DATABASE", "DB_SYNCHRONIZE", "DB_LOGGING")
        "Redis 配置" = @("REDIS_HOST", "REDIS_PORT", "REDIS_PASSWORD", "REDIS_DB")
        "加密配置" = @("ENCRYPTION_ADAPTER", "AES_KEY", "AES_ALGORITHM", "AES_KEY_LENGTH")
        "哈希配置" = @("HASHING_ADAPTER", "BCRYPT_SALT_ROUNDS")
        "CORS 配置" = @("CORS_ORIGIN", "CORS_CREDENTIALS")
        "监控配置" = @("METRICS_ADAPTER", "METRICS_ENABLED")
        "Swagger 配置" = @("SWAGGER_ENABLED", "SWAGGER_PATH")
        "服务端口" = @("API_SERVICE_PORT", "GATEWAY_SERVICE_PORT", "WEBHOOKS_SERVICE_PORT", "WORKER_SERVICE_PORT", "LOGGING_SERVICE_PORT")
        "RabbitMQ 配置" = @("RABBITMQ_HOST", "RABBITMQ_PORT", "RABBITMQ_USER", "RABBITMQ_PASSWORD", "RABBITMQ_VHOST", "RABBITMQ_URI", "RMQ_URL")
        "Consul 配置" = @("CONSUL_ENABLED", "CONSUL_HOST", "CONSUL_PORT")
    }
    
    foreach ($category in $categories.Keys) {
        $categoryVars = @()
        foreach ($var in $categories[$category]) {
            if ($dockerVars.ContainsKey($var)) {
                $categoryVars += "$var=$($dockerVars[$var])"
            }
        }
        if ($categoryVars.Count -gt 0) {
            $output += "# $category"
            $output += $categoryVars
            $output += ""
        }
    }
    
    # 写入文件
    $outputDir = Split-Path $outputPath -Parent
    if (-not [string]::IsNullOrWhiteSpace($outputDir) -and -not (Test-Path $outputDir)) {
        New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
    }
    
    $output -join "`n" | Out-File -FilePath $outputPath -Encoding utf8 -NoNewline
    Write-Host "✓ 已生成: $outputPath" -ForegroundColor Green
}

# 解析环境变量
$envVars = Parse-EnvFile -content $envContent

# 生成环境变量文件
if ([string]::IsNullOrWhiteSpace($Service)) {
    # 生成所有服务的环境变量文件
    Write-Host "`n开始生成所有服务的环境变量文件..." -ForegroundColor Yellow
    
    # 生成各服务的 .env 文件
    foreach ($serviceName in $serviceConfigs.Keys) {
        $outputPath = "apps/$serviceName/.env"
        Generate-ServiceEnvFile -variables $envVars -requiredVars $serviceConfigs[$serviceName] -outputPath $outputPath -serviceName $serviceName
    }
    
    # 生成 Docker 统一的 .env 文件
    Generate-DockerEnvFile -variables $envVars -outputPath "$Target/.env"
    
    Write-Host "`n✓ 所有环境变量文件生成完成！" -ForegroundColor Green
}
elseif ($Service -eq "docker") {
    # 只生成 Docker 统一的 .env 文件
    Generate-DockerEnvFile -variables $envVars -outputPath "$Target/.env"
    Write-Host "`n✓ Docker 环境变量文件生成完成！" -ForegroundColor Green
}
elseif ($serviceConfigs.ContainsKey($Service)) {
    # 生成特定服务的 .env 文件
    $outputPath = "apps/$Service/.env"
    Generate-ServiceEnvFile -variables $envVars -requiredVars $serviceConfigs[$Service] -outputPath $outputPath -serviceName $Service
    Write-Host "`n✓ $Service 服务环境变量文件生成完成！" -ForegroundColor Green
}
else {
    Write-Error "未知的服务: $Service"
    Write-Host "可用服务: $($serviceConfigs.Keys -join ', '), docker"
    exit 1
}

