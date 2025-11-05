import requests
import json

from GenerateAccessToken import GenerateNewAccessToken

accesstokenCurrent = GenerateNewAccessToken()
#print(accesstokenCurrent)

headerslist = {
            'Authorization': f'Bearer {accesstokenCurrent}',
            'Content-Type': 'application/json'
}
payload = {
    "nickname": "<YOUR_NICKNAME_HERE>"
}

response = requests.patch('https://developer.api.autodesk.com/da/us-east/v3/forgeapps/me', json=payload, headers=headerslist)

print(response.status_code)
try:
    print(response.json())
except ValueError:
    print("No JSON returned. Response text:", response.text)