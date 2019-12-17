# idiotchess

[![Build Status](https://matthewcocks.visualstudio.com/AWCards/_apis/build/status/PunkUnicorn.idiotchess?branchName=master)](https://matthewcocks.visualstudio.com/AWCards/_build/latest?definitionId=4&branchName=master)

![Idiot Chess for Stupids](CHESS.png)

~~Publishes to https://idiotchess01.azurewebsites.net/
Although this is a free hosting that goes to sleep. Wake it  up with an http get (hint put the url in the browser)~~

Published ad-hoc to a linux VM while in development.

The repo is missing auth.json.

# auth.json

This is the file that holds the discord app key

{
"token": "<secret token here>"
}

You have to make your own, or wait till I've changed the CI pipeline to publish to a Linux box, instead of an app service. The CI publishes the bot *with* the secret. It's just not in github.


This also exposes a management console on port 8081 but it's not written yet. The port returns blank page, or rude message atm.


Discord bot, idiotchess - chess using: 

## chess.js
## chessy.js

