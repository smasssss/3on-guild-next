"""Exercise the built weekly VIP picker, including persistent member-ID exclusions."""
import os,subprocess
subprocess.run(['node','tests/vip_ui_regression.cjs'],check=True,env={**os.environ,'VIP_UI_PATH':'dist/client/carriage-vip.js'})
