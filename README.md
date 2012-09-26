SURVEY API
==========

To install dependencies

    $ npm install
    
To set environment variables:

    $ source ./sentenv_local.sh
    
Run with

    $ node web.js

To test the API, use testclient.js:

    $ node testclient.js seedforms
    $ node testclient.js getform FORMID

See the testclient.js code for more.

We're also experimenting with using mocha for tests:

    $ make test
