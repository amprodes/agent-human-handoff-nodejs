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
const { ExpressAdapter } = require('@bull-board/express');
const webhooks = require('./webhooks.js');
const bodyParser = require("body-parser");
const helmet = require("helmet");
const Redis = require('ioredis');
require('events').EventEmitter.defaultMaxListeners = 0;
let client;
let subscriber;

const redisOptions = {
  // redisOpts here will contain at least a property of connectionName which will identify the queue based on its name
  createClient: function (type, redisOpts) {
    switch (type) {
      case 'client':
        if (!client) {
          client = new Redis(`redis://${process.env.REDIS_URI}:${process.env.REDIS_PORT}`, {
            maxRetriesPerRequest: null,
            enableReadyCheck: false
        });
        }
        return client;
      case 'subscriber':
        if (!subscriber) {
          subscriber = new Redis(`redis://${process.env.REDIS_URI}:${process.env.REDIS_PORT}`, {
            maxRetriesPerRequest: null,
            enableReadyCheck: false
        });
        }
        return subscriber;
      case 'bclient':
        return new Redis(`redis://${process.env.REDIS_URI}:${process.env.REDIS_PORT}`, {
          maxRetriesPerRequest: null,
          enableReadyCheck: false
      });
      default:
        throw new Error('Unexpected connection type: ', type);
    }
  },
  settings: {
    backoffStrategies: {
      jitter: function (attemptsMade, err) {
        return 5000 + Math.random() * 500;
      }
    }
  }
}

// const options = {
//   redis: { port: process.env.REDIS_PORT, host: process.env.REDIS_URI/*, password: 'foobared'*/ },
//   settings: {
//     backoffStrategies: {
//       jitter: function (attemptsMade, err) {
//         return 5000 + Math.random() * 500;
//       }
//     }
//   }
// };

const messagesQueue = new Queue('messagesQueue', redisOptions);
const read = new Queue('read', redisOptions); // if you have a special connection to redis. 
const write = new Queue('write', redisOptions); // if you have a special connection to redis.

const resumeJobs = new Queue('resumeJobs', redisOptions);
const opportunityJobs = new Queue('opportunityJobs', redisOptions);
const dbQueue = new Queue('dbQueue', redisOptions);
const userQueue = new Queue('userQueue', redisOptions);
const inviteQueue = new Queue('inviteQueue', redisOptions);
const referalQueue = new Queue('referalQueue', redisOptions);
const groupsQueue = new Queue('groupsQueue', redisOptions);
const refulfillQueue = new Queue('refulfillQueue', redisOptions);

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

const { addQueue, removeQueue, setQueues, replaceQueues } = createBullBoard({
  queues: [
    new BullMQAdapter(read),
    new BullMQAdapter(write),
    new BullMQAdapter(messagesQueue), 
    new BullAdapter(opportunityJobs),
    new BullMQAdapter(resumeJobs),
    new BullMQAdapter(dbQueue),
    new BullMQAdapter(userQueue),
    new BullMQAdapter(inviteQueue),
    new BullMQAdapter(referalQueue),
    new BullMQAdapter(groupsQueue),
    new BullMQAdapter(refulfillQueue)
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
// app.post('/isThereResume', webhook.isThereResume)
// app.post('/deleteExistingResume', webhook.deleteExistingResume)
// app.post('/checkOpportunities', webhook.checkOpportunities)
// app.post('/isfilePresent', webhook.isfilePresent)
// app.post('/addingReferral', webhook.addingReferral)
// app.post('/updateJobInfo', webhook.updateJobInfo)
app.post('/webhook', webhooks.webhook);
// Begin responding to websocket and http requests
messageRouter.handleConnections();
http.listen(5000, () => {
  console.log('Listening on *:5000');
});


