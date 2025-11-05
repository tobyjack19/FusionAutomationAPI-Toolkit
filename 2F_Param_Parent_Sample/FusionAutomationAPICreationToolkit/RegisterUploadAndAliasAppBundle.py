import os
import json
import argparse
import requests
from typing import Any, Dict

from GenerateAccessToken import GenerateNewAccessToken


def register_appbundle(bundle_id: str = '<YOUR_APPBUNDLE_NAME_HERE>', engine: str = 'Autodesk.Fusion+Latest', description: str = 'Appbundle to update parameters in Fusion 360 designs', access_token: str | None = None, raise_for_status: bool = True) -> dict:
    """Register an appbundle and return the parsed JSON response.

    Returns the JSON response from the register call or a dict with raw_text on non-JSON responses.
    """
    if access_token is None:
        access_token = GenerateNewAccessToken()

    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json'
    }

    payload = {
        'id': bundle_id,
        'engine': engine,
        'description': description,
    }

    resp = requests.post('https://developer.api.autodesk.com/da/us-east/v3/appbundles', json=payload, headers=headers)
    if raise_for_status:
        resp.raise_for_status()

    try:
        return resp.json()
    except ValueError:
        return {'raw_text': resp.text, 'status_code': resp.status_code}


def upload_appbundle_from_uploadParameters(uploadParameters: dict, zip_path: str) -> requests.Response:
    """Upload the zip to the endpoint described in uploadParameters.

    uploadParameters is expected to be a dict with keys 'endpointURL' and 'formData'.
    """
    endpoint = uploadParameters.get('endpointURL') or uploadParameters.get('endpoint')
    if not endpoint:
        raise ValueError('uploadParameters missing endpointURL/endpoint')

    formData = uploadParameters.get('formData')
    if not isinstance(formData, dict):
        raise ValueError('uploadParameters.formData missing or not a dict')

    if not os.path.isfile(zip_path):
        raise FileNotFoundError(f'Zip file not found: {zip_path}')

    headers = {'Cache-Control': 'no-cache'}
    with open(zip_path, 'rb') as f:
        files = {'file': (os.path.basename(zip_path), f, 'application/octet-stream')}
        resp = requests.post(endpoint, data=formData, files=files, headers=headers)

    return resp


def _default_zip_path() -> str:
    default = os.path.join(os.path.dirname(__file__), 'AppBundles', '2F_Param_Edit.zip')
    return os.path.normpath(default)


def create_alias(bundle_id, alias_id='my_current_version', version='1', access_token=None):
    """Create an alias for the given appbundle.

    Returns the requests.Response object.
    """
    if access_token is None:
        access_token = GenerateNewAccessToken()

    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json'
    }

    payload = {
        'id': alias_id,
        'version': str(version)
    }

    url = f'https://developer.api.autodesk.com/da/us-east/v3/appbundles/{bundle_id}/aliases'
    resp = requests.post(url, json=payload, headers=headers)
    return resp


def register_upload_and_alias(zip_path, bundle_id='<YOUR_APPBUNDLE_NAME_HERE>', alias_id='my_current_version', alias_version='1', access_token=None, no_upload=False):
    """Register, upload, and create alias for an appbundle.

    Returns a dict with keys: register, upload_response (or None), alias_response.
    """
    result: Dict[str, Any] = {
        'register': None,
        'upload_response': None,
        'alias_response': None,
    }

    # Register
    reg = register_appbundle(bundle_id=bundle_id, access_token=access_token)
    result['register'] = reg

    uploadParameters = reg.get('uploadParameters')
    if not uploadParameters:
        raise RuntimeError('register response does not contain uploadParameters: ' + json.dumps(reg))

    # Upload unless explicitly skipped
    upload_resp = None
    if not no_upload:
        upload_resp = upload_appbundle_from_uploadParameters(uploadParameters, zip_path)
        result['upload_response'] = {'status_code': upload_resp.status_code, 'text': upload_resp.text}

    # Create alias
    alias_resp = create_alias(bundle_id=bundle_id, alias_id=alias_id, version=alias_version, access_token=access_token)
    result['alias_response'] = {'status_code': alias_resp.status_code, 'text': alias_resp.text}

    return result


def main():
    parser = argparse.ArgumentParser(description='Register, upload, and create alias for an Autodesk appbundle')
    parser.add_argument('--zip', '-z', dest='zip_path', default=_default_zip_path(), help='Path to the appbundle zip to upload')
    parser.add_argument('--id', dest='bundle_id', default='<YOUR_APPBUNDLE_NAME_HERE>', help='AppBundle id to register')
    parser.add_argument('--alias-id', dest='alias_id', default='my_current_version', help='Alias id to create')
    parser.add_argument('--alias-version', dest='alias_version', default='1', help='Alias version to point to')
    parser.add_argument('--no-upload', dest='no_upload', action='store_true', help='Skip upload step (register + alias only)')

    args = parser.parse_args()

    zip_path = args.zip_path
    bundle_id = args.bundle_id
    alias_id = args.alias_id
    alias_version = args.alias_version

    print('Starting register -> upload -> alias flow')
    print('Bundle id:', bundle_id)
    print('Zip path:', zip_path)
    print('Alias:', alias_id, '-> version', alias_version)

    try:
        res = register_upload_and_alias(zip_path=zip_path, bundle_id=bundle_id, alias_id=alias_id, alias_version=alias_version, no_upload=args.no_upload)
    except requests.HTTPError as e:
        print('HTTP error during flow:', e)
        if hasattr(e, 'response') and e.response is not None:
            try:
                print('Response JSON:', e.response.json())
            except Exception:
                print('Response text:', e.response.text)
        return 1
    except Exception as e:
        print('Error during flow:', e)
        return 1

    print('\nResults summary:')
    # Register keys
    reg_val = res.get('register')
    print('Register response keys:', list(reg_val.keys()) if isinstance(reg_val, dict) else reg_val)

    # Upload response (may be None if skipped)
    upload_val = res.get('upload_response')
    if upload_val:
        print('Upload status code:', upload_val.get('status_code'))
        print('Upload response snippet:', (upload_val.get('text') or '')[:500])
    else:
        print('Upload step skipped')

    # Alias response
    alias_val = res.get('alias_response')
    if alias_val:
        print('Alias creation status code:', alias_val.get('status_code'))
        try:
            print('Alias response text:', json.loads(alias_val.get('text') or ''))
        except Exception:
            print('Alias response text (raw):', alias_val.get('text'))
    else:
        print('No alias response available')

    return 0


if __name__ == '__main__':
    raise SystemExit(main())
