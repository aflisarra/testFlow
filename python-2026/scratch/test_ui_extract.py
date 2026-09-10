import sys, json
sys.path.append('c:/Users/MSI/Downloads/pfe-2026-project-clean/pfe-2026-project-clean/python-2026')
from services.case_service import _extract_ui_components
spec = '''
UI Components:
- Login
- Username
- Password
- Bouton "Login"
'''
components = _extract_ui_components([], spec_text=spec, plan_title='', plan_description='')
print('Extracted components:', components)
