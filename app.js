'use strict';

const restify = require('restify');
const builder = require('botbuilder');
const oxford = require('project-oxford');
const fs = require('fs');
const request = require('request');
    

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

// Images in our Database
var faceUrls = [];
faceUrls.push({url: "https://raw.githubusercontent.com/ritazh/facedetect-bot/master/images/face.jpeg", email: "billgates@microsoft.com"});
faceUrls.push({url: "https://raw.githubusercontent.com/ritazh/facedetect-bot/master/images/face3.jpeg", email: "ritazh@microsoft.com"});
faceUrls.push({url: "https://raw.githubusercontent.com/ritazh/facedetect-bot/master/images/face4.jpeg", email: "sedouard@microsoft.com"});
//=========================================================
// Bots Dialogs
//=========================================================

bot.dialog('/', [
  (session) => {
    session.send('Welcome!');
    builder.Prompts.confirm(session, "We have some user images in our database. Would you like to upload an image to find a match?");
  },
  (session, results, next) => {
    if (results.response){
      session.send('Existing users in our database:');

      session.userData.faces =[];

      var processedface = 0;
      var attachments = [];
      faceUrls.forEach(function(faceUrl){
        var attachment = new builder.HeroCard(session)
          .title("")
          .subtitle("")
          .images([
              builder.CardImage.create(session, faceUrl.url)
          ]);

         attachments.push(attachment);

        client.face.detect({
          url: faceUrl.url,
          returnFaceId: true,
          analyzesAge: true,
          analyzesGender: true
        }).then(function (response) {
          console.log('The faceid is: ' + response[0].faceId);
          console.log('The gender is: ' + response[0].faceAttributes.gender);
          session.userData.faces.push({faceid: response[0].faceId, contact: faceUrl.email});
          processedface++;

          if(processedface == faceUrls.length){
            var msg = new builder.Message(session)
              .attachmentLayout(builder.AttachmentLayout.carousel)
              .attachments(attachments);

            session.send(msg);
            session.beginDialog('/findmatch');
          }
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
    var filebody;

    results.response.forEach(function (attachment) {
        fileurl = attachment.contentUrl;
        var headers = {};
        if(isSkypeAttachment(fileurl)){
          connector.getAccessToken(
              function(error, token) {
                  headers['Authorization'] = 'Bearer ' + token;
                  headers['Content-Type'] = 'application/octet-stream';
              }
          );
        }
        else{
            headers['Content-Type'] = attachment.contentType;
        }

        request(
            {
                url: fileurl,
                method: 'get',
                encoding: null,
                headers: headers
            },
            function(error, response, body){
                if(!error && response.statusCode){
                    client.face.detect({
                      data: body,
                      returnFaceId: true,
                      analyzesAge: true,
                      analyzesGender: true
                    }).then(function (response) {
                        console.log('The faceid is: ' + response[0].faceId);
                        console.log('The gender is: ' + response[0].faceAttributes.gender);

                        var userfaceid = response[0].faceId;
                        var facematching = [];
                        facematching.push(userfaceid);
                        var processed = 0;
                        var matchfound = false;
                        var matchcontact;
                        var msg = '';

                        console.log(session.userData.faces);

                        session.userData.faces.forEach(function(face){
                          facematching.push(face.faceid);
                          client.face.verify(facematching).then(function (response) {
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
                }
                else{
                    console.log(error);
                    console.log(response.statusCode);
                }
            }
        );
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

// check if attachment is skype attachment
function isSkypeAttachment(url){
    return url.startsWith("https://apis.skype.com/v2/attachments");
}



