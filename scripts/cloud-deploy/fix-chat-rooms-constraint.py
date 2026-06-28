#!/usr/bin/env python3
import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("101.43.9.37", username="ubuntu", password="right123..", timeout=30)

cmds = [
    "sudo docker exec service-postgres-prod psql -U postgres -d service_db -c \"ALTER TABLE chat_rooms DROP CONSTRAINT IF EXISTS chk_chat_rooms_type;\"",
    "sudo docker exec service-postgres-prod psql -U postgres -d service_db -c \"ALTER TABLE chat_rooms ADD CONSTRAINT chk_chat_rooms_type CHECK (room_type IN ('main', 'department', 'task', 'custom', 'direct'));\"",
    "sudo docker exec service-postgres-prod psql -U postgres -d service_db -c \"SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='chat_rooms'::regclass AND conname='chk_chat_rooms_type';\"",
]

for cmd in cmds:
    print(f">>> {cmd}")
    _, o, e = c.exec_command(cmd, timeout=30)
    print(o.read().decode())
    err = e.read().decode()
    if err.strip():
        print("ERR:", err)
c.close()
