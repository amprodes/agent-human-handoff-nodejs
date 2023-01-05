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

const appConstants = require('./appConstants.js');
const AppConstants = require('./appConstants.js');
const ChatConnectionHandler = require('./chatConnectionHandler.js');

// Handles the connection to an individual customer
class CustomerConnectionHandler extends ChatConnectionHandler {
  constructor(socket, messageRouter, onDisconnect) {
    super(socket, messageRouter, onDisconnect);
    // In this sample, we use the socket's unique id as a customer id.
    this.init(socket.id);
    this.attachHandlers();
    this.count = 0;
    this.usr = 'undefined'
  }

  init(customerId) {
    console.log('A customer joined: ', customerId);
    //this.router._sendConnectionStatusToOperator(customerId)
    // Determine if this is a new or known customer
    this.router.customerStore.getOrCreateCustomer(customerId)
      .then(customer => {
        console.log('A customer connected: ', customer);
        // If new, begin the Dialogflow conversation
        // if (customer.isNew) {
        //   return this.router._sendEventToAgent(customer)
        //     .then(responses => {
        //       const response = responses[0];
        //       this._respondToCustomer(response.queryResult.fulfillmentText, this.socket);
        //     });
        // }
        // If known, do nothing - they just reconnected after a network interruption
      })
      .catch(error => {
        // Log this unspecified error to the console and
        // inform the customer there has been a problem
        console.log('Error after customer connection: ', error.message);
        this._sendErrorToCustomer(error.message);
      });
  }

  attachHandlers() {
    this.socket.on(AppConstants.EVENT_CUSTOMER_MESSAGE, (message) => {
      //console.log('Received customer message: ', message);
      this._gotCustomerInput(message);
    });
    this.socket.on(AppConstants.EVENT_DISCONNECT, () => {
      //console.log('Customer disconnected');
      //this.router._sendConnectionStatusToOperator(this.socket.id, true);
      this.onDisconnect();
    });
  }

  // Called on receipt of input from the customer
  _gotCustomerInput(utterance) {
    if(this.usr != utterance.userId){
      this.count = 0;
      this.usr = utterance.userId;
    }

    // Look up this customer
    this.router.customerStore
      .getOrCreateCustomer(this.socket.id)
      .then(customer => {
        // Tell the router to perform any next steps
        return this.router._routeCustomer(utterance);
      })
      .then(response => {
        // Send any response back to the customer
        if (response) {
          return this._respondToCustomer(response);
        }
      })
      .catch(error => {
        // Log this unspecified error to the console and
        // inform the customer there has been a problem
        console.log('Error after customer input: ', error.message);
        this._sendErrorToCustomer(error.message);
      });
  }

  // Send a message or an array of messages to the customer
  // _respondToCustomer(response) {
  //   console.log('User Context:', response.queryResult.responseMessages.text.text);
  //   if (Array.isArray(response.queryResult.responseMessages) && response.queryResult.responseMessages.length > 0) {
  //     const message = Array.from(response.queryResult.responseMessages).map(result => result)
  //     if (Array.isArray(message)) {
  //       message.forEach(messages => {
  //         if (messages?.text?.text && Array.isArray(messages?.text?.text)) {
  //           messages?.text?.text?.forEach(message => {
  //             this.socket.emit(AppConstants.EVENT_TO_CUSTOMER_MESSAGE, message);
  //           })
  //         }
  //       });
  //       return;
  //     }
  //   } 
  //   //this.socket.emit(AppConstants.EVENT_TO_CUSTOMER_MESSAGE, response);
  //   // We're using Socket.io for our chat, which provides a synchronous API. However, in case
  //   // you want to swich it out for an async call, this method returns a promise.
  //   return Promise.resolve();
  // }

  _respondToCustomer (response) {
    // console.log('Sending response to customer:', response);
    // console.log('Current Page:', response[0].queryResult.currentPage);
    console.log('Current parameters:', response[0].queryResult.parameters);
    // console.log('Current message:', response[0].queryResult.responseMessages);
    console.log('ALL:', response[0]);
    this.count++;
    if(response[0].queryResult.currentPage.name === 'Start Page'){
      this.count = 0;
    }
    //console.log('Current intent:', response[0].queryResult.intent);
    if (Array.isArray(response)) {
      response?.forEach(message => {
        if (Array.isArray(message.queryResult?.responseMessages) && message.queryResult?.responseMessages.length > 0) {
          const newArray = message.queryResult.responseMessages; 
          this.socket.emit(AppConstants.EVENT_TO_CUSTOMER_MESSAGE, { newArray, userId: response[1]?.userId || this.usr, response, count: this.count });
          //this.socket.emit(appConstants.FULL_RESPONSE, { response, count: this.count });
        }
        //this.socket.emit(AppConstants.EVENT_CUSTOMER_MESSAGE, message);
      });
      return;
    }
    //this.socket.emit(AppConstants.EVENT_CUSTOMER_MESSAGE, response);
    // We're using Socket.io for our chat, which provides a synchronous API. However, in case
    // you want to swich it out for an async call, this method returns a promise.
    return Promise.resolve();
  }
  _sendErrorToCustomer(message) {
    // Immediately notifies customer of error
    console.log(`Sending error to customer ${message}`);
    this.socket.emit(AppConstants.EVENT_SYSTEM_ERROR, {
      type: 'Error',
      message: `There was a problem. ${message}`
    });
  }
}

module.exports = CustomerConnectionHandler;
