/**
 * Post the NC Program to Fusion Team.
 * @param {boolean} useCurrentDocument Whether to use the currently open document.
 * @param {boolean} useParentFolder Whether to store NC Program to CAM file's parent folder.
 * @param {string} hubId The id of the hub to load a file from.
 *                    Use data.property in Fusion to get Hub Id.
 * @param {string} fileURN The id (urn) of the file to load. Must be CAM Project.
 *                    Use data.property in Fusion to get Lineage URN.
 * @param {string} outputFolder The id (urn) of the folder to store the nc program in.
 *                    Specify the folder URN where you want to output your NC Program to. Make sure to set useParentFolder as false
 * @param {string} ncProgramFilename The name of the posted nc-program
 * @param {string} postDescription Description of the post to be used.
 */

import { adsk } from "@adsk/fas";

function run() {
  // Read the parameters passed with the script
  const scriptParameters = JSON.parse(adsk.parameters);
  if (!scriptParameters) throw Error("Invalid parameters provided.");

  // Get the Fusion API's application object
  const app = adsk.core.Application.get();
  if (!app) throw Error("No asdk.core.Application.");

  // Log some information
  adsk.log(new Date().toString());
  adsk.log("UserName: " + app.userName);
  adsk.log("User: " + app.currentUser.displayName);
  adsk.log("UserId: " + app.userId);
  adsk.log("Version: " + app.version);

  const doc = getDocument(
    app,
    scriptParameters.useCurrentDocument,
    scriptParameters.hubId,
    scriptParameters.fileURN,
  );
  if (!doc) throw Error("Invalid document.");
  // Switch to CAM Environment
  const camWS = app.userInterface.workspaces.itemById("CAMEnvironment");
  camWS?.activate();

  // Getting CAM Product
  const camProduct = doc.products.itemByProductType("CAMProductType");
  if (!camProduct) throw Error("File has no CAM Product.");
  const cam = camProduct as adsk.cam.CAM;
  let setups: adsk.cam.Setups = cam.setups;
  if (!setups) throw Error("File has no Setups. Terminating...");

  adsk.log("Generating all the toolpaths");
  let future = cam.generateAllToolpaths(true);
  var i = 0;
  while (future.isGenerationCompleted == false && i < 2 * 60 * 2) {
    wait(500);
    i++;
  }

  const camManager = adsk.cam.CAMManager.get() as adsk.cam.CAMManager;
  const libraryManager = camManager.libraryManager;

  adsk.log("Searching for the post configuration");
  let postConfig = getPostConfig(
    libraryManager,
    scriptParameters.postDescription,
  );

  adsk.log("Creating the nc program input");
  let ncInput = cam.ncPrograms.createInput();
  adsk.log("Changing NC program parameters on the input ");
  ncInput.displayName = "A new NCProgram";
  const inputparams = ncInput.parameters;

  // Changing the NC Program file name
  (<adsk.cam.StringParameterValue>(
    inputparams.itemByName("nc_program_filename")?.value
  )).value = scriptParameters.ncProgramFilename;

  // Setting the output folder parameters
  (<adsk.cam.BooleanParameterValue>(
    inputparams.itemByName("nc_program_postToFusionTeam")?.value
  )).value = true;

  // Getting the Output Folder Parameter
  let outputFolder = getFolderId(
    app,
    scriptParameters.useParentFolder,
    scriptParameters.outputFolder,
  );

  // Setting Fusion Teams Output Folder Parameter
  (<adsk.cam.StringParameterValue>(
    inputparams.itemByName("nc_program_internal_fusion_team_output_folder")
      ?.value
  )).value = outputFolder;

  // Setting the Fusion Teams Output folder Project ID Parameter
  (<adsk.cam.StringParameterValue>(
    inputparams.itemByName("nc_program_fusion_team_target_project_id")?.value
  )).value = getProjectId(app, outputFolder);

  adsk.log("Adding operation to the input ");
  let setupList: adsk.cam.Setup[] = [];
  for (let i = 0; i < setups.count; i++) {
    setupList.push(setups.item(i)!);
  }
  ncInput.operations = setupList;

  // Creating NC Program
  adsk.log("Create NC program");
  const newprogram = cam.ncPrograms.add(ncInput);
  newprogram.postConfiguration = postConfig;

  adsk.log("Post process");
  let postOptions = adsk.cam.NCProgramPostProcessOptions.create();
  newprogram.postProcess(postOptions!);

  // Waiting for the Posting to complete
  while (app.hasActiveJobs) {
    wait(4000);
  }
  wait(5000);
}

