'use strict';

const restify = require('restify');
const builder = require('botbuilder');
const oxford = require('project-oxford');
const fs = require('fs');
const request = require('request');
const azure = require('azure-storage');
const stream = require('stream');
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

// Seed images
var faceUrls = [];
faceUrls.push({url: "https://raw.githubusercontent.com/ritazh/facedetect-bot/master/images/face.jpeg", contact: "@BillGates", faceid: ""});
faceUrls.push({url: "https://raw.githubusercontent.com/ritazh/facedetect-bot/master/images/face3.jpeg", contact: "@ritazzhang", faceid: ""});
faceUrls.push({url: "https://raw.githubusercontent.com/ritazh/facedetect-bot/master/images/face7.jpeg", contact: "@bhargav", faceid: ""});
faceUrls.push({url: "https://raw.githubusercontent.com/ritazh/facedetect-bot/master/images/face4.jpeg", contact: "@sedouard", faceid: ""});

var faceListId = "facedetectbot";
var faceList = null;

//storage setup
var blobClient = azure.createBlobService();
var containerName = "facedetectbot"
var hostName = 'https://' + process.env.AZURE_STORAGE_ACCOUNT + '.blob.core.windows.net';
var uploadOptions = {
  blockIdPrefix: "block",
  useTransactionalMD5: true,
  storeBlobContentMD5: true,
  contentSettings: {contentType: 'image/jpeg'}
};
//=========================================================
// Bots Dialogs
//=========================================================
bot.on('conversationUpdate', function (message) {
  if (message.membersAdded) {
    message.membersAdded.forEach(function (identity) {
      if (identity.id === message.address.bot.id) {
        bot.beginDialog(message.address, '/');
      }
    });
  }
});

