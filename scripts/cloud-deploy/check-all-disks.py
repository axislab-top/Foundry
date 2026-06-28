#!/usr/bin/env python3
import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)

script = r"""
echo '=== 所有块设备与挂载 ==='
lsblk -o NAME,SIZE,FSUSED,FSUSE%,MOUNTPOINTS
echo ''
df -hT
echo ''
echo '=== 云监控可能看的 inode ==='
df -i /
echo ''
echo '=== /var 明细 ==='
sudo du -xh /var --max-depth=1 2>/dev/null | sort -hr | head -12
echo ''
echo '=== docker 实际占用 ==='
sudo du -sh /var/lib/docker 2>/dev/null
sudo du -sh /var/lib/docker/* 2>/dev/null | sort -hr | head -8
"""

_, o, _ = c.exec_command(script, timeout=90)
print(o.read().decode(errors="replace"))
c.close()
