/**
 * Hello Fusion
 * Fusion Automation API's 'Hello World' sample
 * @returns {object} The parameters passed with the script.
 */

import { adsk } from "@adsk/fas";

function run() {
  // Log a message
  adsk.log("Hello Fusion");

  // Get the Fusion API's application object
  const app = adsk.core.Application.get();
  if (!app) throw Error("No asdk.core.Application.");

  // Log some information
  adsk.log(new Date().toString());
  adsk.log("UserName: " + app.userName);
  adsk.log("User: " + app.currentUser.displayName);
  adsk.log("UserID: " + app.userId);
  adsk.log("Version: " + app.version);

  // Read the parameters passed with the script
  const parameters = JSON.parse(adsk.parameters);

  // Hand them back as a result
  adsk.result = JSON.stringify(parameters);
}

run();
