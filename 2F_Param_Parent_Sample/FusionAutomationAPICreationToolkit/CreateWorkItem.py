import requests
import json
from pathlib import Path

from GenerateAccessToken import GenerateNewAccessToken


def load_task_parameters() -> dict:
    """Load task parameters from 2F_Param_Edit.json in the 2F_Param_Edit_Main folder.

    Returns the parsed JSON as a dict. If the file can't be read or parsed, a default
    fallback dictionary is returned.
    """
    # Determine the path relative to this script: ../2F_Param_Edit_Main/2F_Param_Edit.json
    config_path = Path(__file__).resolve().parent.parent / '2F_Param_Edit_Main' / '2F_Param_Edit.json'
    try:
        with config_path.open('r', encoding='utf-8') as fh:
            data = json.load(fh)
            # The example file already contains keys like fileURN and parameters.
            return data
    except Exception as e:
        print(f'Warning: could not load task parameters from {config_path}: {e}')
        # Fallback to the previous inline payload structure
        return {
            "fileURN": "<YOUR_FILE_URN_HERE>",
            "parameters": {
                "<YOUR_PARAMETER_NAME_2_HERE>": "37mm"
            }
        }

accesstokenCurrent = GenerateNewAccessToken()

headerslist = {
    'Authorization': f'Bearer {accesstokenCurrent}',
    'Content-Type': 'application/json'
}

# Load task parameters (dict) and convert to a JSON string for the TaskParameters argument
task_params_obj = load_task_parameters()
task_params_str = json.dumps(task_params_obj)

print(f'{task_params_str}')

payload = {
    "activityId": "<YOUR_NICKNAME_HERE>.<YOUR_ACTIVITY_NAME_HERE>+my_current_version",
    "arguments": {
        "PersonalAccessToken": "<YOUR_PERSONAL_ACCESS_TOKEN_HERE>",
        "TaskParameters": task_params_str
    }
}

response = requests.post('https://developer.api.autodesk.com/da/us-east/v3/workitems', json=payload, headers=headerslist)

print(response.status_code)
try:
    print(response.json())
except ValueError:
    print('No JSON returned. Response text:', response.text)