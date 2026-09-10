import sys, json
sys.path.append('c:/Users/MSI/Downloads/pfe-2026-project-clean/pfe-2026-project-clean/python-2026')
from services.case_service import _extract_raw_ui_section, _extract_ui_components_from_text, _extract_ui_components
spec = '''
UI Components:
- Login
- Username
- Password
- Bouton "Login"
'''
raw = _extract_raw_ui_section(spec)
print('raw UI section:', repr(raw))
print('from raw via _extract_ui_components_from_text:', _extract_ui_components_from_text(raw))
print('full extraction via _extract_ui_components:', _extract_ui_components([], spec_text=spec, plan_title='', plan_description=''))
