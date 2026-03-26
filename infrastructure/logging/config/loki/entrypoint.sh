#!/bin/sh
# Loki 容器启动脚本
# 用于替换配置文件中的环境变量

set -e

# 设置默认值（7天 = 168小时）
LOG_RETENTION_HOURS=${LOG_RETENTION_HOURS:-168}

# 复制模板文件
cp /etc/loki/local-config.yaml.template /etc/loki/local-config.yaml

# 使用 sed 替换环境变量（兼容性更好，不依赖 envsubst）
sed -i "s/\${LOG_RETENTION_HOURS}/${LOG_RETENTION_HOURS}/g" /etc/loki/local-config.yaml

# 启动 Loki
exec /usr/bin/loki -config.file=/etc/loki/local-config.yaml "$@"

