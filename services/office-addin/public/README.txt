Carbone Office Add-in Installation Instructions

1. Trust the SSL Certificate (Mandatory)
   Double-click 'ca.crt' and install it into "Trusted Root Certification Authorities".

2. Configure Manifest
   The manifest files (manifest-word.xml, manifest-excel.xml, manifest-ppt.xml) are pre-configured to point to https://localhost:3000.
   Ensure the Carbone Office Add-in service is running.

3. Sideload to Office
   - For Word: Go to "Insert" -> "My Add-ins" -> "Upload My Add-in" -> select 'manifest-word.xml'.
   - For Excel: Go to "Insert" -> "My Add-ins" -> "Upload My Add-in" -> select 'manifest-excel.xml'.

4. Troubleshooting
   - Ensure you are using HTTPS.
   - Ensure port 3000 is accessible.
   - If using a different machine, update 'localhost' in the manifest to your server's IP.

For more information, visit https://carbone.io
