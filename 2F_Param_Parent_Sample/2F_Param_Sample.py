#!/usr/bin/env python3
"""Update parameters in 2F_Param_Sample.json and optionally run the TypeScript script.

Usage examples (PowerShell):
    python .\2F_Param.py -p ParamName=45            # set value and submit
    python .\2F_Param.py -p ParamName=30 --no-run   # only update JSON
    python .\2F_Param.py --file path\to\file.json -p Name=25

Notes:
 - This will update the `parameters` object in the JSON file with the values provided.
 - By default the script will try to run `npx ts-node 2F_Param_Sample.ts` in the same folder.
   That requires Node.js and `npx` to be available. To skip running the TypeScript file use --no-run.
 - If you intend to run the script remotely via an Automation API, skip the local run and use
   your remote deployment/trigger mechanism (this script only updates the JSON file and can
   optionally invoke a local run).
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import os
import time
import requests
from pathlib import Path
import sys

# Ensure the FusionAutomationAPICreationToolkit folder is importable so we can reuse its token helper
_toolkit_dir = Path(__file__).resolve().parent / 'FusionAutomationAPICreationToolkit'
# Try to make the toolkit folder importable and import the token helper.
# If that fails (different CWD or packaging), fall back to loading the file by path.
try:
    if str(_toolkit_dir) not in sys.path:
        sys.path.insert(0, str(_toolkit_dir))
    from GenerateAccessToken import GenerateNewAccessToken  # type: ignore
except Exception:
    # Fallback: load module by file location
    gen_file = _toolkit_dir / 'GenerateAccessToken.py'
    if gen_file.exists():
        import importlib.util

        spec = importlib.util.spec_from_file_location('GenerateAccessToken', str(gen_file))
        if spec is None or spec.loader is None:
            raise ImportError(f'Could not load spec for GenerateAccessToken from {gen_file}')
        gen_mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(gen_mod)  # type: ignore
        GenerateNewAccessToken = getattr(gen_mod, 'GenerateNewAccessToken')
    else:
        raise ImportError(f'Could not import GenerateAccessToken. Checked sys.path and {gen_file}')

# Default value set inside the script. Change this constant to update the value used
# when no --value CLI argument is provided.

# You can edit this dictionary to control which top-level fields are set in the
# `2F_Param_Sample.json` file before submitting the workitem. Keys are top-level
# JSON keys; the special key "parameters" controls the parameters object and
# should be a dict of parameterName: value.
# The script will clear the `parameters` element and replace it with only the
# entries provided here when it updates the JSON.
PARAM_1 = 37
PARAM_2 = 26

DEFAULT_UPDATES = {
    "parameters": {
        "<YOUR_PARAMETER_NAME_1_HERE>": f"{PARAM_1}",
        "<YOUR_PARAMETER_NAME_2_HERE>": f"{PARAM_2}"
    },
    # Example: set fileURN if you want to override the default in the JSON
    "fileURN": "<YOUR_FILE_URN_HERE>"
}

def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, data: dict) -> None:
    # preserve pretty formatting
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def update_parameter(json_path: Path, param_name: str, value: str, backup: bool = True) -> Path:
    if not json_path.exists():
        raise FileNotFoundError(f"JSON file not found: {json_path}")

    data = load_json(json_path)

    # Ensure structure exists
    if "parameters" not in data or not isinstance(data["parameters"], dict):
        data["parameters"] = {}

    old_value = data["parameters"].get(param_name)
    data["parameters"][param_name] = str(value)

    if backup:
        bak = json_path.with_suffix(json_path.suffix + ".bak")
        shutil.copy2(json_path, bak)

    write_json(json_path, data)
    return json_path


def apply_updates(json_path: Path, parameter_updates: dict, other_updates: dict | None = None, backup: bool = True) -> Path:
    """Apply updates to the target JSON.

    - parameter_updates: dict of name->value to set inside the `parameters` element.
      The function will clear any existing parameters and only include the provided ones.
    - other_updates: dict of other top-level keys to set/overwrite.
    """
    if not json_path.exists():
        raise FileNotFoundError(f"JSON file not found: {json_path}")

    data = load_json(json_path)

    # Backup
    if backup:
        bak = json_path.with_suffix(json_path.suffix + ".bak")
        shutil.copy2(json_path, bak)

    # Replace parameters entirely
    data['parameters'] = {}
    for k, v in (parameter_updates or {}).items():
        data['parameters'][k] = str(v)

    # Apply other top-level updates
    if other_updates:
        for k, v in other_updates.items():
            # don't allow nested parameter setting via other_updates
            if k == 'parameters':
                continue
            data[k] = v

    write_json(json_path, data)
    return json_path


def _load_task_parameters_from_main() -> dict:
    """Load task parameters from ../2F_Param_Sample_Main/2F_Param_Sample.json (relative to this file).

    Returns parsed JSON dict or a sensible fallback on error.
    """
    config_path = Path(__file__).resolve().parent / '2F_Param_Sample_Main' / '2F_Param_Sample.json'
    # In case file layout is one level deeper, check parent.parent as fallback
    if not config_path.exists():
        config_path = Path(__file__).resolve().parent.parent / '2F_Param_Sample_Main' / '2F_Param_Sample.json'

    try:
        with config_path.open('r', encoding='utf-8') as fh:
            return json.load(fh)
    except Exception as e:
        print(f'Warning: could not load task parameters from {config_path}: {e}')
        # Fall back to DEFAULT_UPDATES where possible so there are no hardcoded
        # parameter names in this function.
        return {
            "fileURN": DEFAULT_UPDATES.get('fileURN', "<YOUR_FILE_URN_HERE>"),
            "parameters": DEFAULT_UPDATES.get('parameters', {})
        }


def run_typescript(folder: Path, ts_file: str) -> int:
    """Instead of running TypeScript locally, create a Design Automation workitem and poll for completion.

    Returns 0 on success, non-zero on failure.
    """
    # Load task parameters from main JSON (this file should have been updated earlier)
    task_params_obj = _load_task_parameters_from_main()
    task_params_str = json.dumps(task_params_obj)

    # Use access token for API calls
    access_token = GenerateNewAccessToken()
    headers = {'Authorization': f'Bearer {access_token}', 'Content-Type': 'application/json'}

    payload = {
        "activityId": "<YOUR_NICKNAME_HERE>.<YOUR_ACTIVITY_NAME_HERE>+my_current_version",
        "arguments": {
            # PersonalAccessToken used by the workitem code; kept as in original script
            "PersonalAccessToken": "<YOUR_PERSONAL_ACCESS_TOKEN_HERE>",
            "TaskParameters": task_params_str
        }
    }

    try:
        resp = requests.post('https://developer.api.autodesk.com/da/us-east/v3/workitems', json=payload, headers=headers)
    except Exception as e:
        print('Failed to submit workitem:', e)
        return 3

    print('Create workitem status:', resp.status_code)
    try:
        resp_json = resp.json()
        print('Create workitem response:', resp_json)
    except ValueError:
        print('Create workitem response text:', resp.text)
        return 4

    # Extract workitem id
    workitem_id = resp_json.get('id') or resp_json.get('workItemId') or resp_json.get('workitemId')
    if not workitem_id:
        print('Could not determine workitem id from response; aborting')
        return 5

    # Poll workitem status until success or terminal failure
    status = None
    poll_url = f'https://developer.api.autodesk.com/da/us-east/v3/workitems/{workitem_id}'
    print('Polling workitem:', workitem_id)
    while True:
        try:
            st = requests.get(poll_url, headers=headers)
            st.raise_for_status()
            st_json = st.json()
            status = st_json.get('status')
            print('Workitem status:', status)
            if status == 'success':
                print('Workitem completed successfully')
                return 0
            if status in ('failed', 'error'):
                print('Workitem finished with error state:', status)
                print('Full status response:', st_json)
                return 6
        except Exception as e:
            print('Error checking workitem status:', e)
        # Wait a bit before polling again
        time.sleep(3)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Update parameters in the JSON and run the TS/workitem flow")
    parser.add_argument("--file", default=None, help="Path to JSON file to edit (defaults to 2F_Param_Sample_Main/2F_Param_Sample.json)")
    parser.add_argument("--param", "-p", dest="params", action='append', help="Parameter update in the form NAME=VALUE. Can be passed multiple times.")
    parser.add_argument("--set", "-s", dest="sets", action='append', help="Top-level JSON update in the form KEY=VALUE (e.g. fileURN=urn:...). Can be passed multiple times.")
    parser.add_argument("--no-run", action="store_true", help="Only update JSON; do not run the TS file")
    parser.add_argument("--ts-file", default="2F_Param_Sample.ts", help="TypeScript script to run (in same folder)")
    args = parser.parse_args(argv)

    if args.file:
        json_path = Path(args.file)
        # If a relative path was given, assume it's relative to this script's directory
        if not json_path.is_absolute():
            base = Path(__file__).resolve().parent
            json_path = (base / json_path).resolve()
    else:
        # Default: write into the 2F_Param_Sample_Main folder so CreateWorkItem reads it
        default_main = Path(__file__).resolve().parent / '2F_Param_Sample_Main' / '2F_Param_Sample.json'
        if not default_main.exists():
            default_main = Path(__file__).resolve().parent.parent / '2F_Param_Sample_Main' / '2F_Param_Sample.json'
        json_path = default_main

    # Build parameter updates and other updates from CLI and defaults
    param_updates: dict = {}
    other_updates: dict = {}

    # No legacy hardcoded parameter handling: use --param NAME=VALUE to set parameters.

    # Parse repeated --param NAME=VALUE entries
    if args.params:
        for entry in args.params:
            if '=' not in entry:
                print(f"Ignoring malformed --param entry: {entry}")
                continue
            name, val = entry.split('=', 1)
            param_updates[name] = val

    # Parse repeated --set KEY=VALUE entries for top-level JSON keys
    if args.sets:
        for entry in args.sets:
            if '=' not in entry:
                print(f"Ignoring malformed --set entry: {entry}")
                continue
            key, val = entry.split('=', 1)
            other_updates[key] = val

    # If no CLI updates provided, fall back to DEFAULT_UPDATES
    if not param_updates and not other_updates:
        param_updates = DEFAULT_UPDATES.get('parameters', {}).copy()
        # copy other top-level default entries (except parameters)
        for k, v in DEFAULT_UPDATES.items():
            if k != 'parameters':
                other_updates[k] = v

    try:
        updated = apply_updates(json_path, parameter_updates=param_updates, other_updates=other_updates)
        print(f"Updated {updated} -> parameters = {param_updates}, other = {other_updates}")
    except Exception as e:
        print(f"Failed to update JSON: {e}")
        return 2

    if args.no_run:
        print("--no-run supplied: skipping running TypeScript file.")
        return 0

    # Run the TypeScript file in the same folder as the JSON (or script folder)
    ts_folder = json_path.parent
    ts_file = args.ts_file

    try:
        rc = run_typescript(ts_folder, ts_file)
        print(f"TypeScript process exited with code {rc}")
        return rc
    except Exception as e:
        print(f"Error running TypeScript: {e}")
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
