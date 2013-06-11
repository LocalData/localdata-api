SURVEY API
==========

Install
-------

To install dependencies

    $ npm install


Run
---

Set environment variables:

    $ source ./sentenv_local.sh

Run with

    $ node lib/server.js

Run for development
-------------------

For active development, it's handy to use Foreman for reading a set of
environment variables and supervisor for restarting the app after changes. With
environment variables in a `local.env` file, you can use

    $ foreman start -f Procfile_supervisor -e local.env -p 3000



Simulate a deployment with HTTPS (recommended)
----------------------------------------------

You will need a self-signed certificate for HTTPS. You can generate those using
`openssl`:

    $ openssl req -x509 -nodes -days 730 -newkey rsa:1024 -keyout ~/.ssh/localdata-key.pem -out ~/.ssh/localdata-cert.pem

You can import the cert to your browser or simplify instruct the browser to
proceed despite a self-signed certificate. On a Mac, open `~/.ssh` and
double-click localdata-cert.pem to add it to your Keychain.

Then, start the server with Foreman:

    $ foreman start -f Procfile_supervisor -e local.env -p 3000

Finally, run the `bin/fakeroku` script to handle HTTPS and forward requests to
the server:

    $ PORT=3443 bin/fakeroku 3000


Testing
--------

To test the API, use:

    $ make test

You will need a self-signed certificate for the HTTPS tests. You can generate those using `openssl`:

    $ openssl req -x509 -nodes -days 730 -newkey rsa:1024 -keyout tests/data/test-key.pem -out tests/data/test-cert.pem

You can also pass options to mocha with the `OPTS` variable or specify a test file with the `FILE` variable:

    $ make test OPTS="--grep 'Surveys'" FILE=test/surveys.js

