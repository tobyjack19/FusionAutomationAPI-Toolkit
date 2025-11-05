import requests
import json

from GenerateAccessToken import GenerateNewAccessToken

accesstokenCurrent = GenerateNewAccessToken()
#print(accesstokenCurrent)

headerslist = {
        'Authorization': f'Bearer {accesstokenCurrent}',
        'Content-Type': 'application/json'
}

response = requests.get('https://developer.api.autodesk.com/da/us-east/v3/workitems/<PASTE_WORK_ITEM_CODE_HERE>', headers=headerslist)

print(response.status_code)
try:
    print(response.json())
except ValueError:
    print('No JSON returned. Response text:', response.text)