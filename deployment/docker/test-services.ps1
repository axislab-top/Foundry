# 服务测试脚本
# 测试所有服务的健康状态

Write-Host "=== 服务状态检查 ===" -ForegroundColor Cyan
docker ps --filter "name=service-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

Write-Host "`n=== API 服务测试 ===" -ForegroundColor Cyan
$apiHealth = Invoke-WebRequest -Uri "http://localhost:3000/api/health" -UseBasicParsing -ErrorAction SilentlyContinue
if ($apiHealth) {
    Write-Host "✅ API 服务健康检查: 成功" -ForegroundColor Green
    Write-Host "响应: $($apiHealth.Content)" -ForegroundColor Gray
} else {
    Write-Host "❌ API 服务健康检查: 失败" -ForegroundColor Red
}

Write-Host "`n=== Swagger 文档测试 ===" -ForegroundColor Cyan
$swagger = Invoke-WebRequest -Uri "http://localhost:3000/api-docs" -UseBasicParsing -ErrorAction SilentlyContinue
if ($swagger -and $swagger.StatusCode -eq 200) {
    Write-Host "✅ Swagger 文档: 可访问" -ForegroundColor Green
} else {
    Write-Host "❌ Swagger 文档: 不可访问" -ForegroundColor Red
}

Write-Host "`n=== 数据库连接测试 ===" -ForegroundColor Cyan
$dbTest = docker exec service-postgres-dev psql -U postgres -d service_db_dev -c "SELECT 1;" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ PostgreSQL 连接: 正常" -ForegroundColor Green
} else {
    Write-Host "❌ PostgreSQL 连接: 失败" -ForegroundColor Red
}

Write-Host "`n=== Redis 连接测试 ===" -ForegroundColor Cyan
$redisTest = docker exec service-redis-dev redis-cli ping 2>&1
if ($redisTest -match "PONG") {
    Write-Host "✅ Redis 连接: 正常" -ForegroundColor Green
} else {
    Write-Host "❌ Redis 连接: 失败" -ForegroundColor Red
}

Write-Host "`n=== RabbitMQ 连接测试 ===" -ForegroundColor Cyan
$rabbitmqTest = docker exec service-rabbitmq rabbitmq-diagnostics ping 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ RabbitMQ 连接: 正常" -ForegroundColor Green
} else {
    Write-Host "⚠️  RabbitMQ 连接: 可能未就绪" -ForegroundColor Yellow
}

Write-Host "`n测试完成！" -ForegroundColor Cyan



























