'use strict';

const restify = require('restify');
const builder = require('botbuilder');
const oxford = require('project-oxford'),
    client = new oxford.Client('40a61586f1ad4dfca462d39e8a4489c1');

//=========================================================
// Bot Setup
//=========================================================

// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3979, function () {
  console.log('%s listening to %s', server.name, server.url); 
});
  
// Create chat bot
console.log('started...')
console.log(process.env.MICROSOFT_APP_ID);
var connector = new builder.ChatConnector({
  appId: process.env.MICROSOFT_APP_ID,
  appPassword: process.env.MICROSOFT_APP_PASSWORD
});
var bot = new builder.UniversalBot(connector);
server.post('/api/messages', connector.listen());
server.get('/', restify.serveStatic({
  'directory': __dirname,
  'default': 'index.html'
}));
//=========================================================
// Auth Setup
//=========================================================

server.use(restify.queryParser());
server.use(restify.bodyParser());


//=========================================================
// Bots Dialogs
//=========================================================

bot.dialog('/', [
  (session) => {
    session.send('Hello!')
    builder.Prompts.attachment(session, "Upload an image and we will find it.");
  },
  (session, results) => {
    // var msg = new builder.Message(session)
    //     .ntext("I got %d attachment.", "I got %d attachments.", results.response.length);
    // results.response.forEach(function (attachment) {
    //     msg.addAttachment(attachment);    
    // });
    // session.endDialog(msg);
    var faces = [];
    var file;
    results.response.forEach(function (attachment) {
        file = attachment;    
    });
    client.face.detect({
      path: './face.jpeg',
      returnFaceId: true,
      analyzesAge: true,
      analyzesGender: true
    }).then(function (response) {
        console.log('The faceid is: ' + response[0].faceId);
        console.log('The gender is: ' + response[0].faceAttributes.gender);
        faces.push(response[0].faceId);
        var msg = "faceid: " +  response[0].faceId + " | gender: " +  response[0].faceAttributes.gender;//new builder.Message(session).ntext("faceid: " +  response[0].faceId + " | gender: " +  response[0].faceAttributes.gender);
        session.send(msg);

        client.face.detect({
          path: './face3.jpeg',
          returnFaceId: true,
          analyzesAge: true,
          analyzesGender: true
        }).then(function (response) {
            console.log('The faceid is: ' + response[0].faceId);
            console.log('The gender is: ' + response[0].faceAttributes.gender);
            faces.push(response[0].faceId);
            var msg = "faceid: " +  response[0].faceId + " | gender: " +  response[0].faceAttributes.gender;//new builder.Message(session).ntext("faceid: " +  response[0].faceId + " | gender: " +  response[0].faceAttributes.gender);
            session.send(msg);

            client.face.verify(faces).then(function (response) {
                console.log(response);
                console.log(response.isIdentical);
                console.log(response.confidence);
                session.endDialog("done");
              });

        });
    });
  }
]);