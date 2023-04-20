$(function () {
  var socket = io('/customer');
  ;
  // When the form is submitted, send a customer message to the server
  $('form').submit(function(){
    var messageText = $('#m').val();
    $('#messages').append($('<li class="customer-message">').text(messageText));
    socket.emit('customer message', {message: messageText, userId: socket.id});
    $('#m').val('');
    return false;
  });

  // When we receive a customer message, display it
  socket.on('message to customer', async function(msg){
    if (typeof (msg.newArray) === 'object' && msg.newArray.length > 0) {
      const message = [... new Set(msg.newArray)];
      for (let m = 0; m < message.length; m++) {
          const newArray = message[m];
          // console.log({ messagesBotSaid })
          if (newArray.text && newArray.text.text[0] !== '') {
              // await write.add('write', { message: `${newArray.text.text[0]}`, userId: msg.userId, mode: 'withSearch' }, { attempts: 3, timeout: 300000, priority: 1 })
              $('#messages').append($('<li>').text(`${newArray.text.text[0]}`));
          }
      }
  }
  });

  // When we receive a system error, display it
  socket.on('system error', function(error) {
    var errorText = error.type + ' - ' + error.message;
    console.log(errorText);
    $('#messages').append($('<li class="customer-error">').text(errorText));
  });
});