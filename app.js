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

var client = new oxford.Client(process.env.MICROSOFT_FACEAPI_KEY);
server.use(restify.queryParser());
server.use(restify.bodyParser());
//=========================================================
// Bots Dialogs
//=========================================================

bot.dialog('/', [
  (session) => {
    session.send('Welcome!')
    builder.Prompts.confirm(session, "We have some user images in our database. Would you like to upload a user's image see if we can find a match of the same user?");
  },
  (session, results, next) => {
    console.log(results.response);
    if (results.response){
      session.userData.faces =[];
      client.face.detect({
        path: './face.jpeg',
        returnFaceId: true,
        analyzesAge: true,
        analyzesGender: true
      }).then(function (response) {
        console.log('The faceid is: ' + response[0].faceId);
        console.log('The gender is: ' + response[0].faceAttributes.gender);
        session.userData.faces.push(response[0].faceId);
        var msg = "Default user is " +  response[0].faceAttributes.gender;//new builder.Message(session).ntext("faceid: " +  response[0].faceId + " | gender: " +  response[0].faceAttributes.gender);
        session.send(msg);
        session.beginDialog('/findmatch');
      });
    }else{
      next();
    }
  },
  (session) => {
    session.endConversation("Goodbye until next time...");
  }
]);

bot.dialog('/findmatch', [
  (session) => {
    builder.Prompts.attachment(session, "Upload an image and we will find a match for you.");
  },
  (session, results) => {
    var fileurl;
    results.response.forEach(function (attachment) {
        //file = attachment;    
        console.log(attachment);
        console.log(attachment.contentUrl);
        fileurl = attachment.contentUrl;
    });

    client.face.detect({
      url: fileurl,
      returnFaceId: true,
      analyzesAge: true,
      analyzesGender: true
    }).then(function (response) {
        console.log('The faceid is: ' + response[0].faceId);
        console.log('The gender is: ' + response[0].faceAttributes.gender);
        var userfaceid = response[0].faceId;
        session.userData.faces.push(userfaceid);
        var msg = "New user is " +  response[0].faceAttributes.gender;//new builder.Message(session).ntext("faceid: " +  response[0].faceId + " | gender: " +  response[0].faceAttributes.gender);
        session.send(msg);

        client.face.verify(session.userData.faces).then(function (response) {
          console.log(response);
          console.log(response.isIdentical);
          console.log(response.confidence);
          var msg = 'These users have ' + response.confidence * 100 + '% confidence in matching.';
          if(response.isIdentical){
            msg = msg + "We've found a match for this user!";
            session.send(msg);
            // msg = new builder.Message(session);
            // results.response.forEach(function (attachment) {
            //     msg.addAttachment(attachment);    
            // });
            // session.send(msg);
          } else{
            msg = msg + 'Sorry no match found for this user!';
            session.send(msg);
          }
          session.userData.faces.pop(userfaceid);
          builder.Prompts.confirm(session, "Would you like to try another user image?");
        });

    });
  },
  (session, results) => {
    if (results.response){
      session.replaceDialog('/findmatch');
    }else{
      session.endDialog();
    }
  }
]);