bot.dialog('/', [
  (session) => {
    session.send('Welcome! I am Face Detection Bot! Upload a user picture and I will find a match for you.');
    session.send('Here are some users in our database:');
    session.userData.faces =[];
    session.userData.faceids = [];
    getFaceList(function(err){
      if(!err){
        if (faceList && faceList.persistedFaces.length > 0){
          displayFaces(session);
          builder.Prompts.confirm(session, "Would you like to upload a user picture to find a match?");
        }else{
          builder.Prompts.confirm(session, "Something went wrong. Would you like to try again?");
        }
      }else{
        session.send("Something went wrong. " + err);
        builder.Prompts.confirm(session, "Something went wrong. Would you like to try again?");
      }
    });
  },
  (session, results, next) => {
    if (results.response){
      session.beginDialog('/findmatch');
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
    builder.Prompts.attachment(session, "Please upload a user picture.");
  },
  (session, results, next) => {
    session.sendTyping();
    console.log(results);
    session.userData.newUserImageUrl = null;
    session.userData.newUserFaceId = null;

    results.response.forEach(function (attachment) {
        getFile(attachment, function(error, body){
          if(!error){
            findMatch(session, body, function(msg, userfaceid, found){
              session.send(msg);

              if (!found){
                saveFile(body, function(error, fileurl){
                  if (!error){
                    session.userData.newUserImageUrl = fileurl;
                    session.userData.newUserFaceId = userfaceid;

                    session.beginDialog('/adduser');
                  }else{
                    session.send("Error encountered while saving the picture: " + error);
                    next();
                  }
                });
              }else{
                next();
              }
            });
          }else{
            session.send("Error encountered while getting the picture: " + error);
            next();
          }
        });
    });
  },
  (session, results) => {
    builder.Prompts.confirm(session, "Would you like to try another picture?");
  },
  (session, results) => {
    if (results.response){
      session.replaceDialog('/findmatch');
    }else{
      session.endDialog();
    }
  }
]);

bot.dialog('/adduser', [
  (session) => {
    builder.Prompts.confirm(session, "Would you like to add this user?");
  },
  (session, results, next) => {
    if (results.response){
      session.beginDialog('/addcontact');
    }else{
      next();
    }
  },
  (session, results) => {
    session.endDialog();
  }
]);

bot.dialog('/addcontact', [
  (session) => {
    builder.Prompts.text(session, "Please enter the user's twitter handle starting with '@'");
  },
  (session, results, next) => {
    console.log(results.response);
    if (results.response){
      if(validateTwitter(results.response)){
        var contact = results.response;
        var newFace = {url: session.userData.newUserImageUrl, contact: contact, faceid: session.userData.newUserFaceId};
        //add to facelist
        addFaceToList(newFace, function(err){
          if(!err){
            console.log("Added new user:" + contact);
            session.send("New user has been added successfully!");
            session.userData.newUserFaceId = null;
            session.userData.newUserImageUrl = null;
            //refresh list and display latest
            getFaceList(function(err){
              if (!err){
                displayFaces(session);
                next();
              }else{
                session.send("Error detected while trying to add this user. " + err);
                session.userData.newUserFaceId = null;
                session.userData.newUserImageUrl = null;
                next();
              }
            });
          }else{
            session.send("Error detected while trying to add this user. " + err);
            session.userData.newUserFaceId = null;
            session.userData.newUserImageUrl = null;
            next();
          }
        });
      }else{
        session.send("Invalid twitter handle");
        session.replaceDialog('/addcontact');
      }

    }else{
      //this shouldnt happen
      session.replaceDialog('/addcontact');
    }
  },
  (session, results) => {
    session.endDialog();
  }
]);

function displayFaces(session){
  
  var msg = "Something went wrong. There are no existing users.";
  if (faceList.persistedFaces.length > 0){
    var attachments = [];
    var processed = 0;
    faceList.persistedFaces.forEach(function (persistedFace) {
      //breaking this into batches as skype only supports up to 10 items in carousel
      var userData = JSON.parse(persistedFace.userData);
      attachments.push(createAttachment(session, userData.contact, '', userData.url));
      processed++;
      if(processed == faceList.persistedFaces.length || attachments.length > 4){
        msg = new builder.Message(session)
          .attachmentLayout(builder.AttachmentLayout.carousel)
          .attachments(attachments.reverse());
        session.send(msg);
        attachments = [];
      }
    });
  }
}

// get facelist
function getFaceList(callback){
  client.face.faceList.get(faceListId).then(function (response) {
    if(response && response.faceListId === faceListId){
      faceList = response;
      callback(null);
    }else{
      createFaceList(callback);
    }
  }).catch(function (error) {
      console.log(JSON.stringify(error));
      if(error.code === "FaceListNotFound"){
        createFaceList(callback);
      }
  });
  
}
function createFaceList(callback){
  client.face.faceList.create(faceListId, {
    name: faceListId 
  }).then(function (response) {
    //Add seed images to faceList
    var addedImages = 0;
    faceUrls.forEach(function(faceUrl){
      addFaceToList(faceUrl, function(err){
        if(!err){
          addedImages++;

          if(addedImages == faceUrls.length){
            client.face.faceList.get(faceListId).then(function (response) {
              if(response && response.faceListId === faceListId){
                faceList = response;
                callback(null);
              }
            }).catch(function (error) {
                console.log(JSON.stringify(error));
                callback(error);
            });
          }
        }else{
          callback(err);
        }
      });
    });
    
  });
}

function getFaceFromList(persistedFaceId){
  var face = null;
  faceList.persistedFaces.forEach(function (persistedFace) {
    if (persistedFace.persistedFaceId === persistedFaceId){
      var userData = JSON.parse(persistedFace.userData);
      face = {url: userData.url, contact: userData.contact, faceid: persistedFace.persistedFaceId};
      console.log(face);
    }
  });
  return face;
}

function addFaceToList(faceUrl, callback){
  var userData = JSON.stringify({contact: faceUrl.contact, url: faceUrl.url});
  console.log(userData);
  client.face.faceList.addFace(faceListId, {
      url: faceUrl.url,
      userData: userData})
  .then(function (response) {
      faceUrl.faceid = response.persistedFaceId;
      callback(null);
  })
  .catch(function (error) {
      console.log(JSON.stringify(error));
      callback(error);
  })
}
// check if attachment is skype attachment
function isSkypeAttachment(url){
    return url.startsWith("https://apis.skype.com/v2/attachments");
}

// create new attachment
function createAttachment(session, title, subtitle, url){
  var attachment = new builder.HeroCard(session)
    .title(title)
    .subtitle(subtitle)
    .images([
        builder.CardImage.create(session, url)
    ]);
  return attachment;
}

function detectFace(url, callback){
  client.face.detect({
    url: url,
    returnFaceId: true,
    analyzesAge: false,
    analyzesGender: false
  }).then(function (response) {
    console.log('The faceid is: ' + response[0].faceId);
    callback(response);
  });
}

function saveFile(body, callback){
  var bufferStream = new stream.PassThrough();
    bufferStream.end(body);
    var fileName = new Date().getTime() + '.jpeg';
    blobClient.createAppendBlobFromStream(containerName, fileName, bufferStream, body.length, uploadOptions, function(error, blob){
      if(error){
        console.log(error);
        callback(error, null);
      }else{
        var fileurl = blobClient.getUrl(containerName, fileName, null, hostName);
        callback(null, fileurl);
      }
    });
}

function getFile(attachment, callback){
  var fileurl = attachment.contentUrl;
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
  request({
    url: fileurl,
    method: 'get',
    encoding: null,
    headers: headers
    },
    function(error, response, body){
      callback(error, body);
    }
  );
}

function validateEmail(email) {
    var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return newRegExp(re).test(email);
}
function validateTwitter(twitter){
  var re = /(^|[^@\w])@(\w{1,15})\b/;
  return re.test(twitter);
}
function findMatch(session, body, callback){
  client.face.detect({
    data: body,
    returnFaceId: true,
    analyzesAge: false,
    analyzesGender: false
  }).then(function (response) {
      console.log('The faceid is: ' + response[0].faceId);

      var userfaceid = response[0].faceId;
      var matchfound = false;
      var matchcontact;
      var msg = '';

      client.face.similar(userfaceid, {
        candidateFaceListId: faceListId
      }).then(function(response) {
          if(response.length > 0){
            matchcontact = getFaceFromList(response[0].persistedFaceId);
            if(matchcontact){
              matchfound = true;

              msg = "We've found a matching user with " + Math.floor(response[0].confidence * 100) + '% confidence.';
              msg = msg + " Here's the contact info: " + matchcontact.contact;
              
              callback(msg, userfaceid, true);
            }
          }
          if (!matchfound){
            msg = 'Sorry no match found for this user.';
            callback(msg, userfaceid, false);
          }
      });
  });
}


