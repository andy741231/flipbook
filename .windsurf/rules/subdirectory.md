# Deployment Environment

This app is deployed as a sub-application under IIS on Windows Server 2022.

- The production base path is `/apps/{appName}` where `{appName}` is the name of the current project/app being built.
- Never hardcode absolute paths starting with `/`.
- Always use a configurable `BASE_PATH` or `BASE_URL` constant for all links, redirects, includes, and API fetch calls.
- For PHP: define `BASE_PATH` in a config file and reference it throughout.
- For JS/HTML: assume a `<base href>` tag will be set to the deployment path.
- Do not assume the app runs at the domain root.
- **Server:** Windows Server 2022, IIS, PHP via FastCGI.

# Database

MySQL connection details (use when database access is needed):
```env
DB_CONNECTION=mysql
DB_HOST=uhph-server1.cougarnet.uh.edu
DB_PORT=3306
DB_DATABASE={database_name}
DB_USERNAME=web_app
DB_PASSWORD=UHPH@2025_again
```

# Email / SMTP

Campus mail server (no TLS, self-signed certificate allowed):
```env
MAIL_MAILER=campus_smtp
MAIL_HOST=post-office.uh.edu
MAIL_PORT=25
MAIL_FROM_ADDRESS=donotreply@uh.edu
MAIL_FROM_NAME="${APP_NAME}"
MAIL_EHLO_DOMAIN=central.uh.edu
CAMPUS_SMTP_DSN="smtp://post-office.uh.edu:25?tls=0&verify_peer=0&verify_peer_name=0&allow_self_signed=1"
```