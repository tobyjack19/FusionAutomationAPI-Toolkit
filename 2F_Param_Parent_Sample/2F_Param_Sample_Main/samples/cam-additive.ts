/**
 * CAM Additive Sample
 * Creates an Additive setup out of the bodies in the Fusion's Design Workspace.
 * @param {boolean} useCurrentDocument Whether to use the currently open document as the input file.
 * @param {boolean} saveAsNewDocument Whether to save the modified file as a new document or overwrite it.
 * @param {string} hubId The id of the hub to load files from.
 *                       Use data.property in Fusion text commands to get Hub Id.
 * @param {string} fileURN The id (urn) of the file, which you would like to convert into Additive Setup.
 *                                 Use data.property in Fusion to get Lineage Urn.
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
  adsk.log("UserID: " + app.userId);
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

  adsk.log("Creating Manufacturing Model");
  const manufacturingModels = cam.manufacturingModels;
  const mmInput = manufacturingModels.createInput();
  mmInput.name = "My Manufacturing Model - FFF";
  const manufacturingModel = manufacturingModels.add(mmInput);

  adsk.log("Getting Occurences...");
  const occs = getValidOccurences(manufacturingModel.occurrence);
  if (occs.length == 0) {
    adsk.log("No component has been added to the scene. Terminating...");
    return;
  }

  // Define and create the arrange operation
  adsk.log("Creating arrange operation...");
  const setup = createAdditiveSetup(occs, cam);
  const arrangeInput = setup.operations.createInput("additive_arrange");

  // Modifying the parameters to control the arrangement. Units in centimeters
  // Can also be done similar to the Desktop API
  (<adsk.cam.StringParameterValue>(
    arrangeInput.parameters.itemByName("arrange_arrangement_type")?.value
  )).value = "Pack2D";
  (<adsk.cam.IntegerParameterValue>(
    arrangeInput.parameters.itemByName("arrange_platform_clearance")?.value
  )).value = 0;
  (<adsk.cam.FloatParameterValue>(
    arrangeInput.parameters.itemByName("arrange_frame_width")?.value
  )).value = 0.5;
  (<adsk.cam.FloatParameterValue>(
    arrangeInput.parameters.itemByName("arrange_ceiling_clearance")?.value
  )).value = 0.5;
  (<adsk.cam.IntegerParameterValue>(
    arrangeInput.parameters.itemByName("arrange_object_spacing")?.value
  )).value = 1;

  const arrange = setup.operations.add(arrangeInput);

  let future = cam.generateToolpath(arrange);
  while (future.isGenerationCompleted == false) {
    wait(500);
  }

  adsk.log("Additive arrange added");

  // Creating the automatic orientation operations for each occurence
  for (let occ of occs) {
    adsk.log(`Defining orientation for occurence ${occ.name}...`);
    const orientationInput = setup.operations.createInput(
      "automatic_orientation",
    );
    const orientationTarget = orientationInput.parameters.itemByName(
      "optimizeOrientationTarget",
    );
    if (orientationTarget) {
      (<adsk.cam.CadObjectParameterValue>orientationTarget.value).value = [occ];
    }
    orientationInput.displayName = "Automatic Orientation " + occ.name;

    // Global orientation
    // Setting the parameters for the orientation. All units are internal Fusion units. Check documentation for more info.
    // Can also be done similar to the Desktop API
    (<adsk.cam.IntegerParameterValue>(
      orientationInput.parameters.itemByName(
        "optimizeOrientationSmallestRotation",
      )?.value
    )).value = 180;
    (<adsk.cam.IntegerParameterValue>(
      orientationInput.parameters.itemByName("optimizeOrientationCriticalAngle")
        ?.value
    )).value = 45;
    (<adsk.cam.IntegerParameterValue>(
      orientationInput.parameters.itemByName(
        "optimizeOrientationDistanceToPlatform",
      )?.value
    )).value = 0;
    (<adsk.cam.BooleanParameterValue>(
      orientationInput.parameters.itemByName("optimizeOrientationMoveToCenter")
        ?.value
    )).value = true;
    (<adsk.cam.FloatParameterValue>(
      orientationInput.parameters.itemByName("optimizeOrientationFrameWidth")
        ?.value
    )).value = 0.5;
    (<adsk.cam.FloatParameterValue>(
      orientationInput.parameters.itemByName(
        "optimizeOrientationCeilingClearance",
      )?.value
    )).value = 0.5;
    (<adsk.cam.StringParameterValue>(
      orientationInput.parameters.itemByName(
        "optimizeOrientationRankingSupportVolume",
      )?.value
    )).value = "10";
    (<adsk.cam.StringParameterValue>(
      orientationInput.parameters.itemByName(
        "optimizeOrientationRankingSupportArea",
      )?.value
    )).value = "0";
    (<adsk.cam.StringParameterValue>(
      orientationInput.parameters.itemByName(
        "optimizeOrientationRankingBoundingBoxVolume",
      )?.value
    )).value = "2";
    (<adsk.cam.StringParameterValue>(
      orientationInput.parameters.itemByName(
        "optimizeOrientationRankingPartHeight",
      )?.value
    )).value = "6";
    (<adsk.cam.StringParameterValue>(
      orientationInput.parameters.itemByName(
        "optimizeOrientationRankingCOGHeight",
      )?.value
    )).value = "6";

    const orientation = setup.operations.add(orientationInput);

    adsk.log("Generating orientation...");
    future = cam.generateToolpath(orientation);
    while (future.isGenerationCompleted == false) {
      wait(500);
    }

    let generatedResults = orientation.generatedDataCollection;
    let firstResult: adsk.cam.OptimizedOrientationResult | null = null;

    let primary = generatedResults.itemByIdentifier(
      adsk.cam.GeneratedDataType.OptimizedOrientationGeneratedDataType,
    ) as adsk.cam.OptimizedOrientationResults;

    if (primary) {
      firstResult = primary.item(0);
      primary.currentOrientationResult = firstResult;
    }
  }

  adsk.log("Generating arrange...");
  future = cam.generateToolpath(arrange);
  while (future.isGenerationCompleted == false) {
    wait(500);
  }

  adsk.log("Generating supports...");
  const supportInput = setup.operations.createInput("solid_volume_support");
  const volumeSupport = setup.operations.add(supportInput);
  const supportTargetParam =
    volumeSupport.parameters.itemByName("supportTarget");
  if (supportTargetParam) {
    (<adsk.cam.CadObjectParameterValue>supportTargetParam.value).value = occs;
  } else {
    adsk.log("ERROR: Support target parameter not found...");
  }

  future = cam.generateToolpath(volumeSupport);
  while (future.isGenerationCompleted == false) {
    wait(500);
  }

  if (volumeSupport.hasError) {
    volumeSupport.deleteMe();
  }

  adsk.log("Generating toolpath...");
  let toolpath: adsk.cam.Operation | null = null;

  for (let i = 0; i < setup.operations.count; ++i) {
    const op = setup.operations.item(i)!;
    if (op.strategy == "additive_buildstyle") {
      toolpath = op;
      break;
    }
  }

  if (toolpath == null) {
    adsk.log("Adding toolpath strategy failed ... Terminating");
    return;
  }

  future = cam.generateToolpath(toolpath);
  while (toolpath.isGenerating) {
    wait(1000);
  }

  adsk.log("Done.");

  let destinationFolder = doc.dataFile.parentFolder;
  if (doc.dataFile.isReadOnly) {
    adsk.log(
      "Document is read-only. Attempting to save in default folder in Fusion Automation API project.",
    );
    destinationFolder = defaultFolder(app, "Fusion Automation API");
  }

  saveDocument(
    doc,
    scriptParameters.saveAsNewDocument,
    destinationFolder,
    "Additive Setup Sample",
  );

  while (app.hasActiveJobs) {
    wait(2000);
  }
  adsk.result = JSON.stringify({
    Filename: doc.dataFile.name,
    urn: doc.dataFile.id,
    "Fusion Web URL": doc.dataFile.fusionWebURL,
  });
}

// Create an additive setup
function createAdditiveSetup(
  models: adsk.fusion.Occurrence[],
  cam: adsk.cam.CAM,
) {
  const setups = cam.setups;
  const input = setups.createInput(adsk.cam.OperationTypes.AdditiveOperation);
  input.models = models;
  input.name = "AdditiveSetup";

  const camManager = adsk.cam.CAMManager.get();
  if (!camManager) throw Error("No CAM Manager.");
  const libraryManager = camManager.libraryManager;
  const printSettingLibrary = libraryManager.printSettingLibrary;
  const machineLibrary = libraryManager.machineLibrary;
  let machineModel: adsk.cam.Machine | null = null;
  let printSetting: adsk.cam.PrintSetting | null = null;

  // URL - structure browsing by using Fusion360Library
  const printSettingUrl = printSettingLibrary.urlByLocation(
    adsk.cam.LibraryLocations.Fusion360LibraryLocation,
  );
  const printSettings = printSettingLibrary.childPrintSettings(printSettingUrl);
  if (!printSettings) throw Error("No print settings found.");

  const machineUrl = machineLibrary.urlByLocation(
    adsk.cam.LibraryLocations.Fusion360LibraryLocation,
  );
  const machines = machineLibrary.childMachines(machineUrl);
  if (!machines) throw Error("No machines found.");

  // Print Settings name from Fusion PrintSetting Library
  for (let ps of printSettings) {
    if (ps.name == "PLA (Direct Drive)") {
      printSetting = ps;
      break;
    }
  }
  // Machine model name from Fusion Machine Library
  for (let machine of machines) {
    if (machine.model == "i3 MK3S+") {
      machineModel = machine;
      break;
    }
  }
  if (machineModel) input.machine = machineModel;
  if (printSetting) input.printSetting = printSetting;

  const setup = setups.add(input);

  return setup;
}

// Given an occurence, this finds all child occurences that contain either a B-rep or Mesh body.
// Recursive function to find all occurences at all levels.
function getValidOccurences(
  occurence: adsk.fusion.Occurrence,
): adsk.fusion.Occurrence[] {
  let result: adsk.fusion.Occurrence[] = [];
  const childOcc = occurence.childOccurrences;

  for (let i = 0; i < childOcc.count; ++i) {
    const currentOccurrence = childOcc.item(i);
    if (
      currentOccurrence &&
      currentOccurrence.bRepBodies.count +
        currentOccurrence.component.meshBodies.count >
        0
    ) {
      result.push(currentOccurrence);
    }
    if (currentOccurrence) {
      result = result.concat(getValidOccurences(currentOccurrence));
    }
  }
  return result;
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

function saveDocument(
  doc: adsk.core.Document,
  saveAsNewDocument: boolean,
  destinationFolder: adsk.core.DataFolder,
  description: string,
  name?: string,
): boolean {
  if (saveAsNewDocument) {
    if (doc.saveAs(name ?? doc.name, destinationFolder, description, "")) {
      adsk.log("Document saved successfully.");
      return true;
    } else {
      adsk.log("Failed to save document.");
      return false;
    }
  }
  if (!doc.isModified) {
    adsk.log("Document is not modified, not saving.");
    return true;
  }
  try {
    if (doc.save(description)) {
      adsk.log("Document saved successfully.");
      return true;
    } else {
      adsk.log("Failed to save document.");
      return false;
    }
  } catch (error) {
    adsk.log(`Error saving document: ${error}`);
    return false;
  }
}

function defaultFolder(app: adsk.core.Application, defaultProjectName: string) {
  const projects = app.data.activeHub.dataProjects;
  if (!projects) throw Error("Unable to get active hub's projects.");
  for (let i = 0; i < projects.count; ++i) {
    const project = projects.item(i)!;
    if (project.name === defaultProjectName) {
      return project.rootFolder;
    }
  }
  adsk.log(`Creating new project: ${defaultProjectName}`);
  const project = projects.add(defaultProjectName);
  if (!project) throw Error("Unable to create new project.");
  return project.rootFolder;
}

function wait(ms: number) {
  const start = new Date().getTime();
  while (new Date().getTime() - start < ms) adsk.doEvents();
}

run();
