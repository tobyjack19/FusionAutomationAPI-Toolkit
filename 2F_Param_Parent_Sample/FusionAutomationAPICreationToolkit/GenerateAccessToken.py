import base64
import requests

clientID = '<YOUR_CLIENT_ID_HERE>'
clientSecret = '<YOUR_CLIENT_SECRET_HERE>'

def GenerateNewAccessToken():

    encodedClientDetails = base64.b64encode(f'{clientID}:{clientSecret}'.encode()).decode()
    #print(encodedClientDetails)

    headerslist = {'Content-Type': 'application/x-www-form-urlencoded', 
            'Accept': 'application/json', 
            'Authorization': f'Basic {encodedClientDetails}'
    }
    payload = {
        'grant_type': 'client_credentials', 
        'scope': 'code:all bucket:create bucket:read data:create data:write data:read'
    }

    response = requests.post('https://developer.api.autodesk.com/authentication/v2/token', data=payload, headers=headerslist)
    jsonResponse = response.json()
    key = jsonResponse.get('access_token')
    return key
    #print(key)
    #print(response.json())

GenerateNewAccessToken()