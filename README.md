SURVEY API
==========

## install dependencies

    $ npm install

Configure environment variables in a `.env` file. See `sample.env` for an example. Then run locally with

    $ node_modules/.bin/envrun node lib/server.js

Or you can create a separate environment files. For example, to use a `remote-db.env` file, you can run

    $ node_modules/.bin/envrun -e remote-db.env node lib/server.js

## Web interfaces

You'll need host copies of the dashboard and mobile
app. Change `REMOTE_MOBILE_PREFIX` and `REMOTE_ADMIN_PREFIX` to point to your
installs of those apps.

For active development, it's handy to use envrun for reading a set of environment variables and supervisor for restarting the app after changes. With environment variables in a `local.env` file, you can use

    $ node_modules/.bin/envrun --path -e local.env supervisor -n error -- lib/server.js

## Simulate a live deployment

You can use the `bin/fakeroku` script to handle HTTPS and forward requests to the actual LocalData API:

    $ PORT=3443 bin/fakeroku 3000

The script will use `~/.ssh/localdata-key.pem` and `~/.ssh/localdata-cert.pem`.
You can import the cert to your browser or simplify instruct the browser to
proceed despite a self-signed certificate. See below for generating a cert.

## Test the API

To test the API, use:

    $ make test

You will need a self-signed certificate for the HTTPS tests. You can generate those using `openssl`:

    $ openssl req -x509 -nodes -days 730 -newkey rsa:1024 -keyout tests/data/test-key.pem -out tests/data/test-cert.pem

You can also pass options to mocha with the `OPTS` variable or specify a test file with the `FILE` variable:

    $ make test OPTS="--grep 'Surveys'" FILE=test/surveys.js

If this is your first time running tests, you will need to create a PostgreSQL/PostGIS database with base feature data. You can import the `test/data/features-db.sql` file using psql, with `psql "CONNECTION_STRING"-f test/data/features-db.sql`.

