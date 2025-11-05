import argparse
import json
import requests
import sys
from typing import List, Optional

from GenerateAccessToken import GenerateNewAccessToken


def create_activity(activity_id: str, engine: str, appbundles: List[str], parameters: Optional[dict] = None, settings: Optional[dict] = None, description: str = "") -> requests.Response:
    """Create an activity on the Autodesk DA endpoint and return the response object."""
    token = GenerateNewAccessToken()
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }

    payload = {
        "id": activity_id,
        "engine": engine,
        "commandline": [],
        "parameters": parameters or {},
        "appbundles": appbundles,
        "settings": settings or {},
        "description": description
    }

    resp = requests.post('https://developer.api.autodesk.com/da/us-east/v3/activities', json=payload, headers=headers)
    return resp


def create_activity_alias(activity_id: str, alias_id: str = 'my_current_version', version: str = '1') -> requests.Response:
    """Create an alias for an existing activity and return the response object."""
    token = GenerateNewAccessToken()
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }

    payload = {
        "version": int(version),
        "id": alias_id
    }

    url = f'https://developer.api.autodesk.com/da/us-east/v3/activities/{activity_id}/aliases'
    resp = requests.post(url, json=payload, headers=headers)
    return resp


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description='Create an Autodesk Design Automation activity and optionally add an alias')
    parser.add_argument('--activity-id', '-a', dest='activity_id', default='<YOUR_ACTIVITY_NAME_HERE>', help='Activity id to create')
    parser.add_argument('--engine', '-e', dest='engine', default='Autodesk.Fusion+Latest', help='Engine string for the activity')
    parser.add_argument('--appbundle', '-b', dest='appbundles', action='append', help='Appbundle(s) to attach (can be passed multiple times). Example: <YOUR_NICKNAME_HERE>.<YOUR_APPBUNDLE_NAME_HERE>+my_current_version', required=False)
    parser.add_argument('--alias-id', dest='alias_id', default='my_current_version', help='Alias id to create')
    parser.add_argument('--alias-version', dest='alias_version', default='1', help='Alias version to point to (integer)')
    parser.add_argument('--no-alias', dest='no_alias', action='store_true', help='Create activity but skip alias creation')
    parser.add_argument('--print-payload', dest='print_payload', action='store_true', help='Print the activity payload before sending')

    args = parser.parse_args(argv)

    appbundles = args.appbundles or ["<YOUR_NICKNAME_HERE>.<YOUR_APPBUNDLE_NAME_HERE>+my_current_version"]

    # Default parameters similar to existing CreateActivity.py
    parameters = {
        "TaskParameters": {
            "verb": "read",
            "description": "the parameters for the script",
            "required": False
        },
        "PersonalAccessToken": {
            "verb": "read",
            "description": "the personal access token to use",
            "required": True
        }
    }

    if args.print_payload:
        print('Activity payload:')
        print(json.dumps({
            "id": args.activity_id,
            "engine": args.engine,
            "parameters": parameters,
            "appbundles": appbundles
        }, indent=2))

    # Create activity
    try:
        resp = create_activity(activity_id=args.activity_id, engine=args.engine, appbundles=appbundles, parameters=parameters)
    except Exception as e:
        print('Failed to call create_activity:', e)
        return 2

    print('Create activity status:', resp.status_code)
    try:
        print('Create activity response:', resp.json())
    except ValueError:
        print('Create activity response text:', resp.text)

    if args.no_alias:
        print('Skipping alias creation (--no-alias).')
        return 0

    # Create alias
    try:
        alias_resp = create_activity_alias(activity_id=args.activity_id, alias_id=args.alias_id, version=args.alias_version)
    except Exception as e:
        print('Failed to call create_activity_alias:', e)
        return 3

    print('Create alias status:', alias_resp.status_code)
    try:
        print('Create alias response:', alias_resp.json())
    except ValueError:
        print('Create alias response text:', alias_resp.text)

    return 0


if __name__ == '__main__':
    raise SystemExit(main())
