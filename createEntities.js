const {EntityTypesClient} = require('@google-cloud/dialogflow-cx');
const EntitiesConstants = require('./entities.js');
require('dotenv').config()

// Grab the service account credentials path from an environment variable
const keyPath = process.env.DF_SERVICE_ACCOUNT_PATH;
if(!keyPath) {
  console.log('You need to specify a path to a service account keypair in environment variable DF_SERVICE_ACCOUNT_PATH. See README.md for details.');
  process.exit(1);
}

const client = new EntityTypesClient({
    keyFilename: keyPath,
    apiEndpoint: process.env.DF_API_ENDPOINT
  })

async function createEntityType(projectId, location, agentId, language, displayName, entities, kind) {

    parent = client.agentPath(projectId, location, agentId)

    let entityType = {
        name: `projects/${projectId}/locations/us-central1/agents/e2a490dc-654b-49b5-8a0f-b92314740176/entityTypes/0c07b86d-9df4-4dd5-ab94-875e00e18b9a`,
        displayName,
        entities,
        kind
    }

    let request = {
        parent,
        entityType,
        language
    }

    const [response] = await client.updateEntityType(request);
    console.log(response)
}

// Grab the Dialogflow project ID from an environment variable
const projectId = process.env.DF_PROJECT_ID;
const location = process.env.DF_PROJECT_REGION;
const agentId = process.env.DF_AGENT_ID;

language = "en"
displayName = "skills" 
kind = "KIND_MAP" 
entities = EntitiesConstants;

createEntityType(projectId, location, agentId, language, displayName, entities, kind)