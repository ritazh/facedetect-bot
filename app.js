'use strict';

const restify = require('restify');
const builder = require('botbuilder');
const oxford = require('project-oxford');
    

//=========================================================
// Bot Setup
//=========================================================

// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3979, function () {
  console.log('%s listening to %s', server.name, server.url); 
});
  
// Create chat bot
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

client = new oxford.Client(process.env.MICROSOFT_FACE_KEY);
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
    builder.Prompts.attachment(session, "Upload an image and we will find a match for you.");
  },
  (session, results) => {
    var faces = [];
    var fileurl;
    results.response.forEach(function (attachment) {
        //file = attachment;    
        console.log(attachment);
        console.log(attachment.contentUrl);
        fileurl = attachment.contentUrl;
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
          url: fileurl,
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
                var msg = 'These users have ' + response.confidence + ' percentage of match.';
                if(response.isIdentical){
                  msg = msg + ' We have found a match for you!';
                } else{
                  msg = msg + ' Sorry no match found for you!';
                }
                session.endDialog(msg);
              });

        });
    });
  }
]);