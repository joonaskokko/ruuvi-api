Simple Ruuvi sensor API
=======================
Simple headless Ruuvi sensor API for saving Ruuvi sensor data to a database. A replacement for Ruuvi Cloud.

Install
-------
`$ npm install`

Configuration
-------------
Check `.env.defaults` for default ENV variables. Create your own `.env` or `.env.production` (or whichever `NODE_ENV` value are you using).

Note that the service can be ran in port mode or socket mode OR both. Empty the variables you don't want to use.

Start with `$ npm start`. First time running will create the database table schema.