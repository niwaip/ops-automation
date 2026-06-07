Carbone Office Add-in Wizard

1. Open the wizard page
   https://<OFFICE_ADDIN_PUBLIC_HOST>:3000/wizard

2. Download the unified script
   office-addin-wizard.ps1

3. Run the script in Windows PowerShell
   powershell -ExecutionPolicy Bypass -File .\office-addin-wizard.ps1 -HostName <OFFICE_ADDIN_PUBLIC_HOST>

4. Use the menu
   1 = Install certificate
   2 = Check certificate status
   3 = Install Word add-in
   4 = Install Excel add-in
   5 = Install PowerPoint add-in
   6 = Deep diagnosis

5. Notes
   - The wizard downloads the latest certificate and manifest from the running add-in service.
   - The host used in Office must exist in the certificate SAN.
   - Old scripts are still present only as compatibility wrappers.
