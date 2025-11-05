# FusionAutomationAPI-Toolkit
A toolkit which can be used for easy(er) editing, uploading and calling of typescript files for use in the fusion automation API via python

# Instructions

  -  This toolkit is for editing files for, and interfacing with, the fusion automation API via python.
    
  -  To start with, follow the instructions given in: https://aps.autodesk.com/blog/get-started-design-automation-fusion
    
  -  This will cover downloading automation api add ons in fusion, there is also an extension in VScode which is necessary to download (I think)
    
  -  Before editing and running .ts files from vs code you will need the urn from the relevant file: with the relevant file open in the fusion UI, and with the 2F_Param_Sample_Main folder ONLY open in VScode, run the FusionFileURNFinder.ts script locally to get the file URN, copy this into the 2F_Param_Sample.json file and edit the parameter name and value list to match some parameter names and valid values in your fusion file.
    
  -  With this setup you should be able to edit and run the "2F_Param_Sample.ts" file either locally or remotely (via cloud) straight from VScode, please note, this only works if the open folder in VScode is EXCLUSIVELY 2F_Param_Sample_Main, if you are in the parent file you won't be able to run things.
    
  -  Before attempting to upload a .ts script to the cloud you will need to create an app: https://aps.autodesk.com/en/docs/oauth/v2/tutorials/create-app/
    
  -  Make sure to note down Client ID and Client Secret, used for generating access tokens as you go
    
  -  You will need to copy your working .ts script into a new folder in the appbundles folder in the FusionAutomationAPICreationToolkit Folder, follow the format of the examples already there (including renaming to main.ts) and compress to zip folder, this zip folder will be referenced when uploading the appbundle (I think)
    
  -  Following this, the API Creation Toolkit closely follows the walkthrough given in: https://aps.autodesk.com/en/docs/design-automation/v3/tutorials/fusion/ however the code has been ported into python, and I've combined things to make it a little more accessible, try to follow their workflow.
    
  -  The "ListAndDeleteWorkspace.py" file is not in the walkthrough, I set this up in case you want to list out and clean up existing appbundles and activities you have posted previously.
    
  -  The python script in the 2F_Param_Parent_Sample folder ("2F_Param_Sample.py") can be used to call the workitem from fusion and wait for completion.
