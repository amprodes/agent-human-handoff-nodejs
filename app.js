// Copyright 2017, Google, Inc.
// Licensed under the Apache License, Version 2.0 (the 'License');
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an 'AS IS' BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Load third party dependencies
const express = require('express');
let app = express()
const http = require('http').Server(app);
const io = require('socket.io')(http);
const Queue = require('bull');
const { createBullBoard } = require('@bull-board/api');
const { BullAdapter } = require('@bull-board/api/bullAdapter');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
require('dotenv').config()

// Load our custom classes
const CustomerStore = require('./customerStore.js');
const MessageRouter = require('./messageRouter.js');
const webhook = require('./webhooks.js');

const bodyParser = require("body-parser");
const helmet = require("helmet");

const { ExpressAdapter } = require('@bull-board/express');

const messagesQueue = new Queue('messagesQueue', {
  redis: { port: process.env.REDIS_PORT, host: process.env.REDIS_URI/*, password: 'foobared'*/ },
  settings: { maxStalledCount: 5, lockDuration: 300000 }
});

const cola = new Queue('cola', {
  redis: { port: process.env.REDIS_PORT, host: process.env.REDIS_URI/*, password: 'foobared'*/ },
}); // if you have a special connection to redis. 

const resumeJobs = new Queue('resumeJobs', {
  redis: { port: process.env.REDIS_PORT, host: process.env.REDIS_URI/*, password: 'foobared'*/ },
});

const opportunityJobs = new Queue('opportunityJobs', {
  redis: { port: process.env.REDIS_PORT, host: process.env.REDIS_URI/*, password: 'foobared'*/ },
});

const dbQueue = new Queue('dbQueue', {
  redis: { port: process.env.REDIS_PORT, host: process.env.REDIS_URI/*, password: 'foobared'*/ },
});

const userQueue = new Queue('userQueue', {
  redis: { port: process.env.REDIS_PORT, host: process.env.REDIS_URI/*, password: 'foobared'*/ },
});

const inviteQueue = new Queue('inviteQueue', {
  redis: { port: process.env.REDIS_PORT, host: process.env.REDIS_URI/*, password: 'foobared'*/ },
});

const referalQueue = new Queue('referalQueue', {
  redis: { port: process.env.REDIS_PORT, host: process.env.REDIS_URI/*, password: 'foobared'*/ },
});

const groupsQueue = new Queue('groupsQueue', {
  redis: { port: process.env.REDIS_PORT, host: process.env.REDIS_URI/*, password: 'foobared'*/ },
});

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

const { addQueue, removeQueue, setQueues, replaceQueues } = createBullBoard({
  queues: [
    new BullMQAdapter(messagesQueue),
    new BullAdapter(cola),
    new BullAdapter(opportunityJobs),
    new BullMQAdapter(resumeJobs),
    new BullMQAdapter(dbQueue),
    new BullMQAdapter(userQueue),
    new BullMQAdapter(inviteQueue),
    new BullMQAdapter(referalQueue),
    new BullMQAdapter(groupsQueue),
  ],
  serverAdapter: serverAdapter,
});


app.use('/admin/queues', serverAdapter.getRouter());


// Grab the service account credentials path from an environment variable
const keyPath = process.env.DF_SERVICE_ACCOUNT_PATH;
if (!keyPath) {
  console.log('You need to specify a path to a service account keypair in environment variable DF_SERVICE_ACCOUNT_PATH. See README.md for details.');
  process.exit(1);
}

// Load and instantiate the Dialogflow client library
const { SessionsClient } = require('@google-cloud/dialogflow-cx');
const dialogflowClient = new SessionsClient({
  keyFilename: keyPath,
  apiEndpoint: process.env.DF_API_ENDPOINT
})

// Grab the Dialogflow project ID from an environment variable
const projectId = process.env.DF_PROJECT_ID;
const location = process.env.DF_PROJECT_REGION;
const agentId = process.env.DF_AGENT_ID;

if (!projectId) {
  console.log('You need to specify a project ID in the environment variable DF_PROJECT_ID. See README.md for details.');
  process.exit(1);
}

// Instantiate our app
const customerStore = new CustomerStore();
const messageRouter = new MessageRouter({
  customerStore: customerStore,
  dialogflowClient: dialogflowClient,
  projectId: projectId,
  location,
  agentId,
  customerRoom: io.of('/customer'),
  operatorRoom: io.of('/operator')
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(helmet());

// Serve static html files for the customer and operator clients
app.get('/customer', (req, res) => {
  res.sendFile(`${__dirname}/static/customer.html`);
});

app.get('/operator', (req, res) => {
  res.sendFile(`${__dirname}/static/operator.html`);
});

// Webhooks
app.post('/isThereResume', webhook.isThereResume)
app.post('/deleteExistingResume', webhook.deleteExistingResume)
app.post('/checkOpportunities', webhook.checkOpportunities)
app.post('/isfilePresent', webhook.isfilePresent)
app.post('/addingReferral', webhook.addingReferral)
app.post('/updateJobInfo', webhook.updateJobInfo)
// Begin responding to websocket and http requests
messageRouter.handleConnections();
http.listen(5000, () => {
  console.log('Listening on *:5000');
});