'use strict';

const yaml = require('js-yaml');

module.exports = {
  downloadDocumentation: function () {
    const aws = this.serverless.providers.aws;
    const stackName = aws.naming.getStackName(this.serverless.service.provider.stage);
    const customVars = this.serverless.variables.service.custom;
    const contentType = createAWSContentType(this.options.outputFileName);
    return this._getRestApiId(stackName).then((restApiId) => {
      return aws.request('APIGateway', 'getExport', {
        stageName: this.serverless.service.provider.stage,
        restApiId: restApiId,
        exportType: 'swagger',
        parameters: {
          extensions: extensionType(this.options.extensions),
        },
        accepts: contentType,
      });
    }).then((response) => {
      if(this.options.fixVersion){
        // assuming it is a string for now
        if(!response || !response.body){
          // did not get a response, return error
          console.log('Error - downloadDocumentation - did not get a response from aws');
        }
        var swagger =  fixVersion(response.body, customVars, contentType);
        if(swagger === undefined) {
          console.log('Error - downloadDocumentation - parsing ' + contentType + ' file returned by aws. Operation was aborted.');
          return;
        }
        response.body = swagger;
      }
      // write file
      this.fs.writeFileSync(this.options.outputFileName, response.body);
    });
  },

  _getRestApiId: function (stackName) {
    return this.serverless.providers.aws.request('CloudFormation', 'describeStacks', {StackName: stackName},
      this.serverless.service.provider.stage,
      this.serverless.service.provider.region
    ).then((result) => {
      return result.Stacks[0].Outputs
        .filter(output => output.OutputKey === 'AwsDocApiId')
        .map(output => output.OutputValue)[0];
    });
  },
};

function getFileExtension(filename) {
  const path = require('path');
  let ext = path.extname(filename || '').split('.');

  return ext[ext.length - 1];
}

function createAWSContentType(outputFileName) {
  const fileExtension = getFileExtension(outputFileName);
  let awsContentType = 'application/json';
  if (fileExtension === 'yml' || fileExtension === 'yaml') {
    awsContentType = 'application/yaml';
  }

  return awsContentType;
}

function extensionType(extensionArg) {
  const possibleExtensions = ['integrations', 'apigateway', 'authorizers', 'postman'];

  if (possibleExtensions.includes(extensionArg)) {
    return extensionArg;
  } else {
    return 'integrations';
  }
}

// returns a new string with the corrected version, handles both json and yml 
function fixVersion(originalString, customVars, contentType) {
  // content type is either 'application/json' or 'application/yaml'
  // parsing and re stringifying here is costly but this is just a devopsy command so I'm not worried
  // Currently the file to be downloaded is swagger 2.0, if openapi 3.0 is made an options check that this object does not change structure
  var correctedString = undefined;
  var correctVersion = '';
  // Get the correct version by looking into the info object or the api object, both are possible
  if(customVars.documentation && customVars.documentation.info && customVars.documentation.info.version) {
    correctVersion = customVars.documentation.info.version;
  } else if(customVars.documentation && customVars.documentation.api && customVars.documentation.api.version) {
    correctVersion = customVars.documentation.api.version;
  } else {
    console.log('Error - downloadDocumentation - no version found in the serverless.yml');
    return undefined; // throw error here? 
  }

  try {
    if (contentType === 'application/json') {
      var parsed = JSON.parse(originalString);
      parsed.info.version = correctVersion;
      correctedString = JSON.stringify(parsed, null, 4);
    } else if (contentType === 'application/yaml') {
      var parsed = yaml.safeLoad(originalString)
      parsed.info.version = correctVersion;
      correctedString = yaml.safeDump(parsed);
    }
  } catch (e) {
    console.log(e);
    return undefined;
  }
  return correctedString;
}

