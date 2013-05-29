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

To simulate a live deployment, you can use the `bin/fakeroku` script to handle HTTPS and forward requests to the actual LocalData API:

    $ PORT=3443 bin/fakeroku 3000

The script will use `~/.ssh/localdata-key.pem` and `~/.ssh/localdata-cert.pem`.
You can import the cert to your browser or simplify instruct the browser to
proceed despite a self-signed certificate. See below for generating a cert.

To test the API, use:

    $ make test

You will need a self-signed certificate for the HTTPS tests. You can generate those using `openssl`:

    $ openssl req -x509 -nodes -days 730 -newkey rsa:1024 -keyout tests/data/test-key.pem -out tests/data/test-cert.pem

You can also pass options to mocha with the `OPTS` variable or specify a test file with the `FILE` variable:

    $ make test OPTS="--grep 'Surveys'" FILE=test/surveys.js