// Function to get the Post Configuration from Fusion Library
function getPostConfig(
  libManager: adsk.cam.CAMLibraryManager,
  description: string,
): adsk.cam.PostConfiguration {
  let postLib = libManager.postLibrary;

  // Creating a query to get posts from Autodesk Vendor
  let postConfigQuery = postLib.createQuery(
    adsk.cam.LibraryLocations.Fusion360LibraryLocation,
  );
  postConfigQuery.vendor = "Autodesk";
  let postConfigs: adsk.cam.PostConfiguration[] = postConfigQuery.execute();

  // Find post from description parameter and returning the post
  for (let config of postConfigs) {
    if (config.description == description) {
      return config;
    }
  }
  throw new Error("Post with description = " + description + " not found.");
}

function getDocument(
  app: adsk.core.Application,
  useCurrentDocument: boolean,
  hubId: string,
  fileURN: string,
): adsk.core.Document {
  if (useCurrentDocument === true) {
    adsk.log(`Using currently open document: ${app.activeDocument.name}.`);
    return app.activeDocument;
  }

  if (hubId) {
    // Possible hubId formats: base64 encoded string, or business:<id>,
    // or personal:<id> (deprecated)
    const hub =
      app.data.dataHubs.itemById(hubId) ||
      app.data.dataHubs.itemById(`a.${adsk.btoa(`business:${hubId}`, true)}`) ||
      app.data.dataHubs.itemById(`a.${adsk.btoa(`personal:${hubId}`, true)}`);
    if (!hub) throw Error(`Hub with id ${hubId} not found.`);
    adsk.log(`Setting hub: ${hub.name}.`);
    app.data.activeHub = hub;
  }

  const file = app.data.findFileById(fileURN);
  if (!file) throw Error(`File not found ${fileURN}.`);
  adsk.log(`Opening ${file.name}`);
  const document = app.documents.open(file, true);
  if (!document) throw Error(`Cannot open file ${file.name}.`);
  return document;
}

function getFolderId(
  app: adsk.core.Application,
  useParentFolder: boolean,
  outputFolder: string,
): string {
  if (useParentFolder) {
    return app.activeDocument.dataFile.parentFolder.id;
  }

  if (!outputFolder) {
    // Setting Default Project as Fusion Automation API
    adsk.log("No output folder specified, setting the Default Folder.");
    const projects = app.data.activeHub.dataProjects;
    if (!projects) throw Error("Unable to get active hub's projects.");
    for (let i = 0; i < projects.count; ++i) {
      const project = projects.item(i)!;
      if (project.name === "Fusion Automation API") {
        return project.rootFolder.id;
      }
    }
    adsk.log(`Creating new project: Fusion Automation API}`);
    const project = projects.add("Fusion Automation API");
    if (!project) throw Error("Unable to create new project.");
    return project.rootFolder.id;
  }
  return outputFolder;
}

function getProjectId(app: adsk.core.Application, outputFolder: string) {
  let folder = app.data.findFolderById(outputFolder);
  if (!folder) throw Error("Folder not found");
  let encodedId = folder.parentProject.id.split(".", 2);
  if (encodedId.length < 1) throw Error("Cannot get encoded project id");
  const parentProjectId: string = adsk.atob(encodedId[1], true);
  const projectId = parentProjectId.split("#", 2);
  if (projectId.length > 1) return projectId[1];
  throw Error("Cannot get Project Id");
}

function wait(ms: number) {
  const start = new Date().getTime();
  while (new Date().getTime() - start < ms) adsk.doEvents();
}

run();
