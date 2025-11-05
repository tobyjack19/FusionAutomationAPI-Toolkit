import requests

from GenerateAccessToken import GenerateNewAccessToken

accesstokenCurrent = GenerateNewAccessToken()
#print(accesstokenCurrent)

headerslist = {
        'Authorization': f'Bearer {accesstokenCurrent}',
        'Content-Type': 'application/json'
}

response = {}
response2 = {}

appbundlelist = requests.get('https://developer.api.autodesk.com/da/us-east/v3/appbundles', headers=headerslist)
print(appbundlelist.json())
response = requests.delete('https://developer.api.autodesk.com/da/us-east/v3/appbundles/<YOUR_APPBUNDLE_NAME_HERE>', headers=headerslist)
print(response.status_code)

activitylist = requests.get('https://developer.api.autodesk.com/da/us-east/v3/activities', headers=headerslist)
print(activitylist.json())
response2 = requests.delete('https://developer.api.autodesk.com/da/us-east/v3/activities/<YOUR_ACTIVITY_NAME_HERE>', headers=headerslist)
print(response2.status_code)

if response != {}:
    try:
        print(response.json())  
    except ValueError:
        print('No JSON returned. Response text:', response.text)

if response2 != {}:
    try:
        print(response2.json())
    except ValueError:
        print('No JSON returned. Response text:', response2.text)
