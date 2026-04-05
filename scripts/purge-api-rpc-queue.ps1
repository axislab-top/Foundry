# Purge Nest API RPC queue (development recovery).
# Use when api-rpc-queue has a large backlog and Gateway/Worker hit RPC timeouts
# while the API consumer cannot drain faster than publishers enqueue.
#
# Requires: Docker container named service-rabbitmq (see deployment/docker/docker-compose.yml).
# Usage: .\scripts\purge-api-rpc-queue.ps1

$ErrorActionPreference = 'Stop'
$queue = if ($env:API_RMQ_RPC_QUEUE) { $env:API_RMQ_RPC_QUEUE } else { 'api-rpc-queue' }
$container = if ($env:RABBITMQ_CONTAINER) { $env:RABBITMQ_CONTAINER } else { 'service-rabbitmq' }

Write-Host "Purging RabbitMQ queue '$queue' in container '$container' ..."
docker exec $container rabbitmqctl purge_queue $queue
Write-Host "Done."
