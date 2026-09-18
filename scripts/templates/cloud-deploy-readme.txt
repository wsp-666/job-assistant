Job Assistant - Cloud Deploy Package
====================================

Server IP: 124.220.48.21
Upload to: /www/wwwroot/job-assistant/

[Xftp]
  Upload api/, web/, .env to the path above

[Baota - Database]
  Name: job_assistant
  User: job_assistant
  Password: (your choice) -> same as MYSQL_PASSWORD in .env

[Baota - Terminal]
  cd /www/wwwroot/job-assistant
  python3 -m venv .venv
  source .venv/bin/activate
  pip install -r api/requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

[Baota - Python Project]
  Command:
  /www/wwwroot/job-assistant/.venv/bin/uvicorn app.main:app --app-dir api --host 127.0.0.1 --port 8000
  Port: 8000

[Baota - Website]
  Domain: 124.220.48.21
  Reverse proxy: http://127.0.0.1:8000

[Verify]
  http://124.220.48.21/health
  http://124.220.48.21/wsp

[WSP login]
  Use LICENSE_ADMIN_SECRET value from .env (value only, not the key name)

[User installer - later]
  .\scripts\build-user-installer.ps1 -CloudApiUrl http://124.220.48.21
