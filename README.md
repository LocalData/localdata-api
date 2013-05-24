SURVEY API
==========

To install dependencies

    $ npm install
    
To set environment variables:

    $ source ./sentenv_local.sh
    
Run with

    $ node lib/server.js

For active development, it's handy to use Foreman for reading a set of environment variables and supervisor for restarting the app after changes. With environment variables in a `local.env` file, you can use

    $ foreman start -f Procfile_supervisor -e local.env -p 3000

To test the API, use:

    $ make test

You can also pass options to mocha with the `OPTS` variable or specify a test file with the `FILE` variable:

    $ make test OPTS="--grep 'Surveys'" FILE=test/surveys.js

