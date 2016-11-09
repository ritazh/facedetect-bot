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

server.get('/image', restify.serveStatic({
    directory: './'
}));

var client = new oxford.Client(process.env.MICROSOFT_FACEAPI_KEY);
server.use(restify.queryParser());
server.use(restify.bodyParser());
//=========================================================
// Bots Dialogs
//=========================================================

bot.dialog('/', [
  (session) => {
    session.send('Welcome!');
    builder.Prompts.confirm(session, "We have some user images in our database. Would you like to upload an image to find a match?");
  },
  (session, results, next) => {
    console.log(results.response);
    if (results.response){
      session.send('Existing users in our database:');
      var msg = new builder.Message(session)
        .attachments([{
            contentType: "image/jpeg",
            contentUrl: "https://ritatextmemebot4771.blob.core.windows.net/faces/face.jpeg"
      }]);
      session.send(msg);

      msg = new builder.Message(session)
          .attachments([{
              contentType: "image/jpeg",
              contentUrl: "https://media.licdn.com/mpr/mpr/shrinknp_400_400/p/2/005/024/04b/3944b39.jpg"
      }]);
      session.send(msg);
      session.userData.faces =[];
      /// TODO: Process all default users in the database here and add their contact info
      client.face.detect({
        path: './face.jpeg',
        returnFaceId: true,
        analyzesAge: true,
        analyzesGender: true
      }).then(function (response) {
        console.log('The faceid is: ' + response[0].faceId);
        console.log('The gender is: ' + response[0].faceAttributes.gender);
        session.userData.faces.push({faceid: response[0].faceId, contact: 'billgates@microsoft.com'});
        
        client.face.detect({
          path: './face3.jpeg',
          returnFaceId: true,
          analyzesAge: true,
          analyzesGender: true
        }).then(function (response) {
          console.log('The faceid is: ' + response[0].faceId);
          console.log('The gender is: ' + response[0].faceAttributes.gender);
          session.userData.faces.push({faceid: response[0].faceId, contact: 'ritazh@microsoft.com'});
  
          session.beginDialog('/findmatch');
        });
      });
    }else{
      next();
    }
  },
  (session) => {
    var msg = new builder.Message(session)
        .attachments([{
            contentType: "image/jpeg",
            contentUrl: "http://www.theoldrobots.com/images62/Bender-18.JPG"
        }]);
    session.send(msg);
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
        // var msg = "New user is " +  response[0].faceAttributes.gender;//new builder.Message(session).ntext("faceid: " +  response[0].faceId + " | gender: " +  response[0].faceAttributes.gender);
        // session.send(msg);

        var userfaceid = response[0].faceId;
        var facematching = [];
        facematching.push(userfaceid);
        var processed = 0;
        var matchfound = false;
        var matchcontact;
        var msg = '';

        console.log(session.userData.faces);

        session.userData.faces.forEach(function(face){
          console.log(face);
          facematching.push(face.faceid);
          client.face.verify(facematching).then(function (response) {
            console.log(response);
            console.log(response.isIdentical);
            console.log(response.confidence);
            
            if(response.isIdentical){
              matchfound = true;
              matchcontact = face.contact;
              msg = "We've found a matching user with " + response.confidence * 100 + '% confidence.';
              msg = msg + " Here's the contact info: " + matchcontact;

            } else{
              if(!matchfound){
                msg ='Sorry no match found for this user.';
              }
            }

            processed++;

            if(processed == session.userData.faces.length){
              session.send(msg);
              builder.Prompts.confirm(session, "Would you like to try another user image?");
            }
          });

          facematching.pop(face);
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




